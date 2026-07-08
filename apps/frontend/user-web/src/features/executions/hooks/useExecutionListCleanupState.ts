import { useCallback, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

interface UseExecutionListCleanupStateOptions {
  onCleanupBeforeDate: (value: Dayjs | null | undefined) => void;
}

const getDefaultCleanupDate = () => dayjs().subtract(2, 'day');

export function useExecutionListCleanupState({
  onCleanupBeforeDate,
}: UseExecutionListCleanupStateOptions) {
  const [clearBeforeDate, setClearBeforeDate] = useState<Dayjs>(getDefaultCleanupDate);

  const handleClearBeforeDateChange = useCallback((value: Dayjs | null) => {
    setClearBeforeDate(value ?? getDefaultCleanupDate());
  }, []);

  const handleCleanup = useCallback(() => {
    onCleanupBeforeDate(clearBeforeDate);
  }, [clearBeforeDate, onCleanupBeforeDate]);

  return {
    clearBeforeDate,
    handleClearBeforeDateChange,
    handleCleanup,
  };
}
