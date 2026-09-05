export interface FriendlyErrorOptions {
  skillName?: string;
  phase?: 'waiting_input' | 'execution' | 'planning' | 'saved_workflow';
}

/**
 * 格式化执行异常信息为对用户友好的中文提示。
 *
 * 特别是对于权限不足（如未分配技能权限）的场景，避免直接抛出英文系统错误，
 * 明确引导用户前往技能中心申请授权或联系管理员开通。
 */
export function formatFriendlyExecutionError(
  rawError: unknown,
  options?: FriendlyErrorOptions
): string {
  const message = extractErrorMessage(rawError);
  const skillName = options?.skillName?.trim();
  const skillLabel = skillName ? `「${skillName}」` : '该';

  // 1. 技能执行或访问权限不足 (403 / Forbidden / access denied / permission)
  if (isPermissionError(message)) {
    return `您当前暂无${skillLabel}技能的执行权限。如需使用，请前往「技能中心」申请授权，或联系系统管理员开通权限。`;
  }

  // 2. 网络或服务不可用
  if (/econnrefused|failed to fetch|network error/i.test(message)) {
    return '后台服务暂时无法连接，请检查服务运行状态或稍后重试。';
  }

  // 3. 超时
  if (/(timeout|timed out)/i.test(message)) {
    return '服务响应超时，请稍后重试。';
  }

  // 4. 通用执行错误，根据阶段增加中文前缀
  if (options?.phase === 'waiting_input') {
    return `创建等待输入执行单失败: ${message || '未知错误'}`;
  }
  if (options?.phase === 'execution') {
    return `创建执行单失败: ${message || '未知错误'}`;
  }

  return message || '任务执行遇到未知异常，请稍后重试。';
}

function extractErrorMessage(rawError: unknown): string {
  if (!rawError) {
    return '';
  }
  if (typeof rawError === 'string') {
    return rawError;
  }
  const anyError = rawError as any;
  if (anyError.response?.data?.message) {
    const respMsg = anyError.response.data.message;
    return Array.isArray(respMsg) ? respMsg.join('; ') : String(respMsg);
  }
  if (anyError.message) {
    return String(anyError.message);
  }
  return String(rawError);
}

function isPermissionError(message: string): boolean {
  return (
    /permission to execute/i.test(message) ||
    /permission to access/i.test(message) ||
    /access denied/i.test(message) ||
    /forbidden/i.test(message) ||
    /403/i.test(message) ||
    /暂无.*权限/.test(message) ||
    /无权/.test(message) ||
    /未授权/.test(message) ||
    /缺少.*权限/.test(message) ||
    /not have permission/i.test(message)
  );
}
