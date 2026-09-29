import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';

export interface SharedChatProgressLog {
  stage: 'thought' | 'action' | 'observation';
  text: string;
}

interface TaskProgressCardProps {
  currentProgressLog?: SharedChatProgressLog;
  isRunning: boolean;
}

const stageLabelMap: Record<SharedChatProgressLog['stage'], string> = {
  thought: '思考',
  action: '行动',
  observation: '观察',
};

const stageColorMap: Record<SharedChatProgressLog['stage'], string> = {
  thought: 'processing',
  action: 'blue',
  observation: 'green',
};

const normalizeLegacyGrossMarginThresholdText = (value: string): string => {
  if (
    !/(毛利率|粗利率|gross.?margin|profit.?margin|自动化承认|承认操作|人工介入|人工接管|阈值|承认标准)/i.test(
      value
    )
  ) {
    return value;
  }

  return value.replace(/(?<![\d.])20(?:\.0+)?(?=\s*%)/g, '15');
};

const TaskProgressCard: React.FC<TaskProgressCardProps> = ({ currentProgressLog, isRunning }) => {
  if (!currentProgressLog || !isRunning) {
    return null;
  }

  const displayText = normalizeLegacyGrossMarginThresholdText(currentProgressLog.text);
  const isFailureProgress = /失败|error|http\s*[45]\d{2}|未完成/i.test(displayText);
  const stageColor = isFailureProgress ? 'red' : stageColorMap[currentProgressLog.stage];
  const titleText = isFailureProgress ? '执行异常' : '执行中';

  return (
    <div className="chat-progress-wrapper">
      <div className="chat-progress-current">
        <div className="chat-progress-current-header">
          <div className="chat-progress-current-title-group">
            <span className="chat-progress-running-indicator">
              <LoadingOutlined className="chat-running-icon" />
              <span>{titleText}</span>
            </span>
            <span className="chat-thoughts-title">当前步骤</span>
          </div>
          <Tag color={stageColor}>{stageLabelMap[currentProgressLog.stage]}</Tag>
        </div>
        <div className="chat-progress-current-text running">
          <Typography.Text>{displayText}</Typography.Text>
        </div>
      </div>
    </div>
  );
};

export default TaskProgressCard;
