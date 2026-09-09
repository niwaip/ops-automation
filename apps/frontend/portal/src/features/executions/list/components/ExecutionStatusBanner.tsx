import { Alert, Button, Space, Tag, Typography, message } from 'antd';
import {
  CloseCircleFilled,
  ExclamationCircleFilled,
  CheckCircleFilled,
  SyncOutlined,
  CopyOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { ExecutionDto, ExecutionStepDto } from '@/api/execution';
import { formatDuration } from '@/features/executions/list/listView';

const { Text } = Typography;

interface ExecutionStatusBannerProps {
  execution: ExecutionDto;
  skillDisplayName?: string;
  currentStep?: ExecutionStepDto;
  onOpenAiTask?: (draft: string, executionId: string) => void;
  requiredInputCount?: number;
}

export const ExecutionStatusBanner: React.FC<ExecutionStatusBannerProps> = ({
  execution,
  skillDisplayName,
  currentStep,
  onOpenAiTask,
  requiredInputCount,
}) => {
  const handleCopyDebug = () => {
    const info = {
      executionId: execution.id,
      status: execution.status,
      skillId: execution.skillId,
      skillName: skillDisplayName,
      failureReason: execution.failureReason,
      failedStep: currentStep
        ? {
            index: currentStep.stepIndex,
            name: currentStep.name,
            action: currentStep.action,
            errorMessage: currentStep.errorMessage,
          }
        : undefined,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      endedAt: execution.endedAt,
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2)).then(() => {
      message.success('已复制排障诊断信息到剪贴板');
    });
  };

  if (execution.status === 'failed') {
    return (
      <Alert
        type="error"
        showIcon
        icon={<CloseCircleFilled style={{ fontSize: 20, color: '#ff4d4f' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(255, 77, 79, 0.3)',
          background: 'rgba(255, 77, 79, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Text strong style={{ fontSize: 14, color: '#ff4d4f' }}>
              执行异常终止
            </Text>
            {currentStep && (
              <Tag color="error">
                卡在步骤 {currentStep.stepIndex + 1}: {currentStep.name || currentStep.action || currentStep.type}
              </Tag>
            )}
          </div>
        }
        description={
          <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 6 }}>
            <Text style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {execution.failureReason || currentStep?.errorMessage || '未知异常导致流程中断'}
            </Text>
            {currentStep?.errorMessage && currentStep.errorMessage !== execution.failureReason && (
              <div style={{ background: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                <Text type="secondary">底层错误：</Text>
                <Text type="danger" code>{currentStep.errorMessage}</Text>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopyDebug}
              >
                复制排障信息
              </Button>
              {onOpenAiTask && (
                <Button
                  size="small"
                  type="primary"
                  danger
                  icon={<RobotOutlined />}
                  onClick={() =>
                    onOpenAiTask(
                      `请分析工单 #${execution.id.slice(0, 8)} 失败原因：${execution.failureReason || currentStep?.errorMessage || ''}`,
                      execution.id
                    )
                  }
                >
                  AI 智能诊断
                </Button>
              )}
            </div>
          </Space>
        }
      />
    );
  }

  if (execution.status === 'waiting_input') {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<ExclamationCircleFilled style={{ fontSize: 20, color: '#fa8c16' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(250, 140, 22, 0.3)',
          background: 'rgba(250, 140, 22, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <Text strong style={{ fontSize: 14, color: '#fa8c16' }}>
            任务挂起：需要补充运行入参
          </Text>
        }
        description={
          <Text style={{ fontSize: 13 }}>
            当前步骤需要提供 {requiredInputCount !== undefined ? `${requiredInputCount} 个` : ''}参数以继续执行，请在下方表单补充后提交。
          </Text>
        }
      />
    );
  }

  if (execution.status === 'pending_approval') {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<ExclamationCircleFilled style={{ fontSize: 20, color: '#fa8c16' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(250, 140, 22, 0.3)',
          background: 'rgba(250, 140, 22, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <Text strong style={{ fontSize: 14, color: '#fa8c16' }}>
            任务挂起：等待管理员审批通过
          </Text>
        }
        description={
          <Text style={{ fontSize: 13 }}>
            本任务触发了高风险操作或策略约束规则，需要管理员审批授权后方可继续流转。
          </Text>
        }
      />
    );
  }

  if (execution.status === 'human_control') {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<ExclamationCircleFilled style={{ fontSize: 20, color: '#fa8c16' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(250, 140, 22, 0.3)',
          background: 'rgba(250, 140, 22, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <Text strong style={{ fontSize: 14, color: '#fa8c16' }}>
            任务已转入人工接管
          </Text>
        }
        description={
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text style={{ fontSize: 13 }}>
              {execution.takeoverReason || '自动化流程遇到断点或需人工确认，已转由人工接管。'}
            </Text>
            {onOpenAiTask && (
              <Button
                size="small"
                type="primary"
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16', marginTop: 4 }}
                onClick={() =>
                  onOpenAiTask(
                    `请接管工单 #${execution.id.slice(0, 8)}：${execution.takeoverReason || '人工接管'}`,
                    execution.id
                  )
                }
              >
                在聊天窗口接管
              </Button>
            )}
          </Space>
        }
      />
    );
  }

  if (execution.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        icon={<SyncOutlined spin style={{ fontSize: 20, color: '#1890ff' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(24, 144, 255, 0.3)',
          background: 'rgba(24, 144, 255, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14, color: '#1890ff' }}>
              任务正在实时执行中...
            </Text>
            {currentStep && (
              <Tag color="processing">
                正在执行步骤 {currentStep.stepIndex + 1}: {currentStep.name || currentStep.action || currentStep.type}
              </Tag>
            )}
          </div>
        }
        description={
          <Text style={{ fontSize: 13 }}>
            系统全天候运行守护中，状态与步骤将实时流式更新。
          </Text>
        }
      />
    );
  }

  if (execution.status === 'succeeded') {
    return (
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleFilled style={{ fontSize: 20, color: '#52c41a' }} />}
        style={{
          borderRadius: 12,
          border: '1px solid rgba(82, 196, 26, 0.3)',
          background: 'rgba(82, 196, 26, 0.06)',
          padding: '12px 16px',
        }}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14, color: '#52c41a' }}>
              任务顺利执行完成
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              总耗时: {formatDuration(execution)}
            </Text>
          </div>
        }
        description={
          <Text style={{ fontSize: 13 }}>
            所有步骤均已成功通过，结果与产物数据已全部就绪。
          </Text>
        }
      />
    );
  }

  return null;
};
