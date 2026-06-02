import type { WorkflowStep } from './temporal-workflow.types';

export function normalizeInputParams(
  inputParams: Array<{ key?: string; value?: string; required?: boolean }> | Record<string, string> | undefined,
): Array<{ key: string; value: string; required: boolean }> {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams
      .filter((item) => item && typeof item.key === 'string' && item.key.trim())
      .map((item) => ({
        key: String(item.key),
        value: typeof item.value === 'string' ? item.value : '',
        required: Boolean(item.required),
      }));
  }
  return Object.entries(inputParams).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : '',
    required: !value,
  }));
}

export function buildPythonJsonLiteral(value: unknown): string {
  return `json.loads(${JSON.stringify(JSON.stringify(value ?? ''))})`;
}

export function durationToTimedeltaCode(duration: string): string {
  const normalized = String(duration || '60s').trim();
  const match = normalized.match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    return 'timedelta(seconds=60)';
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'm':
      return `timedelta(minutes=${value})`;
    case 'h':
      return `timedelta(hours=${value})`;
    case 'd':
      return `timedelta(days=${value})`;
    case 's':
    default:
      return `timedelta(seconds=${value})`;
  }
}

export function buildExecuteActivityTimeoutLines(
  step: WorkflowStep,
  fallbackStartToCloseTimeout: string,
): string[] {
  const lines = [
    `            start_to_close_timeout=${durationToTimedeltaCode(step.startToCloseTimeout || fallbackStartToCloseTimeout)},`,
  ];
  if (step.scheduleToCloseTimeout) {
    lines.push(
      `            schedule_to_close_timeout=${durationToTimedeltaCode(step.scheduleToCloseTimeout)},`,
    );
  }
  if (step.heartbeatTimeout) {
    lines.push(
      `            heartbeat_timeout=${durationToTimedeltaCode(step.heartbeatTimeout)},`,
    );
  }
  return lines;
}

export function toPythonLiteral(value: unknown, indent = 0): string {
  const nextIndent = indent + 4;
  const currentPadding = ' '.repeat(indent);
  const nextPadding = ' '.repeat(nextIndent);

  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `[\n${value.map((item) => `${nextPadding}${toPythonLiteral(item, nextIndent)}`).join(',\n')}\n${currentPadding}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '{}';
    }
    return `{\n${entries.map(([key, item]) => `${nextPadding}${JSON.stringify(key)}: ${toPythonLiteral(item, nextIndent)}`).join(',\n')}\n${currentPadding}}`;
  }
  return JSON.stringify(String(value));
}
