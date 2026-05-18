export const RECOVERY_MESSAGES = {
  BROWSER_TAKEOVER: 'Browser runtime requested human takeover',
  BROWSER_PHASE_TAKEOVER: 'Browser phase requires human takeover',
  SKILL_TAKEOVER: 'Skill runtime requested human takeover',
  SKILL_TAKEOVER_UNHANDLED: 'Skill runtime requested human takeover without handler',
  PHASE_TAKEOVER: 'Phase requires human takeover',
  BROWSER_FAILED: 'Browser phase execution failed',
  AI_RECOVERY_FAILED: 'AI browser phase recovery failed',
  AUTO_RETRY: (attempt: number) => `Retry browser phase automatically (attempt ${attempt})`,
};

export const RECOVERY_ACTIONS = {
  RETRY_SAME_PHASE: 'retry_same_phase',
  RETRY_WITH_PATCH: 'retry_with_patch',
  TAKEOVER_REQUIRED: 'takeover_required',
  RESOLVED_BY_HUMAN: 'resolved_by_human',
  ABORT: 'abort',
} as const;
