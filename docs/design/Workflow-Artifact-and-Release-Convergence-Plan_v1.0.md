# Workflow Artifact 与 Release 职责收敛方案 v1.0

**版本：** v1.0  
**日期：** 2026-06-03  
**状态：** 建议方案  
**适用范围：** `temporal_workflow`、`capability_release`、Portal Workflow 页、Portal Release 页

---

## 1. 目标

本方案用于将当前平台中的 `workflow` 与 `release` 链路重新收敛，建立单一真相来源，解决“代码工件生成、验证、部署、发布”职责分裂的问题。

本次调整的核心目标如下：

1. 让 `workflow` 成为唯一的代码工件生产与验证中心；
2. 让 `release` 收敛为引用已验证工件、执行环境验证、部署与发布的管理层；
3. 消除“Workflow 里重新生成了代码，但 Release 里仍然没有构建产物”的状态分裂；
4. 让 Portal 前后端流程与真实职责边界一致；
5. 为后续显式 `Workflow Artifact` 模型演进保留清晰边界。

一句话定义：

- `workflow = artifact authoring + execution verification`
- `release = environment verification + publication`

---

## 2. 现状与问题

## 2.1 当前已具备的能力

从当前代码现态看，`workflow` 域已经拥有较完整的“生成代码 + 保存 + 真实执行验证”基础能力：

- `temporal-workflow.controller.ts` 已提供代码生成与真实验证接口；
- `temporal-workflow.service.ts` 已提供 `generateAndSaveWorkflowCode()` 与 `validateSavedWorkflowArtifact()`；
- `schema.prisma` 中 `temporal_workflows.generated_code` 已可持久化保存生成结果；
- `release build` 侧已有部分逻辑开始读取已保存的 Workflow 代码工件，而不是完全重新 codegen。

这说明系统并不是“完全没有 artifact 模型”，而是已经出现了一个雏形，但上下游语义尚未完全统一。

## 2.2 当前职责分裂点

当前问题主要集中在以下几个方面：

### A. Workflow 与 Release 都在承载“代码结果”

当前存在两套“代码真相”：

- `temporal_workflows.generated_code`
- `capability_builds.generated_code`

这导致系统会出现以下不一致状态：

- Workflow 页面里生成并保存了代码；
- Release 页面仍然认为“缺少 build 产物”；
- Deploy / Runtime / Smoke Test 仍以 Release build 为准；
- 用户无法判断哪一份代码才是当前真正可发布、可部署的版本。

### B. Release 仍保留“重新生成代码”的旧语义

在 `capability-release-build-validation.service.ts` 中，`build()` 的历史语义仍然偏向“构建产物生成”，而不是“已验证工件绑定检查”。

即使当前实现已经部分改为读取已保存 Workflow 代码，其 DTO、命名、前端按钮文案和用户心智仍然延续旧模型：

- `build`
- `build stream`
- `build detail`
- “构建 / AI 生成代码”

这会持续把用户引导到错误路径。

### C. Deploy 仍耦合 release snapshot / build 语义

当前部署链路虽然已能拿到代码，但整体语义仍表现为：

```text
Release snapshot / build
-> 解析可执行代码
-> 同步 workflow 元数据
-> deploy
```

这意味着：

- Deploy 仍隐含承担“重新组装工件”的职责；
- Runtime / Rollback 仍偏向依赖 build 记录，而不是显式依赖 Workflow artifact；
- 后续一旦 build 记录被清理、缺失或语义重定义，会继续产生行为不稳定。

### D. 前端流程仍然双轨

Portal 前端当前表现为两套平行流程：

- Workflow 页走 `/temporal/*`
- Release 页走 `/capabilities/*`

但 Release 页上仍保留：

- build
- validate
- deploy
- publish

这使得用户误以为“进入 Release 后还要再次生成代码”，从而偏离目标架构。

---

## 3. 目标架构

## 3.1 职责边界

目标架构下，两大域的职责如下。

### Workflow 负责

- 编辑 `workflowDsl` / `activityDsl`
- 生成完整 `generatedCode`
- 保存代码到 `temporal_workflows.generated_code`
- 执行真实验证
- 持久化 artifact 元信息
- 对外提供“可发布工件”

### Release 负责

