import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { llmOperationApi } from '../api/llmOperationApi';
import type {
  LlmOperationCatalogEntry,
  LlmOperationDetail,
  LlmOperationVersionRecord,
  LlmOperationValidationSubmission,
} from '../types';

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

interface LlmOperationManagerDrawerProps {
  entry: LlmOperationCatalogEntry | null;
  actor: string;
  onClose: () => void;
  onChanged: () => void;
}

interface DraftFormValue {
  version: string;
  changeSummary: string;
  manifestJson: string;
}

const nextPatchVersion = (version: string): string => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : `${version}.1`;
};

const stateColor = (state: LlmOperationVersionRecord['state']): string => {
  if (state === 'approved') return 'success';
  if (state === 'draft') return 'blue';
  if (state === 'candidate' || state === 'validating') return 'processing';
  if (state.includes('failed') || state.includes('rejected')) return 'error';
  return 'default';
};

const prepareDraftManifest = (manifest: Record<string, unknown>): Record<string, unknown> => {
  const closeSchema = (schema: unknown): unknown =>
    schema && typeof schema === 'object' && !Array.isArray(schema)
      ? { ...(schema as Record<string, unknown>), additionalProperties: false }
      : schema;
  return {
    ...manifest,
    inputSchema: closeSchema(manifest.inputSchema),
    outputSchema: closeSchema(manifest.outputSchema),
  };
};

