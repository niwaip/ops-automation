# 企业级技能平台 编排层重建 Batch R7 详细方案

**Enterprise-Skill-Platform Orchestration Batch R7 Recorder Debug Facade Slimming Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R7` 的目标是在 `Batch R6` 已抽离 `recorder-debug-session.facade.ts` 的基础上，继续把 [recorder-debug.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts) 收敛成真正的薄 Facade。

本批次的核心不是继续创建更多目录，而是明确：

1. 哪些职责仍应保留在 `RecorderDebugService`
2. 哪些职责应继续委托给已有子服务
3. 哪些内部 helper 应该从“Facade 内部实现”下沉到稳定协作者中

目标是让 `RecorderDebugService` 从“总入口 + 大量细节实现”的状态，演进为“总入口 + 少量协调逻辑”的状态。

---

## 2. 当前现状

### 2.1 当前对外接口

`RecorderDebugService` 当前仍直接暴露并承载以下 public 能力：

1. `chat(...)`
2. `exportArtifacts(...)`
3. `resetSession(...)`
4. `upsertLoopDraft(...)`
5. `clearLoopDraft(...)`
6. `getSession(...)`
7. `reconcileAfterTakeover(...)`
8. `buildResumePrompt(...)`
9. `mergeManualPatchSteps(...)`
10. `buildCandidatesAndTrace(...)`

### 2.2 当前内部复杂度来源

从当前方法分布看，复杂度主要集中在以下几类 helper：

1. chat 入口分支控制
2. navigate-then-action 特殊处理
3. conditional branch 特殊处理
4. page description / observation summary 拼装
5. export artifact 组装入口
6. browser command parse context 构造
7. browser execute response 合并
8. 手工 patch step 合并

虽然其中部分能力已经委托给：

1. `RecorderDebugChatFlowService`
2. `RecorderDebugExecutionService`
3. `RecorderDebugChatExecutionService`
4. `RecorderDebugResponseService`
5. `RecorderExportAssemblyService`

但 `RecorderDebugService` 仍保留了较多流程拼装和条件分支细节。

### 2.3 当前最适合继续下沉的职责

基于当前代码结构，`R7` 最适合继续治理的不是 session 生命周期，而是以下三类：

1. chat 入口中的“业务分支路由细节”
2. observation / page 描述的格式化辅助逻辑
3. execute / navigate / conditional branch 的组合编排细节

---

## 3. 本批次范围

### 3.1 纳入范围

1. 继续瘦身 `RecorderDebugService`
2. 让 `chat(...)` 更接近“分发器”
3. 将可稳定下沉的流程 helper 委托给已有或新增的小型协作者
4. 保持 `RecorderDebugService` 仍是 controller 的唯一入口

### 3.2 不纳入范围

1. 重写 `RecorderDebugChatFlowService`
2. 重写 `RecorderDebugExecutionService`
3. 大规模重写 `RecorderDebugResponseService`
4. 再做一轮目录迁移
5. 把 controller 改成直接调用多个 service

说明：

`R7` 的目标是“让 Facade 更薄”，而不是“把所有逻辑都切碎”。

---

## 4. 目标状态

目标状态下，`RecorderDebugService` 应只保留以下职责：

1. 对外统一入口
2. 参数基础校验
3. 顶层业务分支路由
4. 统一的成功/失败闭环协调

不再保留的大块细节实现包括：

1. session / observation 生命周期逻辑
2. navigate-then-action 的具体组合细节
3. conditional branch 的复杂分支处理细节
4. page description / summary 的具体构造细节
5. export artifact 的具体组装逻辑

目标行数：

1. 第一阶段目标：降到 `500-700` 行
2. 最终目标：接近 `300-500` 行

说明：

`R7` 可以先达成“明显变薄”，不强求一次性压到最终理想值。

---

## 5. 建议职责下沉方向

### 5.1 保留在 `RecorderDebugService` 的职责

建议继续保留：

1. `chat(...)`
2. `exportArtifacts(...)`
3. `resetSession(...)`
4. `upsertLoopDraft(...)`
5. `clearLoopDraft(...)`
6. `getSession(...)`
7. `reconcileAfterTakeover(...)`
8. `buildResumePrompt(...)`

原因：

这些是最直接的对外 Facade 能力，适合继续统一暴露。

### 5.2 优先下沉的内部 helper

建议优先处理：

1. `tryHandleNavigateThenActionChat(...)`
2. `handleConditionalBranchChat(...)`
3. `describePage(...)`
4. `buildObservationSummary(...)`
5. `buildRecorderObservationSummary(...)`
6. `buildBrowserCommandParseContext(...)`
7. `mergeBrowserExecuteResponses(...)`
8. `buildExportArtifacts(...)`

### 5.3 推荐协作者落点

这些 helper 不一定都要各自新建 service，建议优先复用或温和扩展现有协作者：

1. navigate / conditional branch 相关
   - 优先扩展 `RecorderDebugChatExecutionService`
   - 或新增 `RecorderDebugBranchFacade`，但仅当复杂度确实独立成型
2. observation / description 相关
   - 优先扩展 `RecorderObservationService`
   - 或新增 `RecorderDebugObservationFacade`
3. export artifact 相关
   - 继续收敛到 `RecorderExportAssemblyService`
4. parse context / execute response 合并
   - 优先作为 execution/chat flow 的辅助方法下沉到已有 service

原则：

优先扩展已有协作者，避免同时新建过多 service。

---

## 6. 建议实施步骤

### Step 1：让 `chat(...)` 只保留主分支骨架

目标形态应接近：

```ts
if (controlTokenOnly) return ...
if (conditionalBranch) return ...
if (stagedNavigate) return ...
switch (flow.kind) { ... }
```

但每个分支内部的细节尽量交给协作者处理。

### Step 2：迁移 observation 描述相关 helper

建议优先迁移：

1. `describePage(...)`
2. `buildObservationSummary(...)`
3. `buildRecorderObservationSummary(...)`
4. `inferRecorderPageType(...)`

原因：

1. 这部分偏格式化和信息提炼
2. 相对容易独立
3. 对 chat 分支判断影响较小

### Step 3：迁移 navigate-then-action 组合逻辑

建议迁移：

1. `tryHandleNavigateThenActionChat(...)`
2. `splitNavigateThenActionMessage(...)`
3. `buildBrowserCommandParseContext(...)`
4. `mergeBrowserExecuteResponses(...)`

这块是当前 `chat(...)` 内最重的流程性逻辑之一，迁出去后收益明显。

### Step 4：迁移 conditional branch 处理逻辑

建议迁移：

1. `handleConditionalBranchChat(...)`

注意：

这部分与 `RecorderConditionalBranchService`、execution、response 都有交集，不建议与 Step 3 并行大改。

### Step 5：收尾 export 和 patch helper

最后处理：

1. `buildExportArtifacts(...)`
2. `mergeManualPatchSteps(...)`

其中：

1. export 应优先完全收敛到 `RecorderExportAssemblyService`
2. patch merge 如仅与 takeover 场景有关，可考虑后续独立提取为更聚焦的 helper

---

## 7. 验收标准

### 7.1 结构验收

1. `RecorderDebugService` 明显变薄
2. `chat(...)` 仍保持清晰的顶层分支路由
3. 大块 helper 已下沉到稳定协作者

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少验证以下范围：

1. `recorder-debug.core.spec.ts`
2. `recorder-debug-execution.service.spec.ts`
3. `recorder-debug.loop-export.spec.ts`
4. 与 observation / export / branch handling 相关的关键测试

### 7.4 运行时验收

至少完成以下真实链路验证：

1. 普通 chat -> 执行
2. navigate-then-action chat
3. conditional branch chat
4. exportArtifacts
5. take over 后 reconcile / resume prompt

---

## 8. 风险点

### 8.1 最大风险

1. 为了瘦身而机械拆方法，导致逻辑跳转过碎
2. navigate / branch / export 三类复杂路径同时改动，回归定位困难
3. 新增协作者过多，形成“小服务过量”问题

### 8.2 控制策略

1. 按功能块分批迁移，不要一次性全搬
2. 先迁 observation/helper，再迁 navigate，再迁 conditional branch
3. 优先复用已有 service，而不是默认新增 service
4. 每迁移一个功能块就跑一次针对性测试

---

## 9. 回滚策略

若本批次引入回归，按以下顺序回滚：

1. 恢复 `RecorderDebugService` 对应功能块的直接实现
2. 保留新协作者空壳或部分通用 helper
3. 暂停继续推进 `R8+`，先收口 `RecorderDebugService`

推荐提交粒度：

1. observation helper 下沉一个 commit
2. navigate-then-action 下沉一个 commit
3. conditional branch 下沉一个 commit
4. export / patch 收尾一个 commit

---

## 10. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. observation / description 相关 helper 下沉
2. `RecorderDebugService` 中对应委托替换
3. 少量必要测试调整

首轮 PR 不建议同时包含：

1. conditional branch 处理下沉
2. navigate-then-action 大改
3. export + patch merge 一起迁移

原因：

先从低风险、高可读收益的 helper 开始，更容易把 `RecorderDebugService` 稳定收薄。

---

## 11. 结论

`Batch R7` 的核心不是“继续建更多 service”，而是把 `RecorderDebugService` 真正收敛成一个薄 Facade：

1. 它继续作为统一入口
2. 它继续掌控顶层业务流程
3. 但它不再亲自承担大量 observation、navigate、branch、export 细节

如果 `R6` 解决的是“session 上下文聚合”问题，那么 `R7` 解决的就是“Facade 仍然过厚”的问题。两者配合后，`browser/execute` 的后续演进才会真正稳定下来。
