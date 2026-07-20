import type { ExecutionStatus } from '@/api/execution';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/constants/executionStatusMeta';

export const buildExecutionStatusMeta = ({
  isEnglish,
  manualReviewPendingLabel,
}: {
  isEnglish: boolean;
  manualReviewPendingLabel: string;
}) => {
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const statusLabelMap = statusLabels as Record<string, string>;
  const statusColors = EXECUTION_STATUS_COLORS as Record<string, string>;

  const getExecutionStatusLabel = (status?: ExecutionStatus | string) => {
    if (!status) {
      return '-';
    }
    if (status === 'human_control') {
      return manualReviewPendingLabel;
    }
    return statusLabelMap[status] || status;
  };

  const getExecutionStatusColor = (status?: ExecutionStatus | string) => {
    if (!status) {
      return 'default';
    }
    if (status === 'human_control') {
      return 'warning';
    }
    return statusColors[status] || 'default';
  };

  return {
    statusLabels,
    statusColors,
    getExecutionStatusLabel,
    getExecutionStatusColor,
  };
};
