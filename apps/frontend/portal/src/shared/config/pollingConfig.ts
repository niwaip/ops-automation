/**
 * 集中管理系统各类轮询间隔（单位：毫秒）
 */

/** 报告生成与详情轮询间隔 */
export const REPORT_POLL_INTERVAL = 3_000;

/** 执行列表与详情活跃状态轮询间隔 */
export const EXECUTION_ACTIVE_POLL_INTERVAL = 5_000;

/** 执行通知中心轮询间隔 */
export const NOTIFICATION_POLL_INTERVAL = 5_000;

/** Session 会话状态轮询间隔 */
export const SESSION_POLL_INTERVAL = 5_000;

/** 技能/录制器调试轮询间隔 */
export const DEBUG_RECORDER_POLL_INTERVAL = 3_000;
