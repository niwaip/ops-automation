import React from 'react';
import { Modal, Space, Select, Card, Alert, Input, Button, Typography, Descriptions, Tag, message } from 'antd';
import { SafetyCertificateOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ReleaseAuditEvent } from '@/api/capabilities';

const { TextArea } = Input;
const { Title, Text } = Typography;

export interface ReleaseActionModalsProps {
  deployVisible: boolean;
  onCancelDeploy: () => void;
  onDeploy: () => void;
  deployLoading: boolean;
  deployEnvironment: string;
  setDeployEnvironment: (env: any) => void;
  deployStrategy: string;
  setDeployStrategy: (strat: any) => void;
  activeDeployProfile: any;
  deployOverridesDraft: string;
  setDeployOverridesDraft: (draft: string) => void;
  deployOverridesState: { valid: boolean; error?: string };
  hasSuccessfulStagingDeployment: boolean;
  selectedDeployReadiness: { hasExecutableCode: boolean; message?: string };
  studioPaneStyle: React.CSSProperties;

  analysisVisible: boolean;
  onCancelAnalysis: () => void;
  analysisResult: {
    isParameterIssue?: boolean;
    explanation?: string;
    suggestedAction?: string | null;
    analysis?: string;
    suggestedParams?: any;
  } | null;
  modalJsonPaneStyle: React.CSSProperties;

  isAuditModalVisible: boolean;
  onCancelAuditModal: () => void;
  selectedAuditEvent: ReleaseAuditEvent | null;

  jsonViewVisible: boolean;
  onCancelJsonView: () => void;
  jsonViewTitle: string;
  jsonViewData: any;
  setDeployVisible: (visible: boolean) => void;
}

