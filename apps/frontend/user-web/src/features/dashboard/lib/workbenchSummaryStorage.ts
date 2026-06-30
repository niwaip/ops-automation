import { browserStorage } from '@/adapters/storage/browserStorage';

const WORKBENCH_SUMMARY_STORAGE_KEY = 'user-web-workbench-summaries';

export type WorkbenchSummaryPeriod = 'daily' | 'weekly';

export interface CachedWorkbenchSummary {
  period: WorkbenchSummaryPeriod;
  content: string;
  generatedAt: string;
  cacheKey: string;
}

type SummaryCacheMap = Partial<Record<WorkbenchSummaryPeriod, CachedWorkbenchSummary>>;

const getWeekStartKey = (): string => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.toISOString().slice(0, 10);
};

export const buildWorkbenchSummaryCacheKey = (period: WorkbenchSummaryPeriod): string =>
  period === 'daily' ? new Date().toISOString().slice(0, 10) : getWeekStartKey();

const parseStoredMap = (): SummaryCacheMap => {
  const raw = browserStorage.getItem(WORKBENCH_SUMMARY_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as SummaryCacheMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveStoredMap = (value: SummaryCacheMap): void => {
  browserStorage.setItem(WORKBENCH_SUMMARY_STORAGE_KEY, JSON.stringify(value));
};

export const loadWorkbenchSummary = (
  period: WorkbenchSummaryPeriod
): CachedWorkbenchSummary | null => {
  const stored = parseStoredMap()[period];
  if (!stored) {
    return null;
  }
  return stored.cacheKey === buildWorkbenchSummaryCacheKey(period) ? stored : null;
};

export const saveWorkbenchSummary = (
  period: WorkbenchSummaryPeriod,
  content: string,
  generatedAt: string
): CachedWorkbenchSummary => {
  const nextValue: CachedWorkbenchSummary = {
    period,
    content,
    generatedAt,
    cacheKey: buildWorkbenchSummaryCacheKey(period),
  };
  const stored = parseStoredMap();
  saveStoredMap({
    ...stored,
    [period]: nextValue,
  });
  return nextValue;
};
