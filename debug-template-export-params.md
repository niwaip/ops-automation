# [OPEN] template-export-params

## 问题描述
- recorder-debug-1781873203775 导出的模版里，参数没有真正应用，例如阈值未生效。
- 需要同时核查用户名、密码字段在导出链路中是否取值正确。
- 修复后需要重新导出并验证结果。

## 当前假设
1. 导出链路未将 recorder 参数正确注入模版上下文。
2. 参数在上下文归一化或 DTO 映射时被丢弃、改名或覆盖。
3. 用户名和密码来源字段映射错误，或在导出前被清洗为空。
4. 模版变量名与后端传入 key 不一致，导致值未命中。
5. 导出流程命中了旧服务逻辑或旧构建产物。

## 调试计划
1. 定位 recorder 导出入口、参数归一化逻辑、模版渲染调用点。
2. 仅添加最小化埋点，记录导出请求中的关键参数、归一化结果和最终渲染 payload。
3. 复现 recorder-debug-1781873203775 的导出流程并比对日志。
4. 基于证据做最小修复，重新导出验证。

## 进展记录
- 已创建调试会话，准备定位导出链路。
- 已确认旧导出结果存在问题：参数列表中已有 `username`、`loginCredential`、`grossMarginThreshold`，但 `templateSteps` 中仍保留字面量 `admin/admin/20`。
- 已通过埋点确认导出装配阶段只把 `grossMarginThreshold` 替换进 `templateSteps`，用户名和密码未替换。
- 已定位根因：`RecorderParameterService` 在去重同名参数时优先保留了 `command.*` 来源，导致后续 `template.*` 来源的用户名/密码参数被丢弃，`applyParameterPlaceholdersToTemplateSteps()` 无法命中对应 `fill` 步骤。
- 已完成最小修复：同名参数冲突时优先保留 `template.*` 来源。
- 已通过单测验证：`npm test -- recorder-debug.loop-export.spec.ts --runInBand`。
- 已使用真实会话 `recorder-debug-1781873203775` 重新导出，结果如下：
  - `username.source = template.step_2.params.value`
  - `loginCredential.source = template.step_3.params.value`
  - `grossMarginThreshold.source = template.step_8.branch.condition_fn`
  - 模版 `fill` 步骤已变为 `${username}` / `${loginCredential}`
  - 分支阈值已变为 `${grossMarginThreshold}`
- 二次排查确认：
  - `Recorder` 会话内最后一次导出结果确实已经是新版本。
  - 但平台数据库中没有出现本次新的 `browser_recording` 草稿或 release 更新记录。
  - 当前数据库里最近的 `browser_recording` `skill_drafts` 更新时间仍停留在 `2026-06-18`，说明本次重新导出未桥接到实际使用的能力草稿/发布版本。
  - 因此用户端看到“还是一样”的原因，高概率不是导出没变，而是实际查看/运行的仍是旧模版快照。
