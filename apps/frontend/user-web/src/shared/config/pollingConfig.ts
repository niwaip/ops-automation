/**
 * 集中管理前端所有的轮询时间间隔（单位：毫秒）。
 *
 * 避免在页面/Hook 中直接硬编码数字字面量，方便统一调整。
 */

/** 聊天会话列表刷新间隔（空闲状态） */
export const CHAT_SESSION_POLL_INTERVAL = 5_000;

/** 聊天会话列表刷新间隔（流式响应进行中） */
export const CHAT_SESSION_STREAMING_POLL_INTERVAL = 4_000;

/** 报告生成状态轮询间隔 */
export const REPORT_STATUS_POLL_INTERVAL = 3_000;

/** 执行状态轮询间隔（活跃/进行中状态） */
export const EXECUTION_ACTIVE_POLL_INTERVAL = 5_000;
