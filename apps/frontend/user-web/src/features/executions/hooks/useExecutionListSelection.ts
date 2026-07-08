import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ExecutionDto } from '@/api/execution';

interface UseExecutionListSelectionOptions {
  navigate: (to: string) => void;
}

export function useExecutionListSelection({ navigate }: UseExecutionListSelectionOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>(
    searchParams.get('executionId') || undefined
  );

  useEffect(() => {
    const executionId = searchParams.get('executionId') || undefined;
    setSelectedExecutionId(executionId);
  }, [searchParams]);

  const updateExecutionSelection = useCallback(
    (executionId?: string) => {
      const nextSearchParams = new URLSearchParams(searchParams);
      if (executionId) {
        nextSearchParams.set('executionId', executionId);
      } else {
        nextSearchParams.delete('executionId');
      }
      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleExecutionRowClick = useCallback(
    (record: ExecutionDto) => {
      if (record.status === 'human_control') {
        navigate(`/executions/${record.id}`);
        return;
      }

      updateExecutionSelection(record.id);
    },
    [navigate, updateExecutionSelection]
  );

  return {
    searchParams,
    selectedExecutionId,
    updateExecutionSelection,
    handleExecutionRowClick,
  };
}
