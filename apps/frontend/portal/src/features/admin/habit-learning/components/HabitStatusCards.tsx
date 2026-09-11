import React, { useMemo } from 'react';
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
  LikeOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import type { HabitLearningOverview, HabitLearningStatus } from '@/api/habitLearning';
import { OverviewStatGrid, type OverviewStatItem } from '@/components/page/PageScaffold';

interface Props {
  overview?: HabitLearningOverview;
  status?: HabitLearningStatus;
}

export const HabitStatusCards: React.FC<Props> = ({ overview, status }) => {
  const statItems = useMemo<OverviewStatItem[]>(() => {
    const total = overview?.feedback.total ?? 0;
    const positive = overview?.feedback.positive ?? 0;
    const positiveRate = total > 0 ? Math.round((positive / total) * 100) : 100;

    return [
      {
        key: 'habits_active',
        label: '已生效习惯 (0-Token)',
        value: status?.habitCounts?.active ?? 0,
        icon: <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 22 }} />,
        color: '#52c41a',
      },
      {
        key: 'habits_candidate',
        label: '待生效候选',
        value: status?.candidateCounts?.candidate ?? 0,
        icon: <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 22 }} />,
        color: '#1677ff',
      },
      {
        key: 'feedback_positive',
        label: '正向评价 (好评率)',
        value: total > 0 ? `${positive} (${positiveRate}%)` : `${positive}`,
        icon: <LikeOutlined style={{ color: '#52c41a', fontSize: 22 }} />,
        color: '#52c41a',
      },
      {
        key: 'feedback_total',
        label: '用户反馈总数',
        value: total,
        icon: <CommentOutlined style={{ color: '#1890ff', fontSize: 22 }} />,
        color: 'var(--text-primary)',
      },
    ];
  }, [overview, status]);

  return <OverviewStatGrid items={statItems} gutter={16} />;
};
