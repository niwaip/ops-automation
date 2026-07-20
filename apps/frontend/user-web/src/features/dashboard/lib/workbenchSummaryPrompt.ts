import { formatMonthDayTime } from '@/shared/utils/dateText';

export interface SummaryExecutionItem {
  title: string;
  statusLabel: string;
  displayTime: string;
  failureReason?: string;
}

const buildExecutionSummaryLines = (items: SummaryExecutionItem[]): string[] =>
  items.map(
    (item) =>
      `- ${item.title}｜状态：${item.statusLabel}｜时间：${formatMonthDayTime(item.displayTime)}${item.failureReason ? `｜说明：${item.failureReason}` : ''}`
  );

export const buildDailyWorkbenchSummaryPrompt = ({
  manualQueue,
  todayCompletedExecutions,
  todayFailedExecutionsCount,
}: {
  manualQueue: SummaryExecutionItem[];
  todayCompletedExecutions: SummaryExecutionItem[];
  todayFailedExecutionsCount: number;
}): string => {
  const completedLines = buildExecutionSummaryLines(todayCompletedExecutions.slice(0, 8));
  const pendingLines = buildExecutionSummaryLines(manualQueue.slice(0, 8));

  return [
    '请基于下面的工作台数据，帮我生成一份今天的个人工作总结。',
    '要求：',
    '1. 使用中文。',
    '2. 先总结今天完成了什么，再总结待处理风险与优先级。',
    '3. 输出格式包含：今日完成、风险提醒、下一步建议。',
    `4. 今日已完成 ${todayCompletedExecutions.length} 条，失败 ${todayFailedExecutionsCount} 条，待人工处理 ${manualQueue.length} 条。`,
    '',
    '今日完成记录：',
    ...(completedLines.length ? completedLines : ['- 今日暂无完成记录']),
    '',
    '待处理与失败记录：',
    ...(pendingLines.length ? pendingLines : ['- 当前没有待人工处理记录']),
  ].join('\n');
};

export const buildWeeklyWorkbenchSummaryPrompt = ({
  manualQueue,
  weekCompletedExecutions,
}: {
  manualQueue: SummaryExecutionItem[];
  weekCompletedExecutions: SummaryExecutionItem[];
}): string => {
  const completedLines = buildExecutionSummaryLines(weekCompletedExecutions.slice(0, 10));
  const pendingLines = buildExecutionSummaryLines(manualQueue.slice(0, 10));

  return [
    '请基于下面的工作台数据，帮我生成一份本周工作回顾。',
    '要求：',
    '1. 使用中文。',
    '2. 给出本周完成情况、重复性问题、下周行动建议。',
    '3. 尽量提炼成适合用户汇报的自然语言，不要只罗列数据。',
    `4. 本周已完成 ${weekCompletedExecutions.length} 条，当前待人工处理 ${manualQueue.length} 条。`,
    '',
    '本周完成记录：',
    ...(completedLines.length ? completedLines : ['- 本周暂无完成记录']),
    '',
    '当前待处理记录：',
    ...(pendingLines.length ? pendingLines : ['- 当前没有待处理记录']),
  ].join('\n');
};
