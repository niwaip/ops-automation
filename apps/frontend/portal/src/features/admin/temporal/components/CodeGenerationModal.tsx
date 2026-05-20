import React, { useReducer, useEffect } from 'react';
import { Modal, Space, Alert, Card, Typography, Button, message } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { temporalWorkflowApi, WorkflowDsl, ActivityDsl, WorkflowCodeResult, WorkflowCodeStreamEvent } from '@/api/temporal';

const { Text } = Typography;
const MAX_LOG_LINES = 2000;

export interface CodeGenerationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowCodeResult | null;
}

export type CodeGenerationAction =
  | { type: 'START' }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowCodeResult }
  | { type: 'CLOSE' };

export const initialCodeGenerationState: CodeGenerationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
};

export const codeGenerationReducer = (state: CodeGenerationState, action: CodeGenerationAction): CodeGenerationState => {
  switch (action.type) {
    case 'START': return { visible: true, isStreaming: true, logs: [], result: null };
    case 'APPEND_LOG': return { ...state, logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload] };
    case 'SET_RESULT': return { ...state, isStreaming: false, result: action.payload };
    case 'CLOSE': return { ...initialCodeGenerationState };
    default: return state;
  }
};

export interface CodeGenerationModalProps {
  visible: boolean;
  onClose: () => void;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  workflowName: string;
  errorContext?: string;
  forceAiGeneration: boolean;
  onGenerateSuccess: (code: string) => void;
  onViewCode: () => void;
  onAutoRetried?: (attempts: number) => void;
}

export const CodeGenerationModal: React.FC<CodeGenerationModalProps> = ({
  visible, onClose, workflowDsl, activityDsl, workflowName, errorContext, forceAiGeneration, onGenerateSuccess, onViewCode, onAutoRetried
}) => {
  const [state, dispatch] = useReducer(codeGenerationReducer, initialCodeGenerationState);

  useEffect(() => {
    if (visible && !state.isStreaming && !state.result && state.logs.length === 0) {
      handleGenerateCode();
    }
  }, [visible]);

  const handleGenerateCode = async () => {
    if (!workflowName) { message.warning('请先填写工作流名称'); onClose(); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); onClose(); return; }
    
    const nextWorkflowDsl = { ...workflowDsl, name: workflowName };
    dispatch({ type: 'START' });
    
    try {
      await temporalWorkflowApi.generateWorkflowCodeStream(
        nextWorkflowDsl,
        activityDsl,
        errorContext,
        forceAiGeneration,
        (event: WorkflowCodeStreamEvent) => {
          if (event.type === 'log' && event.content) {
            dispatch({ type: 'APPEND_LOG', payload: event.content });
            return;
          }
          if (event.type === 'done') {
            const result: WorkflowCodeResult = {
              success: Boolean(event.success),
              code: event.code,
              error: event.error,
              attempts: event.attempts,
              autoRetried: event.autoRetried,
              generationMode: event.generationMode,
            };
            dispatch({ type: 'SET_RESULT', payload: result });
            if (result.success && result.code) {
              onGenerateSuccess(result.code);
              
              if (result.autoRetried) {
                message.success(`代码生成成功，已基于编译反馈自动重试 ${Math.max((result.attempts || 1) - 1, 1)} 次`);
                if (onAutoRetried) onAutoRetried(result.attempts || 1);
              } else if (forceAiGeneration && result.generationMode === 'ai') {
                message.success('代码生成成功（已强制使用 AI 生成）');
              } else if (result.generationMode === 'deterministic') {
                message.success('代码生成成功（固定模板模式）');
              } else {
                message.success('代码生成成功');
              }
            } else {
              message.error(result.error || '代码生成失败');
            }
            return;
          }
          if (event.type === 'error') {
            dispatch({
              type: 'SET_RESULT',
              payload: { success: false, error: event.content || 'Unknown error' },
            });
            message.error(event.content || '代码生成失败');
          }
        }
      );
    } catch (error: any) {
      dispatch({
        type: 'SET_RESULT',
        payload: { success: false, error: error.message || 'Stream request failed' },
      });
      message.error(error.message || '代码生成请求失败');
    }
  };

  const footer = [
    state.result?.success
      ? <Button key="view" type="primary" icon={<CodeOutlined />} onClick={onViewCode}>查看代码</Button>
      : null,
    <Button key="close" onClick={onClose} disabled={state.isStreaming}>关闭</Button>,
  ].filter(Boolean);

  return (
    <Modal
      title="AI 生成代码状态"
      open={visible}
      onCancel={() => { if (!state.isStreaming) onClose(); }}
      footer={footer}
      width={760}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {state.isStreaming && <Alert type="info" message="AI 正在生成 Workflow 代码..." showIcon />}
        {!state.isStreaming && state.result && (
          <Alert
            type={state.result.success ? 'success' : 'error'}
            message={state.result.success ? '代码生成完成' : '代码生成失败'}
            description={state.result.error || (
              state.result.generationMode === 'deterministic'
                ? '本次命中固定模板编译路径。'
                : `共尝试 ${state.result.attempts || 1} 次生成。`
            )}
            showIcon
          />
        )}
        <Card title="生成日志" size="small">
          <div style={{ maxHeight: 320, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
            {state.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
            {state.logs.length === 0 && !state.isStreaming && <Text type="secondary">暂无日志</Text>}
            {state.isStreaming && <Text type="secondary">等待更多状态...</Text>}
          </div>
        </Card>
      </Space>
    </Modal>
  );
};
