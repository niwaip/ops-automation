import React from 'react';
import {
  Button,
  Collapse,
  Empty,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  EyeOutlined,
  LinkOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type {
  CommandHistoryEntry,
  ExecutionBackend,
  MCPCommand,
} from './AIControls.types';
import {
  buildCompactHistoryBubbleText,
  buildLoopSummaryText,
  formatRecorderConfidence,
  getOutcomeKindLabel,
  getOutcomeStatusMeta,
  getVerificationMeta,
} from './AIControls.utils';

const { Text } = Typography;

export interface AIControlsHistoryListProps {
  history: CommandHistoryEntry[];
  isDarkTheme: boolean;
  isReactChatMode: boolean;
  backendLabels: Record<ExecutionBackend, string>;
  backendTagColors: Record<ExecutionBackend, string>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  navigate: (path: string) => void;
  buildRecorderDebugDetailPath: (sessionId: string) => string;
  handleCopyCommand: (cmd: MCPCommand) => void;
  handleExecuteCommands: (commands: MCPCommand[]) => void | Promise<void>;
  t: (key: string) => string;
}

export const AIControlsHistoryList: React.FC<AIControlsHistoryListProps> = ({
  history,
  isDarkTheme,
  isReactChatMode,
  backendLabels,
  backendTagColors,
  messagesEndRef,
  navigate,
  buildRecorderDebugDetailPath,
  handleCopyCommand,
  handleExecuteCommands,
  t,
}) => {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: isDarkTheme ? 'var(--bg-primary)' : '#fafafa',
        borderRadius: 12,
        padding: 8,
        border: isDarkTheme ? '1px solid #334155' : '1px solid #e5e7eb',
      }}
    >
      {history.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('recorder:ai.noHistory') || '暂无对话记录'}
        />
      ) : (
        history.map((entry) =>
          (() => {
            const displayContent = buildCompactHistoryBubbleText(entry);
            return (
              <div
                key={entry.id}
                style={{
                  marginBottom: 12,
                  textAlign: entry.type === 'user' ? 'right' : 'left',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background:
                      entry.type === 'user'
                        ? '#6366f1'
                        : entry.type === 'system'
                          ? isDarkTheme
                            ? '#1e3a8a'
                            : '#e6f7ff'
                          : isDarkTheme
                            ? 'var(--bg-card)'
                            : '#fff',
                    color: entry.type === 'user' ? '#fff' : 'inherit',
                    boxShadow:
                      entry.type === 'user'
                        ? 'none'
                        : isDarkTheme
                          ? '0 1px 3px rgba(0,0,0,0.3)'
                          : '0 1px 2px rgba(0,0,0,0.1)',
                    border:
                      isDarkTheme && entry.type !== 'user' ? '1px solid #334155' : 'none',
                  }}
                >
                  <Text
                    style={{
                      color: entry.type === 'user' ? '#fff' : 'inherit',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {displayContent}
                  </Text>

                  {/* Show commands if present */}
                  {entry.commands && entry.commands.length > 0 && !isReactChatMode && (
                    <div style={{ marginTop: 8 }}>
                      <Collapse
                        size="small"
                        ghost
                        items={[
                          {
                            key: '1',
                            label: (
                              <Space>
                                <CodeOutlined />
                                <Text style={{ fontSize: 12 }}>
                                  {entry.commands.length}{' '}
                                  {t('recorder:ai.commands') || '执行命令'}
                                </Text>
                              </Space>
                            ),
                            children: (
                              <div>
                                {entry.commands.map((cmd, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      background: isDarkTheme ? '#1e293b' : '#f5f5f5',
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                      marginBottom: 4,
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                      border: isDarkTheme ? '1px solid #334155' : 'none',
                                    }}
                                  >
                                    <Space>
                                      <Tag color="blue">{cmd.tool}</Tag>
                                      <Text code style={{ fontSize: 11 }}>
                                        {JSON.stringify(cmd.params)}
                                      </Text>
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<CopyOutlined />}
                                        onClick={() => handleCopyCommand(cmd)}
                                      />
                                    </Space>
                                  </div>
                                ))}
                                <Button
                                  type="primary"
                                  size="small"
                                  icon={<PlayCircleOutlined />}
                                  onClick={() => {
                                    void handleExecuteCommands(entry.commands!);
                                  }}
                                  style={{ marginTop: 8 }}
                                >
                                  {t('recorder:ai.execute') || '执行命令'}
                                </Button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}

                  {/* Show result if present */}
                  {entry.result && (
                    <div style={{ marginTop: 8 }}>
                      {isReactChatMode ? (
                        <Collapse
                          size="small"
                          ghost
                          defaultActiveKey={
                            entry.result.outcome?.status === 'failed' ||
                            entry.result.status === 'error' ||
                            entry.result.execution?.success === false
                              ? ['detail']
                              : []
                          }
                          items={[
                            {
                              key: 'detail',
                              label: (
                                <Space>
                                  {entry.result.outcome?.status === 'failed' ||
                                  entry.result.status === 'error' ||
                                  entry.result.execution?.success === false ? (
                                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                  ) : (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                  )}
                                  <Text style={{ fontSize: 12 }}>
                                    {entry.result.outcome?.status === 'failed' ||
                                    entry.result.status === 'error' ||
                                    entry.result.execution?.success === false
                                      ? entry.result.outcome?.verification?.failureReason ||
                                        entry.result.message ||
                                        '执行失败'
                                      : entry.commands && entry.commands.length > 0
                                        ? `已执行: ${entry.commands.map((cmd) => cmd.tool).join(' / ')}`
                                        : '执行成功'}
                                  </Text>
                                </Space>
                              ),
                              children: (
                                <div style={{ marginTop: 4 }}>
                                  {entry.commands && entry.commands.length > 0 && (
                                    <div style={{ marginBottom: 8 }}>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        已执行: {entry.commands.map((cmd) => cmd.tool).join(' / ')}
                                      </Text>
                                    </div>
                                  )}
                                  {buildLoopSummaryText(
                                    entry.result.loopDraft,
                                    entry.result.loopState
                                  ) ? (
                                    <div style={{ marginBottom: 8 }}>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        {buildLoopSummaryText(
                                          entry.result.loopDraft,
                                          entry.result.loopState
                                        )}
                                      </Text>
                                    </div>
                                  ) : null}
                                  {entry.result.outcome ? (
                                    <div
                                      style={{
                                        marginBottom: 8,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        background: isDarkTheme ? '#0f172a' : '#f8fafc',
                                        border: isDarkTheme
                                          ? '1px solid #334155'
                                          : '1px solid #e2e8f0',
                                      }}
                                    >
                                      <Space wrap size={[4, 6]} style={{ marginBottom: 6 }}>
                                        <Tag
                                          color={
                                            getOutcomeStatusMeta(entry.result.outcome.status).color
                                          }
                                        >
                                          {getOutcomeStatusMeta(entry.result.outcome.status).label}
                                        </Tag>
                                        <Tag>{getOutcomeKindLabel(entry.result.outcome.kind)}</Tag>
                                        <Tag
                                          color={
                                            getVerificationMeta(
                                              entry.result.outcome.verification?.success
                                            ).color
                                          }
                                        >
                                          {
                                            getVerificationMeta(
                                              entry.result.outcome.verification?.success
                                            ).label
                                          }
                                        </Tag>
                                        <Tag color="blue">
                                          置信度{' '}
                                          {formatRecorderConfidence(
                                            entry.result.outcome.verification?.confidence
                                          )}
                                        </Tag>
                                        <Tag>
                                          Verifier:{' '}
                                          {entry.result.outcome.verification?.verifier || 'unknown'}
                                        </Tag>
                                      </Space>
                                      <div style={{ marginBottom: 4 }}>
                                        <Text style={{ fontSize: 12 }}>
                                          {entry.result.outcome.summary?.userVisible ||
                                            entry.result.outcome.summary?.compact ||
                                            entry.content}
                                        </Text>
                                      </div>
                                      {entry.result.outcome.verification?.failureReason ? (
                                        <Text type="danger" style={{ fontSize: 12 }}>
                                          失败原因：{entry.result.outcome.verification.failureReason}
                                        </Text>
                                      ) : entry.result.outcome.summary?.nextHint ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          下一步建议：{entry.result.outcome.summary.nextHint}
                                        </Text>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {(entry.result.execution ||
                                    entry.result.observation ||
                                    entry.result.exportArtifacts ||
                                    entry.result.loopDraft ||
                                    entry.result.loopState ||
                                    entry.result.outcome) && (
                                    <div
                                      style={{
                                        marginBottom: 8,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        background: isDarkTheme ? '#111827' : '#f8fafc',
                                        border: isDarkTheme
                                          ? '1px solid #334155'
                                          : '1px solid #e2e8f0',
                                        fontSize: 12,
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          gap: 8,
                                          alignItems: 'center',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <div>
                                          <div>
                                            {entry.result.outcome
                                              ? `结果协议已生成：${
                                                  getOutcomeStatusMeta(entry.result.outcome.status).label
                                                }`
                                              : entry.result.execution?.success === false
                                                ? '浏览器执行失败'
                                                : '浏览器执行详情已生成'}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: 2,
                                              color: isDarkTheme ? '#94a3b8' : '#64748b',
                                            }}
                                          >
                                            {entry.result.outcome
                                              ? `${getVerificationMeta(
                                                  entry.result.outcome.verification?.success
                                                ).label} · 置信度 ${formatRecorderConfidence(
                                                  entry.result.outcome.verification?.confidence
                                                )}`
                                              : entry.commands?.length
                                                ? `命令数 ${entry.commands.length}`
                                                : buildLoopSummaryText(
                                                    entry.result.loopDraft,
                                                    entry.result.loopState
                                                  ) || '已隐藏详细执行内容，请按需查看详情'}
                                          </div>
                                        </div>
                                        <Space size={4} wrap>
                                          {entry.sessionId ? (
                                            <>
                                              <Button
                                                size="small"
                                                icon={<EyeOutlined />}
                                                onClick={() =>
                                                  navigate(
                                                    buildRecorderDebugDetailPath(entry.sessionId!)
                                                  )
                                                }
                                              >
                                                查看详情
                                              </Button>
                                              <Button
                                                size="small"
                                                type="link"
                                                icon={<LinkOutlined />}
                                                onClick={() =>
                                                  window.open(
                                                    buildRecorderDebugDetailPath(entry.sessionId!),
                                                    '_blank',
                                                    'noopener,noreferrer'
                                                  )
                                                }
                                              >
                                                打开链接
                                              </Button>
                                            </>
                                          ) : null}
                                        </Space>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ),
                            },
                          ]}
                        />
                      ) : (
                        <Collapse
                          size="small"
                          ghost
                          items={[
                            {
                              key: 'result',
                              label: (
                                <Space>
                                  {entry.result.status === 'error' ? (
                                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                  ) : (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                  )}
                                  <Text style={{ fontSize: 12 }}>
                                    {entry.result.status === 'error'
                                      ? entry.result.message || '执行失败'
                                      : t('recorder:ai.result') || '执行结果'}
                                  </Text>
                                </Space>
                              ),
                              children: (
                                <div
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: isDarkTheme ? '#111827' : '#f8fafc',
                                    border: isDarkTheme
                                      ? '1px solid #334155'
                                      : '1px solid #e2e8f0',
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ marginBottom: 6 }}>
                                    已隐藏详细执行内容，请按需查看详情。
                                  </div>
                                  <Space size={4} wrap>
                                    {entry.sessionId ? (
                                      <>
                                        <Button
                                          size="small"
                                          icon={<EyeOutlined />}
                                          onClick={() =>
                                            navigate(
                                              buildRecorderDebugDetailPath(entry.sessionId!)
                                            )
                                          }
                                        >
                                          查看详情
                                        </Button>
                                        <Button
                                          size="small"
                                          type="link"
                                          icon={<LinkOutlined />}
                                          onClick={() =>
                                            window.open(
                                              buildRecorderDebugDetailPath(entry.sessionId!),
                                              '_blank',
                                              'noopener,noreferrer'
                                            )
                                          }
                                        >
                                          打开链接
                                        </Button>
                                      </>
                                    ) : null}
                                  </Space>
                                </div>
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: isDarkTheme ? '#64748b' : '#999',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    justifyContent: entry.type === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {entry.timestamp.toLocaleTimeString()}
                  {entry.backend && entry.type !== 'user' && (
                    <Tag
                      style={{
                        fontSize: 9,
                        lineHeight: '14px',
                        padding: '0 4px',
                        border: 0,
                        marginInlineEnd: 0,
                        background: 'transparent',
                      }}
                      color={backendTagColors[entry.backend]}
                    >
                      {backendLabels[entry.backend] === 'Playwright CLI'
                        ? 'PW CLI'
                        : backendLabels[entry.backend] === 'CDT CLI'
                          ? 'CDT'
                          : backendLabels[entry.backend]}
                    </Tag>
                  )}
                </div>
              </div>
            );
          })()
        )
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