- 引用一个 Workflow artifact
- 记录环境配置与 deployment profile
- 执行真实环境验证
- 执行 deploy / smoke test
- 生成 Skill 草案
- 发布 Skill
- 回滚与审计

## 3.2 统一原则

后续整个链路都遵循以下规则：

1. `generatedCode` 的唯一生产入口属于 Workflow；
2. `validationStatus` 的唯一真实结果属于 Workflow artifact；
3. Release 不再重新生成代码；
4. Release 只消费已存在、已持久化、可追踪的 Workflow artifact；
5. Deploy / Runtime / Rollback 不再把 `capability_builds.generated_code` 当成唯一来源。

---

## 4. 核心设计

## 4.1 引入 Workflow Artifact 概念

从领域上讲，需要显式引入 `Workflow Artifact` 概念，但第一阶段不强制独立建表。

第一阶段采用最小闭环方案：

- 直接由 `TemporalWorkflow` 自身承载 artifact 状态
- 先把“生成、验证、版本、哈希、结果摘要”补到 `temporal_workflows`
- Release 只保存对该 artifact 的引用信息

这意味着 Phase 1 的 artifact 载体就是：

- `TemporalWorkflow.id`
- `artifactVersion`
- `artifactHash`
- `generatedCode`
- `validationStatus`
- `validatedAt`

## 4.2 Workflow Artifact 的最小字段集

建议在 `temporal_workflows` 中补充如下字段：

- `artifact_version`
- `artifact_hash`
- `validation_status`
- `validation_score`
- `validation_result_json`
- `validated_at`

推荐语义如下：

- `artifactVersion`
  - 每次成功“生成并保存代码”后递增；
  - 用于 Release 绑定具体工件版本，而不是只绑定 workflowId。

- `artifactHash`
  - 对 `generatedCode` 做稳定哈希；
  - 用于部署审计、幂等校验、跨记录一致性检查。

- `validationStatus`
  - 例如：`draft` / `generated` / `validated` / `failed`
  - 用于前端三段式状态展示与 Release 入口约束。

- `validationScore`
  - 保存真实验证分数，便于列表展示与后续发布策略判断。

- `validationResultJson`
  - 保存验证日志、错误、返回摘要等。

- `validatedAt`
  - 标记最后一次真实验证完成时间。

## 4.3 Release 绑定的是 Artifact，不是“可再生成源”

Release 侧需要从“我保存了一份可以重新 codegen 的源快照”转向“我绑定了某个已验证 artifact，并额外保存环境信息”。

因此，`CapabilitySourceSnapshotDTO.sourcePayload` 的主语义要调整为：

- 发布引用
- 环境配置
- 业务说明
- 兼容性所需的最小工作流元数据

而不再是：

- “只要拿到这份 payload，就必须能在 Release 里重新生成全部代码”

---

## 5. 后端改造方案

## 5.1 Workflow 域改造

### 5.1.1 目标

将 `TemporalWorkflowService` 扩展为完整 artifact service，负责：

- 生成并保存 artifact
- 验证已保存 artifact
- 读取 artifact 元数据
- 作为 Release 侧唯一 artifact 查询来源

### 5.1.2 接口设计

建议保留底层能力接口：

- `POST /temporal/generate-code`
- `POST /temporal/validate-code`

同时新增并提升以下接口为主流程：

- `POST /temporal/:id/generate-and-save`
- `POST /temporal/:id/validate-saved-artifact`
- `GET /temporal/:id/artifact`
- `POST /temporal/:id/promote-to-release-draft`（可在后续阶段落地）

其中：

- `generate-and-save`
  - 基于已保存 DSL 生成代码；
  - 写回 `generatedCode`；
  - 刷新 `artifactVersion`；
  - 计算 `artifactHash`；
  - 将 `validationStatus` 重置为 `generated`。

- `validate-saved-artifact`
  - 读取持久化的 `generatedCode`；
  - 执行真实验证；
  - 写回 `validationStatus / validationScore / validationResultJson / validatedAt`。

- `GET /artifact`
  - 返回统一 artifact 视图；
  - 供 Release、Portal 列表页、发布检查统一消费。

### 5.1.3 返回结构建议

建议 Workflow artifact 返回对象统一为：

