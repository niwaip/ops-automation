import {
  ClearOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  RobotOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  message as antdMessage,
} from 'antd';
import { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import { aiModelApi } from '@/api/ai';
import {
  workspaceApi,
  type WorkspaceFileDigest,
  type WorkspaceNode,
} from '@/api/workspace';

const { Text } = Typography;
const { TextArea } = Input;

export type CleanScope = 'selected' | 'all' | 'uncleaned';

interface WorkspaceAiCleanModalProps {
  open: boolean;
  nodes: WorkspaceNode[];
  workspaceId: string;
  initialScope?: CleanScope;
  onClose: () => void;
  onSuccess: (updatedDigest?: WorkspaceFileDigest) => void;
}

const PRESET_PROMPTS: Record<string, string> = {
  clean_summary:
    '请对文档进行深度去噪，移除页眉页脚、分页编号、无意义乱码和重复版权信息，输出高业务浓度的执行摘要及核心结论。',
  extract_data:
    '请提取文档中包含的关键参数、系统配置、IP端口、账户人员、联系方式及关键业务规程指标，输出为结构化键值。',
  custom: '',
};

export function WorkspaceAiCleanModal({
  open,
  nodes,
  workspaceId,
  initialScope,
  onClose,
  onSuccess,
}: WorkspaceAiCleanModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [extractMode, setExtractMode] = useState<'clean_summary' | 'extract_data' | 'custom'>(
    'clean_summary'
  );

  const isSingleNode = nodes.length === 1;
  const isReClean = isSingleNode && Boolean(nodes[0]?.digest?.cleanedByAi);

  const defaultScope: CleanScope = isSingleNode
    ? 'selected'
    : initialScope || (nodes.length > 0 ? 'selected' : 'all');
  const [scope, setScope] = useState<CleanScope>(defaultScope);

  useEffect(() => {
    if (open) {
      if (nodes.length === 1) {
        setScope('selected');
        const d = nodes[0].digest;
        const initialMode = d?.extractedData ? 'extract_data' : 'clean_summary';
        setExtractMode(initialMode);
        form.setFieldsValue({
          modelId: d?.aiModel || 'default',
          extractMode: initialMode,
          promptInstructions: d?.cleanPrompt || PRESET_PROMPTS[initialMode],
        });
      } else {
        const targetScope = initialScope || (nodes.length > 0 ? 'selected' : 'all');
        setScope(targetScope);
        form.setFieldsValue({
          modelId: 'default',
          extractMode: 'clean_summary',
          promptInstructions: PRESET_PROMPTS.clean_summary,
        });
      }
    }
  }, [open, initialScope, nodes, form]);

  // 加载可用 AI 模型列表
  const { data: modelsData, isLoading: isModelsLoading } = useQuery(
    ['admin-ai-models-clean'],
    () => aiModelApi.listForAdmin(),
    { staleTime: 120000, enabled: open }
  );

  const activeModels = (modelsData?.models || []).filter(
    (m) => m.status === 'active' || !m.status
  );

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const requestPayload = {
        useAi: true,
        modelId: values.modelId === 'default' ? undefined : values.modelId,
        extractMode,
        promptInstructions: values.promptInstructions || PRESET_PROMPTS[extractMode] || undefined,
      };

      if (isSingleNode) {
        const singleNode = nodes[0];
        const res = await workspaceApi.regenerateDigest(
          workspaceId,
          singleNode.id,
          requestPayload
        );
        if (res.success && res.digest) {
          antdMessage.success(
            isReClean
              ? `《${singleNode.name}》已成功重新清理与提炼！`
              : `《${singleNode.name}》AI 数据清理与摘要提取完成`
          );
          onSuccess(res.digest);
        }
      } else {
        const batchPayload = {
          scope,
          nodeIds: scope === 'selected' ? nodes.map((n) => n.id) : undefined,
          ...requestPayload,
        };

        const res = await workspaceApi.batchRegenerateDigest(workspaceId, batchPayload);
        antdMessage.success(
          `AI 批量清理完成：共处理 ${res.total} 篇，成功 ${res.successful} 篇，失败 ${res.failed} 篇`
        );
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      antdMessage.error(err.message || 'AI 清理调用异常');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (isSingleNode) {
      return isReClean
        ? `重新 AI 清理与提炼 - 《${nodes[0]?.name}》`
        : `个别文件 AI 清理与提炼 - 《${nodes[0]?.name}》`;
    }
    if (scope === 'all') return '一键全量空间文档 AI 清理与提炼';
    if (scope === 'uncleaned') return '仅补齐未清洗文档 AI 清理';
    return `批量 AI 数据清理 (${nodes.length} 个文件)`;
  };

  const getOkText = () => {
    if (loading) return '正在深度清理中，请稍候...';
    if (isSingleNode) {
      return isReClean ? '立即重新清理' : '立即执行 AI 清理';
    }
    return '立即执行 AI 清理';
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isReClean ? (
            <SyncOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          ) : (
            <RobotOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          )}
          <span>{getTitle()}</span>
          <Tag color={isReClean ? 'green' : 'blue'}>
            {isReClean ? '重新提炼' : '大模型驱动'}
          </Tag>
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={getOkText()}
      cancelText="取消"
      width={660}
      destroyOnClose
    >
      <div style={{ marginTop: 12 }}>
        {/* 单文件模式：展示目标文件详情与上次清理状态 */}
        {isSingleNode && nodes[0] && (
          <Alert
            type={isReClean ? 'success' : 'info'}
            showIcon
            message={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text strong>目标文件：</Text>
                  <Text code>{nodes[0].name}</Text>
                  <Tag color={isReClean ? 'green' : 'cyan'}>
                    {isReClean ? '已完成大模型深度清理（支持调整重新清理）' : '当前为规则初级摘要（待 AI 清理）'}
                  </Tag>
                </div>
                {isReClean && nodes[0].digest && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    上次清理模型：{nodes[0].digest.aiModel || '系统默认'} · 上次提炼时间：
                    {nodes[0].digest.extractedAt
                      ? new Date(nodes[0].digest.extractedAt).toLocaleString()
                      : '-'}
                  </Text>
                )}
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 多文件/批量模式：提供治理范围选择 */}
        {!isSingleNode && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              治理范围 (Scope)：
            </Text>
            <Radio.Group
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <Radio value="all">
                <Space>
                  <GlobalOutlined style={{ color: '#1677ff' }} />
                  <Text strong>全量空间文档</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    （扫描当前工作空间下的全部文件，进行全量重新深度清理）
                  </Text>
                </Space>
              </Radio>

              <Radio value="uncleaned">
                <Space>
                  <SyncOutlined style={{ color: '#52c41a' }} />
                  <Text strong>仅未清洗文档</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    （仅补齐规则摘要与未建卡文件，自动跳过已有 AI 深度提炼的文档）
                  </Text>
                </Space>
              </Radio>

              {nodes.length > 0 && (
                <Radio value="selected">
                  <Space>
                    <RobotOutlined style={{ color: '#722ed1' }} />
                    <Text strong>当前勾选文件 ({nodes.length} 篇)</Text>
                  </Space>
                </Radio>
              )}
            </Radio.Group>
          </div>
        )}

        {scope === 'selected' && nodes.length > 1 && (
          <Alert
            type="info"
            showIcon
            message={
              <div>
                <Text strong>已选中 {nodes.length} 个文档：</Text>
                <div style={{ maxHeight: 60, overflowY: 'auto', marginTop: 4 }}>
                  {nodes.map((n) => (
                    <Tag key={n.id} style={{ marginBottom: 4 }}>
                      {n.name}
                    </Tag>
                  ))}
                </div>
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {loading && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <Progress percent={99} status="active" showInfo={false} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              大模型正在并发分析与清理文本，请勿关闭窗口...
            </Text>
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            modelId: 'default',
            extractMode: 'clean_summary',
            promptInstructions: PRESET_PROMPTS.clean_summary,
          }}
        >
          <Form.Item
            label="调用 AI 算法模型"
            name="modelId"
            tooltip="选择执行文档提炼与清洗任务的 LLM，不选则使用系统全局默认模型"
          >
            <Select
              loading={isModelsLoading}
              placeholder="选择 AI 模型（默认全局模型）"
              options={[
                { label: '系统默认模型 (Auto Default)', value: 'default' },
                ...activeModels.map((m) => ({
                  label: `${m.name} (${m.provider})`,
                  value: m.id,
                })),
              ]}
            />
          </Form.Item>

          <Form.Item label="清洗与抽取任务模式" required>
            <Radio.Group
              value={extractMode}
              onChange={(e) => {
                const mode = e.target.value;
                setExtractMode(mode);
                form.setFieldsValue({
                  promptInstructions: PRESET_PROMPTS[mode] || '',
                });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <Radio value="clean_summary">
                <Space direction="vertical" size={2}>
                  <Text strong>
                    <ClearOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                    深度去噪与业务摘要
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    去除乱码、无用页眉页脚与多余符号，高浓度提炼业务结论与章节大纲
                  </Text>
                </Space>
              </Radio>

              <Radio value="extract_data">
                <Space direction="vertical" size={2}>
                  <Text strong>
                    <DatabaseOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                    特定业务数据与参数抽取
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    抽取关键配置、IP/端口、账号人员、规程指标等，沉淀为结构化数据
                  </Text>
                </Space>
              </Radio>

              <Radio value="custom">
                <Space direction="vertical" size={2}>
                  <Text strong>
                    <ExperimentOutlined style={{ marginRight: 4, color: '#fa8c16' }} />
                    自定义清洗指令
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    针对特定业务文档形态，输入个性化提示词
                  </Text>
                </Space>
              </Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="定制指令 / 提示词需求"
            name="promptInstructions"
            tooltip="可针对文档特定格式、术语或清洗目标添加特殊要求"
          >
            <TextArea
              rows={3}
              placeholder="请输入您希望 AI 遵循的数据清洗与特定字段提取要求..."
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}
