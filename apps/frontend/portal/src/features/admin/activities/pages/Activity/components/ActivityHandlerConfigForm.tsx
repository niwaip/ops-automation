import React from 'react';
import { Form, Input, Select, Card, Typography, Row, Col } from 'antd';

const { Text } = Typography;
const { TextArea } = Input;

export interface ActivityHandlerConfigFormProps {
  handler: string;
}

export const ActivityHandlerConfigForm: React.FC<ActivityHandlerConfigFormProps> = ({ handler }) => {
  if (handler === 'api') {
    return (
      <Card size="small" title="API 请求配置" style={{ borderRadius: 8, marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="HTTP 方法" name={['config', 'method']} initialValue="GET">
              <Select
                options={[
                  { label: 'GET', value: 'GET' },
                  { label: 'POST', value: 'POST' },
                  { label: 'PUT', value: 'PUT' },
                  { label: 'DELETE', value: 'DELETE' },
                  { label: 'PATCH', value: 'PATCH' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item
              label="URL 模板"
              name={['config', 'urlTemplate']}
              rules={[{ required: true, message: '请输入 URL 模板' }]}
            >
              <Input placeholder="https://api.example.com/v1/resource/{id}" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Headers 模板 (JSON)" name={['config', 'headersTemplate']}>
          <TextArea rows={2} placeholder='{"Authorization": "Bearer {token}"}' />
        </Form.Item>

        <Form.Item label="Query 参数模板 (JSON)" name={['config', 'queryTemplate']}>
          <TextArea rows={2} placeholder='{"page": "{page}", "limit": "{limit}"}' />
        </Form.Item>

        <Form.Item label="Body 模板 (JSON)" name={['config', 'jsonTemplate']}>
          <TextArea rows={3} placeholder='{"name": "{name}", "email": "{email}"}' />
        </Form.Item>

        <Form.Item label="响应字段映射 (JSON)" name={['config', 'responseFieldMappings']}>
          <TextArea rows={2} placeholder='{"resultId": "data.id", "status": "data.status"}' />
        </Form.Item>
      </Card>
    );
  }

  if (handler === 'carbone') {
    return (
      <Card size="small" title="Carbone 报表配置" style={{ borderRadius: 8, marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="模板 ID / 文件名"
              name={['config', 'templateId']}
              rules={[{ required: true, message: '请输入模板 ID' }]}
            >
              <Input placeholder="report_template_v1.docx" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="输出格式" name={['config', 'renderFormat']} initialValue="pdf">
              <Select
                options={[
                  { label: 'PDF (.pdf)', value: 'pdf' },
                  { label: 'Word (.docx)', value: 'docx' },
                  { label: 'Excel (.xlsx)', value: 'xlsx' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="数据 Payload 模板 (JSON)" name={['config', 'dataTemplate']}>
          <TextArea rows={4} placeholder='{"title": "{reportTitle}", "items": "{items}"}' />
        </Form.Item>
      </Card>
    );
  }

  if (handler === 'browser') {
    return (
      <Card size="small" title="浏览器自动化配置" style={{ borderRadius: 8, marginBottom: 16 }}>
        <Form.Item label="目标 URL" name={['config', 'targetUrl']} rules={[{ required: true }]}>
          <Input placeholder="https://admin.example.com/login" />
        </Form.Item>
        <Form.Item label="脚本动作指令 (JSON / DSL)" name={['config', 'scriptActions']}>
          <TextArea
            rows={4}
            placeholder='[{"action": "type", "selector": "#username", "value": "{user}"}, {"action": "click", "selector": "#submit"}]'
          />
        </Form.Item>
      </Card>
    );
  }

  return (
    <Card size="small" title="自定义 Python 脚本配置" style={{ borderRadius: 8, marginBottom: 16 }}>
      <Form.Item label="自定义 Python 逻辑脚本 / 命令" name={['config', 'customScript']}>
        <TextArea
          rows={6}
          placeholder="# 在此处输入自定义脚本逻辑&#10;def run(params):&#10;    return {'output': params.get('input')}"
        />
      </Form.Item>
      <Text type="secondary" style={{ fontSize: 12 }}>
        自定义脚本会在 Python Activity 执行阶段直接运行。
      </Text>
    </Card>
  );
};
