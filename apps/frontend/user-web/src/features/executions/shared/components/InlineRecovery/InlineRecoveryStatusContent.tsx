import { Alert, Button, Select, Space, Typography } from 'antd';
import type { ExecutionPhaseDto } from '@/api/execution';
import { RECOVERY_COPY } from '../recoveryOptions';

const { Text } = Typography;

interface PhaseStep {
  stepId?: string;
  id?: string;
  stepIndex?: number;
  action?: string;
  status: string;
}

interface InlineRecoveryStatusContentProps {
  phase?: ExecutionPhaseDto;
  isTakeoverPhase: boolean;
  activeStepId: string | undefined;
  phaseSteps: PhaseStep[];
  showAdvancedStepSelect: boolean;
  onShowAdvancedStepSelect: () => void;
  onStepIdChange: (value: string) => void;
}

/**
 * 状态内容区：阶段信息 + 错误步骤选择器 + 错误消息。
 */
export function InlineRecoveryStatusContent({
  phase,
  isTakeoverPhase,
  activeStepId,
  phaseSteps,
  showAdvancedStepSelect,
  onShowAdvancedStepSelect,
  onStepIdChange,
}: InlineRecoveryStatusContentProps) {
  return (
    <Alert
      type={isTakeoverPhase ? 'warning' : phase?.errorMessage ? 'error' : 'warning'}
      showIcon
      message={
        phase
          ? `${RECOVERY_COPY.currentPhase}：${phase.phaseName || phase.phaseKey}`
          : RECOVERY_COPY.activeHumanControl
      }
      description={
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {phase ? (
            <Space wrap size={16} style={{ rowGap: 0 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {`${RECOVERY_COPY.phaseStatus}：${phase.status}`}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {`${RECOVERY_COPY.phaseKey}：${phase.phaseKey}`}
              </Text>
            </Space>
          ) : null}
          {phase && activeStepId ? (
            <Space wrap size={8}>
              <Text strong style={{ fontSize: 13 }}>
                错误步骤：
              </Text>
              {!showAdvancedStepSelect ? (
                <>
                  <Text style={{ fontSize: 13 }}>
                    {(() => {
                      const step = phaseSteps.find((s) => (s.stepId || s.id) === activeStepId);
                      if (step) {
                        return `${step.stepIndex}. ${step.action}`;
                      }
                      return activeStepId.length > 20
                        ? `${activeStepId.slice(0, 8)}...`
                        : activeStepId;
                    })()}
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 13 }}
                    onClick={onShowAdvancedStepSelect}
                  >
                    修改
                  </Button>
                </>
              ) : (
                <Select
                  size="small"
                  style={{ minWidth: 200 }}
                  value={activeStepId}
                  onChange={onStepIdChange}
                  options={phaseSteps.map((step) => ({
                    value: step.stepId || step.id,
                    label: `${step.stepIndex}. ${step.action} ${
                      ['failed', 'takeover_required', 'blocked'].includes(step.status)
                        ? '(发生分歧/错误的步骤)'
                        : ''
                    }`,
                  }))}
                />
              )}
            </Space>
          ) : null}
          {phase?.errorMessage && !isTakeoverPhase ? (
            <div
              style={{
                marginTop: 4,
                padding: '6px 10px',
                background: 'rgba(255, 77, 79, 0.08)',
                borderRadius: 4,
                borderLeft: '3px solid #ff4d4f',
              }}
            >
              <Text
                type="danger"
                style={{ fontSize: 13, wordBreak: 'break-word', fontFamily: 'monospace' }}
              >
                {phase.errorMessage}
              </Text>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
