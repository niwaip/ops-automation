import { browserStorage } from '@/adapters/storage/browserStorage';

const WORKBENCH_HANDLED_EXECUTION_STORAGE_KEY = 'user-web-workbench-handled-executions';

export type WorkbenchHandledExecutionMap = Record<string, string>;

const normalizeHandledExecutions = (raw: unknown): WorkbenchHandledExecutionMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.entries(raw as Record<string, unknown>).reduce<WorkbenchHandledExecutionMap>(
    (result, [executionId, handledAt]) => {
      if (!executionId.trim() || typeof handledAt !== 'string' || !handledAt.trim()) {
        return result;
      }
      result[executionId] = handledAt;
      return result;
    },
    {}
  );
};

export const loadWorkbenchHandledExecutions = (): WorkbenchHandledExecutionMap => {
  const saved = browserStorage.getItem(WORKBENCH_HANDLED_EXECUTION_STORAGE_KEY);
  if (!saved) {
    return {};
  }
  try {
    return normalizeHandledExecutions(JSON.parse(saved));
  } catch {
    return {};
  }
};

export const saveWorkbenchHandledExecutions = (
  handledExecutions: WorkbenchHandledExecutionMap
): void => {
  browserStorage.setItem(
    WORKBENCH_HANDLED_EXECUTION_STORAGE_KEY,
    JSON.stringify(handledExecutions)
  );
};

export const mergeHandledExecutions = (
  base: WorkbenchHandledExecutionMap,
  incoming: WorkbenchHandledExecutionMap
): WorkbenchHandledExecutionMap => {
  const merged: WorkbenchHandledExecutionMap = { ...base };
  for (const [id, dateStr] of Object.entries(incoming)) {
    if (!merged[id] || new Date(dateStr).getTime() > new Date(merged[id]).getTime()) {
      merged[id] = dateStr;
    }
  }
  return merged;
};

export const clearWorkbenchHandledExecutions = (): void => {
  browserStorage.removeItem(WORKBENCH_HANDLED_EXECUTION_STORAGE_KEY);
};

