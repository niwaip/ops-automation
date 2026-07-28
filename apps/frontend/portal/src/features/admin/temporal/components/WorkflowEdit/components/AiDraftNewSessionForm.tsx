import React from 'react';
import { Card, Form, Input, Button, Typography, Upload, Tag, message } from 'antd';
import { ThunderboltOutlined, UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import yaml from 'js-yaml';

const { Title, Text } = Typography;
const { TextArea } = Input;

export interface AiDraftNewSessionFormProps {
  description: string;
  setDescription: (val: string) => void;
  referenceUrl: string;
  setReferenceUrl: (val: string) => void;
  skillFileName?: string;
  setSkillFileContent?: (val: string | undefined) => void;
  setSkillFileType?: (val: string | undefined) => void;
  setSkillFileName?: (val: string | undefined) => void;
  onClearSkillFile?: () => void;
  onSubmit: () => void;
  loading: boolean;
}

export const AiDraftNewSessionForm: React.FC<AiDraftNewSessionFormProps> = ({
  description,
  setDescription,
  referenceUrl,
  setReferenceUrl,
  skillFileName,
  setSkillFileContent,
  setSkillFileType,
  setSkillFileName,
  onClearSkillFile,
  onSubmit,
  loading,
}) => {
  const [showParamInput, setShowParamInput] = React.useState(false);
  const [paramText, setParamText] = React.useState('');
  const [showOutputInput, setShowOutputInput] = React.useState(false);
  const [outputText, setOutputText] = React.useState('');

  const handleBeforeUpload = async (file: File) => {
    try {
      const text = await file.text();
      let fileType: 'yaml' | 'json' | 'markdown' | 'text' = 'text';
      let parsed: unknown = text;
      let label = file.name;
      if (file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
        fileType = 'yaml';
        parsed = yaml.load(text);
      } else if (file.name.endsWith('.json')) {
        fileType = 'json';
        parsed = JSON.parse(text);
      } else if (file.name.endsWith('.md')) {
        fileType = 'markdown';
        parsed = text;
      } else {
        message.error('不支持的文件格式，请上传 .yml / .yaml / .json / .md');
        return false;
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as { name?: unknown };
        if (typeof obj.name === 'string' && obj.name.trim()) {
          label = obj.name.trim();
        } else {
          message.warning('文件中未找到 name 字段，将作为纯文本说明使用');
        }
      }
      setSkillFileContent?.(text);
      setSkillFileType?.(fileType);
      setSkillFileName?.(label);
      message.success(`已加载技能配置: ${label}`);
    } catch (e) {
      message.error(`解析技能文件失败: ${(e as Error)?.message || '格式错误'}`);
    }
    return false;
  };

  const handleFormSubmit = () => {
    let finalDesc = description.trim();
    if (paramText.trim()) {
      finalDesc += `\n\n【指定运行时输入参数】\n${paramText.trim()}`;
    }
    if (outputText.trim()) {
      finalDesc += `\n\n【指定期望输出与动作】\n${outputText.trim()}`;
    }
    if (finalDesc !== description) {
      setDescription(finalDesc);
    }
    onSubmit();
  };

  return (
    <div style={{ flex: 1, padding: 40, maxWidth: 640, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <ThunderboltOutlined style={{ fontSize: 44, color: 'var(--primary-color)', marginBottom: 12 }} />
        <Title level={3} style={{ margin: 0 }}>
          新建 AI 工作流草稿
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          描述业务需求、上传 Skill 配置文件（.yml/.json）或输入参考 API，AI 将自动分析并生成 Workflow DSL 定义。
        </Text>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: 'var(--shadow-md)' }}>
        <Form layout="vertical" onFinish={handleFormSubmit}>
          <Form.Item label="工作流需求说明" required={!skillFileName}>
            <TextArea
              rows={4}
              placeholder="描述具体业务场景，如: 监控服务指标，若 CPU > 90% 则触发巡检并向钉钉群发送告警..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>💡 Prompt 结构引导：</Text>
              {!showParamInput && (
                <Tag
                  color="blue"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowParamInput(true)}
                >
                  + 补充输入参数
                </Tag>
              )}
              {!showOutputInput && (
                <Tag
                  color="purple"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowOutputInput(true)}
                >
                  + 补充期望输出/通知方式
                </Tag>
              )}
            </div>
          </Form.Item>

          {showParamInput && (
            <Form.Item label="指定运行时输入参数 (可选)">
              <Input
                placeholder="例如: 服务器 IP, CPU 告警阈值(默认 90%), 告警接收人 Token"
                value={paramText}
                onChange={(e) => setParamText(e.target.value)}
                allowClear
              />
            </Form.Item>
          )}

          {showOutputInput && (
            <Form.Item label="指定期望输出与动作 (可选)">
              <Input
                placeholder="例如: 生成 Markdown 报告并推送到钉钉机器人"
                value={outputText}
                onChange={(e) => setOutputText(e.target.value)}
                allowClear
              />
            </Form.Item>
          )}

          <Form.Item label="上传 Skill / 配置文件 (可选)">
            {skillFileName ? (
              <Tag
                color="blue"
                closable
                onClose={onClearSkillFile}
                icon={<FileTextOutlined />}
                style={{ padding: '6px 12px', fontSize: 14 }}
              >
                已加载技能配置: {skillFileName}
              </Tag>
            ) : (
              <Upload beforeUpload={handleBeforeUpload} showUploadList={false} accept=".yml,.yaml,.json,.md">
                <Button icon={<UploadOutlined />}>选择 Skill 配置文件 (.yml / .json / .md)</Button>
              </Upload>
            )}
          </Form.Item>

          <Form.Item label="参考 API 或网页 URL (可选)">
            <Input
              placeholder="https://api.example.com/docs"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
            />
          </Form.Item>

          <Button
            type="primary"
            size="large"
            block
            icon={<ThunderboltOutlined />}
            htmlType="submit"
            loading={loading}
          >
            生成草稿
          </Button>
        </Form>
      </Card>
    </div>
  );
};


