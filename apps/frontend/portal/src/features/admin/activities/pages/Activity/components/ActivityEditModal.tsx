import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Switch,
  Select,
  Button,
  Space,
  Tabs,
  Row,
  Col,
  Alert,
  message,
  Typography,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  SaveOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { activityApi, type ActivityDTO, type CreateActivityDto } from '@/api/activity';
import { skillApi, type SkillConfigDTO } from '@/api/skill';
import { ActivityHandlerConfigForm } from './ActivityHandlerConfigForm';
import { ActivityCodePreviewModal } from './ActivityCodePreviewModal';
import { generatePythonCode, skillToActivityDraft } from '../utils/activityHelpers';

const { TextArea } = Input;
const { Text } = Typography;

export interface ActivityEditModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateActivityDto) => void;
  editingActivity: ActivityDTO | null;
  initialDraft?: Partial<CreateActivityDto> | null;
  loading: boolean;
  onTestActivity?: (activity: ActivityDTO | CreateActivityDto) => void;
}

export const ActivityEditModal: React.FC<ActivityEditModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  editingActivity,
  initialDraft,
  loading,
  onTestActivity,
}) => {
  const [form] = Form.useForm();
  const [selectedHandler, setSelectedHandler] = useState<string>('script');
  const [codePreviewVisible, setCodePreviewVisible] = useState<boolean>(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>(undefined);

  // Fetch all skills for "从技能库快速生成"
  const skillsQuery = useQuery(['skills', 'list-for-activity'], skillApi.list, {
    enabled: visible,
    staleTime: 60_000,
  });

  const skillsList: SkillConfigDTO[] = skillsQuery.data?.skills || [];

  useEffect(() => {
    if (visible) {
      setSelectedSkillId(undefined);
      if (editingActivity) {
        setSelectedHandler(editingActivity.handler || 'script');
        form.setFieldsValue({
          name: editingActivity.name,
          fn: editingActivity.fn,
          description: editingActivity.config?.description || '',
          handler: editingActivity.handler || 'script',
          timeout: editingActivity.timeout || '60s',
          isActive: editingActivity.isActive !== false,
          config: editingActivity.config || {},
        });
        setGeneratedCode(editingActivity.generatedCode || '');
      } else if (initialDraft) {
        setSelectedHandler(initialDraft.handler || 'script');
        form.setFieldsValue({
          name: initialDraft.name || '',
          fn: initialDraft.fn || '',
          description: initialDraft.config?.description || '',
          handler: initialDraft.handler || 'script',
          timeout: initialDraft.timeout || '60s',
          isActive: initialDraft.isActive !== false,
          config: initialDraft.config || {},
        });
        setGeneratedCode(initialDraft.generatedCode || '');
      } else {
        setSelectedHandler('script');
        form.resetFields();
        setGeneratedCode('');
      }
    }
  }, [visible, editingActivity, initialDraft, form]);

  const handleSelectSkill = (skillId: string) => {
    setSelectedSkillId(skillId);
    const skill = skillsList.find((s: SkillConfigDTO) => s.id === skillId);
    if (!skill) return;

    const draft = skillToActivityDraft(skill);
    setSelectedHandler(draft.handler);
    form.setFieldsValue({
      name: draft.name,
      fn: draft.fn,
      description: draft.config?.description || '',
      handler: draft.handler,
      timeout: draft.timeout,
      isActive: draft.isActive,
      config: draft.config,
    });
    message.success(`已成功从技能 [${skill.name}] 导入并生成 Activity 配置草稿`);
  };

  const handleFinish = (values: any) => {
    const rawConfig = values.config || {};
    onSubmit({
      name: values.name,
      fn: values.fn,
      handler: values.handler || 'script',
      timeout: values.timeout || '60s',
      config: {
        ...rawConfig,
        description: values.description || '',
      },
      isActive: values.isActive !== false,
      generatedCode: generatedCode || undefined,
    });
  };

  const handleGenerateCode = async () => {
    const values = form.getFieldsValue();
    setIsGeneratingCode(true);

    try {
      const res = await activityApi.generateCode({
        name: values.name || 'SampleActivity',
        fn: values.fn || 'sample_activity',
        handler: values.handler || 'script',
        timeout: values.timeout || '60s',
        config: values.config || {},
        isActive: values.isActive !== false,
      });

      if (res?.success && res.code) {
        setGeneratedCode(res.code);
        message.success('已通过 AI 代码生成引擎构建 Python Activity 代码');
        setCodePreviewVisible(true);
        return;
      }
    } catch (err) {
      console.warn('Backend generateCode failed, fallback to local code generator:', err);
    } finally {
      setIsGeneratingCode(false);
    }

    // Local fallback generator
    const localCode = generatePythonCode({
      name: values.name || 'SampleActivity',
      fn: values.fn || 'sample_activity',
      description: values.description || '',
      isActive: values.isActive !== false,
      startToCloseTimeout: values.timeout || '60s',
      steps: [
        {
          id: 'step_1',
          name: values.name || 'Step 1',
          type: (values.handler || 'script') as any,
          timeout: values.timeout || '60s',
          config: values.config || {},
        },
      ],
    });
    setGeneratedCode(localCode);
    setCodePreviewVisible(true);
  };

  const isCloneOrNew = !editingActivity;

  return (
    <>
      <Modal
        open={visible}
        title={
          <Space>
            <CodeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>
              {editingActivity
                ? `编辑 Activity: ${editingActivity.name}`
                : initialDraft?.name
                ? `克隆生成 Activity: ${initialDraft.name}`
                : '新建 Activity 定义'}
            </span>
          </Space>
        }
        onCancel={onCancel}
        width={960}
        footer={null}
        destroyOnClose
      >
        {isCloneOrNew && (
          <Alert
            message="快速生成与复用"
            description={
              <div style={{ marginTop: 6 }}>
                <Space wrap align="center">
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    复制技能 (Skills) 快速生成对应工作单元：
                  </Text>
                  <Select
                    showSearch
                    placeholder="从已有技能库中选择技能一键生成..."
                    style={{ minWidth: 280 }}
                    value={selectedSkillId}
                    onChange={handleSelectSkill}
                    filterOption={(input, option) =>
                      String(option?.label || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    options={skillsList.map((s: SkillConfigDTO) => ({
                      label: `${s.name} (${s.triggerKeywords?.[0] || '技能'})`,
                      value: s.id,
                    }))}
                    allowClear
                  />
                  {initialDraft && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已预填克隆副本参数，可直接调整并保存。
                    </Text>
                  )}
                </Space>
              </div>
            }
            type="info"
            showIcon
            icon={<ThunderboltOutlined style={{ color: '#8b5cf6' }} />}
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            handler: 'script',
            isActive: true,
            timeout: '60s',
          }}
          onFinish={handleFinish}
        >
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基本定义',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          label="Activity 名称"
                          name="name"
                          rules={[{ required: true, message: '请输入 Activity 名称' }]}
                        >
                          <Input placeholder="如：Send Email Notification Activity" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          label="Python 函数名 (fn)"
                          name="fn"
                          rules={[{ required: true, message: '请输入 Python 函数名' }]}
                          tooltip="在 Temporal 工作流 worker 中注册的 python 异步函数名"
                        >
                          <Input placeholder="如：send_email_activity" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          label="处理器类型 (Handler)"
                          name="handler"
                          rules={[{ required: true }]}
                        >
                          <Select
                            onChange={(val) => setSelectedHandler(val)}
                            options={[
                              { label: '脚本 (Script)', value: 'script' },
                              { label: 'API 请求 (HTTP)', value: 'api' },
                              { label: 'Carbone 报表渲染', value: 'carbone' },
                              { label: '浏览器自动化 (Playwright)', value: 'browser' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="超时时间" name="timeout">
                          <Input placeholder="如：60s, 5m" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="启用状态" name="isActive" valuePropName="checked">
                          <Switch checkedChildren="已启用" unCheckedChildren="已停用" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item label="描述说明" name="description">
                      <TextArea rows={3} placeholder="描述该 Activity 的职责、上下游调用约定与使用场景..." />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'handlerConfig',
                label: 'Handler 配置与细节',
                children: <ActivityHandlerConfigForm handler={selectedHandler} />,
              },
            ]}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <Space>
              <Button
                icon={<RobotOutlined spin={isGeneratingCode} />}
                onClick={handleGenerateCode}
                loading={isGeneratingCode}
              >
                AI 生成 Python 代码
              </Button>
              {generatedCode && (
                <Button icon={<CodeOutlined />} onClick={() => setCodePreviewVisible(true)}>
                  查看当前生成代码
                </Button>
              )}
              {onTestActivity && (
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => {
                    const currentValues = form.getFieldsValue();
                    onTestActivity({ ...editingActivity, ...currentValues });
                  }}
                >
                  调试 / 在线测试
                </Button>
              )}
            </Space>

            <Space>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                保存 Activity
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <ActivityCodePreviewModal
        visible={codePreviewVisible}
        onCancel={() => setCodePreviewVisible(false)}
        code={generatedCode}
        onSaveCode={(code) => {
          setGeneratedCode(code);
          message.success('代码已保存到当前 Activity 定义中，请点击【保存 Activity】提交。');
          setCodePreviewVisible(false);
        }}
      />
    </>
  );
};

export default ActivityEditModal;
