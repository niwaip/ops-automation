import React from 'react';
import { Input, Button, Checkbox, Tooltip, Typography, Radio } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import {
  SendOutlined,
  AudioOutlined,
  SaveOutlined,
  BulbOutlined,
  UndoOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import LoopRecordingPanel from './LoopRecordingPanel';
import { AIControlsTakeoverBanner } from './AIControlsTakeoverBanner';
import type {
  CommandHistoryEntry,
  ExecutionBackend,
  PredefinedCommand,
  TakeoverUiState,
  TemplateStep,
} from './AIControls.types';

const { TextArea } = Input;
const { Text } = Typography;

export interface AIControlsInputAreaProps {
  isReactChatMode: boolean;
  isAIMode: boolean;
  takeoverState: TakeoverUiState;
  isDarkTheme: boolean;
  onStartTakeover: () => void;
  onStopTakeover: () => void;
  onResumeAfterTakeover: () => void;
  onResetTakeover: () => void;
  predefinedCommands: PredefinedCommand[];
  selectedCommand: string;
  setSelectedCommand: (command: string) => void;
  inputRef: React.RefObject<TextAreaRef>;
  paramInput: string;
  handleParamInputChange: (val: string) => void;
  isComposingRef: React.MutableRefObject<boolean>;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  isTranscribing: boolean;
  actionColumnHeight?: number;
  handleSend: () => void;
  canSend: boolean;
  primaryActionButtonStyle: React.CSSProperties;
  secondaryActionButtonStyle: React.CSSProperties;
  mutedActionButtonStyle: React.CSSProperties;
  handleSpeechToggle: () => void;
  canUseSpeech: boolean;
  isListening: boolean;
  speechSupported: boolean;
  handleExportTemplateFromRecorder: () => void;
  exportTemplateLoading: boolean;
  canExport: boolean;
  isReplaceable: boolean;
  setIsReplaceable: (val: boolean) => void;
  recorderDebugSessionId?: string;
  recorderDebugRuntimeSessionId?: string;
  executionBackend: ExecutionBackend;
  currentPageUrl?: string;
  templateSteps: TemplateStep[];
  setRecorderDebugSessionId: (id?: string) => void;
  setRecorderDebugRuntimeSessionId: (id?: string) => void;
  handleInsertRecorderControlToken: (token: string) => void;
  latestReactSuggestedParameters?: Array<{ name: string; type?: string; description?: string }>;
  handleInsertSuggestedParameter: (name: string) => void;
  history: CommandHistoryEntry[];
  rollbackLoading: boolean;
  handleRollbackLastStep: () => void;
  handleClearHistory: () => void;
  t: (key: string) => string;
}

export const AIControlsInputArea: React.FC<AIControlsInputAreaProps> = ({
  isReactChatMode,
  isAIMode,
  takeoverState,
  isDarkTheme,
  onStartTakeover,
  onStopTakeover,
  onResumeAfterTakeover,
  onResetTakeover,
  predefinedCommands,
  selectedCommand,
  setSelectedCommand,
  inputRef,
  paramInput,
  handleParamInputChange,
  isComposingRef,
  handleInputKeyDown,
  isLoading,
  isTranscribing,
  actionColumnHeight,
  handleSend,
  canSend,
  primaryActionButtonStyle,
  secondaryActionButtonStyle,
  mutedActionButtonStyle,
  handleSpeechToggle,
  canUseSpeech,
  isListening,
  speechSupported,
  handleExportTemplateFromRecorder,
  exportTemplateLoading,
  canExport,
  isReplaceable,
  setIsReplaceable,
  recorderDebugSessionId,
  recorderDebugRuntimeSessionId,
  executionBackend,
  currentPageUrl,
  templateSteps,
  setRecorderDebugSessionId,
  setRecorderDebugRuntimeSessionId,
  handleInsertRecorderControlToken,
  latestReactSuggestedParameters,
  handleInsertSuggestedParameter,
  history,
  rollbackLoading,
  handleRollbackLastStep,
  handleClearHistory,
  t,
}) => {
  return (
    <div style={{ marginTop: 0, flexShrink: 0 }}>
      {!isReactChatMode && takeoverState.mode !== 'idle' && (
        <AIControlsTakeoverBanner
          takeoverState={takeoverState}
          isDarkTheme={isDarkTheme}
          onStartTakeover={onStartTakeover}
          onStopTakeover={onStopTakeover}
          onResumeAfterTakeover={onResumeAfterTakeover}
          onResetTakeover={onResetTakeover}
        />
      )}
      {!isReactChatMode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {predefinedCommands.map((c) => (
            <Radio.Button
              key={c.value}
              value={c.value}
              onClick={() => setSelectedCommand(c.value)}
              style={{
                borderRadius: 16,
                padding: '4px 16px',
                height: 32,
                lineHeight: '24px',
                border:
                  selectedCommand === c.value
                    ? '2px solid #6366f1'
                    : isDarkTheme
                      ? '1px solid #334155'
                      : '1px solid #d9d9d9',
                background:
                  selectedCommand === c.value
                    ? isDarkTheme
                      ? '#312e81'
                      : '#eef2ff'
                    : isDarkTheme
                      ? 'var(--bg-primary)'
                      : '#fff',
                color:
                  selectedCommand === c.value
                    ? isDarkTheme
                      ? '#e0e7ff'
                      : '#6366f1'
                    : isDarkTheme
                      ? '#94a3b8'
                      : '#666',
                fontWeight: selectedCommand === c.value ? 500 : 400,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </Radio.Button>
          ))}
        </div>
      )}

      {/* Row 2: 参数输入 | 按钮区 | 参数可替换 */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
        {/* 参数输入 */}
        <TextArea
          ref={inputRef}
          value={paramInput}
          onChange={(e) => handleParamInputChange(e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          placeholder={
            isReactChatMode
              ? '直接描述你的目标，或询问页面结构、需要填写的参数'
              : predefinedCommands.find((c) => c.value === selectedCommand)?.placeholder ||
                '输入参数'
          }
          autoSize={isReactChatMode ? false : { minRows: 2, maxRows: 4 }}
          onKeyDown={handleInputKeyDown}
          disabled={isLoading || isTranscribing}
          style={{
            flex: 1,
            minWidth: 180,
            height: isReactChatMode ? actionColumnHeight : undefined,
            borderRadius: 20,
            padding: isReactChatMode ? '10px 14px' : '8px 14px',
            background: isDarkTheme ? '#0f172a' : '#ffffff',
            borderColor: isDarkTheme ? '#475569' : '#cbd5e1',
            color: 'var(--text-primary)',
            resize: 'none',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            gap: 8,
            paddingTop: 0,
            height: isReactChatMode ? actionColumnHeight : undefined,
          }}
        >
          <Button
            icon={<SendOutlined />}
            onClick={() => {
              void handleSend();
            }}
            loading={isLoading}
            style={{
              ...primaryActionButtonStyle,
              ...(!canSend ? mutedActionButtonStyle : {}),
            }}
          >
            {t('common:send')}
          </Button>
          <Button
            icon={<AudioOutlined />}
            onClick={() => {
              void handleSpeechToggle();
            }}
            disabled={!canUseSpeech && !isListening}
            loading={isTranscribing}
            type={isListening ? 'primary' : 'default'}
            style={{
              ...secondaryActionButtonStyle,
              ...(canUseSpeech || isListening ? {} : mutedActionButtonStyle),
            }}
            title={
              speechSupported
                ? isListening
                  ? '停止录音并转写'
                  : '语音输入'
                : '当前浏览器不支持录音'
            }
          >
            {isListening ? '录音中' : isTranscribing ? '转写中' : '语音'}
          </Button>
          {isReactChatMode ? (
            <>
              <Button
                size="middle"
                icon={<SaveOutlined />}
                onClick={() => {
                  void handleExportTemplateFromRecorder();
                }}
                loading={exportTemplateLoading}
                style={{
                  ...secondaryActionButtonStyle,
                  ...(!canExport ? mutedActionButtonStyle : {}),
                }}
              >
                导出
              </Button>
            </>
          ) : (
            <Checkbox
              checked={isReplaceable}
              onChange={(e) => setIsReplaceable(e.target.checked)}
              disabled={!paramInput.trim()}
              style={{ marginLeft: 4 }}
            >
              <Tooltip title="勾选后，此参数在生成模版时会被标记为可替换参数">
                <Text style={{ fontSize: 12, color: isReplaceable ? '#6366f1' : '#999' }}>
                  可替换
                </Text>
              </Tooltip>
            </Checkbox>
          )}
        </div>
      </div>
      {isAIMode && (
        <LoopRecordingPanel
          sessionId={recorderDebugSessionId}
          runtimeSessionId={recorderDebugRuntimeSessionId}
          backend={executionBackend}
          currentPageUrl={currentPageUrl}
          templateSteps={templateSteps.map((step) => ({
            id: step.id,
            tool: step.tool,
            description: step.description,
          }))}
          isDarkTheme={isDarkTheme}
          onSessionBound={(nextSessionId, nextRuntimeSessionId) => {
            setRecorderDebugSessionId(nextSessionId);
            setRecorderDebugRuntimeSessionId(nextRuntimeSessionId);
          }}
          onInsertControlToken={handleInsertRecorderControlToken}
        >
          {isReactChatMode && latestReactSuggestedParameters && latestReactSuggestedParameters.length > 0 && (
            <>
              <div style={{ width: 1, height: 16, background: isDarkTheme ? '#334155' : '#e2e8f0', margin: '0 4px' }} />
              <Tooltip
                title={`补充参数: ${latestReactSuggestedParameters.map((p) => p.name).join(', ')}`}
              >
                <Button
                  size="small"
                  shape="circle"
                  type="text"
                  icon={<BulbOutlined />}
                  style={{ color: '#6366f1' }}
                  onClick={() => {
                    latestReactSuggestedParameters.forEach((param) => {
                      handleInsertSuggestedParameter(param.name);
                    });
                  }}
                />
              </Tooltip>
            </>
          )}
          <div style={{ flex: 1 }} />
          {recorderDebugSessionId && history.some((h) => h.type === 'ai') && (
            <Tooltip title={t('recorder:ai.rollbackLastStep') || '撤销上一步'}>
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                loading={rollbackLoading}
                onClick={() => {
                  void handleRollbackLastStep();
                }}
                style={{ color: '#6366f1' }}
              />
            </Tooltip>
          )}
          {history.length > 0 && (
            <Tooltip title={t('recorder:ai.clearHistory') || '清空记录'}>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => {
                  void handleClearHistory();
                }}
                style={{ color: '#999' }}
              />
            </Tooltip>
          )}
        </LoopRecordingPanel>
      )}
    </div>
  );
};
