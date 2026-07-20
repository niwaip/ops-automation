import axios from 'axios';

/**
 * 获取 API 请求返回的 HTTP 状态码。
 * 支持 AxiosError 以及携带 status/response.status 的普通错误对象。
 */
export const getApiErrorStatus = (error: unknown): number | undefined => {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const errorWithStatus = error as {
    status?: unknown;
    response?: {
      status?: unknown;
    };
  };

  if (typeof errorWithStatus.response?.status === 'number') {
    return errorWithStatus.response.status;
  }

  return typeof errorWithStatus.status === 'number' ? errorWithStatus.status : undefined;
};

/**
 * 判断是否为 404 Not Found 错误
 */
export const isNotFoundError = (error: unknown): boolean => getApiErrorStatus(error) === 404;

/**
 * 判断是否为 401 Unauthorized 错误
 */
export const isUnauthorizedError = (error: unknown): boolean => getApiErrorStatus(error) === 401;

/**
 * 判断是否为 403 Forbidden 错误
 */
export const isForbiddenError = (error: unknown): boolean => getApiErrorStatus(error) === 403;

/**
 * 判断是否为可忽略的基线 API 错误（例如 401, 403, 404 在特定条件分支下需要优雅降级而不直接阻断流程）
 */
export const isIgnorableApiError = (
  error: unknown,
  ignorableStatuses: number[] = [401, 403, 404]
): boolean => {
  const status = getApiErrorStatus(error);
  return status !== undefined && ignorableStatuses.includes(status);
};
