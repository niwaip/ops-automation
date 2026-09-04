import {
  ClearOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  message as antdMessage,
} from 'antd';
import { useState } from 'react';
import { useQuery } from 'react-query';
import { aiModelApi } from '@/api/ai';
import {
  workspaceApi,
  type WorkspaceFileDigest,
  type WorkspaceNode,
} from '@/api/workspace';

const { Text } = Typography;
const { TextArea } = Input;

interface WorkspaceAiCleanModalProps {
  open: boolean;
  nodes: WorkspaceNode[];
  workspaceId: string;
  onClose: () => void;
  onSuccess: (updatedDigest?: WorkspaceFileDigest) => void;
}

const PRESET_PROMPTS: Record<string, string> = {
  clean_summary: '请对文档进行深度去噪，移除页眉页脚、分页编号、无意义乱码和重复版权信息，输出高业务浓度的执行摘要及核心结论。',
  extract_data: '请提取文档中包含的关键参数、系统配置、IP端口、账户人员、联系方式及关键业务规程指标，输出为结构化键值。',
  custom: '',
};

export function WorkspaceAiCleanModal({
  open,
  nodes,
  workspaceId,
  onClose,
  onSuccess,
}: WorkspaceAiCleanModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [extractMode, setExtractMode] = useState<'clean_summary' | 'extract_data' | 'custom'>(
    'clean_summary'
  );

  // 加载可用 AI 模型列表
  const { data: modelsData, isLoading: isModelsLoading } = useQuery(
    ['admin-ai-models-clean'],
    () => aiModelApi.listForAdmin(),
    { staleTime: 120000, enabled: open }
  );

  const activeModels = (modelsData?.models || []).filter(
    (m) => m.status === 'active' || !m.status
  );

  const isBatch = nodes.length > 1;

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

      if (isBatch) {
        const res = await workspaceApi.batchRegenerateDigest(workspaceId, {
          nodeIds: nodes.map((n) => n.id),
          ...requestPayload,
        });
        antdMessage.success(
          `批量 AI 清洗完成：成功 ${res.successful} 个，失败 ${res.failed} 个`
        );
        onSuccess();
      } else {
        const singleNode = nodes[0];
        const res = await workspaceApi.regenerateDigest(
          workspaceId,
          singleNode.id,
          requestPayload
        );
        if (res.success && res.digest) {
          antdMessage.success(`《${singleNode.name}》AI 数据清洗与摘要提取完成`);
          onSuccess(res.digest);
        }
      }
      onClose();
    } catch (err: any) {
      antdMessage.error(err.message || 'AI 清洗调用异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RobotOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>
            {isBatch
              ? `批量 AI 数据清洗 (${nodes.length} 个文件)`
              : `AI 数据深度清洗与特定数据提炼`}
          </span>
          <Tag color="blue">大模型驱动</Tag>
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={loading ? '正在深度清洗...' : '立即执行 AI 清洗'}
      cancelText="取消"
      width={640}
      destroyOnClose
    >
      <div style={{ marginTop: 12 }}>
        {!isBatch && nodes[0] && (
          <Alert
            type="info"
            showIcon
            message={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong>目标文件：</Text>
                <Text code>{nodes[0].name}</Text>
                <Text type="secondary">({nodes[0].mimeType || '未知类型'})</Text>
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {isBatch && (
          <Alert
            type="info"
            showIcon
            message={
              <div>
                <Text strong>已选中 {nodes.length} 个文档进行批量处理：</Text>
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
              rows={4}
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
