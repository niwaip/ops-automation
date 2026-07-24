import { ExecutionStatus } from '@/api/execution';

export interface ExecutionListFilterState {
  status?: ExecutionStatus;
  skillId?: string;
  search?: string;
  dateRange?: [string, string];
}

export type ExecutionBatchAction = 'clean' | 'cancel' | 'export';