export function LlmOperationManagerDrawer({
  entry,
  actor,
  onClose,
  onChanged,
}: LlmOperationManagerDrawerProps) {
  const [form] = Form.useForm<DraftFormValue>();
  const [detail, setDetail] = useState<LlmOperationDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [validationResult, setValidationResult] = useState<LlmOperationValidationSubmission>();

  const selectedVersion = useMemo(
    () => detail?.versions.find((version) => version.id === selectedVersionId),
    [detail, selectedVersionId]
  );

  const load = async () => {
    if (!entry) return;
    setLoading(true);
    setError(undefined);
    try {
      const loaded = await llmOperationApi.fetchDetail(entry.capabilityRef.id);
      setDetail(loaded);
      const preferred =
        loaded.versions.find((version) => version.state === 'draft') ||
        loaded.versions.find((version) => version.version === entry.capabilityRef.version) ||
        loaded.versions[0];
      setSelectedVersionId(preferred?.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载 Operation 失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entry) void load();
    else {
      setDetail(null);
      setSelectedVersionId(undefined);
      setValidationResult(undefined);
    }
  }, [entry?.capabilityRef.id]);

  useEffect(() => {
    if (!selectedVersion) return;
    form.setFieldsValue({
      version: selectedVersion.version,
      changeSummary: selectedVersion.changeSummary,
      manifestJson: JSON.stringify(prepareDraftManifest(selectedVersion.manifestJson), null, 2),
    });
    setDraftDirty(false);
  }, [form, selectedVersion]);

  const createDraftFromSelected = () => {
    if (!selectedVersion) return;
    setSelectedVersionId(undefined);
    form.setFieldsValue({
      version: nextPatchVersion(selectedVersion.version),
      changeSummary: `基于 ${selectedVersion.version} 调整 Prompt`,
      manifestJson: JSON.stringify(prepareDraftManifest(selectedVersion.manifestJson), null, 2),
    });
    setValidationResult(undefined);
    setDraftDirty(true);
  };

  const saveDraft = async () => {
    if (!entry) return;
    if (!actor) {
      void message.error('无法识别当前管理员身份，不能写入审计版本');
      return;
    }
    const values = await form.validateFields();
    let manifestJson: Record<string, unknown>;
    try {
      const parsed = JSON.parse(values.manifestJson) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('Manifest 必须是 JSON 对象');
      }
      manifestJson = parsed as Record<string, unknown>;
    } catch (parseError) {
      void message.error(parseError instanceof Error ? parseError.message : 'Manifest JSON 无效');
      return;
    }

    setSaving(true);
    try {
      const saved =
        selectedVersion && ['draft', 'validation_failed'].includes(selectedVersion.state)
          ? await llmOperationApi.updateDraft(
              entry.capabilityRef.id,
              selectedVersion,
              { manifestJson, changeSummary: values.changeSummary },
              actor
            )
          : await llmOperationApi.createDraft(
              entry.capabilityRef.id,
              { version: values.version, manifestJson, changeSummary: values.changeSummary },
              actor
            );
      void message.success(`Draft ${saved.version} 已保存，Digest 已由服务端重新计算`);
      setDraftDirty(false);
      onChanged();
      await load();
      setSelectedVersionId(saved.id);
    } catch (saveError) {
      void message.error(saveError instanceof Error ? saveError.message : '保存 Draft 失败');
    } finally {
      setSaving(false);
    }
  };

  const validate = async () => {
    if (!entry || !selectedVersion) return;
    if (!actor) {
      void message.error('无法识别当前管理员身份，不能执行状态迁移');
      return;
    }
    if (draftDirty) {
      void message.warning('Prompt 或 Manifest 有未保存修改，请先保存 Draft 再执行验证');
      return;
    }
    setSaving(true);
    setValidationResult(undefined);
    try {
      const result = await llmOperationApi.validate(
        entry.capabilityRef.id,
        selectedVersion.version,
        actor
      );
      setValidationResult(result);
      void message.success(
        `验证通过：${result.validation.fixture.passed}/${result.validation.fixture.totalCases} Fixtures，已自动进入 candidate`
      );
      onChanged();
      await load();
    } catch (transitionError) {
      void message.error(
        transitionError instanceof Error ? transitionError.message : '状态迁移失败'
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  const editable =
    !selectedVersion ||
    selectedVersion.state === 'draft' ||
    selectedVersion.state === 'validation_failed';

  return (
    <Drawer
      title={entry ? `${entry.displayName} · 版本与 Prompt` : 'LLM Operation'}
      open={Boolean(entry)}
      onClose={onClose}
      width={760}
      destroyOnClose
    >
      <Spin spinning={loading || saving}>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="模型能力由控制面直接执行"
              description="此处维护 Prompt、Schema 与运行策略的不可变版本；不会生成或调用 Temporal Activity。生产切换仍需 Eval、Attestation 与独立审批。"
            />
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Operation ID">{detail.operation.operationKey}</Descriptions.Item>
              <Descriptions.Item label="Owner">{detail.operation.owner}</Descriptions.Item>
              <Descriptions.Item label="当前生产版本">
                {entry?.capabilityRef.version}
              </Descriptions.Item>
              <Descriptions.Item label="执行主体">{actor || '未识别（只读）'}</Descriptions.Item>
            </Descriptions>

            <Space wrap>
              <Text strong>查看版本</Text>
              <Select
                style={{ minWidth: 260 }}
                value={selectedVersionId}
                placeholder="新建 Draft"
                onChange={setSelectedVersionId}
                options={detail.versions.map((version) => ({
                  value: version.id,
                  label: `${version.version} · ${version.state}`,
                }))}
              />
              {selectedVersion && <Tag color={stateColor(selectedVersion.state)}>{selectedVersion.state}</Tag>}
              <Button onClick={createDraftFromSelected} disabled={!selectedVersion}>
                克隆为新 Draft
              </Button>
            </Space>

            <Form
              form={form}
              layout="vertical"
              onValuesChange={() => {
                setDraftDirty(true);
                setValidationResult(undefined);
              }}
            >
              <Form.Item
                name="version"
                label="版本"
                rules={[{ required: true, message: '请输入版本号' }]}
              >
                <Input disabled={Boolean(selectedVersion)} placeholder="例如 1.1.0" />
              </Form.Item>
              <Form.Item
                name="changeSummary"
                label="变更说明"
                rules={[{ required: true, message: '请输入变更说明' }]}
              >
                <Input disabled={!editable} />
              </Form.Item>
              <Form.Item
                name="manifestJson"
                label="Operation Manifest（Prompt / Schema / Policy）"
                rules={[{ required: true, message: '请输入 Manifest JSON' }]}
              >
                <TextArea
                  disabled={!editable}
                  autoSize={{ minRows: 18, maxRows: 32 }}
                  spellCheck={false}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
            </Form>

            {selectedVersion && (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Operation Digest: <Text code>{selectedVersion.operationDigest}</Text><br />
                Contract Digest: <Text code>{selectedVersion.contractDigest}</Text>
              </Paragraph>
            )}

            {validationResult && (
              <Alert
                type="success"
                showIcon
                message={`验证通过 · ${validationResult.validation.suite.name}`}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      Fixtures：{validationResult.validation.fixture.passed}/
                      {validationResult.validation.fixture.totalCases}
                    </Text>
                    <Text>
                      Schema 通过率：
                      {(validationResult.validation.eval.metrics.schemaPassRate * 100).toFixed(1)}%；
                      任务成功率：
                      {(validationResult.validation.eval.metrics.taskSuccessRate * 100).toFixed(1)}%
                    </Text>
                    <Text code>Attestation: {validationResult.validation.attestation.id}</Text>
                  </Space>
                }
              />
            )}

            <Space wrap>
              <Button
                type="primary"
                onClick={() => void saveDraft()}
                disabled={!editable}
                loading={saving}
              >
                保存 Draft
              </Button>
              <Button
                onClick={() => void validate()}
                disabled={
                  draftDirty ||
                  selectedVersion?.state !== 'draft' &&
                  selectedVersion?.state !== 'validation_failed'
                }
              >
                提交并执行验证
              </Button>
              {draftDirty && selectedVersion && (
                <Text type="warning">存在未保存修改，验证只允许针对已持久化 Digest 执行</Text>
              )}
            </Space>
          </Space>
        )}
      </Spin>
    </Drawer>
  );
}
