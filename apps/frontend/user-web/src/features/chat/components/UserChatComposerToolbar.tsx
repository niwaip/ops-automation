import React from 'react';
import {
  AudioOutlined,
  BulbOutlined,
  CloudSyncOutlined,
  CompassOutlined,
  DownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  RocketOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Select, Segmented, Switch, Tooltip, Upload } from 'antd';
import type { AIModel } from '@ops/user-core';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';
import styles from '../pages/ChatPage.module.css';

export interface UserChatComposerToolbarProps {
  chatMode: 'chat' | 'task';
  onChatModeChange: (mode: 'chat' | 'task') => void;
  nativeReasoningSupported: boolean;
  enableThinking: boolean;
  onEnableThinkingChange: (enabled: boolean) => void;
  reasoningEffort: 'low' | 'medium' | 'high';
  onReasoningEffortChange?: (effort: 'low' | 'medium' | 'high') => void;
  thinkingLabel: string;
  thinkingHint: string;
  enableResearch?: boolean;
  onEnableResearchChange?: (enabled: boolean) => void;
  enableWebSearch: boolean;
  onEnableWebSearchChange?: (enabled: boolean) => void;
  workspaceSearchEnabled: boolean;
  setWorkspaceSearchEnabled: (enabled: boolean) => void;
  disabled: boolean;
  isTranscribing: boolean;
  isUploadingFile: boolean;
  selectedModel?: string;
  onModelChange: (modelId: string) => void;
  modelsLoading: boolean;
  availableModels: AIModel[];
  onOpenWorkflowSelection: () => void;
  onFileUpload: (file: File) => void;
  speechSupported: boolean;
  isListening: boolean;
  onSpeechToggle: () => void;
  onNewSession: () => void;
  isStreaming: boolean;
  onRunInBackground?: () => void;
  onStop?: () => void;
  onSend: () => void;
  hasDraftContent: boolean;
}

