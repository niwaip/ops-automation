import React, { useReducer, useState, useMemo, useEffect } from 'react';
import { Modal, Space, Alert, Card, Typography, Tag, Input, Button } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import { temporalWorkflowApi, WorkflowRealValidationResult } from '@/api/temporal';
import { normalizeExecutionResult } from '@/api/execution-normalizer';
import { normalizeValidationInputValue, collectLeafPaths, unwrapValidationResultPayload } from '../pages/TemporalPage.utils';

const { Text } = Typography;

export interface RealValidationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowRealValidationResult | null;
}

export type RealValidationAction =
  | { type: 'START' }
  | { type: 'OPEN' }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowRealValidationResult }
  | { type: 'CLOSE' };

export const initialRealValidationState: RealValidationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
};

export const realValidationReducer = (state: RealValidationState, action: RealValidationAction): RealValidationState => {
  switch (action.type) {
    case 'START': return { ...state, isStreaming: true, logs: [], result: null };
    case 'OPEN': return { ...state, visible: true, isStreaming: false, logs: [], result: null };
    case 'APPEND_LOG': return { ...state, logs: [...state.logs.slice(-(2000 - 1)), action.payload] };
    case 'SET_RESULT': return { ...state, isStreaming: false, result: action.payload };
    case 'CLOSE': return { ...initialRealValidationState };
    default: return state;
  }
};

export interface RealValidationModalProps {
  visible: boolean;
  onClose: () => void;
  generatedCode: string | null;
  workflowClassName: string;
  taskQueue: string;
  initialInputParams: Record<string, string>;
  hasHttpRequest: boolean;
  onApplySuggestedResponsePath: (path: string) => void;
  onRegenerateCode?: (errorContext: string) => void;
}

export const RealValidationModal: React.FC<RealValidationModalProps> = ({
  visible, onClose, generatedCode, workflowClassName, taskQueue, initialInputParams, hasHttpRequest, onApplySuggestedResponsePath, onRegenerateCode
}) => {
  const [state, dispatch] = useReducer(realValidationReducer, initialRealValidationState);
  const [inputParams, setInputParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      dispatch({ type: 'OPEN' });
      setInputParams(initialInputParams);
    } else {
      dispatch({ type: 'CLOSE' });
    }
  }, [visible, initialInputParams]);

  const handleRealValidation = async () => {
    if (!generatedCode) return;
    const fn = workflowClassName.trim();
    dispatch({ type: 'START' });

    const finalParams: Record<string, string> = {};
    Object.entries(inputParams).forEach(([key, value]) => {
      const normalizedValue = normalizeValidationInputValue(value).trim();
      if (normalizedValue) {
        finalParams[key] = normalizedValue;
      }
    });
    if (hasHttpRequest) {
      finalParams.__httpResponsePreview = 'true';
    }

    try {
      await temporalWorkflowApi.validateWorkflowRealStream(
        generatedCode,
        fn,
        finalParams,
        taskQueue,
        (event) => {
          if (event.type === 'log' && event.content) {
            dispatch({ type: 'APPEND_LOG', payload: event.content });
          } else if (event.type === 'done') {
            const normalized = normalizeExecutionResult(event, { defaultSuccessScore: 100, defaultFailureScore: 0 });
            dispatch({
              type: 'SET_RESULT',
              payload: {
                success: normalized.success,
                logs: [],
                result: event.result,
                error: normalized.error,
                score: normalized.score,
              },
            });
          } else if (event.type === 'error') {
            dispatch({
              type: 'SET_RESULT',
              payload: { success: false, logs: [], error: event.content || 'Unknown error', score: 0 },
            });
          }
        }
      );
    } catch (error: any) {
      dispatch({
        type: 'SET_RESULT',
        payload: { success: false, logs: [], error: error.message || 'Stream error', score: 0 },
      });
    }
  };

  const rawResult = useMemo(() => unwrapValidationResultPayload(state.result?.result), [state.result?.result]);
  const leafPaths = useMemo(() => collectLeafPaths(rawResult), [rawResult]);

  const handleRegenerateCode = () => {
    if (!onRegenerateCode) return;
    const errors: string[] = [];
    if (state.result?.error) errors.push(`验证错误: ${state.result.error}`);
    if (state.result?.result?.error) errors.push(`执行错误: ${state.result.result.error}`);
    if (state.result?.result?.traceback) errors.push(`堆栈: ${state.result.result.traceback}`);
    if (state.logs.length > 0) errors.push(`日志:\n${state.logs.join('\n')}`);
    const errorContext = `上次真实验证失败，请修复以下问题:\n\n${errors.join('\n\n')}`;
    onRegenerateCode(errorContext);
  };

  const footer = [
    ...(state.result && !state.result.success && onRegenerateCode ? [
      <Button key="regenerate" type="primary" onClick={handleRegenerateCode}>重新生成代码</Button>
    ] : []),
    <Button key="close" onClick={onClose}>
      关闭
    </Button>
  ];

  return (
    <Modal title="真实验证结果" open={visible} onCancel={onClose} footer={footer} width={800}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {state.isStreaming && <Alert type="info" message="真实验证进行中..." showIcon />}

        {!state.isStreaming && (
          <Card size="small" style={{ marginBottom: 12 }}>
            {Object.keys(inputParams).length > 0 ? (
              <>
                <Text strong>输入参数（请填写参数值）：</Text>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(inputParams).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag color="blue">{key}</Tag>
                      <Input
                        placeholder={`请输入 ${key}`}
                        value={value}
                        onChange={(e) => setInputParams(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: 160 }}
                        size="small"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Text type="secondary">当前工作流没有可填写的输入参数，可直接开始真实验证。</Text>
            )}
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              onClick={handleRealValidation}
              style={{ marginTop: 12 }}
            >
              开始真实验证
            </Button>
          </Card>
        )}

        {state.result && (
          <>
            <Alert type={state.result.success ? 'success' : 'error'} message={state.result.success ? '真实验证通过' : '真实验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {state.result.score}/100</Text></Card>
            {state.result.error && <Alert type="error" message="错误" description={state.result.error} showIcon />}
            {state.result.result?.error && <Alert type="error" message="执行错误" description={String(state.result.result.error).substring(0, 500)} showIcon />}
            {rawResult !== undefined && rawResult !== null && (
              <Card title="执行结果" size="small">
                <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 11, margin: 0 }}>
                  {JSON.stringify(rawResult, null, 2)}
                </pre>
              </Card>
            )}
            {leafPaths.length > 0 && (
              <Card title="叶子节点建议" size="small">
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  HTTP 预览结果已自动按 body 相对路径展开，可直接回填到 `Body 路径`
                </Text>
                <Space wrap size={[6, 6]}>
                  {leafPaths.slice(0, 40).map((item: { path: string }) => (
                    <Button
                      key={`modal-path-${item.path}`}
                      size="small"
                      onClick={() => onApplySuggestedResponsePath(item.path)}
                    >
                      {item.path}
                    </Button>
                  ))}
                </Space>
              </Card>
            )}
          </>
        )}
        <Card title="执行日志" size="small">
          <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
            {state.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
            {state.logs.length === 0 && !state.isStreaming && <Text type="secondary">暂无日志</Text>}
            {state.isStreaming && <Text type="secondary">等待更多日志...</Text>}
          </div>
        </Card>
      </Space>
    </Modal>
  );
};
