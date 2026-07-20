import { useQuery } from 'react-query';
import type { ExecutionStatus } from '@/api/execution';
import { runtimeSessionApi } from '@/api/runtimeSession';
import { useStableRuntimeSessionNovncUrl } from '@/features/executions/shared/hooks/useStableRuntimeSessionNovncUrl';
import {
  getExecutionRuntimeSessionRefetchInterval,
  shouldEnableExecutionRuntimeSessionLookup,
} from '@/features/executions/shared/lib/runtimeSession';

interface UseExecutionRuntimeSessionQueryOptions {
  executionId?: string;
  executionStatus?: ExecutionStatus | string;
  executionRuntimeSessionId?: string;
  runtimeSessionLookupEnabled?: boolean;
}

export function useExecutionRuntimeSessionQuery({
  executionId,
  executionStatus,
  executionRuntimeSessionId,
  runtimeSessionLookupEnabled = true,
}: UseExecutionRuntimeSessionQueryOptions) {
  const runtimeSessionQueryEnabled = shouldEnableExecutionRuntimeSessionLookup({
    runtimeSessionLookupEnabled,
    executionRuntimeSessionId,
  });

  const { data: runtimeSession } = useQuery(
    ['execution-runtime-session', executionRuntimeSessionId],
    () => runtimeSessionApi.getByIdOrExecutionId(executionRuntimeSessionId!, executionId),
    {
      enabled: runtimeSessionQueryEnabled,
      refetchInterval: (data) =>
        getExecutionRuntimeSessionRefetchInterval({
          runtimeSessionState: data?.state,
          executionStatus,
        }),
    }
  );

  const stableRuntimeSessionNovncUrl = useStableRuntimeSessionNovncUrl(runtimeSession);

  return {
    runtimeSession,
    stableRuntimeSessionNovncUrl,
  };
}
