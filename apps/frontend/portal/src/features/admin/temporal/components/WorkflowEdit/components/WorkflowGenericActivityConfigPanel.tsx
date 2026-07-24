import React from 'react';
import { Form, Input, Select, InputNumber, Switch, Typography, Card, Space, Tag } from 'antd';
import type { WorkflowSelectableActivity } from '../hooks/useWorkflowEditState';

const { Text } = Typography;

export interface WorkflowGenericActivityConfigPanelProps {
  selectedStepIndexForConfig: number;
  selectedStep: any;
  selectedStepActivity: WorkflowSelectableActivity | undefined;
  handleUpdateStep: (index: number, field: string, value: unknown) => void;
  renderTipLabel: (title: string, tip: string) => React.ReactNode;
  TWO_COLUMN_GRID_STYLE: React.CSSProperties;
  CONFIG_SECTION_STYLE: React.CSSProperties;
}

export const WorkflowGenericActivityConfigPanel: React.FC<WorkflowGenericActivityConfigPanelProps> = ({
  selectedStepIndexForConfig,
  selectedStep,
  selectedStepActivity,
  handleUpdateStep,
  renderTipLabel,
  TWO_COLUMN_GRID_STYLE,
  CONFIG_SECTION_STYLE,
}) => {
  const stepInput = (selectedStep?.input as Record<string, any>) || {};

  const updateInputParam = (key: string, val: any) => {
    handleUpdateStep(selectedStepIndexForConfig, 'input', {
      ...stepInput,
      [key]: val,
    });
  };

  const activityRef = selectedStep?.activityRef || '';
  const activityFn = selectedStepActivity?.fn || selectedStep?.activityName || '';

  const isFileRead = activityRef === 'builtin:fileRead' || activityFn === 'fileRead';
  const isFileWrite = activityRef === 'builtin:fileWrite' || activityFn === 'fileWrite';

  return (
    <div style={{ marginTop: 12 }}>
      {isFileRead && (
        <Card
          size="small"
          style={CONFIG_SECTION_STYLE}
          title={
            <Text strong style={{ fontSize: 13 }}>
              文件读取配置 (fileRead)
            </Text>
          }
        >
          <Form layout="vertical" size="small">
            <Form.Item
              label={renderTipLabel(
                '存储协议 (protocol)',
                '指定存储服务协议，支持本地文件系统、AWS S3、阿里云 OSS 或 MinIO'
              )}
              style={{ marginBottom: 10 }}
            >
              <Select
                size="small"
                value={stepInput.protocol || 'local'}
                onChange={(val) => updateInputParam('protocol', val)}
                options={[
                  { label: '本地文件系统 (local)', value: 'local' },
                  { label: 'AWS S3 (s3)', value: 's3' },
                  { label: '阿里云 OSS (oss)', value: 'oss' },
                  { label: 'MinIO (minio)', value: 'minio' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label={renderTipLabel(
                '文件路径 (path)',
                '目标文件读取路径。支持 {{variable}} 变量插值，如 /data/input/{{filename}}'
              )}
              style={{ marginBottom: 10 }}
            >
              <Input
                size="small"
                value={stepInput.path || ''}
                onChange={(e) => updateInputParam('path', e.target.value)}
                placeholder="例如：/data/input/{{filename}}"
              />
            </Form.Item>

            <div style={TWO_COLUMN_GRID_STYLE}>
              <Form.Item
                label={renderTipLabel('文件编码 (encoding)', '文件字符编码格式')}
                style={{ marginBottom: 10 }}
              >
                <Select
                  size="small"
                  value={stepInput.encoding || 'utf-8'}
                  onChange={(val) => updateInputParam('encoding', val)}
                  options={[
                    { label: 'UTF-8', value: 'utf-8' },
                    { label: 'GBK', value: 'gbk' },
                    { label: '二进制(Base64)', value: 'base64' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={renderTipLabel('返回格式 (returnMode)', '读取内容后输出给下游的数据形态')}
                style={{ marginBottom: 10 }}
              >
                <Select
                  size="small"
                  value={stepInput.returnMode || 'text'}
                  onChange={(val) => updateInputParam('returnMode', val)}
                  options={[
                    { label: '原始文本 (text)', value: 'text' },
                    { label: '结构化 JSON (json)', value: 'json' },
                    { label: '按行分割数组 (lines)', value: 'lines' },
                    { label: 'Base64 编码 (base64)', value: 'base64' },
                  ]}
                />
              </Form.Item>
            </div>

            <Form.Item
              label={renderTipLabel('最大限制 (maxSizeKb)', '单次允许读取的最大文件大小（KB）')}
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                size="small"
                min={1}
                max={102400}
                value={stepInput.maxSizeKb ?? 10240}
                onChange={(val) => updateInputParam('maxSizeKb', val || 10240)}
                addonAfter="KB"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <div style={{ marginTop: 12, background: 'var(--bg-secondary)', padding: 10, borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                输出数据结构描述 (Result Payload):
              </Text>
              <Space wrap size={[4, 4]}>
                <Tag color="blue">content (读取内容)</Tag>
                <Tag color="green">size (字节数)</Tag>
                <Tag style={{ opacity: 0.8 }}>path (实际文件路径)</Tag>
                <Tag style={{ opacity: 0.8 }}>protocol (存储协议)</Tag>
              </Space>
            </div>
          </Form>
        </Card>
      )}

      {isFileWrite && (
        <Card
          size="small"
          style={CONFIG_SECTION_STYLE}
          title={
            <Text strong style={{ fontSize: 13 }}>
              文件写入配置 (fileWrite)
            </Text>
          }
        >
          <Form layout="vertical" size="small">
            <Form.Item
              label={renderTipLabel(
                '存储协议 (protocol)',
                '指定写入存储服务协议，支持本地文件系统、AWS S3、阿里云 OSS 或 MinIO'
              )}
              style={{ marginBottom: 10 }}
            >
              <Select
                size="small"
                value={stepInput.protocol || 'local'}
                onChange={(val) => updateInputParam('protocol', val)}
                options={[
                  { label: '本地文件系统 (local)', value: 'local' },
                  { label: 'AWS S3 (s3)', value: 's3' },
                  { label: '阿里云 OSS (oss)', value: 'oss' },
                  { label: 'MinIO (minio)', value: 'minio' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label={renderTipLabel(
                '目标路径 (path)',
                '写入文件的存储路径。支持 {{variable}} 变量插值，如 /data/output/{{reportId}}.json'
              )}
              style={{ marginBottom: 10 }}
            >
              <Input
                size="small"
                value={stepInput.path || ''}
                onChange={(e) => updateInputParam('path', e.target.value)}
                placeholder="例如：/data/output/{{reportId}}.json"
              />
            </Form.Item>

            <div style={TWO_COLUMN_GRID_STYLE}>
              <Form.Item
                label={renderTipLabel(
                  '内容来源 (contentSource)',
                  '数据获取途径：来自全局入参还是上一步骤结果'
                )}
                style={{ marginBottom: 10 }}
              >
                <Select
                  size="small"
                  value={stepInput.contentSource || 'input'}
                  onChange={(val) => updateInputParam('contentSource', val)}
                  options={[
                    { label: '工作流输入参数 (input)', value: 'input' },
                    { label: '上一步骤结果 (previousStep)', value: 'previousStep' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={renderTipLabel(
                  '内容字段路径 (contentKey)',
                  '内容来源为上一步骤时提取的字段（如 body.data 或 content）'
                )}
                style={{ marginBottom: 10 }}
              >
                <Input
                  size="small"
                  value={stepInput.contentKey || 'content'}
                  onChange={(e) => updateInputParam('contentKey', e.target.value)}
                  placeholder="例如：content 或 body.data"
                />
              </Form.Item>
            </div>

            <div style={TWO_COLUMN_GRID_STYLE}>
              <Form.Item
                label={renderTipLabel('写入模式 (writeMode)', '写入模式与格式转换')}
                style={{ marginBottom: 10 }}
              >
                <Select
                  size="small"
                  value={stepInput.writeMode || 'text'}
                  onChange={(val) => updateInputParam('writeMode', val)}
                  options={[
                    { label: '原始文本 (text)', value: 'text' },
                    { label: 'Base64 解码写入 (base64decode)', value: 'base64decode' },
                    { label: 'JSON 序列化写入 (json)', value: 'json' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={renderTipLabel('文件编码 (encoding)', '写入文件的字符编码')}
                style={{ marginBottom: 10 }}
              >
                <Select
                  size="small"
                  value={stepInput.encoding || 'utf-8'}
                  onChange={(val) => updateInputParam('encoding', val)}
                  options={[
                    { label: 'UTF-8', value: 'utf-8' },
                    { label: 'GBK', value: 'gbk' },
                  ]}
                />
              </Form.Item>
            </div>

            <div style={{ display: 'flex', gap: 24, marginBottom: 10 }}>
              <Form.Item
                label={renderTipLabel('允许覆盖 (overwrite)', '同名文件存在时是否允许覆盖')}
                style={{ marginBottom: 0 }}
              >
                <Switch
                  size="small"
                  checked={stepInput.overwrite !== false}
                  onChange={(checked) => updateInputParam('overwrite', checked)}
                />
              </Form.Item>

              <Form.Item
                label={renderTipLabel('自动创建目录 (mkdir)', '路径目录不存在时是否自动创建')}
                style={{ marginBottom: 0 }}
              >
                <Switch
                  size="small"
                  checked={stepInput.mkdir !== false}
                  onChange={(checked) => updateInputParam('mkdir', checked)}
                />
              </Form.Item>
            </div>

            <div style={{ marginTop: 12, background: 'var(--bg-secondary)', padding: 10, borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                输出数据结构描述 (Result Payload):
              </Text>
              <Space wrap size={[4, 4]}>
                <Tag color="green">status: "success"</Tag>
                <Tag color="blue">path (写入绝对路径)</Tag>
                <Tag style={{ opacity: 0.8 }}>sizeWritten (写入字节数)</Tag>
                <Tag style={{ opacity: 0.8 }}>overwritten (是否覆盖)</Tag>
              </Space>
            </div>
          </Form>
        </Card>
      )}

      {!isFileRead && !isFileWrite && (
        <Card
          size="small"
          style={CONFIG_SECTION_STYLE}
          title={
            <Text strong style={{ fontSize: 13 }}>
              {selectedStepActivity?.name || selectedStep?.activityName || '工作单元'} 参数与结果配置
            </Text>
          }
        >
          <Form layout="vertical" size="small">
            <Form.Item
              label={renderTipLabel(
                '活动描述',
                selectedStepActivity?.description || '执行特定业务逻辑的工作单元'
              )}
              style={{ marginBottom: 10 }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedStepActivity?.description || '系统内置/自定义工作单元 Activity'}
              </Text>
            </Form.Item>

            <Form.Item
              label={renderTipLabel(
                '输入参数 (JSON 格式)',
                '传递给该 Activity 的自定义参数字典，格式为标准的 JSON 对象'
              )}
              style={{ marginBottom: 10 }}
            >
              <Input.TextArea
                rows={5}
                value={JSON.stringify(stepInput, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleUpdateStep(selectedStepIndexForConfig, 'input', parsed);
                  } catch {
                    // Raw text typing
                  }
                }}
                placeholder='{\n  "paramKey": "paramValue"\n}'
              />
            </Form.Item>
          </Form>
        </Card>
      )}
    </div>
  );
};