```json
{
  "workflowId": "uuid",
  "artifactVersion": 3,
  "artifactHash": "sha256:...",
  "generatedCode": "...",
  "validationStatus": "validated",
  "validationScore": 96,
  "validatedAt": "2026-06-03T10:00:00.000Z",
  "validationResult": {}
}
```

这样可以直接消除前端与 Release 侧重复拼装 DTO 的问题。

## 5.2 Release 域改造

### 5.2.1 Create / Update DTO 扩展

建议在 `interfaces.ts` 中为以下 DTO 增加 artifact 绑定字段：

- `CreateCapabilityReleaseDTO`
- `UpdateCapabilitySourceDTO`

建议新增：

- `workflowArtifactRef`
- `workflowId`
- `artifactVersion`
- `artifactHash`

推荐结构：

```json
{
  "workflowArtifactRef": {
    "workflowId": "uuid",
    "artifactVersion": 3,
    "artifactHash": "sha256:..."
  }
}
```

### 5.2.2 Source Snapshot 语义调整

`sourcePayload` 建议收敛为三类内容：

1. `artifactRef`
2. `deploymentProfiles / environmentConfig`
3. `goal / paramsSchema / businessDescription`

对于 `temporal_workflow` 类型，允许保留少量 workflow 结构信息用于兼容展示或调试，但这些字段不再被视为“Release 内可重新 codegen 的唯一真源”。

### 5.2.3 Build 语义收缩

`CapabilityReleaseBuildValidationService.build()` 对 `temporal_workflow` 类型应改为：

- 不调用 `generateWorkflowCode()`
- 不再承担代码生成职责
- 只检查：
  - Workflow 是否存在
  - Artifact 是否存在
  - Artifact 是否已验证
  - Release 中的 artifactRef 与 Workflow 当前 artifact 是否匹配

若保留 `build` 名称，则其真实语义变为：

- `prepare artifact binding`
- `artifact readiness check`

即：

```text
Release.build
!= codegen
== artifact binding check
```

### 5.2.4 可执行代码解析逻辑改造

当前 `resolveTemporalExecutableBuildOrThrow()` 需要被改造成“工件解析器”，而不是“构建产物解析器”。

目标逻辑：

1. 若 Release 指定了 `workflowArtifactRef`
   - 直接到 `TemporalWorkflow` 中解析该版本工件；
2. 若当前阶段还未做版本化落盘
   - 则退化为读取 `TemporalWorkflow.generatedCode` + `artifactHash`；
3. 仅在兼容历史记录时才回退到 `capability_builds.generated_code`；
4. 新逻辑中 `capability_builds.generated_code` 不再是唯一来源。

### 5.2.5 Deploy 语义改造

`capability-release-deployment.service.ts` 中的部署逻辑需要从“重新组装 workflow 并部署”收敛为：

1. 读取已绑定 Workflow artifact
2. 应用环境级配置覆盖
3. 执行 smoke test / deploy test
4. 记录 deployment record

Deploy 不再承担：

- 重新生成代码
- 重新判定源 DSL 是否可 codegen
- 把 Release snapshot 当成新的代码真源

### 5.2.6 Runtime / Rollback 语义改造

Runtime 与 Rollback 也应逐步切换到 artifact 引用模型：

- Runtime 优先从 Workflow artifact 取 `generatedCode`
- Rollback 回到某个历史 Release 时，恢复的是“该 Release 绑定的 artifactRef”
- 审计信息要能明确区分：
  - 恢复了哪个 Release
  - 恢复到了哪个 Workflow artifact version/hash

---

## 6. 数据模型方案

## 6.1 第一阶段最小改动

第一阶段建议不引入独立 `workflow_artifacts` 表，先做最小闭环：

- 扩展 `temporal_workflows`
- 扩展 `capability_releases`
- 扩展 `capability_source_snapshots.source_payload_json`

## 6.2 Workflow 侧字段

建议新增：

- `temporal_workflows.artifact_version`
- `temporal_workflows.artifact_hash`
- `temporal_workflows.validation_status`
- `temporal_workflows.validation_score`
- `temporal_workflows.validation_result_json`
- `temporal_workflows.validated_at`

## 6.3 Release 侧引用方案

推荐两种方案：

### 方案 A

