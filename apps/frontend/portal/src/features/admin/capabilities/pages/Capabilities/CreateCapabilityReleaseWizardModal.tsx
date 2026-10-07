import React, { useMemo } from 'react';
import { Modal, Space, Alert, Steps, Card, Form, Select, Button, Descriptions, Input, Collapse, Typography, Tag } from 'antd';
import { CapabilityReleaseDetail } from '@/api/capabilities';
import { DeploymentSmokeInputEditor } from './components/DeploymentSmokeInputEditor';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export interface CreateCapabilityReleaseWizardModalProps {
  visible: boolean;
  onCancel: () => void;
  createWizardStep: number;
  wizardReleaseId: string | null;
  wizardRelease: CapabilityReleaseDetail['release'] | null;
  wizardDetail: CapabilityReleaseDetail | null;
  createForm: any;
  createSourceType: string;
  SOURCE_TYPE_OPTIONS: any[];
  isCreateSourceLoading: boolean;
  createSourceOptions: any[];
  handleCreate: () => void;
  createMutationLoading: boolean;
  getSourceTypeLabel: (type: string) => string;
  wizardDeployReadiness: { hasExecutableCode: boolean; message?: string };
  deployEnvironment: string;
  setDeployEnvironment: (env: any) => void;
  DEPLOY_ENV_OPTIONS: any[];
  deployStrategy: string;
  setDeployStrategy: (strat: any) => void;
  wizardAssistMutationLoading: boolean;
  onWizardAssist: () => void;
  wizardHasSuccessfulStagingDeployment: boolean;
  deploySmokeInputDraft: string;
  setDeploySmokeInputDraft: (draft: string) => void;
  handleWizardDeploy: () => void;
  deployMutationLoading: boolean;
  publishMutationLoading: boolean;
  generateDraftMutationLoading: boolean;
  approveMutationLoading: boolean;
  handlePublishSkill: (release: CapabilityReleaseDetail['release']) => void;
  wizardValidationCasesDraft: string;
  setWizardValidationCasesDraft: React.Dispatch<React.SetStateAction<string>>;
  realValidateMutationLoading: boolean;
  handleWizardValidate: () => void;
}

