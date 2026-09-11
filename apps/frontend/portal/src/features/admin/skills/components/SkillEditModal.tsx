import React, { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Collapse,
  Divider,
  Card,
  Popconfirm,
  Badge,
  Tabs,
} from 'antd';
import {
  InfoCircleOutlined,
  ThunderboltOutlined,
  OrderedListOutlined,
  DragOutlined,
  CloseOutlined,
  PlusOutlined,
  ApiOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SkillConfigDTO, CreateSkillDTO } from '@/api/skill';
import {
  STEP_TYPES,
  schemaToFormParams,
  formParamsToSchema,
} from '../utils/skillHelpers';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TabPane } = Tabs;

interface SkillEditModalProps {
  open: boolean;
  editingSkill: SkillConfigDTO | null;
  onClose: () => void;
  onSave: (data: CreateSkillDTO, editingSkillId?: string) => void;
  onDelete?: (id: string, name?: string) => void;
  onValidate?: (skill: SkillConfigDTO) => void;
  validatingSkillId?: string | null;
  saveLoading?: boolean;
  deleteLoading?: boolean;
  templateOptions?: { label: string; value: string }[];
  templatesLoading?: boolean;
  executionFlowTemplates?: any[];
  executionFlowTemplatesLoading?: boolean;
}

export const SkillEditModal: React.FC<SkillEditModalProps> = ({
  open,
  editingSkill,
  onClose,
  onSave,
  onDelete,
  onValidate,
  validatingSkillId,
  saveLoading = false,
  deleteLoading = false,
  templateOptions = [],
  templatesLoading = false,
  executionFlowTemplates = [],
  executionFlowTemplatesLoading = false,
}) => {
  const { t } = useTranslation(['common', 'admin']);
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (editingSkill) {
        form.setFieldsValue({
          name: editingSkill.name,
          description: editingSkill.description,
          triggerKeywords: editingSkill.triggerKeywords || [],
          executionFlow: editingSkill.executionFlow || [],
          templateId: editingSkill.templateId,
          carboneTemplateId: editingSkill.carboneTemplateId,
          carboneSkillId: editingSkill.carboneSkillId,
          executionFlowTemplateIds: editingSkill.executionFlowTemplateIds || [],
          parameterDefinitions: schemaToFormParams(editingSkill.paramsSchema),
          paramsSchema: editingSkill.paramsSchema
            ? JSON.stringify(editingSkill.paramsSchema, null, 2)
            : '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          triggerKeywords: [],
          executionFlow: [],
          tools: [],
          parameterDefinitions: [],
          executionFlowTemplateIds: [],
          paramsSchema: '',
        });
      }
    }
  }, [open, editingSkill, form]);

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      let paramsSchema = formParamsToSchema(values.parameterDefinitions || []);
      if (
        values.paramsSchema &&
        typeof values.paramsSchema === 'string' &&
        values.paramsSchema.trim()
      ) {
        try {
          paramsSchema = JSON.parse(values.paramsSchema);
        } catch {
          // fallback to formParamsToSchema
        }
      }

      const data: CreateSkillDTO = {
        name: values.name,
        description: values.description,
        triggerKeywords: values.triggerKeywords || [],
        executionFlow: values.executionFlow || [],
        paramsSchema,
        templateId: values.templateId,
        carboneTemplateId: values.carboneTemplateId,
        carboneSkillId: values.carboneSkillId,
        executionFlowTemplateIds: values.executionFlowTemplateIds || [],
      };

      onSave(data, editingSkill?.id);
    });
  };

  return (
    <Modal
      title={editingSkill ? t('admin:editSkill') : t('admin:createSkill')}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={saveLoading}
      width={950}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        editingSkill && onDelete && (
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            loading={deleteLoading}
            onClick={() => onDelete(editingSkill.id, editingSkill.name)}
          >
            删除 Skill
          </Button>
        ),
        editingSkill && onValidate && (
          <Button
            key="validate"
            icon={<CheckCircleOutlined />}
            onClick={() => onValidate(editingSkill)}
            loading={validatingSkillId === editingSkill.id}
          >
            验证并优化
          </Button>
        ),
        <Button
          key="submit"
          type="primary"
          onClick={handleSubmit}
          loading={saveLoading}
        >
          确定
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Collapse defaultActiveKey={[]} ghost>
          <Panel
            header={
              <Text strong style={{ fontSize: 16 }}>
                <InfoCircleOutlined /> 基本信息
              </Text>
            }
            key="basic"
          >
            <div style={{ padding: '0 16px' }}>
              <Form.Item
                name="name"
                label={t('admin:skillName')}
                rules={[{ required: true, message: '请输入技能名称' }]}
              >
                <Input placeholder="技能显示名称，例如：保密合同生成" />
              </Form.Item>
              <Form.Item
                name="description"
                label={t('admin:skillDescription')}
                rules={[{ required: true, message: '请输入描述' }]}
              >
                <Input.TextArea rows={2} placeholder="详细描述技能的功能和用途" />
              </Form.Item>
              <Form.Item
                name="triggerKeywords"
                label={t('admin:triggerKeywords')}
                extra="AI语义匹配失败时的回退方案，输入关键词后按回车添加"
              >
                <Select mode="tags" placeholder="输入关键词" />
              </Form.Item>
            </div>
          </Panel>

          <Panel
            header={
              <Text strong style={{ fontSize: 16 }}>
                <ThunderboltOutlined /> 执行流程编排
              </Text>
            }
            key="flow"
          >
            <div style={{ padding: '0 16px' }}>
              <Form.Item
                name="executionFlowTemplateIds"
                label="关联流程模板 (可多选)"
                extra="按顺序关联一个或多个流程模板。模板步骤将优先执行，随后执行下方手动编排的步骤。"
              >
                <Select
                  mode="multiple"
                  placeholder="选择流程模板"
                  allowClear
                  showSearch
                  loading={executionFlowTemplatesLoading}
                >
                  {executionFlowTemplates.map((template) => (
                    <Option key={template.id} value={template.id}>
                      <Space>
                        <OrderedListOutlined />
                        <Text>{template.name}</Text>
                        <Badge
                          count={template.steps?.length || 0}
                          showZero
                          style={{ marginLeft: 8 }}
                        />
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.List name="executionFlow">
                {(fields, { add, remove, move }) => (
                  <div style={{ marginTop: 16 }}>
                    <Divider orientation="left">手动追加/编排步骤</Divider>
                    {fields.map(({ key, name, ...restField }, index) => (
                      <Card
                        key={key}
                        size="small"
                        style={{
                          marginBottom: 12,
                          borderLeft: '4px solid var(--primary-color)',
                        }}
                        title={
                          <Space>
                            <DragOutlined
                              style={{ cursor: 'grab', color: 'var(--text-light)' }}
                            />
                            <Text strong>步骤 {index + 1}</Text>
                          </Space>
                        }
                        extra={
                          <Space>
                            {index > 0 && (
                              <Button
                                type="link"
                                size="small"
                                onClick={() => move(index, index - 1)}
                              >
                                上移
                              </Button>
                            )}
                            {index < fields.length - 1 && (
                              <Button
                                type="link"
                                size="small"
                                onClick={() => move(index, index + 1)}
                              >
                                下移
                              </Button>
                            )}
                            <Popconfirm
                              title="确定删除此步骤吗？"
                              onConfirm={() => remove(name)}
                            >
                              <Button
                                type="link"
                                danger
                                size="small"
                                icon={<CloseOutlined />}
                              />
                            </Popconfirm>
                          </Space>
                        }
                      >
                        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                          <Form.Item
                            {...restField}
                            name={[name, 'type']}
                            label="类型"
                            rules={[{ required: true }]}
                            style={{ width: 200, marginBottom: 0 }}
                          >
                            <Select placeholder="选择类型">
                              {STEP_TYPES.map((t) => (
                                <Option key={t.value} value={t.value}>
                                  <Space>
                                    {t.icon}
                                    {t.label}
                                  </Space>
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'name']}
                            label="名称"
                            rules={[{ required: true }]}
                            style={{ flex: 1, marginBottom: 0 }}
                          >
                            <Input placeholder="步骤名称" />
                          </Form.Item>
                        </div>

                        <Form.Item shouldUpdate noStyle>
                          {() => {
                            const type = form.getFieldValue([
                              'executionFlow',
                              name,
                              'type',
                            ]);
                            if (type === 'text') {
                              return (
                                <Form.Item
                                  {...restField}
                                  name={[name, 'content']}
                                  label="提示词内容"
                                >
                                  <Input.TextArea
                                    rows={3}
                                    placeholder="输入 AI 提示词或指导文本"
                                  />
                                </Form.Item>
                              );
                            }
                            if (type === 'api') {
                              return (
                                <div
                                  style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    padding: 12,
                                    borderRadius: 4,
                                  }}
                                >
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'api', 'endpoint']}
                                    label="API 地址"
                                  >
                                    <Input placeholder="https://api.example.com/v1/..." />
                                  </Form.Item>
                                  <div style={{ display: 'flex', gap: 16 }}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'api', 'method']}
                                      label="方法"
                                      style={{ width: 120 }}
                                    >
                                      <Select defaultValue="GET">
                                        <Option value="GET">GET</Option>
                                        <Option value="POST">POST</Option>
                                        <Option value="PUT">PUT</Option>
                                        <Option value="DELETE">DELETE</Option>
                                      </Select>
                                    </Form.Item>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'api', 'timeout']}
                                      label="超时(ms)"
                                      style={{ flex: 1 }}
                                    >
                                      <Input type="number" placeholder="30000" />
                                    </Form.Item>
                                  </div>
                                </div>
                              );
                            }
                            if (type === 'tool') {
                              return (
                                <Form.Item
                                  {...restField}
                                  name={[name, 'tool', 'name']}
                                  label="工具名称"
                                >
                                  <Input placeholder="例如：skill_match, document_render..." />
                                </Form.Item>
                              );
                            }
                            if (type === 'script') {
                              return (
                                <div
                                  style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    padding: 12,
                                    borderRadius: 4,
                                  }}
                                >
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'script', 'language']}
                                    label="脚本语言"
                                  >
                                    <Select defaultValue="javascript">
                                      <Option value="javascript">JavaScript</Option>
                                      <Option value="python">Python</Option>
                                      <Option value="bash">Bash</Option>
                                    </Select>
                                  </Form.Item>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'script', 'code']}
                                    label="代码内容"
                                  >
                                    <Input.TextArea
                                      rows={5}
                                      style={{ fontFamily: 'monospace' }}
                                      placeholder="输入脚本代码"
                                    />
                                  </Form.Item>
                                </div>
                              );
                            }
                            return null;
                          }}
                        </Form.Item>
                      </Card>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add({ type: 'text', name: '新步骤' })}
                      block
                      icon={<PlusOutlined />}
                    >
                      添加追加步骤
                    </Button>
                  </div>
                )}
              </Form.List>
            </div>
          </Panel>

          <Panel
            header={
              <Text strong style={{ fontSize: 16 }}>
                <ApiOutlined /> 参数与配置
              </Text>
            }
            key="params"
          >
            <div style={{ padding: '0 16px' }}>
              <Tabs size="small">
                <TabPane tab="参数 Schema" key="schema_edit">
                  <Form.Item
                    name="paramsSchema"
                    label="JSON 定义"
                    extra="定义技能执行所需的参数及其提取提示。支持 JSON 格式。"
                  >
                    <Input.TextArea
                      rows={10}
                      style={{ fontFamily: 'monospace' }}
                      placeholder={`{\n  "properties": {\n    "city": {\n      "type": "string",\n      "description": "城市名称",\n      "required": true,\n      "extractionPrompt": "从用户输入中提取城市"\n    }\n  },\n  "required": ["city"]\n}`}
                    />
                  </Form.Item>
                </TabPane>
                <TabPane tab="文档模板配置" key="carbone_edit">
                  <div style={{ marginTop: 8 }}>
                    <Form.Item
                      name="carboneTemplateId"
                      label={t('admin:carboneTemplateId')}
                      extra="选择已有的Carbone模板.用于文档渲染"
                    >
                      <Select
                        placeholder="选择模板"
                        allowClear
                        showSearch
                        loading={templatesLoading}
                        options={templateOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      name="carboneSkillId"
                      label={t('admin:carboneSkillId')}
                      extra="Carbone引擎的技能配置ID.用于AI参数生成"
                    >
                      <Input placeholder="UUID格式（可选）" />
                    </Form.Item>
                    <Form.Item name="templateId" label="内部模板ID">
                      <Input placeholder="自定义内部模板标识" />
                    </Form.Item>
                  </div>
                </TabPane>
              </Tabs>
            </div>
          </Panel>
        </Collapse>
      </Form>
    </Modal>
  );
};
