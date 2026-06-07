import type { AxiosRequestConfig } from 'axios';

export const LONG_RUNNING_WORKFLOW_TIMEOUT_MS = 360000;

// 浏览器环境不需要 httpsAgent，浏览器会自动处理 TLS。
export function getAxiosConfig(_url: string, options: AxiosRequestConfig = {}): AxiosRequestConfig {
  const config: AxiosRequestConfig = { ...options };
  return config;
}
