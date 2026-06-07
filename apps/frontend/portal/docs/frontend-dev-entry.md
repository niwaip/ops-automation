# 前端开发入口说明

基于当前 `portal` / `user-web` 拆分状态，推荐按下面方式启动：

## 端口职责

- `5173` -> `portal`，面向管理员和内部运营。
- `5174` -> `user-web`，面向普通用户，聊天/通知/报告/执行主链路优先在这里验收。

## 最短启动命令

在仓库根目录执行：

```bash
# 1) 启动 user-web 依赖的最小后端集合
pnpm run dev:user-web:deps:up

# 2) 启动 portal
pnpm run dev:portal

# 3) 启动 user-web
pnpm run dev:user-web
```

停止 `user-web` 依赖服务：

```bash
pnpm run dev:user-web:deps:stop
```

## 什么时候需要 Docker

- 只想看前端静态页面：可以不启 Docker，只跑 `pnpm run dev:portal` 或 `pnpm run dev:user-web`。
- 需要真实登录、执行、聊天、通知、报告：需要先跑 `pnpm run dev:user-web:deps:up`。

## 当前登录行为

- `portal` 和 `user-web` 目前各自维护登录态，本地开发时不会自动共享会话。
- 在 `5173` 登录，不代表 `5174` 已登录；反之亦然。
- `portal` 中用户侧路由会逐步跳转到 `user-web`，因此普通用户链路建议直接从 `5174` 验证。

## 当前推荐用法

- 管理后台改动：打开 `http://localhost:5173`
- 用户侧聊天/通知/报告/执行：打开 `http://localhost:5174`

## 对应根脚本

- `pnpm run dev:portal`
- `pnpm run dev:user-web`
- `pnpm run dev:user-web:deps:up`
- `pnpm run dev:user-web:deps:stop`
