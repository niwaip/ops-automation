import {
  loadWorkbenchSummary,
  type WorkbenchSummaryPeriod,
} from './workbenchSummaryStorage';

export interface SummaryGenerateState {
  status: 'idle' | 'running' | 'completed' | 'error';
  content: string;
  generatedAt?: string;
  error?: string;
}

export type WorkbenchSummaryState = Record<WorkbenchSummaryPeriod, SummaryGenerateState>;

export const formatSummaryTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const createInitialWorkbenchSummaryState = (
  period: WorkbenchSummaryPeriod
): SummaryGenerateState => {
  const cached = loadWorkbenchSummary(period);
  if (!cached) {
    return { status: 'idle', content: '' };
  }

  return {
    status: 'completed',
    content: cached.content,
    generatedAt: cached.generatedAt,
  };
};

export const createInitialWorkbenchSummaryStateMap = (): WorkbenchSummaryState => ({
  daily: createInitialWorkbenchSummaryState('daily'),
  weekly: createInitialWorkbenchSummaryState('weekly'),
});
