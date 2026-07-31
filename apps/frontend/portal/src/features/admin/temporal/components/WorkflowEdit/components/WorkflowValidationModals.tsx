import React from 'react';
import { Modal, Alert, Card, Space, Typography, Button, Tag, Input, message } from 'antd';
import { CodeOutlined, CopyOutlined, ExperimentOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface WorkflowValidationModalsProps {
  validateModalVisible: boolean;
  onCloseValidateModal: () => void;
  validationResult: {
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
  } | null;
  workflowDsl?: any;

  codeModalVisible: boolean;
  onCloseCodeModal: () => void;
  currentWorkflowDisplayName?: string | null;
  currentWorkflowClassName?: string | null;
  generatedCode?: string | null;

  realValidationState: {
    visible: boolean;
    isStreaming: boolean;
    logs: string[];
    result?: {
      success: boolean;
      score: number;
      error?: string;
      result?: { error?: any };
    } | null;
  };
  onCloseRealValidation: () => void;
  realValidationModalFooter: React.ReactNode;
  realValidationInputParams: Record<string, string>;
  setRealValidationInputParams: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onStartRealValidation: () => void;
  realValidationRawResult?: any;
  realValidationLeafPaths: Array<{ path: string }>;
  onApplySuggestedResponsePath: (path: string) => void;
}

export const WorkflowValidationModals: React.FC<WorkflowValidationModalsProps> = ({
  validateModalVisible,
  onCloseValidateModal,
  validationResult,
  workflowDsl,
  codeModalVisible,
  onCloseCodeModal,
  currentWorkflowDisplayName,
  currentWorkflowClassName,
  generatedCode,
  realValidationState,
  onCloseRealValidation,
  realValidationModalFooter,
  realValidationInputParams,
  setRealValidationInputParams,
  onStartRealValidation,
  realValidationRawResult,
  realValidationLeafPaths,
  onApplySuggestedResponsePath,
}) => {
  const dslJsonString = React.useMemo(() => {
    if (!workflowDsl) return '';
    try {
      return JSON.stringify(workflowDsl, null, 2);
    } catch {
      return String(workflowDsl);
    }
  }, [workflowDsl]);

  return (
    <>
      <Modal
        title="验证工作流 DSL"
        open={validateModalVisible}
        onCancel={onCloseValidateModal}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(dslJsonString);
              void message.success('DSL 已复制到剪贴板');
            }}
            disabled={!dslJsonString}
          >
            复制 DSL
          </Button>,
          <Button key="close" onClick={onCloseValidateModal}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {validationResult ? (
            <>
              <Alert
                type={validationResult.isValid ? 'success' : 'error'}
                message={validationResult.isValid ? '验证通过' : '验证失败'}
                showIcon
              />
              <Card size="small">
                <Text>
                  <strong>评分:</strong> {validationResult.score}/100
                </Text>
              </Card>
              {validationResult.errors.length > 0 && (
                <Alert
                  type="error"
                  message="错误"
                  description={
                    <ul>
                      {validationResult.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  }
                />
              )}
              {validationResult.warnings.length > 0 && (
                <Alert
                  type="warning"
                  message="警告"
                  description={
                    <ul>
                      {validationResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  }
                />
              )}
            </>
          ) : (
            <Alert type="info" message="点击验证按钮开始验证，下方为当前待验证的 Workflow DSL 配置" />
          )}

          {dslJsonString && (
            <Card
              size="small"
              title={
                <Space>
                  <CodeOutlined />
                  <Text strong>Workflow DSL (JSON)</Text>
                </Space>
              }
              extra={
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard.writeText(dslJsonString);
                    void message.success('DSL 已复制到剪贴板');
                  }}
                >
                  复制
                </Button>
              }
            >
              <pre
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {dslJsonString}
              </pre>
            </Card>
          )}
        </Space>
      </Modal>

      <Modal
        title={
          <Space direction="vertical" size={0}>
            <Text strong>AI 生成的 Workflow 代码</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              显示名称：{currentWorkflowDisplayName} ｜ 类名：{currentWorkflowClassName}
            </Text>
          </Space>
        }
        open={codeModalVisible}
        onCancel={onCloseCodeModal}
        footer={[
          <Button
            key="copy"
            icon={<CodeOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(generatedCode || '');
              void message.success('已复制到剪贴板');
            }}
          >
            复制代码
          </Button>,
          <Button key="close" onClick={onCloseCodeModal}>
            关闭
          </Button>,
        ]}
        width={900}
      >
        {generatedCode && (
          <pre
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: 16,
              borderRadius: 8,
              maxHeight: 500,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'Monaco, Menlo, monospace',
            }}
          >
            {generatedCode}
          </pre>
        )}
      </Modal>

      <Modal
        title="端到端验证结果"
        open={realValidationState.visible}
        onCancel={onCloseRealValidation}
        footer={realValidationModalFooter}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {realValidationState.isStreaming && (
            <Alert type="info" message="端到端验证进行中..." showIcon />
          )}

          {!realValidationState.isStreaming && (
            <Card size="small" style={{ marginBottom: 12 }}>
              {Object.keys(realValidationInputParams).length > 0 ? (
                <>
                  <Text strong>输入参数（请填写参数值）：</Text>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(realValidationInputParams).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tag color="blue">{key}</Tag>
                        <Input
                          placeholder={`请输入 ${key}`}
                          value={value}
                          onChange={(e) =>
                            setRealValidationInputParams((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          style={{ width: 160 }}
                          size="small"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Text type="secondary">当前工作流没有可填写的输入参数，可直接开始端到端验证。</Text>
              )}
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={onStartRealValidation}
                style={{ marginTop: 12 }}
              >
                开始端到端验证
              </Button>
            </Card>
          )}

          {realValidationState.result && (
            <>
              <Alert
                type={realValidationState.result.success ? 'success' : 'error'}
                message={realValidationState.result.success ? '端到端验证通过' : '端到端验证失败'}
                showIcon
              />
              <Card>
                <Text>
                  <strong>评分:</strong> {realValidationState.result.score}/100
                </Text>
              </Card>
              {realValidationState.result.error && (
                <Alert
                  type="error"
                  message="错误"
                  description={realValidationState.result.error}
                  showIcon
                />
              )}
              {realValidationState.result.result?.error && (
                <Alert
                  type="error"
                  message="执行错误"
                  description={String(realValidationState.result.result.error).substring(0, 500)}
                  showIcon
                />
              )}
              {realValidationRawResult !== undefined && realValidationRawResult !== null && (
                <Card title="执行结果" size="small">
                  <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 11, margin: 0 }}>
                    {JSON.stringify(realValidationRawResult, null, 2)}
                  </pre>
                </Card>
              )}
              {realValidationLeafPaths.length > 0 && (
                <Card title="叶子节点建议" size="small">
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    HTTP 预览结果已自动按 body 相对路径展开，可直接回填到 `Body 路径`
                  </Text>
                  <Space wrap size={[6, 6]}>
                    {realValidationLeafPaths.slice(0, 40).map((item) => (
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
            <div
              style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}
            >
              {realValidationState.logs.map((log, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  {log}
                </div>
              ))}
              {realValidationState.logs.length === 0 && !realValidationState.isStreaming && (
                <Text type="secondary">暂无日志</Text>
              )}
              {realValidationState.isStreaming && <Text type="secondary">等待更多日志...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
    </>
  );
};
