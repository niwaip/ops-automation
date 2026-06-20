# Debug Session: template-run-error

Status: OPEN

## Symptoms

- 模板 `循环审批保留中案件` 执行后立即报错。
- 需要确认是模板步骤本身错误、循环计划构建失败，还是执行端命中了错误定位器。

## Scope

- 模板 `b91c2110-b5c0-4e3e-a530-fe17820e39db`
- template steps / config.loopDraft / executionPlan
- 模板执行服务运行时日志与报错

## Hypotheses

1. 第 2 步“保留中”按钮 locator 过宽，执行时点击到了错误按钮或无法唯一命中。
2. `loopDraft` 虽然存在，但执行端在构建循环计划时失败，导致模板一启动就异常。
3. 执行端读取到的模板版本或 executionPlan 不是刚导出的这份。
4. 模板执行其实已启动，但第一页即触发元素缺失或 takeover，因此表现为“马上出错”。

## Evidence Plan

- 读取模板详情，确认当前落库内容。
- 查找最近与该模板相关的执行记录和运行日志。
- 确认失败发生在第几步，以及是模板步骤失败还是循环初始化失败。

## Findings

- 执行会话为 `ece7b2a5-b200-4fc8-8b9b-f8065c210bbf`，模板为 `b91c2110-b5c0-4e3e-a530-fe17820e39db`。
- Session Broker 日志显示会话在 `step_2` 失败，而不是在循环初始化阶段失败。
- 执行时实际下发的第 2 步命令是 `click selector=role=button`。
- `GET /sessions/:id/steps` 返回的 `step_2` 错误为：
  - `Error: strict mode violation: locator('role=button') resolved to 10 elements`
- `final_state` 页面文本显示当时页面上同时存在多个按钮，包括 `すべて / 保留中 / 承認済み / 却下済み / データをリセット / 詳細`，因此 `role=button` 必然多匹配。
- 模板中的 `loopDraft` 与 `executionPlan.loopDraft` 都完整存在，包含 `eachIteration.stepIds` 和 `stopWhen`，未见循环计划缺失。

## Hypothesis Status

- H1 第 2 步 locator 过宽导致立即失败：确认。根因即 `role=button` 多匹配。
- H2 循环计划构建失败：否定。循环配置完整，失败发生在进入循环主体前的筛选步骤。
- H3 执行端读取了错误模板版本：否定。日志中的 5 个步骤与当前模板定义一致。
- H4 模板已启动但第一页触发元素缺失或 takeover：部分否定。确实是第一页失败，但具体原因不是 takeover，而是 strict mode 多匹配。
