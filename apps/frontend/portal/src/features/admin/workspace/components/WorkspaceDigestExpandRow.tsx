import {
  CheckOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  RobotOutlined,
  ShareAltOutlined,
  SyncOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Tag,
  Typography,
  message as antdMessage,
} from 'antd';
import { useState } from 'react';
import type { WorkspaceNode } from '@/api/workspace';

const { Text, Paragraph } = Typography;

interface WorkspaceDigestExpandRowProps {
  node: WorkspaceNode;
  isOutOfScope?: boolean;
  onOpenPreview?: (node: WorkspaceNode) => void;
  onOpenAiClean?: (node: WorkspaceNode) => void;
}

export function WorkspaceDigestExpandRow({
  node,
  isOutOfScope,
  onOpenPreview,
  onOpenAiClean,
}: WorkspaceDigestExpandRowProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const digest = node.digest;

  const handleCopy = (text: string, key: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    antdMessage.success(`${label}已复制到剪贴板`);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  if (isOutOfScope) {
    return (
      <div
        style={{
          padding: '16px 24px',
          background: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: 8,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>
              个人的临时工作区为沙盒临时运行目录，属于知识库治理对象外，不参与 AI 深度清洗与知识库检索
            </span>
          }
        >
          {onOpenPreview && (
            <Button size="small" onClick={() => onOpenPreview(node)}>
              阅读原文件文本
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  if (!digest) {
    return (
      <div
        style={{
          padding: '16px 24px',
          background: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: 8,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>
              初期上传文件尚未进行 AI 深度清洗与实体萃取
            </span>
          }
        >
          <Space>
            {onOpenAiClean && (
              <Button
                type="primary"
                size="small"
                icon={<RobotOutlined />}
                onClick={() => onOpenAiClean(node)}
              >
                立即开始 AI 清洗
              </Button>
            )}
            {onOpenPreview && (
              <Button size="small" onClick={() => onOpenPreview(node)}>
                阅读原文正文
              </Button>
            )}
          </Space>
        </Empty>
      </div>
    );
  }

  // 渲染 extractedData
  const renderExtractedData = () => {
    if (!digest.extractedData) return null;
    if (typeof digest.extractedData === 'object' && !Array.isArray(digest.extractedData)) {
      const items = Object.entries(digest.extractedData).map(([key, val]) => ({
        key,
        label: <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{key}</span>,
        children: (
          <span style={{ color: 'var(--text-primary, #f8fafc)' }}>
            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
          </span>
        ),
      }));
      return (
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, md: 3 }}
          items={items}
          style={{
            background: 'var(--bg-card, #1e293b)',
            borderRadius: 6,
            border: '1px solid var(--border-color, #334155)',
          }}
        />
      );
    }
    return (
      <pre
        style={{
          background: 'var(--bg-subtle, #0f172a)',
          color: 'var(--text-primary, #f8fafc)',
          padding: 10,
          borderRadius: 6,
          fontSize: 12,
          maxHeight: 160,
          overflowY: 'auto',
          border: '1px solid var(--border-color, #334155)',
        }}
      >
        {JSON.stringify(digest.extractedData, null, 2)}
      </pre>
    );
  };

  // 构造标准 /doc 引用与查询语法
  const docCitation = `[file:${node.name}](file:///workspace/${node.workspaceId}?fileId=${node.id})`;
  const docQueryCmd = `/doc 查找“${node.name.replace(/\.[^.]+$/, '')}”的内容`;

  return (
    <div
      style={{
        padding: '16px 20px',
        background: 'var(--bg-subtle, #141f32)',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: 8,
        margin: '4px 0',
      }}
    >
      <Row gutter={[16, 16]}>
        {/* 左侧：核心摘要与去噪精要 */}
        <Col xs={24} lg={15}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 摘要与精要正文卡片 */}
            <Card
              size="small"
              title={
                <Space>
                  <FileTextOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
                    {digest.cleanedByAi ? 'AI 深度清洗核心精要' : '初级提取文本（尚未 AI 深度清洗）'}
                  </span>
                  {digest.cleanedByAi ? (
                    <Tag color="success" style={{ fontSize: 11 }}>
                      高质量 RAG 就绪
                    </Tag>
                  ) : (
                    <Tag color="default" style={{ fontSize: 11 }}>
                      未清洗
                    </Tag>
                  )}
                </Space>
              }
              extra={
                <Space>
                  {!digest.cleanedByAi && onOpenAiClean && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<RobotOutlined />}
                      onClick={() => onOpenAiClean(node)}
                    >
                      立即 AI 清洗
                    </Button>
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={copiedKey === 'summary' ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() =>
                      handleCopy(digest.cleanedContent || digest.summary, 'summary', '精要正文')
                    }
                  >
                    复制精要
                  </Button>
                </Space>
              }
              style={{
                borderRadius: 6,
                background: 'var(--bg-card, #1e293b)',
                borderColor: 'var(--border-color, #334155)',
              }}
            >
              <Paragraph
                style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: 'var(--text-primary, #f8fafc)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {digest.cleanedContent || digest.summary}
              </Paragraph>
            </Card>

            {/* 核心知识主题标签 */}
            {digest.keyTopics && digest.keyTopics.length > 0 && (
              <div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block', marginBottom: 6, color: 'var(--text-secondary, #94a3b8)' }}
                >
                  <TagsOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                  核心知识检索主题（供大模型与 /doc 精准召回）：
                </Text>
                <Space wrap size={[6, 6]}>
                  {digest.keyTopics.map((topic, i) => (
                    <Tag
                      key={i}
                      color="blue"
                      style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4 }}
                    >
                      {topic}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}

            {/* 章节大纲 */}
            {digest.headings && digest.headings.length > 0 && (
              <div>
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block', marginBottom: 6, color: 'var(--text-secondary, #94a3b8)' }}
                >
                  <UnorderedListOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                  章节层级大纲 ({digest.headings.length} 节)：
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {digest.headings.map((heading, idx) => (
                    <Tag
                      key={idx}
                      style={{
                        fontSize: 11,
                        background: 'var(--bg-card, #1e293b)',
                        borderColor: 'var(--border-color, #334155)',
                        color: 'var(--text-secondary, #cbd5e1)',
                      }}
                    >
                      {heading}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {/* 业务抽取数据 */}
            {digest.extractedData && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
                    <DatabaseOutlined style={{ marginRight: 4, color: '#a855f7' }} />
                    已萃取的结构化业务实体与参数：
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={copiedKey === 'data' ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() =>
                      handleCopy(
                        JSON.stringify(digest.extractedData, null, 2),
                        'data',
                        '结构化实体数据'
                      )
                    }
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    复制 JSON
                  </Button>
                </div>
                {renderExtractedData()}
              </div>
            )}
          </div>
        </Col>

        {/* 右侧：Doc 用户协同与治理工具箱 */}
        <Col xs={24} lg={9}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Doc / Agent 引用助手卡片 */}
            <Card
              size="small"
              title={
                <Space>
                  <ShareAltOutlined style={{ color: '#a855f7' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
                    Doc 用户与协同语法
                  </span>
                </Space>
              }
              style={{
                borderRadius: 6,
                background: 'var(--bg-card, #1e293b)',
                borderColor: 'var(--border-color, #334155)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <Text style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: 4 }}>
                    标准文件引用链接（可在企业协同对话直接引用）：
                  </Text>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-subtle, #0f172a)',
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--border-color, #334155)',
                    }}
                  >
                    <Text
                      code
                      ellipsis
                      style={{
                        fontSize: 11,
                        maxWidth: 220,
                        margin: 0,
                        background: 'transparent',
                        color: 'var(--primary-light, #818cf8)',
                        border: 'none',
                      }}
                    >
                      {docCitation}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedKey === 'citation' ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => handleCopy(docCitation, 'citation', '文档引用链接')}
                    />
                  </div>
                </div>

                <div>
                  <Text style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: 4 }}>
                    自然语言快捷指令：
                  </Text>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-subtle, #0f172a)',
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--border-color, #334155)',
                    }}
                  >
                    <Text
                      code
                      ellipsis
                      style={{
                        fontSize: 11,
                        maxWidth: 220,
                        margin: 0,
                        background: 'transparent',
                        color: 'var(--primary-light, #818cf8)',
                        border: 'none',
                      }}
                    >
                      {docQueryCmd}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedKey === 'cmd' ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => handleCopy(docQueryCmd, 'cmd', '/doc 指令')}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* AI 治理与元数据 */}
            <Card
              size="small"
              style={{
                borderRadius: 6,
                background: 'var(--bg-card, #1e293b)',
                borderColor: 'var(--border-color, #334155)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">治理模式：</Text>
                  <Text strong style={{ color: 'var(--text-primary, #f8fafc)' }}>
                    {digest.cleanedByAi ? '大模型深度提炼' : '规则启发式初算'}
                  </Text>
                </div>
                {digest.aiModel && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">提炼模型：</Text>
                    <Tag color="green" style={{ margin: 0 }}>
                      {digest.aiModel}
                    </Tag>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">字符与预估阅读：</Text>
                  <Text style={{ color: 'var(--text-primary, #f8fafc)' }}>
                    {digest.charCount || 0} 字 · 约 {digest.readingTimeMinutes || 1} 分钟
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">更新提取时间：</Text>
                  <Text type="secondary">
                    {digest.extractedAt ? new Date(digest.extractedAt).toLocaleString() : '-'}
                  </Text>
                </div>
                {digest.cleanPrompt && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 2 }}>
                      提炼特定指令：
                    </Text>
                    <Text
                      code
                      style={{
                        fontSize: 11,
                        display: 'block',
                        whiteSpace: 'pre-wrap',
                        background: 'var(--bg-subtle, #0f172a)',
                        color: 'var(--text-secondary, #cbd5e1)',
                        border: '1px solid var(--border-color, #334155)',
                        padding: 6,
                        borderRadius: 4,
                      }}
                    >
                      {digest.cleanPrompt}
                    </Text>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                {onOpenAiClean && (
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={digest.cleanedByAi ? <SyncOutlined /> : <RobotOutlined />}
                    onClick={() => onOpenAiClean(node)}
                    style={{
                      flex: 1,
                      ...(digest.cleanedByAi ? { color: '#52c41a', borderColor: '#b7eb8f' } : {}),
                    }}
                  >
                    {digest.cleanedByAi ? '重新清理' : 'AI 清理'}
                  </Button>
                )}
                {onOpenPreview && (
                  <Button
                    size="small"
                    onClick={() => onOpenPreview(node)}
                    style={{ flex: 1 }}
                  >
                    阅读全文
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
}
