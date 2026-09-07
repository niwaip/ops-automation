import {
  CheckOutlined,
  CopyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Collapse,
  Space,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useState } from 'react';

const { Text, Paragraph } = Typography;

const PROMPT_EXAMPLES = [
  {
    title: '查收最新未读邮件',
    prompt: '帮我查一下今天收到的最新未读邮件',
    desc: '自动调用邮件检索接口，列出收件箱未读邮件并生成结构化摘要',
  },
  {
    title: '搜索指定主题或发件人',
    prompt: '搜索关于周报或报销的邮件详情',
    desc: '按发件人、标题关键字进行邮件深度检索',
  },
  {
    title: '快速起草并发送邮件',
    prompt: '给 team@example.com 发送一封邮件，通知今天下午3点系统维护',
    desc: '自动生成规范正文并通过专属通道安全投递',
  },
];

export function EmailPromptGuideCard() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(text);
    message.success(`已复制: ${text}`);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  return (
    <Card
      title={
        <Space size={8}>
          <ThunderboltOutlined style={{ color: '#fa8c16' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>在智能协同中直接使用</span>
        </Space>
      }
      bordered
      style={{
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        borderColor: token.colorBorderSecondary,
        boxShadow: token.boxShadowTertiary,
      }}
      styles={{ body: { padding: '14px 16px' } }}
    >
      <Paragraph style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 10 }}>
        配置完成后，前往 <strong>智能协同 (Chat)</strong> 输入自然语言指令，AI 将自动调用邮件能力：
      </Paragraph>

      <Collapse
        defaultActiveKey={['0']}
        ghost
        items={PROMPT_EXAMPLES.map((item, idx) => ({
          key: String(idx),
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Text strong style={{ fontSize: 12 }}>
                {item.title}
              </Text>
              <Tooltip title="一键复制指令">
                <Button
                  type="text"
                  size="small"
                  icon={
                    copiedPrompt === item.prompt ? (
                      <CheckOutlined style={{ color: token.colorSuccess }} />
                    ) : (
                      <CopyOutlined />
                    )
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(item.prompt);
                  }}
                  style={{ height: 22, padding: '0 6px' }}
                />
              </Tooltip>
            </div>
          ),
          children: (
            <div style={{ paddingBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                {item.desc}
              </Text>
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => copyToClipboard(item.prompt)}
              >
                <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  👉 {item.prompt}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>点击复制</Text>
              </div>
            </div>
          ),
        }))}
      />
    </Card>
  );
}
