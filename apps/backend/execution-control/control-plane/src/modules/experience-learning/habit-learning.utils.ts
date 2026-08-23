export function detectHabitRisk(plan: unknown): 'read' | 'external_commit' {
  const text = JSON.stringify(plan || {}).toLowerCase();
  return /bark|email|e-mail|sms|webhook|publish|推送|邮件|短信/.test(text)
    ? 'external_commit'
    : 'read';
}

export function habitAuditSnapshot(value: any) {
  if (!value) return null;
  return {
    id: value.id,
    kind: value.kind,
    status: value.status,
    riskLevel: value.riskLevel,
  };
}

export function serializeHabitDates<T extends Record<string, any>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ])
  ) as T;
}

