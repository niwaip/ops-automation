# Sprint 5 最小验收清单

> 目标：为 `user-web` 的聊天、报告、通知链路提供一份可重复执行的最小闭环验收清单，并补一条静态回归校验，避免 `portal` / `user-web` 的链路边界再次漂移。

## 说明

- 本清单作为参考，用于确保在重构或迭代时主链路功能不受影响。

## 一、先决条件

- `pnpm run validate:user-core`
- `pnpm --filter @ops/user-web run build`
- `pnpm --filter @ops/portal run build`
- `pnpm --filter @ops/portal run check:user-route-policy`

## 二、portal 与 user-web 边界回归

- [ ] `portal` 保留 `/dashboard`
- [ ] `portal` 保留 `/executions`、`/executions/new`、`/executions/:id`
- [ ] `portal` 保留 `/reports`、`/reports/:id`
- [ ] `portal` 的 `/chat` 自动跳转 `user-web`
- [ ] `portal` 的 `/notifications` 自动跳转 `user-web`
- [ ] `portal` 的 `/published-skills` 自动跳转 `user-web`
- [ ] `portal` 的 `/published-skills/:skillId` 跳转到 `user-web /published-skills`

## 三、Sprint 5 主链路回归

### 1. 报告链路

- [ ] 登录 `user-web`
- [ ] 打开 `/reports`，列表可以正常加载
- [ ] 从列表进入 `/reports/:id`
- [ ] 详情页能展示状态、会话 ID、模板 ID
- [ ] 已完成报告可以触发下载

### 2. 聊天链路

- [ ] 打开 `/chat`
- [ ] 模型列表可加载
- [ ] 可新建会话并发送首条消息
- [ ] 历史会话可切换
- [ ] 任务模式下可看到运行状态、结果或错误信息

### 3. 通知链路

- [ ] 登录后通知列表可自动拉取
- [ ] 打开 `/notifications` 能看到通知列表
- [ ] 点击通知可跳转到执行详情或报告详情
- [ ] 登出后通知状态被重置

## 四、建议记录方式

- 对每条人工回归记录：时间、环境、执行人、结果
- 若失败，记录失败页面、接口、控制台错误与复现步骤
- 若本轮未全部人工回归，也应明确标注“功能闭环未人工回归”
