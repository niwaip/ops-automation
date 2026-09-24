import { ClockCircleOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { formatMonthDayTime } from '@/shared/utils/dateText';

export const renderPriorityTag = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return <Tag color="error">紧急</Tag>;
    case 'high':
      return <Tag color="warning">高</Tag>;
    case 'medium':
      return <Tag color="processing">中</Tag>;
    case 'low':
      return <Tag color="default">低</Tag>;
    default:
      return null;
  }
};

export const renderSourceTag = (sourceType: string) => {
  const labels: Record<string, [string, string]> = {
    chat: ['cyan', '智能协同'],
    email: ['gold', '邮件'],
    schedule: ['geekblue', '定时任务'],
    im_channel: ['purple', 'IM 消息'],
    workflow: ['blue', '工作流'],
  };
  const entry = labels[sourceType];
  return entry ? <Tag color={entry[0]}>{entry[1]}</Tag> : null;
};

export const renderDueDateTag = (dueDate?: string | null, completed?: boolean) => {
  if (!dueDate) return null;
  const overdue = new Date(dueDate).getTime() < Date.now() && !completed;
  return (
    <Tag color={overdue ? 'volcano' : 'default'} icon={<ClockCircleOutlined />} bordered={false}>
      {overdue ? `逾期: ${formatMonthDayTime(dueDate)}` : `截止: ${formatMonthDayTime(dueDate)}`}
    </Tag>
  );
};
