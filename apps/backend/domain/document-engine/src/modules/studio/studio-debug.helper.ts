function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.trim().toLowerCase());
}

export function isStudioVerboseDebugEnabled(): boolean {
  return (
    isTruthyEnv(process.env.STUDIO_VERBOSE_DEBUG) ||
    isTruthyEnv(process.env.STUDIO_DEBUG_VERBOSE) ||
    isTruthyEnv(process.env.STUDIO_DEBUG)
  );
}

export function isStudioSkillDebugEnabled(): boolean {
  return isTruthyEnv(process.env.STUDIO_SKILL_DEBUG) || isStudioVerboseDebugEnabled();
}
