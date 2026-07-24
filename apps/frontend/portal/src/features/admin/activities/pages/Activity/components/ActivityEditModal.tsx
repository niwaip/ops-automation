import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Switch, Select, Button, Space, Tabs, Row, Col } from 'antd';
import { RobotOutlined, ThunderboltOutlined, SaveOutlined, CodeOutlined } from '@ant-design/icons';
import type { ActivityDTO, CreateActivityDto } from '@/api/activity';
import { ActivityHandlerConfigForm } from './ActivityHandlerConfigForm';
import { ActivityCodePreviewModal } from './ActivityCodePreviewModal';
import { generatePythonCode } from '../utils/activityHelpers';

const { TextArea } = Input;

export interface ActivityEditModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateActivityDto) => void;
  editingActivity: ActivityDTO | null;
  loading: boolean;
  onTestActivity?: (activity: ActivityDTO | CreateActivityDto) => void;
}

export const ActivityEditModal: React.FC<ActivityEditModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  editingActivity,
  loading,
  onTestActivity,
}) => {
  const [form] = Form.useForm();
  const [selectedHandler, setSelectedHandler] = useState<string>('script');
  const [codePreviewVisible, setCodePreviewVisible] = useState<boolean>(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');

  useEffect(() => {
    if (visible) {
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
      } else {
        setSelectedHandler('script');
        form.resetFields();
      }
    }
  }, [visible, editingActivity, form]);

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
    });
  };

  const handleGenerateCode = () => {
    const values = form.getFieldsValue();
    const mockFormData = {
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
    };
    const pythonCode = generatePythonCode(mockFormData);
    setGeneratedCode(pythonCode);
    setCodePreviewVisible(true);
  };

  return (
    <>
      <Modal
        open={visible}
        title={
          <Space>
            <CodeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>{editingActivity ? '编辑 Activity 定义' : '新建 Activity 定义'}</span>
          </Space>
        }
        onCancel={onCancel}
        width={960}
        footer={null}
        destroyOnClose
      >
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
                        >
                          <Input placeholder="如：send_email_activity" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item label="处理器类型 (Handler)" name="handler" rules={[{ required: true }]}>
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
                      <TextArea rows={3} placeholder="描述该 Activity 的职责与使用场景..." />
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
              <Button icon={<RobotOutlined />} onClick={handleGenerateCode}>
                AI 生成 Python 代码
              </Button>
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
      />
    </>
  );
};
