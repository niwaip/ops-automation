import {
  compareExecutionPhases,
  getPhaseStatusColor,
  getPhaseStatusLabel,
  getPhaseStepStatus,
  type ExecutionPhaseDto,
} from '@ops/user-core';

const getPhaseDisplayTimeMs = (phase: ExecutionPhaseDto): number => {
  const source = phase.startedAt || phase.createdAt;
  if (!source) {
    return 0;
  }
  const parsed = new Date(source).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const compareExecutionPhasesByTime = (
  left: ExecutionPhaseDto,
  right: ExecutionPhaseDto
) => {
  const leftTime = getPhaseDisplayTimeMs(left);
  const rightTime = getPhaseDisplayTimeMs(right);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return compareExecutionPhases(left, right);
};

export {
  compareExecutionPhases,
  getPhaseStatusColor,
  getPhaseStatusLabel,
  getPhaseStepStatus,
};
