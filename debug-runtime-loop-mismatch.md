# [OPEN] runtime-loop-mismatch

## 问题描述
- 已完成技能：
  - 名称：`登录并进入承認する (Approve)`
  - 记录：`84c5c477-d2c7-40b3-b1d8-b1e52db4329b`
- 现象：
  - 在实际运行中，循环没有执行。
  - 在 `http://192.168.100.143:5173/templates` 页面测试时，循环会执行。

## 当前假设
1. `templates` 测试页运行的是最新草稿/模板 DSL，而已完成技能运行时使用的是旧的已发布快照，二者 `executionPlan` 不一致。
2. 发布链路在构建 `executionPlan` 时丢失了 `loop/foreach/branch` 结构，模板测试链路没有丢失。
3. 运行时参数注入后改变了循环入口条件，导致正式运行分支跳过，但测试页使用的是固定示例参数。
4. 模板测试页走的是 `execution-flow` 模板引擎，而已发布技能走的是 `capability-release-runtime`，两者对循环节点解释不一致。
5. 已完成技能记录对应的 release/skill draft 与当前页面上看到的模板不是同一版本。

## 调试计划
1. 定位该技能的 release、skill draft、published skill 与运行时记录。
2. 对比 `templates` 测试使用的模板结构与正式运行使用的 `executionPlan`。
3. 仅添加最小埋点，记录正式运行时收到的 `executionPlan`、循环节点和实际调度路径。
4. 基于证据做最小修复并复测。

## 进展记录
- 继续沿用调试会话 `runtime-loop-mismatch`。
- 已确认本仓库当前标准 Docker 入口为 `docker/start-smart.sh`，Compose 文件位于 `docker/compose/`。
- 本轮继续验证的可证伪假设：
  1. bridge 已接收循环字段，但写入 `skill_drafts.draft_payload_json` 时仍丢失了 `executionPlan.loopDraft`
  2. `skill_drafts` 已保留循环元数据，但发布到 `skill_configs` 时被覆盖
  3. 正式运行链路读取了已发布配置，但没有把 `loopDraft` 传入执行器
  4. `platform` 容器没有加载当前 worktree 新代码，导致行为仍停留在旧版本
- 已建立新的调试会话，开始对比模板测试链路与正式运行链路。
- 已确认运行记录映射：
  - 执行记录 `8bec264f-21c7-4179-801f-474e8251ac15`
  - 对应技能 `84c5c477-d2c7-40b3-b1d8-b1e52db4329b`
  - 技能名 `登录并进入承認する (Approve)`
- 已确认正式运行对象来自 `skill_configs`，不是 `capability_releases/skill_drafts`：
  - `skill_configs.id = 84c5c477-d2c7-40b3-b1d8-b1e52db4329b`
  - `template_id` 为空，说明它没有直接绑定 `/templates` 表中的模板记录。
- 已确认 `/templates` 页同名模板存在独立记录：
  - `templates.id = bf898e26-2c09-4363-b1b9-4e52c1e510ab`
  - 状态为 `DRAFT`
- 关键差异证据：
  - `/templates` 的 `config.executionPlan` 中明确包含 `loopDraft`，`mode = repeat_until`，`eachIteration.stepIds = ["step_6","step_7","step_8","step_9","step_10"]`
  - 正式运行的 `skill_configs.execution_flow` 只包含线性步骤 `1..10`，没有 `loopDraft`，也没有任何循环元数据
  - 因此模板测试会循环，而正式技能运行不会循环
- 额外证据：
  - 正式执行记录 `8bec...` 的 `result_json.stepResults` 数量仅为 `1`
  - 这进一步表明正式运行走的是另一套执行结果聚合链路，而不是模板测试页的 session 循环执行链路
- 已确认 `platform` 容器已按当前 worktree 重启，容器内 `interfaces.ts` 和 `capability-release-publish.service.ts` 与本地改动一致，不是旧挂载。
- 已通过真实导出样本复现 bridge 400，并定位到新的根因：
  - `main.ts` 开启了 `enableImplicitConversion: true`
  - bridge DTO 中多个 `Array<Record<string, unknown>>` 字段叠加 `@IsObject({ each: true })` 后，会在真实接口校验中误判为“each value must be an object”
  - 真实导出中的 `skillDraft.invocation` 还是字符串，也会被原 DTO 拒绝
- 已完成最小修复：
  - `RecorderBridgeSkillDraftDTO.invocation` 改为同时兼容 `string | object`
  - 移除 bridge DTO 中泛型对象数组上的 `@IsObject({ each: true })`，避免与 `enableImplicitConversion` 冲突
  - 新增回归测试 `capability-release-bridge-dto.test.ts`，已通过
- 修复后再次使用真实 `exportArtifacts` 调用 `/capabilities/bridge/recorder-export` 成功，生成：
  - `releaseId = 2dd377a7-4db4-405e-af0b-37c132169502`
  - `draftId = 80bc2021-ee43-412f-8688-6cbc51b28795`
- 已查库确认新 `skill_drafts` 保留了循环元数据：
  - `draft_payload_json.apiEndpoints.runtimeMetadata.executionPlan.loopDraft` 存在
  - `draft_payload_json.apiEndpoints.runtimeMetadata.templateSteps[0]` 存在
  - `draft_payload_json.apiEndpoints.runtimeMetadata.loopPlanPreview[0]` 存在
- 已对新 release 执行 `approve -> publish-skill`，生成：
  - `publishedSkillId = ee23da17-7164-42be-ab82-d9e72b095209`
