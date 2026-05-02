import { EXECUTION_STATUS } from '../src/modules/execution/contracts/execution-status';
import {
  EXECUTION_STATUS_TRANSITIONS,
  canTransitionExecutionStatus,
  isTerminalExecutionStatus,
} from '../src/modules/execution/execution-transition-policy';

describe('execution-transition-policy', () => {
  it('exposes the allowed transitions for active execution states', () => {
    expect(EXECUTION_STATUS_TRANSITIONS[EXECUTION_STATUS.QUEUED]).toEqual([
      EXECUTION_STATUS.RUNNING,
      EXECUTION_STATUS.WAITING_INPUT,
      EXECUTION_STATUS.PENDING_APPROVAL,
      EXECUTION_STATUS.CANCELLED,
    ]);
    expect(EXECUTION_STATUS_TRANSITIONS[EXECUTION_STATUS.RUNNING]).toContain(
      EXECUTION_STATUS.HUMAN_CONTROL,
    );
  });

  it('checks whether a transition is allowed', () => {
    expect(
      canTransitionExecutionStatus(EXECUTION_STATUS.PENDING_APPROVAL, EXECUTION_STATUS.QUEUED),
    ).toBe(true);
    expect(
      canTransitionExecutionStatus(EXECUTION_STATUS.SUCCEEDED, EXECUTION_STATUS.RUNNING),
    ).toBe(false);
  });

  it('recognizes terminal execution states', () => {
    expect(isTerminalExecutionStatus(EXECUTION_STATUS.SUCCEEDED)).toBe(true);
    expect(isTerminalExecutionStatus(EXECUTION_STATUS.CANCELLED)).toBe(true);
    expect(isTerminalExecutionStatus(EXECUTION_STATUS.RUNNING)).toBe(false);
  });
});
