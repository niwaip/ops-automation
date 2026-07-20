import {
  getRuntimeSessionNovncUrl,
  getRuntimeSessionStatusLabel,
  isLiveRuntimeSessionState,
  isPreviewRuntimeSessionState,
  type RuntimeSessionConnectionInfoLike,
  type RuntimeSessionLike,
} from '@ops/user-core';
import type { ExecutionStatus } from '@/api/execution';
import { EXECUTION_ACTIVE_POLLING_STATUSES } from '@/shared/lib/executionStatusMeta';

export {
  getRuntimeSessionNovncUrl,
  getRuntimeSessionStatusLabel,
  isLiveRuntimeSessionState,
  isPreviewRuntimeSessionState,
  type RuntimeSessionConnectionInfoLike,
  type RuntimeSessionLike,
};

export const isExecutionActivePollingStatus = (
  executionStatus?: ExecutionStatus | string
): boolean =>
  Boolean(
    executionStatus && EXECUTION_ACTIVE_POLLING_STATUSES.includes(executionStatus as ExecutionStatus)
  );

export const getExecutionPollingInterval = (
  executionStatus?: ExecutionStatus | string
): number | false =>
  isExecutionActivePollingStatus(executionStatus) ? 3000 : false;

export const getExecutionRuntimeSessionRefetchInterval = ({
  runtimeSessionState,
  executionStatus,
}: {
  runtimeSessionState?: RuntimeSessionLike['state'];
  executionStatus?: ExecutionStatus | string;
}): number | false => {
  if (isLiveRuntimeSessionState(runtimeSessionState)) {
    return 3000;
  }

  return getExecutionPollingInterval(executionStatus);
};

export const shouldEnableExecutionRuntimeSessionLookup = ({
  runtimeSessionLookupEnabled = true,
  executionRuntimeSessionId,
}: {
  runtimeSessionLookupEnabled?: boolean;
  executionRuntimeSessionId?: string;
}): boolean => runtimeSessionLookupEnabled && Boolean(executionRuntimeSessionId);

export const resolveStableRuntimeSessionNovncUrl = (
  runtimeSessionNovncUrl?: string,
  lastKnownRuntimeSessionNovncUrl?: string
): string | undefined => runtimeSessionNovncUrl || lastKnownRuntimeSessionNovncUrl;
