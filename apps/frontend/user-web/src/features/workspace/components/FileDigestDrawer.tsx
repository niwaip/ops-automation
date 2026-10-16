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
  const [isAiCleaning, setIsAiCleaning] = useState(false);
  const digest = node?.digest;

  const handleRegenerate = async (useAi = false) => {
    if (!node) return;
    if (useAi) {
      setIsAiCleaning(true);
    } else {
      setIsRegenerating(true);
    }

    try {
      const res = await workspaceApi.regenerateDigest(node.workspaceId, node.id, {
        useAi,
        extractMode: 'clean_summary',
      });
      if (res.success && res.digest) {
        void antdMessage.success(
          useAi ? 'AI 深度清洗与关键实体抽取已完成' : '文档结构化摘要已重新生成'
        );
        onDigestUpdated?.(node.id, res.digest);
      }
    } catch (err: any) {
      void antdMessage.error(err.message || '生成摘要失败');
    } finally {
      setIsRegenerating(false);
      setIsAiCleaning(false);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    void antdMessage.success(`${label}已复制到剪贴板`);
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <FileTextOutlined style={{ color: 'var(--primary-color, #1677ff)' }} />
          <span style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node?.name || '文档卡片'}
          </span>
          <Tag color="cyan" style={{ fontSize: 11, marginLeft: 4 }}>
            结构化卡片
          </Tag>
          {digest?.cleanedByAi && (
            <Tag color="purple" icon={<RobotOutlined />} style={{ fontSize: 11 }}>
              AI清洗
            </Tag>
          )}
        </div>
      }
      placement="right"
      width={580}
      onClose={onClose}
      open={open}
      extra={
        <Space size="small">
          <Button
            size="small"
            icon={<ReloadOutlined spin={isRegenerating} />}
            loading={isRegenerating}
            disabled={isAiCleaning}
            onClick={() => handleRegenerate(false)}
          >
            规则刷新
          </Button>
          <Button
            size="small"
            icon={<RobotOutlined spin={isAiCleaning} />}
            loading={isAiCleaning}
            disabled={isRegenerating}
            style={{ color: '#722ed1', borderColor: '#d3adf7' }}
            onClick={() => handleRegenerate(true)}
          >
            AI深度清洗
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
                <Space style={{ marginTop: 12 }}>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={isRegenerating}
                    disabled={isAiCleaning}
                    onClick={() => handleRegenerate(false)}
                  >
                    规则生成
                  </Button>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    loading={isAiCleaning}
                    disabled={isRegenerating}
                    style={{ background: '#722ed1', borderColor: '#722ed1' }}
                    onClick={() => handleRegenerate(true)}
                  >
                    AI 深度提炼
                  </Button>
                </Space>
              </span>
            }
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* AI 治理状态条 */}
          {digest.cleanedByAi && (
            <Card
              size="small"
              style={{
                background: 'rgba(82, 196, 26, 0.08)',
                borderColor: 'rgba(82, 196, 26, 0.25)',
                borderRadius: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="small">
                  <RobotOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                  <Text strong style={{ color: '#52c41a' }}>
                    已完成大模型深度清洗与实体萃取
                  </Text>
                  {digest.aiModel && <Tag color="green">{digest.aiModel}</Tag>}
                </Space>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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

          {/* 特定抽取业务数据 (如有) */}
          {digest.extractedData && Object.keys(digest.extractedData).length > 0 && (
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
                  关键业务事实与抽取数据 (Extracted Facts)
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
              <Card
                size="small"
                style={{
                  background: 'var(--bg-card, #fff)',
                  borderColor: 'rgba(82, 196, 26, 0.3)',
                  borderRadius: 6,
                }}
              >
                {typeof digest.extractedData === 'object' && !Array.isArray(digest.extractedData) ? (
                  <Row gutter={[12, 10]}>
                    {Object.entries(digest.extractedData).map(([key, val]) => (
                      <Col span={12} key={key}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{key}</div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </div>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      background: '#1e1e1e',
                      color: '#a6e22e',
                      padding: '10px 12px',
                      borderRadius: 4,
                      fontSize: 12,
                      maxHeight: 180,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(digest.extractedData, null, 2)}
                  </pre>
                )}
              </Card>
            </div>
          )}

          {/* 清洗后核心精要正文 (如有) */}
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
                  AI 清洗精炼正文 (Cleaned Content)
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
                  background: 'rgba(114, 46, 209, 0.05)',
                  borderLeft: '4px solid #722ed1',
                  borderColor: 'rgba(114, 46, 209, 0.25)',
                  borderRadius: '4px 8px 8px 4px',
                }}
              >
                <Paragraph
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary)',
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