- 已对比旧技能与新技能的 `skill_configs`：
  - 旧技能 `84c5c477-d2c7-40b3-b1d8-b1e52db4329b`：
    - `execution_flow_len = 11`
    - `api_endpoints.runtimeMetadata.executionPlan.loopDraft = false`
    - `api_endpoints.runtimeMetadata.templateSteps = false`
    - `api_endpoints.runtimeMetadata.loopPlanPreview = false`
  - 新技能 `ee23da17-7164-42be-ab82-d9e72b095209`：
    - `execution_flow_len = 0`
    - `api_endpoints.runtimeMetadata.executionPlan.loopDraft = true`
    - `api_endpoints.runtimeMetadata.templateSteps = true`
    - `api_endpoints.runtimeMetadata.loopPlanPreview = true`
- 已执行新发布技能 `ee23da17-7164-42be-ab82-d9e72b095209` 的正式 runtime 验证：
  - runtime 返回 `201`
  - `logs` 中明确出现：
    - `[BrowserRuntime] stepCount=11`
    - `[BrowserRuntime] loopMode=repeat_until`
    - `[BrowserRuntime] loopMaxIterations=100`
  - 说明循环元数据已经真正进入正式运行链路，不再是“正式技能没有循环”
  - 本次执行未进入循环体的直接原因已变为前置步骤失败：
    - `Error: "role=button[name="登录"]" does not match any elements.`
    - 停在 `currentStepId = step_4`
    - `currentLoopIteration = null`

## 当前结论
- 这不是“同一份模板在两个地方解释不同”，而是“两个入口根本没有使用同一份执行计划”：
  - `/templates` 测试页 -> `session-broker` -> 读取 `templates.config.executionPlan`，其中有 `loopDraft`
  - 正式技能运行 -> `skill_configs.execution_flow`，其中没有 `loopDraft`
- 循环能力是在“模板 -> 正式技能”这一步丢失的，不是在运行时解释器里临时失效。
- 根因已进一步收敛：
  - 旧技能 `84c5...` 确实是桥接修复前的旧产物，缺少循环元数据，因此不会循环
  - 当前修复后的 bridge + publish 链路已经能把 `loopDraft/templateSteps/loopPlanPreview` 保留到新发布技能 `ee23...`
- post-fix 对比结论：
  - pre-fix：旧技能 `84c5...` 在 `skill_configs` 中没有任何循环元数据，正式运行不可能进入循环
  - post-fix：新技能 `ee23...` 已在正式 runtime 日志中输出 `loopMode=repeat_until`，说明“循环不执行”的根因已被修复
  - 当前剩余问题是另一条独立故障：登录按钮定位器失配，阻塞了后续步骤和真正的循环迭代
- 剩余待确认项：
  - 是否需要将旧业务技能重新 bridge / approve / publish 替换为新发布技能
  - 是否继续进入下一轮调试，修复 `step_4` 的登录按钮定位器问题

## 后续补充证据（CapabilitiesPage 入口）
- 用户反馈重新生成并发布的新技能 `9f952142-b9d2-43cf-be7b-53c0be50d17a` 仍然不循环。
- 已查库确认该技能对应 release `8a0ea308-52ca-470e-b09b-420adb092fed` 的：
  - `capability_source_snapshots.source_payload_json.apiEndpoints.runtimeMetadata.executionPlan.loopDraft = false`
  - `skill_drafts.draft_payload_json.apiEndpoints.runtimeMetadata.executionPlan.loopDraft = false`
  - `skill_configs.api_endpoints.runtimeMetadata.executionPlan.loopDraft = false`
- 进一步比对 source snapshot 发现：该 release 的 `source_payload_json` 来自 `CapabilitiesPage` 的 `buildBrowserRecordingSourcePayload()` 入口，只包含线性 `executionFlow`，没有从 `sourceTemplate.templateId` 对应模板中回填 `executionPlan/loopDraft/templateSteps/loopPlanPreview`。
- 已修复前端入口文件：
  - `apps/frontend/portal/src/features/admin/capabilities/pages/CapabilitiesPage.tsx`
  - 创建 browser recording capability 时，会额外读取 `templateApi.getById(templateId)`，把模板 `config` 里的：
    - `executionPlan`
    - `loopDraft`
    - `templateSteps`
    - `loopPlanPreview`
    合并进 `sourcePayload.apiEndpoints.runtimeMetadata`
- 静态验证：
  - `apps/frontend/portal` 已执行 `npm run typecheck`，通过
- 手工按修复后前端逻辑创建验证 release：
  - `releaseId = 80c2a9ac-6861-4a17-865a-88e691948b4a`
  - `snapshotId = 50f2f842-5bc5-4bd5-aae9-9923dec9ec22`
  - 查库确认新 snapshot：
    - `executionPlan.loopDraft = true`
    - `templateSteps = true`
    - `loopPlanPreview = true`
- 继续完成 `build -> validate/static -> generate-skill-draft -> approve -> publish-skill` 后得到：
  - `draftId = 2ce82f5f-1219-44d4-857d-af99db8d8b26`
  - `publishedSkillId = 87febad2-8916-4939-a183-f22963bedbdc`
- 最终查库确认新发布 skill：
  - `skill_configs.id = 87febad2-8916-4939-a183-f22963bedbdc`
  - `execution_flow_len = 11`
  - `api_endpoints.runtimeMetadata.executionPlan.loopDraft = true`
  - `api_endpoints.runtimeMetadata.templateSteps = true`
  - `api_endpoints.runtimeMetadata.loopPlanPreview = true`
- 结论更新：
  - 用户这次“重新生成和发布仍不循环”的直接原因，是使用了修复前的 `CapabilitiesPage` 创建入口，源数据在 snapshot 阶段就没带循环元数据
  - 当前代码修复后，新从该入口创建并发布的技能已经能保住循环元数据
  - 若新技能正式执行仍未出现循环，应继续排查“进入循环体前的前置步骤是否失败”，而不再是元数据丢失问题