export const ReleaseActionModals: React.FC<ReleaseActionModalsProps> = ({
  deployVisible,
  onCancelDeploy,
  onDeploy,
  deployLoading,
  deployEnvironment,
  setDeployEnvironment,
  deployStrategy,
  setDeployStrategy,
  activeDeployProfile,
  deployOverridesDraft,
  setDeployOverridesDraft,
  deployOverridesState,
  hasSuccessfulStagingDeployment,
  selectedDeployReadiness,
  studioPaneStyle,
  analysisVisible,
  onCancelAnalysis,
  analysisResult,
  modalJsonPaneStyle,
  isAuditModalVisible,
  onCancelAuditModal,
  selectedAuditEvent,
  jsonViewVisible,
  onCancelJsonView,
  jsonViewTitle,
  jsonViewData,
  setDeployVisible,
}) => {
  return (
    <>
      <Modal
        title="代码部署到 ops-temporal"
        open={deployVisible}
        onCancel={onCancelDeploy}
        onOk={onDeploy}
        okText="开始代码部署"
        confirmLoading={deployLoading}
        okButtonProps={{
          disabled:
            !deployOverridesState.valid ||
            !selectedDeployReadiness.hasExecutableCode ||
            (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment),
        }}
        width={760}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ width: 180 }}
              value={deployEnvironment}
              onChange={(value) => setDeployEnvironment(value)}
              options={[
                { label: 'dev', value: 'dev' },
                { label: 'test', value: 'test' },
                { label: 'staging', value: 'staging' },
                { label: 'prod', value: 'prod' },
              ]}
            />
            <Select
              style={{ width: 220 }}
              value={deployStrategy}
              onChange={(value) => setDeployStrategy(value)}
              options={[
                { label: 'hot_reload', value: 'hot_reload' },
                { label: 'rolling_restart', value: 'rolling_restart' },
                { label: 'full_restart', value: 'full_restart' },
              ]}
            />
          </Space>

          <Card
            size="small"
            title={`环境 Profile 预览: ${deployEnvironment}`}
            extra={<Text type="secondary">说明：读取当前 Release 快照里该环境的默认部署参数</Text>}
          >
            <pre style={{ ...studioPaneStyle, maxHeight: 120 }}>
              {JSON.stringify(activeDeployProfile, null, 2)}
            </pre>
          </Card>

          <Alert
            type="info"
            showIcon
            message="部署覆盖参数"
            description="这里填写的是“本次部署额外覆盖”的 JSON。系统会将它与上面的环境默认参数合并，最终形成本次 deploy 实际使用的配置。"
          />
          {deployEnvironment === 'prod' && (
            <Alert
              type="warning"
              showIcon
              message="当前为生产环境发布"
              description="建议先在 staging 完成最终验证；生产优先 rolling_restart，并准备好回滚目标。"
            />
          )}
          <TextArea
            rows={5}
            value={deployOverridesDraft}
            onChange={(event) => setDeployOverridesDraft(event.target.value)}
            placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
          {!deployOverridesState.valid && (
            <Alert type="error" showIcon message={deployOverridesState.error} />
          )}
          {deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment && (
            <Alert
              type="error"
              showIcon
              message="prod 发布门禁"
              description="当前 Release 尚无 staging 成功部署记录，不能直接发布到 prod。"
            />
          )}
          {!selectedDeployReadiness.hasExecutableCode && (
            <Alert
              type="error"
              showIcon
              message="缺少可执行代码"
              description={selectedDeployReadiness.message}
            />
          )}
          <Text type="secondary">
            最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
            `sourcePayload.deploymentProfiles` 下维护。
          </Text>
        </Space>
      </Modal>

      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: 'var(--primary-color)' }} />
            <span>AI 失败原因分析</span>
          </Space>
        }
        open={analysisVisible}
        onCancel={onCancelAnalysis}
        footer={[
          <Button key="close" onClick={onCancelAnalysis}>
            关闭
          </Button>,
          analysisResult?.isParameterIssue && (
            <Button
              key="apply"
              type="primary"
              onClick={() => {
                if (analysisResult.suggestedParams) {
                  setDeployOverridesDraft(JSON.stringify(analysisResult.suggestedParams, null, 2));
                  onCancelAnalysis();
                  setDeployVisible(true);
                  void message.success('已自动填入建议参数');
                }
              }}
            >
              应用建议参数并重试
            </Button>
          ),
        ]}
        width={700}
      >
        {analysisResult ? (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Alert
              type={analysisResult.isParameterIssue ? 'warning' : 'error'}
              message={analysisResult.explanation}
              description={analysisResult.suggestedAction}
              showIcon
            />
            <div style={{ marginTop: 16 }}>
              <Title level={5}>详细分析</Title>
              <div
                style={{
                  ...modalJsonPaneStyle,
                  padding: '12px 16px',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {analysisResult.analysis}
              </div>
            </div>
            {analysisResult.suggestedParams && (
              <div style={{ marginTop: 16 }}>
                <Title level={5}>建议参数 (JSON)</Title>
                <pre
                  style={{
                    ...modalJsonPaneStyle,
                    padding: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(analysisResult.suggestedParams, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <ReloadOutlined spin style={{ fontSize: 24, marginBottom: 16 }} />
            <br />
            <Text type="secondary">AI 正在深度分析失败日志，请稍候...</Text>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>审计事件详情</span>
          </Space>
        }
        open={isAuditModalVisible}
        onCancel={onCancelAuditModal}
        footer={[
          <Button key="close" onClick={onCancelAuditModal}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedAuditEvent && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="事件摘要" span={2}>
                {selectedAuditEvent.summary}
              </Descriptions.Item>
              <Descriptions.Item label="事件类型">
                <Tag color={selectedAuditEvent.success ? 'success' : 'error'}>
                  {selectedAuditEvent.eventType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="执行结果">
                {selectedAuditEvent.success ? '成功' : '失败'}
              </Descriptions.Item>
              <Descriptions.Item label="操作人">
                {selectedAuditEvent.actorName || 'System'}
              </Descriptions.Item>
              <Descriptions.Item label="执行时间">
                {new Date(selectedAuditEvent.createdAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
            {selectedAuditEvent.details && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>详细信息 (JSON):</div>
                <pre
                  style={{
                    ...modalJsonPaneStyle,
                    padding: 12,
                    maxHeight: 400,
                    overflow: 'auto',
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(selectedAuditEvent.details, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>{jsonViewTitle}</span>
          </Space>
        }
        open={jsonViewVisible}
        onCancel={onCancelJsonView}
        footer={[
          <Button key="close" onClick={onCancelJsonView}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <pre
          style={{
            ...modalJsonPaneStyle,
            padding: 16,
            maxHeight: 600,
            overflow: 'auto',
            margin: 0,
            fontSize: 13,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {JSON.stringify(jsonViewData, null, 2)}
        </pre>
      </Modal>
    </>
  );
};