export const CreateCapabilityReleaseWizardModal: React.FC<CreateCapabilityReleaseWizardModalProps> = ({
  visible,
  onCancel,
  createWizardStep,
  wizardReleaseId,
  wizardRelease,
  wizardDetail,
  createForm,
  createSourceType: _createSourceType,
  SOURCE_TYPE_OPTIONS: _SOURCE_TYPE_OPTIONS,
  isCreateSourceLoading,
  createSourceOptions,
  handleCreate,
  createMutationLoading,
  getSourceTypeLabel,
  wizardDeployReadiness,
  deployEnvironment,
  setDeployEnvironment,
  DEPLOY_ENV_OPTIONS,
  deployStrategy,
  setDeployStrategy,
  wizardAssistMutationLoading,
  onWizardAssist,
  wizardHasSuccessfulStagingDeployment,
  deploySmokeInputDraft,
  setDeploySmokeInputDraft,
  handleWizardDeploy,
  deployMutationLoading,
  publishMutationLoading,
  generateDraftMutationLoading,
  approveMutationLoading,
  handlePublishSkill,
  wizardValidationCasesDraft,
  setWizardValidationCasesDraft,
  realValidateMutationLoading,
  handleWizardValidate,
}) => {
  const latestValidation = wizardDetail?.validations?.[0];

  const artifacts: any[] = useMemo(() => {
    if (!latestValidation?.resultSnapshot) return [];
    const snap = latestValidation.resultSnapshot as any;
    if (Array.isArray(snap.artifacts)) return snap.artifacts;
    if (Array.isArray(snap.result?.artifacts)) return snap.result.artifacts;
    if (snap.result?.businessData?.result?.downloadUrl) {
      return [
        {
          name: snap.result.businessData.result.fileName || '已生成文档工件',
          downloadUrl: snap.result.businessData.result.downloadUrl,
        },
      ];
    }
    return [];
  }, [latestValidation]);

  const recommendedPrompts = useMemo(() => {
    const list: string[] = [];
    const sourcePayload = wizardDetail?.currentSourceSnapshot?.sourcePayload;
    if (typeof sourcePayload?.userGoal === 'string' && sourcePayload.userGoal.trim()) {
      list.push(sourcePayload.userGoal.trim());
    }
    const skillName = wizardRelease?.sourceName || '';
    if (
      skillName.includes('replay') ||
      skillName.includes('approval') ||
      skillName.includes('1790872547')
    ) {
      list.push('审批案件，毛利率阈值设为10');
    }
    if (list.length === 0 && skillName) {
      list.push(`执行技能：${skillName}`);
    }
    return Array.from(new Set(list));
  }, [wizardDetail?.currentSourceSnapshot?.sourcePayload, wizardRelease?.sourceName]);

  return (
    <Modal title="创建流程发布向导" open={visible} onCancel={onCancel} footer={null} width={960}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="4 步快速发布"
          description="按“基础信息 -> 部署 -> 发布 Skills -> 真实校验”顺序推进，每一步都会保留当前 Release 上下文。"
        />

        <Steps
          current={createWizardStep}
          items={[
            {
              title: '创建基础信息',
              description: wizardReleaseId ? `已创建 ${wizardReleaseId.slice(0, 8)}` : '填写源信息',
            },
            {
              title: '部署',
              description:
                wizardRelease?.sourceType === 'execution_flow_template'
                  ? '模板型能力可按需跳过部署'
                  : wizardRelease?.sourceType === 'browser_recording'
                    ? '配置浏览器运行环境并执行回放部署'
                    : '配置运行环境与策略',
            },
            {
              title: '发布 Skills',
              description: wizardRelease?.publishedSkillId ? '已发布' : '生成并发布 Skill',
            },
            {
              title: '真实校验',
              description: '自然语言调用 Skill 验证',
            },
          ]}
        />

        {createWizardStep === 0 && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" title="基础信息" style={{ borderRadius: 12 }}>
              <Form form={createForm} layout="vertical">
                <Form.Item name="sourceType" hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="sourceId"
                  label="选择源"
                  rules={[{ required: true, message: '请选择源' }]}
                >
                  <Select
                    allowClear
                    showSearch
                    loading={isCreateSourceLoading}
                    options={createSourceOptions}
                    placeholder="选择要初始化的源（已自动过滤已发布的源）"
                    optionFilterProp="label"
                    onChange={(value, option: any) => {
                      if (option?.sourceType) {
                        createForm.setFieldValue('sourceType', option.sourceType);
                      } else if (!value) {
                        createForm.setFieldValue('sourceType', undefined);
                      }
                      if (option?.sourceName && !createForm.getFieldValue('sourceName')) {
                        createForm.setFieldValue('sourceName', option.sourceName);
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item name="sourceName" label="显示名称">
                  <Input placeholder="可选。若不填，系统会自动从已选源推断" />
                </Form.Item>
              </Form>
            </Card>

            <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" loading={createMutationLoading} onClick={handleCreate}>
                创建并进入部署
              </Button>
            </Space>
          </Space>
        )}

        {createWizardStep === 1 && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" title="部署配置" style={{ borderRadius: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Release ID">{wizardRelease?.id || wizardReleaseId}</Descriptions.Item>
                <Descriptions.Item label="能力类型">
                  {wizardRelease?.sourceType ? getSourceTypeLabel(wizardRelease.sourceType) : '-'}
                </Descriptions.Item>
              </Descriptions>

              {!wizardDeployReadiness.hasExecutableCode && (
                <Alert type="error" showIcon message="缺少可执行代码" description={wizardDeployReadiness.message} />
              )}
              <Space wrap style={{ width: '100%', marginTop: 12 }}>
                <Select
                  style={{ width: 180 }}
                  value={deployEnvironment}
                  onChange={(val) => setDeployEnvironment(val)}
                  options={DEPLOY_ENV_OPTIONS}
                />
                <Select
                  style={{ width: 220 }}
                  value={deployStrategy}
                  onChange={(val) => setDeployStrategy(val)}
                  options={[
                    { label: 'hot_reload', value: 'hot_reload' },
                    { label: 'rolling_restart', value: 'rolling_restart' },
                    { label: 'full_restart', value: 'full_restart' },
                  ]}
                />
                <Button loading={wizardAssistMutationLoading} disabled={!wizardReleaseId} onClick={onWizardAssist}>
                  AI 辅助设置
                </Button>
              </Space>
              <div style={{ marginTop: 12 }}>
                <DeploymentSmokeInputEditor
                  sourcePayload={wizardDetail?.currentSourceSnapshot?.sourcePayload}
                  environment={deployEnvironment}
                  draft={deploySmokeInputDraft}
                  onChange={setDeploySmokeInputDraft}
                />
              </div>
            </Card>

            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Button onClick={onCancel}>稍后继续</Button>
              <Button
                type="primary"
                loading={deployMutationLoading}
                disabled={!wizardDeployReadiness.hasExecutableCode || (deployEnvironment === 'prod' && !wizardHasSuccessfulStagingDeployment)}
                onClick={handleWizardDeploy}
              >
                部署到 {deployEnvironment}
              </Button>
            </Space>
          </Space>
        )}

        {createWizardStep === 2 && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Card size="small" title="Skills 发布" style={{ borderRadius: 12 }}>
              <Alert type="info" showIcon message="发布 Skills" description="这里会自动串联“生成草案 -> 审批 -> 发布”，完成后进入真实校验。" />
            </Card>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Button onClick={onCancel}>稍后继续</Button>
              <Button
                type="primary"
                loading={publishMutationLoading || generateDraftMutationLoading || approveMutationLoading}
                disabled={!wizardRelease}
                onClick={() => (wizardRelease ? handlePublishSkill(wizardRelease) : undefined)}
              >
                自动发布 Skills
              </Button>
            </Space>
          </Space>
        )}

        {createWizardStep === 3 && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {latestValidation && (
              <Alert
                type={latestValidation.success ? 'success' : 'error'}
                showIcon
                message={
                  latestValidation.success
                    ? `真实校验通过（得分：${latestValidation.score} 分）`
                    : `真实校验未通过（得分：${latestValidation.score} 分）`
                }
                description={
                  <div>
                    {latestValidation.success ? (
                      <div>
                        <div>工作流端到端执行完成，结果符合预期。</div>
                        {artifacts.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text strong>产出文档工件：</Text>
                            {artifacts.map((art, idx) => (
                              <Button
                                key={idx}
                                type="primary"
                                size="small"
                                href={art.downloadUrl}
                                target="_blank"
                              >
                                📥 下载 {art.name || art.label || '文档工件'}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 6 }}>
                          {latestValidation.errorSummary || '校验执行发生异常'}
                        </div>
                        {latestValidation.logs && latestValidation.logs.length > 0 && (
                          <div
                            style={{
                              maxHeight: 140,
                              overflowY: 'auto',
                              background: 'rgba(0, 0, 0, 0.04)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                              fontSize: 12,
                            }}
                          >
                            {latestValidation.logs.map((log, idx) => (
                              <div key={idx}>{log}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                }
              />
            )}

            <Card
              size="small"
              title={
                <Space>
                  <span>自然语言技能调用验证 (Prompt Driven)</span>
                  {wizardRelease?.publishedSkillId && (
                    <Tag color="cyan">
                      已发布 Skill #{wizardRelease.publishedSkillId.slice(0, 8)}
                    </Tag>
                  )}
                </Space>
              }
              style={{ borderRadius: 12 }}
            >
              <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                技能已发布上线。真实校验通过自然语言 Prompt 驱动已发布的 Skill，验证意图理解、参数抽取与端到端自动化执行闭环。
              </Paragraph>
              <Form.Item
                label={<Text strong>自然语言测试指令 (User Prompt)</Text>}
                style={{ marginBottom: 8 }}
              >
                <TextArea
                  rows={3}
                  value={wizardValidationCasesDraft}
                  onChange={(e) => setWizardValidationCasesDraft(e.target.value)}
                  placeholder="请输入自然语言指令，例如：审批案件，毛利率阈值设为10"
                />
              </Form.Item>
              {recommendedPrompts.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>推荐指令快速填入：</Text>
                  {recommendedPrompts.map((p, idx) => (
                    <Button
                      key={idx}
                      size="small"
                      type="dashed"
                      onClick={() => setWizardValidationCasesDraft(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              )}
            </Card>

            <Collapse
              ghost
              items={[
                {
                  key: 'smokeInput',
                  label: '高级选项：底层执行凭证与环境参数覆盖 (可选)',
                  children: (
                    <div>
                      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                        自然语言调用已发布 Skill 时，将默认携带以下配置的环境参数与一次性验证凭证。
                      </Paragraph>
                      <DeploymentSmokeInputEditor
                        sourcePayload={wizardDetail?.currentSourceSnapshot?.sourcePayload}
                        environment={deployEnvironment}
                        draft={deploySmokeInputDraft}
                        onChange={setDeploySmokeInputDraft}
                      />
                    </div>
                  ),
                },
              ]}
            />

            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Button onClick={onCancel}>完成并关闭</Button>
              <Button
                type="primary"
                loading={realValidateMutationLoading}
                onClick={handleWizardValidate}
              >
                {latestValidation?.success ? '重新开始真实校验' : '开始真实校验'}
              </Button>
            </Space>
          </Space>
        )}
      </Space>
    </Modal>
  );
};