- `capability_releases.source_id` 继续指向 `workflowId`
- `sourcePayload` 中增加：
  - `workflowArtifactRef.workflowId`
  - `workflowArtifactRef.artifactVersion`
  - `workflowArtifactRef.artifactHash`

### 方案 B

- 在 `capability_releases` 上新增显式列：
  - `workflow_artifact_version`
  - `workflow_artifact_hash`

### 第一阶段推荐

优先采用方案 A，原因如下：

1. 改动最小；
2. 与当前 `source_id = workflowId` 模型兼容；
3. 只需补 artifact 元信息即可开始收敛；
4. 后续若升级为独立表，也可平滑迁移。

---

## 7. API 调整建议

## 7.1 Workflow API

### 保留底层接口

- `POST /temporal/generate-code`
- `POST /temporal/validate-code`

### 提升为主流程接口

- `POST /temporal/:id/generate-and-save`
- `POST /temporal/:id/validate-saved-artifact`
- `GET /temporal/:id/artifact`
- `POST /temporal/:id/promote-to-release-draft`

## 7.2 Release API

### 保留

- `POST /capabilities/:id/validate/static`
- `POST /capabilities/:id/validate/sandbox`
- `POST /capabilities/:id/deploy`
- `POST /capabilities/:id/publish-skill`

### 弱化或废弃

- `POST /capabilities/:id/build`
- `GET /capabilities/:id/build/stream`

### 替代关系

旧流程：

```text
Release.build -> codegen -> validate -> deploy
```

新流程：

```text
Workflow.generate-and-save
-> Workflow.validate-saved-artifact
-> Release.validate/deploy/publish
```

---

## 8. 前端改造方案

## 8.1 Workflow 页

Workflow 页是用户的 artifact authoring 主入口，建议强化三段式状态：

- 草稿
- 已生成代码
- 已端到端验证

### 界面调整

- 列表显示：
  - `artifactVersion`
  - `validationStatus`
  - `validatedAt`
- 主按钮调整为：
  - 生成并保存代码
  - 端到端验证
  - 创建 Release 草稿

### 组件复用原则

当前 `CodeGenerationModal` 与 `RealValidationModal` 可复用，但调用目标需要切换：

- 从临时 DSL 生成 / 校验
- 迁移为保存型主流程接口优先

即：

- 生成代码后不只是本地展示，而是持久化为 artifact
- 验证也不只是临时执行，而是写回 Workflow 状态

## 8.2 Release 页

Release 页需要从“构建中心”转向“环境验证与发布中心”。

### 页面语义调整

当前文案建议替换为：

1. 绑定 Workflow 工件
2. 真实环境验证
3. Deploy
4. 生成 Skill 草案
5. 发布 Skill

### 需要删除或弱化的入口

- 构建
- AI 生成代码
- build stream

### 详情页语义调整

当前 `CapabilityBuildDetailPage` 更适合重命名或降级为：

- 验证记录详情
- 部署准备记录

不再把它呈现为“代码构建详情”。

### Wizard 调整

建议改为：

1. 选择已验证 Workflow
2. 真实环境验证
3. Deploy
4. Skill Draft / Publish

同时，创建 Release 时应优先限制为只能选择：

- `validationStatus = validated`
- `generatedCode` 非空

的 Workflow。

---

## 9. 分阶段实施

## 9.1 Phase 1：职责解耦最小闭环

### 目标

- 不再让 Release 负责 codegen
- Workflow 成为唯一生成代码入口

### 改动

- Workflow 增加 artifact 元信息
- Workflow 增加“生成并保存”“验证并回写状态”“读取 artifact”
- Release build 改为 artifact binding check
- Deploy 从 Workflow artifact 取代码

### 验收

- 在 Workflow 页面生成代码后，数据库可看到持久化 `generatedCode`
- `temporal_workflows` 可看到 artifact 版本、哈希、验证状态
- 不创建 `capability_builds.generated_code` 也能完成 Release deploy
- “Workflow 已重新生成，但 Release 仍报缺构建产物”的问题消失

## 9.2 Phase 2：前端流程收敛

### 目标

- 用户路径与后端职责一致

### 改动

- Workflow 页增加 artifact 状态
- Release 页移除 build 入口
- Release 创建时只能选已验证 Workflow
- 调整按钮、文案、Wizard 顺序

