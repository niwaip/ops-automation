export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) {
    return '';
  }

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
};

export const stepStatusLabels: Record<string, { zh: string; en: string }> = {
  pending: { zh: '待执行', en: 'Pending' },
  running: { zh: '执行中', en: 'Running' },
  succeeded: { zh: '已成功', en: 'Succeeded' },
  failed: { zh: '失败', en: 'Failed' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  waiting_input: { zh: '待补输入', en: 'Waiting Input' },
  pending_approval: { zh: '待审批', en: 'Pending Approval' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
};
