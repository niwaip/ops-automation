import React from 'react';
import { Modal, Space, Alert, Card, Tag, Typography } from 'antd';

const { Text } = Typography;

export interface WorkflowApplyDraftConfirmModalProps {
  applyDraftConfirmVisible: boolean;
  setApplyDraftConfirmVisible: (visible: boolean) => void;
  handleConfirmApplyCurrentDraft: () => Promise<void>;
  currentAiDraft: any;
  currentDraftApplyDiff: any;
  SECTION_CARD_STYLE: React.CSSProperties;
}

export const WorkflowApplyDraftConfirmModal: React.FC<
  WorkflowApplyDraftConfirmModalProps
> = ({
  applyDraftConfirmVisible,
  setApplyDraftConfirmVisible,
  handleConfirmApplyCurrentDraft,
  currentAiDraft,
  currentDraftApplyDiff,
  SECTION_CARD_STYLE,
}) => {
  return (
    <Modal
      title="应用草稿前确认"
      open={applyDraftConfirmVisible}
      onCancel={() => setApplyDraftConfirmVisible(false)}
      onOk={() => {
        void handleConfirmApplyCurrentDraft();
      }}
      okText="确认应用"
      cancelText="取消"
      width={720}
    >
      {currentAiDraft ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="这会把当前 AI 草稿回填到工作流编辑器"
            description="应用后你仍然可以继续人工调整 DSL、生成并保存代码、做端到端验证并保存。"
          />

          <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>本次将应用的草稿</Text>
              <Space wrap size={[6, 6]}>
                <Tag color="blue" style={{ margin: 0 }}>
                  名称: {currentAiDraft.workflowDsl.name || currentAiDraft.name}
                </Tag>
                <Tag color="purple" style={{ margin: 0 }}>
                  步骤: {currentAiDraft.workflowDsl.steps.length}
                </Tag>
                <Tag color="red" style={{ margin: 0 }}>
                  必填输入:{' '}
                  {
                    Object.entries(currentAiDraft.workflowDsl.inputParams || {}).filter(
                      ([, value]: [string, any]) => value.required
                    ).length
                  }
                </Tag>
                <Tag color="green" style={{ margin: 0 }}>
                  输出字段: {Object.keys(currentAiDraft.workflowDsl.outputParams || {}).length}
                </Tag>
              </Space>
              <Text type="secondary">
                Task Queue:{' '}
                {currentAiDraft.taskQueue ||
                  currentAiDraft.workflowDsl.taskQueue ||
                  'SKILL_TASK_QUEUE'}
              </Text>
            </Space>
          </Card>

          <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>关键变化摘要</Text>
              {currentDraftApplyDiff ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {currentDraftApplyDiff.addedInputs.length > 0 ? (
                    <Alert
                      type="success"
                      showIcon
                      message={`新增输入参数: ${currentDraftApplyDiff.addedInputs.join('，')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.changedInputs.length > 0 ? (
                    <Alert
                      type="warning"
                      showIcon
                      message={`输入参数已调整: ${currentDraftApplyDiff.changedInputs.join('；')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.addedOutputs.length > 0 ? (
                    <Alert
                      type="success"
                      showIcon
                      message={`新增输出字段: ${currentDraftApplyDiff.addedOutputs.join('，')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.changedOutputs.length > 0 ? (
                    <Alert
                      type="warning"
                      showIcon
                      message={`输出字段已调整: ${currentDraftApplyDiff.changedOutputs.join('；')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.addedSteps.length > 0 ? (
                    <Alert
                      type="success"
                      showIcon
                      message={`新增步骤: ${currentDraftApplyDiff.addedSteps.join('，')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.changedSteps.length > 0 ? (
                    <Alert
                      type="warning"
                      showIcon
                      message={`已调整步骤: ${currentDraftApplyDiff.changedSteps.join('，')}`}
                    />
                  ) : null}
                  {currentDraftApplyDiff.addedInputs.length === 0 &&
                  currentDraftApplyDiff.changedInputs.length === 0 &&
                  currentDraftApplyDiff.addedOutputs.length === 0 &&
                  currentDraftApplyDiff.changedOutputs.length === 0 &&
                  currentDraftApplyDiff.addedSteps.length === 0 &&
                  currentDraftApplyDiff.changedSteps.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message="当前版本与上一轮相比没有识别到明显结构变化。"
                    />
                  ) : null}
                </Space>
              ) : (
                <Alert type="info" showIcon message="当前没有可比较的上一轮草稿。" />
              )}
            </Space>
          </Card>

          <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>应用后建议动作</Text>
              <Text>1. 检查步骤配置和输入输出定义是否符合预期。</Text>
              <Text>2. 重新生成工作流代码。</Text>
              <Text>3. 做端到端验证后再保存。</Text>
            </Space>
          </Card>
        </Space>
      ) : null}
    </Modal>
  );
};
