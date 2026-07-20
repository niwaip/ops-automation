/**
 * 全站设计 token 单一来源。
 *
 * - antd `ConfigProvider` 的 `theme.token` 从此文件读取
 * - `src/index.css` 中的 `--primary-color` 等 CSS 变量需与此处常量保持一致
 *
 * 任何品牌色/圆角调整都应在此文件修改，禁止在其他位置硬编码同义色值。
 */

/** 主品牌色（indigo-600），antd 与自定义组件统一引用此值 */
export const PRIMARY_COLOR = '#4f46e5';

/** 基础圆角，对应 antd `token.borderRadius` 与 CSS `--radius-md` */
export const BORDER_RADIUS = 10;
