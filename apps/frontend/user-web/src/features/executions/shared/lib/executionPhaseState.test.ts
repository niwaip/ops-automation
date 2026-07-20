import { describe, expect, it } from 'vitest';
import {
  findCurrentExecutionPhase,
  resolveDefaultResumeStepId,
  shouldShowCurrentExecutionPhaseInfo,
  shouldShowExecutionSummary,
} from './executionPhaseState';
import type { ExecutionPhaseDto } from '@/api/execution';

describe('shouldShowCurrentExecutionPhaseInfo', () => {
  it('should return true for running/failed/human_control active statuses', () => {
    expect(shouldShowCurrentExecutionPhaseInfo('running')).toBe(true);
    expect(shouldShowCurrentExecutionPhaseInfo('failed')).toBe(true);
    expect(shouldShowCurrentExecutionPhaseInfo('human_control')).toBe(true);
  });

  it('should return false for other statuses', () => {
    expect(shouldShowCurrentExecutionPhaseInfo('pending' as any)).toBe(false);
    expect(shouldShowCurrentExecutionPhaseInfo('waiting_input')).toBe(false);
    expect(shouldShowCurrentExecutionPhaseInfo('waiting_approval' as any)).toBe(false);
    expect(shouldShowCurrentExecutionPhaseInfo('cancelled')).toBe(false);
    expect(shouldShowCurrentExecutionPhaseInfo('succeeded')).toBe(false);
  });
});

describe('shouldShowExecutionSummary', () => {
  it('should return true for terminal statuses', () => {
    expect(shouldShowExecutionSummary('succeeded')).toBe(true);
    expect(shouldShowExecutionSummary('failed')).toBe(true);
    expect(shouldShowExecutionSummary('cancelled')).toBe(true);
  });

  it('should return false for non-terminal statuses', () => {
    expect(shouldShowExecutionSummary('running')).toBe(false);
    expect(shouldShowExecutionSummary('pending' as any)).toBe(false);
  });
});

describe('findCurrentExecutionPhase', () => {
  it('should match the currentPhaseKey with active status', () => {
    const phases: Partial<ExecutionPhaseDto>[] = [
      { id: 'p1', phaseKey: 'k1', status: 'completed' },
      { id: 'p2', phaseKey: 'k2', status: 'running' },
    ];
    const current = findCurrentExecutionPhase(phases as ExecutionPhaseDto[], 'k2');
    expect(current?.id).toBe('p2');
  });

  it('should fallback to first running phase if key not matched', () => {
    const phases: Partial<ExecutionPhaseDto>[] = [
      { id: 'p1', phaseKey: 'k1', status: 'completed' },
      { id: 'p2', phaseKey: 'k2', status: 'running' },
    ];
    const current = findCurrentExecutionPhase(phases as ExecutionPhaseDto[], 'k3');
    expect(current?.id).toBe('p2');
  });

  it('should return the last phase if no active status matches', () => {
    const phases: Partial<ExecutionPhaseDto>[] = [
      { id: 'p1', phaseKey: 'k1', status: 'completed' },
      { id: 'p2', phaseKey: 'k2', status: 'completed' },
    ];
    const current = findCurrentExecutionPhase(phases as ExecutionPhaseDto[], 'k3');
    expect(current?.id).toBe('p2'); // since it reverses array, the last element 'p2' is checked first
  });
});

describe('resolveDefaultResumeStepId', () => {
  it('should return undefined if failedCurrentPhaseStepId is not provided', () => {
    const phase: Partial<ExecutionPhaseDto> = {
      id: 'p1',
      steps: [{ id: 's1' }, { id: 's2' }] as any,
    };
    expect(resolveDefaultResumeStepId({ currentPhase: phase as any })).toBeUndefined();
  });

  it('should return next step id if failed index exists and has next step', () => {
    const phase: Partial<ExecutionPhaseDto> = {
      id: 'p1',
      steps: [{ id: 's1' }, { id: 's2' }] as any,
    };
    expect(
      resolveDefaultResumeStepId({
        currentPhase: phase as any,
        failedCurrentPhaseStepId: 's1',
      })
    ).toBe('s2');
  });

  it('should return same step id if it was the last step', () => {
    const phase: Partial<ExecutionPhaseDto> = {
      id: 'p1',
      steps: [{ id: 's1' }, { id: 's2' }] as any,
    };
    expect(
      resolveDefaultResumeStepId({
        currentPhase: phase as any,
        failedCurrentPhaseStepId: 's2',
      })
    ).toBe('s2');
  });
});