### 验收

- 用户不再需要在 Release 页面点击“生成代码”
- Workflow -> Release 路径清晰且单向
- Portal 页面语义与后端真实职责一致

## 9.3 Phase 3：数据治理

### 目标

- 清理历史语义混乱与遗留耦合

### 改动

- 将 `CapabilityBuild` 重命名或重定义为“验证/准备记录”
- 补齐 artifact 版本与哈希治理
- 清理历史 `published_skill_id`、归档、回滚异常链路
- 视需要引入独立 `workflow_artifacts` 表

### 验收

- 已发布 Release 不再因归档或 build 语义混乱导致运行时 404
- 审计链可清晰区分“工件验证”和“环境部署”
- Rollback 可明确回到某个 artifact 版本

---

## 10. 兼容性与迁移策略

## 10.1 历史 Release 兼容

历史 Release 可能只具备以下信息：

- `source_id = workflowId`
- `sourcePayload.generatedCode`
- `capability_builds.generated_code`

因此迁移期需要支持如下回退顺序：

1. 优先使用 `workflowArtifactRef`
2. 其次使用 `TemporalWorkflow.generatedCode`
3. 最后兼容历史 `capability_builds.generated_code`

但该第三层回退只应作为历史兼容，不应再作为新流程主路径。

## 10.2 Build 记录兼容

在第一阶段中，`build` 可以继续保留表与接口，但其语义需要调整为：

- readiness record
- artifact binding check
- environment preparation record

而不再代表新的代码工件本体。

## 10.3 前端兼容

前端在过渡期内可以保留旧按钮，但应：

- 默认隐藏；
- 或仅对历史 Release 展示；
- 对新建 Release 主流程不再暴露。

---

## 11. 风险与注意事项

## 11.1 风险一：Workflow 更新后 Release 引用漂移

若 Release 只保存 `workflowId` 而不保存 `artifactVersion / artifactHash`，则 Workflow 更新后会导致 Release 实际部署代码漂移。

因此第一阶段即使不建独立 artifact 表，也必须至少保存：

- `workflowId`
- `artifactVersion`
- `artifactHash`

## 11.2 风险二：Deploy 仍写回 Workflow 造成状态污染

若 Deploy 过程中继续覆盖 Workflow 主记录中的 DSL 或代码，则会让“发布态配置”反向污染“创作态工件”。

因此 Deploy 侧需要严格限制：

- 可以应用环境配置
- 可以生成 deployment record
- 不应重新定义 artifact 本体

## 11.3 风险三：Runtime / Smoke Test 仍偷用旧 build 逻辑

若 Runtime、Smoke Test、Rollback 内部仍默认走 `build.generatedCode`，则新旧逻辑会混用，导致问题表面解决、内部仍不稳定。

因此 Phase 1 实施时要同步检查：

- runtime resolver
- deploy smoke service
- rollback path

是否都已转向 artifact 解析逻辑。

---

## 12. 最终结论

本次收敛的核心并不是“再加一个 artifact 概念”，而是明确系统中谁对代码工件负责。

最终结论如下：

1. `workflow` 必须成为唯一的代码工件生产与验证中心；
2. `release` 必须退回到工件引用、环境验证、部署与发布层；
3. `generatedCode` 的唯一真实来源应回到 `TemporalWorkflow`；
4. `capability_builds.generated_code` 不应再作为主真相来源；
5. 第一阶段可不独立建表，但必须先把 artifact 元信息与引用关系补齐；
6. 前后端流程都需要围绕“Workflow 先生成并验证，Release 再验证环境并发布”重新组织。

推荐实施顺序：

```text
Phase 1
-> 补齐 Workflow artifact 字段与接口
-> Release 改为绑定并消费 Workflow artifact
-> Deploy / Runtime / Rollback 改为 artifact 优先

Phase 2
-> 收敛 Portal 流程与文案
-> 移除 Release 侧重复 codegen 入口

Phase 3
-> 治理历史 Build 语义
-> 视需要演进到独立 workflow_artifacts 表
```

这条路径可以用最小改动先消除当前最突出的状态分裂问题，同时为后续正式 artifact 模型留出明确演进空间。
