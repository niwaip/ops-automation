import type { ExecutionPhaseDto } from '@/api/execution';
import { asRecord, tryParseJsonValue } from './common';

export const getPhaseLoopIteration = (phase?: ExecutionPhaseDto): number | undefined => {
  const phaseInput = asRecord(tryParseJsonValue(phase?.input));
  const value = phaseInput?.loopIteration;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

export const formatPhaseDisplayName = (
  phase: ExecutionPhaseDto,
  options: { isEnglish?: boolean; fallbackIndex?: number } = {}
): string => {
  const { isEnglish = false, fallbackIndex } = options;
  const baseName =
    phase.phaseName ||
    phase.phaseKey ||
    `${isEnglish ? 'Step' : '步骤'} ${fallbackIndex ?? 0}`;
  const loopIteration = getPhaseLoopIteration(phase);
  return loopIteration
    ? `${baseName} · ${isEnglish ? `Loop ${loopIteration}` : `第 ${loopIteration} 轮`}`
    : baseName;
};
