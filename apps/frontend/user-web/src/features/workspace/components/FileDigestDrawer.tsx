import {
  ClockCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
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
} from '../../../api/workspace';

const { Paragraph, Text, Title } = Typography;

interface FileDigestDrawerProps {
  open: boolean;
  node: WorkspaceNode | null;
  onClose: () => void;
  onOpenPreview: (node: WorkspaceNode) => void;
  onDownload: (node: WorkspaceNode) => void;
  onDigestUpdated?: (nodeId: string, digest: WorkspaceFileDigest) => void;
}

export function FileDigestDrawer({
  open,
  node,
  onClose,
  onOpenPreview,
  onDownload,
  onDigestUpdated,
}: FileDigestDrawerProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const digest = node?.digest;

  const handleRegenerate = async () => {
    if (!node) return;
    setIsRegenerating(true);
    try {
      const res = await workspaceApi.regenerateDigest(node.workspaceId, node.id);
      if (res.success && res.digest) {
        void antdMessage.success('文档结构化摘要已重新生成');
        onDigestUpdated?.(node.id, res.digest);
      }
    } catch (err: any) {
      void antdMessage.error(err.message || '重新生成摘要失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopySummary = () => {
    if (!digest?.summary) return;
    void navigator.clipboard.writeText(digest.summary);
    void antdMessage.success('摘要内容已复制到剪贴板');
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <FileTextOutlined style={{ color: 'var(--primary-color, #1677ff)' }} />
          <span style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node?.name || '文档卡片'}
          </span>
          <Tag color="cyan" style={{ fontSize: 11, marginLeft: 4 }}>
            结构化卡片
          </Tag>
        </div>
      }
      placement="right"
      width={560}
      onClose={onClose}
      open={open}
      extra={
        <Space size="small">
          <Button
            size="small"
            icon={<ReloadOutlined spin={isRegenerating} />}
            loading={isRegenerating}
            onClick={handleRegenerate}
          >
            刷新卡片
          </Button>
          <Button
            size="small"
            type="primary"
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
                <Button
                  type="link"
                  icon={<ReloadOutlined />}
                  loading={isRegenerating}
                  onClick={handleRegenerate}
                  style={{ marginTop: 8 }}
                >
                  立即生成
                </Button>
              </span>
            }
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                <FileTextOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                核心执行摘要 (Executive Summary)
              </Title>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopySummary}
                style={{ fontSize: 12 }}
              >
                复制
              </Button>
            </div>
            <Card
              size="small"
              style={{
                background: 'var(--bg-hover, rgba(0, 0, 0, 0.02))',
                borderLeft: '4px solid var(--primary-color, #1677ff)',
                borderRadius: '4px 8px 8px 4px',
              }}
            >
              <Paragraph
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                }}
              >
                {digest.summary}
              </Paragraph>
            </Card>
          </div>

          {/* 核心主题标签 */}
          <div>
            <Title level={5} style={{ margin: '0 0 10px 0', fontSize: 14 }}>
              <TagsOutlined style={{ marginRight: 6, color: '#52c41a' }} />
              核心主题标签 (Key Topics & Entities)
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
                <UnorderedListOutlined style={{ marginRight: 6, color: '#fa8c16' }} />
                文档目录大纲结构 (TOC)
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
                          background: 'var(--bg-secondary, #eee)',
                          textAlign: 'center',
                          lineHeight: '18px',
                          fontSize: 10,
                          color: 'var(--text-secondary)',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                        {heading}
                      </span>
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
              borderTop: '1px solid var(--border-color)',
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
              下载文件
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