export const UserChatComposerToolbar: React.FC<UserChatComposerToolbarProps> = ({
  chatMode,
  onChatModeChange,
  nativeReasoningSupported,
  enableThinking,
  onEnableThinkingChange,
  reasoningEffort,
  onReasoningEffortChange,
  thinkingLabel,
  thinkingHint,
  enableResearch,
  onEnableResearchChange,
  enableWebSearch,
  onEnableWebSearchChange,
  workspaceSearchEnabled,
  setWorkspaceSearchEnabled,
  disabled,
  isTranscribing,
  isUploadingFile,
  selectedModel,
  onModelChange,
  modelsLoading,
  availableModels,
  onOpenWorkflowSelection,
  onFileUpload,
  speechSupported,
  isListening,
  onSpeechToggle,
  onNewSession,
  isStreaming,
  onRunInBackground,
  onStop,
  onSend,
  hasDraftContent,
}) => {
  const isTaskStreaming = isStreaming && chatMode !== 'chat';
  const isChatStreamingWithoutInput = isStreaming && chatMode === 'chat' && !hasDraftContent;
  const shouldShowStop = isTaskStreaming || isChatStreamingWithoutInput;

  return (
    <div className={styles['user-chat-input-toolbar']}>
      <div className={styles['user-chat-input-left-group']}>
        <Segmented
          size="small"
          value={chatMode}
          onChange={(val) => onChatModeChange(val as 'chat' | 'task')}
          options={[
            {
              value: 'chat',
              icon: <UserOutlined />,
              label: (
                <span>
                  {chatMode === 'chat' && <span className={styles['user-chat-mode-dot']} />}
                  个人助理
                </span>
              ),
            },
            {
              value: 'task',
              icon: <RobotOutlined />,
              label: (
                <span>
                  {chatMode === 'task' && <span className={styles['user-chat-mode-dot']} />}
                  企业协同
                </span>
              ),
            },
          ]}
          className={`${styles['user-chat-mode-switch']} ${styles[`mode-${chatMode}`] || ''}`}
        />

        <div className={styles['user-chat-input-controls']}>
          {nativeReasoningSupported ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'off',
                    label: '关闭思考',
                    icon: <StopOutlined style={{ fontSize: 13 }} />,
                  },
                  { type: 'divider' },
                  {
                    key: 'low',
                    label: (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>浅度思考 (Low)</span>
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>轻度推理，快速响应</span>
                      </div>
                    ),
                    icon: <ThunderboltOutlined style={{ color: '#fa8c16' }} />,
                  },
                  {
                    key: 'medium',
                    label: (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>适中思考 (Medium)</span>
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>均衡思考与耗时 (推荐)</span>
                      </div>
                    ),
                    icon: <BulbOutlined style={{ color: '#1890ff' }} />,
                  },
                  {
                    key: 'high',
                    label: (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>深度思考 (High)</span>
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>深入推演，适合复杂代码与逻辑</span>
                      </div>
                    ),
                    icon: <RocketOutlined style={{ color: '#722ed1' }} />,
                  },
                ],
                selectedKeys: [enableThinking ? reasoningEffort : 'off'],
                onClick: ({ key }) => {
                  if (key === 'off') {
                    onEnableThinkingChange(false);
                  } else {
                    onEnableThinkingChange(true);
                    onReasoningEffortChange?.(key as 'low' | 'medium' | 'high');
                  }
                },
              }}
              trigger={['click']}
              placement="topLeft"
            >
              <button
                type="button"
                className={`${styles['user-chat-reasoning-trigger']} ${
                  enableThinking ? styles['user-chat-reasoning-trigger-active'] : ''
                }`}
                title="深度思考 / 推理强度调节"
              >
                <BulbOutlined
                  className={styles['user-chat-reasoning-trigger-icon']}
                  style={{ color: enableThinking ? '#6366f1' : undefined }}
                />
                <span className={styles['user-chat-reasoning-trigger-text']}>
                  {enableThinking
                    ? `思考: ${reasoningEffort === 'low' ? '浅' : reasoningEffort === 'high' ? '深' : '中'}`
                    : '深度思考'}
                </span>
                <DownOutlined className={styles['user-chat-reasoning-trigger-arrow']} />
              </button>
            </Dropdown>
          ) : (
            <Dropdown
              menu={{
                items: [
                  { key: 'off', label: '关闭思考', icon: <StopOutlined style={{ fontSize: 13 }} /> },
                  { key: 'on', label: '开启思考模式', icon: <BulbOutlined style={{ color: '#6366f1' }} /> },
                ],
                selectedKeys: [enableThinking ? 'on' : 'off'],
                onClick: ({ key }) => {
                  onEnableThinkingChange(key === 'on');
                },
              }}
              trigger={['click']}
              placement="topLeft"
            >
              <button
                type="button"
                className={`${styles['user-chat-reasoning-trigger']} ${
                  enableThinking ? styles['user-chat-reasoning-trigger-active'] : ''
                }`}
                title={thinkingHint}
              >
                <BulbOutlined
                  className={styles['user-chat-reasoning-trigger-icon']}
                  style={{ color: enableThinking ? '#6366f1' : undefined }}
                />
                <span className={styles['user-chat-reasoning-trigger-text']}>
                  {enableThinking ? `${thinkingLabel}: 开` : thinkingLabel}
                </span>
                <DownOutlined className={styles['user-chat-reasoning-trigger-arrow']} />
              </button>
            </Dropdown>
          )}
          {chatMode === 'chat' ? (
            <div
              className={styles['user-chat-control-item']}
              title={
                enableResearch
                  ? '深度调研：已开启（支持多源网络情报、GitHub动态与近30天事实分析）'
                  : '深度调研：已关闭（默认关闭。常规查看与问询不走调研；开启或输入 /research 启用多源深度调研）'
              }
            >
              <span className={styles['user-chat-control-label']}>
                <CompassOutlined
                  style={{
                    marginRight: 4,
                    color: enableResearch ? '#10b981' : undefined,
                  }}
                />
                调研
              </span>
              <Switch
                size="small"
                checked={Boolean(enableResearch)}
                onChange={onEnableResearchChange}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
          ) : null}
          {chatMode === 'task' ? (
            <div
              className={styles['user-chat-control-item']}
              title={
                enableWebSearch
                  ? '联网搜索：已开启（允许 AI 检索互联网公开资讯，点击关闭）'
                  : '联网搜索：已关闭（可选开启，开启后允许 AI 检索互联网公开资讯）'
              }
            >
              <span className={styles['user-chat-control-label']}>
                <GlobalOutlined
                  style={{
                    marginRight: 4,
                    color: enableWebSearch ? '#6366f1' : undefined,
                  }}
                />
                联网
              </span>
              <Switch
                size="small"
                checked={enableWebSearch}
                onChange={onEnableWebSearchChange}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
          ) : null}
          {chatMode === 'task' ? (
            <div
              className={styles['user-chat-control-item']}
              title={
                workspaceSearchEnabled
                  ? '工作空间知识检索：已开启（提问将自动探查并研读空间文档，点击关闭）'
                  : '工作空间知识检索：已关闭（可选开启，开启后提问将自动探查并研读空间文档）'
              }
            >
              <span className={styles['user-chat-control-label']}>
                {workspaceSearchEnabled ? (
                  <FolderOpenOutlined style={{ marginRight: 4, color: '#6366f1' }} />
                ) : (
                  <FolderOutlined style={{ marginRight: 4 }} />
                )}
                知识
              </span>
              <Switch
                size="small"
                disabled={disabled || isTranscribing || isUploadingFile}
                checked={workspaceSearchEnabled}
                onChange={setWorkspaceSearchEnabled}
                className={styles['user-chat-input-dot-switch']}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles['user-chat-input-toolbar-spacer']} />
      <div className={styles['user-chat-input-actions-group']}>
        <Select
          size="small"
          className={styles['user-chat-input-model-select']}
          value={selectedModel}
          placeholder="选择模型策略"
          onChange={onModelChange}
          loading={modelsLoading}
          notFoundContent={modelsLoading ? '模型加载中...' : '暂无可用模型'}
          options={[
            { label: 'Auto / 系统默认', value: 'default' },
            ...availableModels.map((model) => ({
              label: supportsNativeReasoning(model)
                ? `${model.name} (${model.provider}) · 推理`
                : `${model.name} (${model.provider})`,
              value: model.id,
            })),
          ]}
        />
        {chatMode === 'task' && (
          <Tooltip title="快捷唤起企业组织工作流 (!)">
            <Button
              size="small"
              icon={<ThunderboltOutlined style={{ color: '#722ed1' }} />}
              onClick={onOpenWorkflowSelection}
              disabled={disabled}
              className={styles['user-chat-input-icon-btn']}
            />
          </Tooltip>
        )}
        <Upload
          multiple
          beforeUpload={(file) => {
            void onFileUpload(file as unknown as File);
            return false;
          }}
          showUploadList={false}
          disabled={disabled || isTranscribing}
        >
          <Tooltip title="添加本地附件">
            <Button
              size="small"
              icon={<PaperClipOutlined />}
              loading={isUploadingFile}
              disabled={disabled || isTranscribing}
              className={styles['user-chat-input-icon-btn']}
            />
          </Tooltip>
        </Upload>
        <Tooltip
          title={
            speechSupported
              ? isListening
                ? '点击停止语音录制'
                : isTranscribing
                  ? '语音转写中...'
                  : '语音输入'
              : '语音输入'
          }
        >
          <Button
            size="small"
            icon={<AudioOutlined />}
            onClick={onSpeechToggle}
            disabled={disabled || (!speechSupported && !isTranscribing)}
            loading={isTranscribing}
            className={`${styles['user-chat-input-icon-btn']}${isListening ? ` ${styles.active}` : ''}`}
          />
        </Tooltip>
        <Tooltip title="新建对话">
          <Button
            size="small"
            onClick={onNewSession}
            className={styles['user-chat-input-icon-btn']}
            icon={<PlusOutlined />}
          />
        </Tooltip>
        {isStreaming && onRunInBackground ? (
          <Tooltip
            title={
              chatMode === 'task'
                ? '将当前任务转入后台异步运行，无需等待；任务完成后将自动通知并同步至 GTD 收集箱'
                : '将当前回答转入后台继续生成，解锁输入框，您可在当前页面继续提问'
            }
          >
            <Button
              size="small"
              icon={<CloudSyncOutlined />}
              onClick={onRunInBackground}
              className={styles['user-chat-bg-task-btn']}
            >
              后台运行
            </Button>
          </Tooltip>
        ) : null}
        {shouldShowStop ? (
          <Tooltip title={isTaskStreaming ? '停止当前任务执行' : '停止当前回答生成'}>
            <Button
              size="small"
              danger
              onClick={onStop}
              className={styles['user-chat-input-stop-btn']}
              icon={<StopOutlined />}
            >
              停止
            </Button>
          </Tooltip>
        ) : (
          <Tooltip
            title={
              disabled
                ? '正在处理中...'
                : !hasDraftContent
                  ? '请输入内容后发送'
                  : '发送消息 (Enter)'
            }
          >
            <Button
              size="small"
              type="primary"
              onClick={onSend}
              disabled={disabled || !hasDraftContent || isTranscribing || isUploadingFile}
              className={styles['user-chat-input-send-btn']}
              icon={<SendOutlined />}
            >
              发送
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
