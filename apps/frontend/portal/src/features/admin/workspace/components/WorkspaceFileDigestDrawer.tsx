import {
  ClockCircleOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RobotOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
  message as antdMessage,
} from 'antd';
import { useState } from 'react';
import {
  workspaceApi,
  type WorkspaceFileDigest,
  type WorkspaceNode,
} from '@/api/workspace';
import { WorkspaceAiCleanModal } from './WorkspaceAiCleanModal';

const { Paragraph, Text, Title } = Typography;

interface WorkspaceFileDigestDrawerProps {
  open: boolean;
  node: WorkspaceNode | null;
  onClose: () => void;
  onOpenPreview: (node: WorkspaceNode) => void;
  onDownload: (node: WorkspaceNode) => void;
  onDigestUpdated?: (nodeId: string, digest: WorkspaceFileDigest) => void;
}

export function WorkspaceFileDigestDrawer({
  open,
  node,
  onClose,
  onOpenPreview,
  onDownload,
  onDigestUpdated,
}: WorkspaceFileDigestDrawerProps) {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isQuickRegenerating, setIsQuickRegenerating] = useState(false);

  const digest = node?.digest;

  // 快速规则重算
  const handleQuickRegenerate = async () => {
    if (!node) return;
    setIsQuickRegenerating(true);
    try {
      const res = await workspaceApi.regenerateDigest(node.workspaceId, node.id);
      if (res.success && res.digest) {
        antdMessage.success('文档结构化摘要已更新');
        onDigestUpdated?.(node.id, res.digest);
      }
    } catch (err: any) {
      antdMessage.error(err.message || '重算摘要失败');
    } finally {
      setIsQuickRegenerating(false);
    }
  };

  const handleCopyText = (content: string, label: string) => {
    if (!content) return;
    void navigator.clipboard.writeText(content);
    antdMessage.success(`${label}已复制到剪贴板`);
  };

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <span
              style={{
                maxWidth: 360,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node?.name || '文档卡片'}
            </span>
            {digest?.cleanedByAi ? (
              <Tag color="success" icon={<RobotOutlined />}>
                AI 深度清洗
              </Tag>
            ) : (
              <Tag color="cyan">规则提取</Tag>
            )}
          </div>
        }
        placement="right"
        width={620}
        onClose={onClose}
        open={open}
        extra={
          <Space size="small">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<RobotOutlined />}
              onClick={() => setIsAiModalOpen(true)}
            >
              AI 清洗/提炼
            </Button>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                if (node) onOpenPreview(node);
              }}
            >
              阅读正文
            </Button>
          </Space>
        }
      >
        {!digest ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Empty
              description={
                <span>
                  该文档尚未生成结构化摘要卡片
                  <br />
                  <Space style={{ marginTop: 12 }}>
                    <Button
                      icon={<ReloadOutlined spin={isQuickRegenerating} />}
                      loading={isQuickRegenerating}
                      onClick={handleQuickRegenerate}
                    >
                      规则快算
                    </Button>
                    <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      onClick={() => setIsAiModalOpen(true)}
                    >
                      手动调用 AI 深度清洗
                    </Button>
                  </Space>
                </span>
              }
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* AI 治理状态条 */}
            {digest.cleanedByAi && (
              <Card
                size="small"
                style={{
                  background: '#f6ffed',
                  borderColor: '#b7eb8f',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size="small">
                    <RobotOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                    <Text strong style={{ color: '#389e0d' }}>
                      已完成大模型深度清洗与实体萃取
                    </Text>
                    {digest.aiModel && <Tag color="green">{digest.aiModel}</Tag>}
                  </Space>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setIsAiModalOpen(true)}
                    style={{ padding: 0 }}
                  >
                    重新配置清洗
                  </Button>
                </div>
                {digest.cleanPrompt && (
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                    清洗需求：{digest.cleanPrompt}
                  </Text>
                )}
              </Card>
            )}

            {/* 指标统计面板 */}
            <Card size="small" style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="文档字符"
                    value={digest.charCount}
                    suffix="字"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="估算阅读"
                    value={digest.readingTimeMinutes}
                    suffix="分钟"
                    prefix={<ClockCircleOutlined style={{ fontSize: 14 }} />}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="大纲章节"
                    value={digest.headings?.length || 0}
                    suffix="节"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
              </Row>
            </Card>

            {/* 核心主旨摘要 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                  <FileTextOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                  核心执行摘要 (Executive Summary)
                </Title>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopyText(digest.summary, '摘要')}
                  style={{ fontSize: 12 }}
                >
                  复制
                </Button>
              </div>
              <Card
                size="small"
                style={{
                  background: 'var(--bg-hover, rgba(0, 0, 0, 0.02))',
                  borderLeft: '4px solid #1677ff',
                  borderRadius: '4px 8px 8px 4px',
                }}
              >
                <Paragraph
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.7,
                  }}
                >
                  {digest.summary}
                </Paragraph>
              </Card>
            </div>

            {/* 特定抽取数据 (如有) */}
            {digest.extractedData && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                    <DatabaseOutlined style={{ marginRight: 6, color: '#52c41a' }} />
                    特定业务抽取数据 (Extracted Data)
                  </Title>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() =>
                      handleCopyText(JSON.stringify(digest.extractedData, null, 2), '抽取数据')
                    }
                    style={{ fontSize: 12 }}
                  >
                    复制 JSON
                  </Button>
                </div>
                <pre
                  style={{
                    background: '#1e1e1e',
                    color: '#a6e22e',
                    padding: '12px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    maxHeight: 220,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(digest.extractedData, null, 2)}
                </pre>
              </div>
            )}

            {/* 清洗后精要文本 (如有) */}
            {digest.cleanedContent && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                    <RobotOutlined style={{ marginRight: 6, color: '#722ed1' }} />
                    AI 清洗精要文本 (Cleaned Content)
                  </Title>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyText(digest.cleanedContent || '', '清洗正文')}
                    style={{ fontSize: 12 }}
                  >
                    复制
                  </Button>
                </div>
                <Card
                  size="small"
                  style={{
                    background: '#f9f0ff',
                    borderColor: '#d3adf7',
                    borderRadius: 6,
                  }}
                >
                  <Paragraph
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {digest.cleanedContent}
                  </Paragraph>
                </Card>
              </div>
            )}

            {/* 核心主题标签 */}
            <div>
              <Title level={5} style={{ margin: '0 0 10px 0', fontSize: 14 }}>
                <TagsOutlined style={{ marginRight: 6, color: '#fa8c16' }} />
                核心关键词与领域实体 (Key Topics)
              </Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {digest.keyTopics && digest.keyTopics.length > 0 ? (
                  digest.keyTopics.map((topic, idx) => {
                    const colors = ['blue', 'cyan', 'purple', 'geekblue', 'orange', 'green'];
                    return (
                      <Tag
                        key={idx}
                        color={colors[idx % colors.length]}
                        style={{ padding: '3px 10px', fontSize: 12, borderRadius: 12 }}
                      >
                        #{topic}
                      </Tag>
                    );
                  })
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    暂未提取到特定主题标签
                  </Text>
                )}
              </div>
            </div>

            {/* 文档目录大纲结构 */}
            {digest.headings && digest.headings.length > 0 && (
              <div>
                <Title level={5} style={{ margin: '0 0 10px 0', fontSize: 14 }}>
                  <UnorderedListOutlined style={{ marginRight: 6, color: '#13c2c2' }} />
                  文档大纲结构 (TOC)
                </Title>
                <Card size="small" style={{ background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {digest.headings.map((heading, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: '#f0f0f0',
                            textAlign: 'center',
                            lineHeight: '18px',
                            fontSize: 10,
                            color: '#8c8c8c',
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span style={{ wordBreak: 'break-word' }}>{heading}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* 底部信息与下载 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 12,
                borderTop: '1px solid #f0f0f0',
              }}
            >
              <Text type="secondary" style={{ fontSize: 11 }}>
                卡片生成时间：{new Date(digest.extractedAt).toLocaleString()}
              </Text>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  if (node) onDownload(node);
                }}
              >
                下载原件
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* AI 清洗配置弹窗 */}
      {node && (
        <WorkspaceAiCleanModal
          open={isAiModalOpen}
          nodes={[node]}
          workspaceId={node.workspaceId}
          onClose={() => setIsAiModalOpen(false)}
          onSuccess={(newDigest) => {
            if (newDigest) {
              onDigestUpdated?.(node.id, newDigest);
            }
          }}
        />
      )}
    </>
  );
}
