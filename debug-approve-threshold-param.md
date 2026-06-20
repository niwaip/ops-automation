# [OPEN] Debug Session: approve-threshold-param

## Bug
- 症状: 在“登录并进入承認する (Approve)”执行中，用户将阈值设置为 `10`，实际执行仍按 `20` 生效。
- 期望: 运行时应正确使用用户传入的阈值 `10`，而不是默认值 `20`。

## Hypotheses
1. 参数提取成功，但未注入最终执行上下文。
2. 执行链路读取了错误字段名或旧变量名，回退到默认值 `20`。
3. 模板步骤对阈值做了空值/类型处理，导致 `10` 被覆盖成默认值。
4. 页面显示阈值已改，但实际承认判断逻辑仍写死 `20`。
5. 本次运行复用了旧 session 或旧导出产物，运行时参数未更新。

## Plan
1. 定位“登录并进入承認する (Approve)”对应的 skill/template/workflow 和参数注入链路。
2. 添加最小化埋点，记录参数提取、参数映射、执行入参、浏览器侧实际阈值。
3. 用一次完整复现收集 pre-fix 证据。
4. 基于证据做最小修复。
5. 做 post-fix 验证并等待用户确认后清理。

## Status
- 已完成最小化插桩并实现双侧修复：
  - 导出侧会将 branch `condition_fn` 中的硬编码阈值改写为参数占位符。
  - 运行时会对已发布 legacy capability 的毛利率 branch 做兼容改写。
- 已完成单测验证：
  - `capability-release-browser-recording.service.test.ts`
  - `recorder-debug.loop-export.spec.ts`
- 已完成 live runtime 验证的关键证据采集：
  - 旧已发布 capability `98603fac-af39-478f-a405-d58247b5487b` 的持久化草案仍写死 `>= 20`。
  - 实际运行时传入 `grossMarginThreshold=10` 后，埋点记录的 resolved branch condition 已变为 `>= 10`。
- 当前剩余阻塞：
  - 该 live capability 自身缺少登录步骤，且 `startUrl` 未传时会直接保留 `${startUrl}` 导致导航失败。
  - 即便补传 `startUrl=http://192.168.100.143/?skip_mfa=true#approvals`，仍会在 `:nth-match([data-ai-action="detail"], 1)` 等待超时，因为页面尚未登录、详情按钮未渲染。
