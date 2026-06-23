# 企业级技能平台 编排层重建 Batch R6 详细方案

**Enterprise-Skill-Platform Orchestration Batch R6 Recorder Debug Session Facade Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R6` 的目标是为 `browser/execute` 建立第一层真正可复用的会话聚合 Facade，把 `RecorderDebugService` 中与“会话 + 观察 + 快照 + 控制状态聚合”相关的职责下沉出去。

本批次的定位是：

1. 不直接把 `RecorderDebugService` 全拆完
2. 先抽出最自然、最稳定、最容易复用的一组职责
3. 为后续 `Batch R7` 的进一步瘦身提供落点

目标新增文件：

```text
apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/
└── recorder-debug-session.facade.ts
```

---

## 2. 当前现状

### 2.1 当前问题

根据当前 [recorder-debug.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts) 的真实状态：

1. 文件超过 `1100` 行
2. 构造函数直接注入 `14` 个依赖
3. 它不仅承担 Facade 角色，还直接承载了大量会话、观察和控制状态编排逻辑

当前构造函数中的核心依赖包括：

1. `RecorderDebugSessionCoordinatorService`
2. `RecorderObservationService`
3. `RecorderDebugObservationRefreshService`
4. `RecorderLoopService`
5. `RecorderConditionalBranchService`
6. `RecorderExportAssemblyService`
7. `RecorderDebugChatFlowService`
8. `RecorderDebugExecutionService`
9. `RecorderDebugResponseService`

这说明：

1. `RecorderDebugService` 仍然是一个“过厚的 Facade”
2. 已存在的子服务虽然已经不少，但“会话聚合层”还不存在

### 2.2 当前最适合先抽离的职责

从当前方法组织来看，最适合先下沉的不是：

1. 对话流决策
2. 浏览器执行落地
3. 响应格式化

而是以下这类围绕 session 的聚合动作：

1. 加载或创建 session
2. 确保浏览器已初始化
3. 安全获取 observation
4. 刷新 execution 后 observation
5. 维护 session 当前页面、lastObservation、history 等上下文状态
6. 应用 loop/control token 前后的会话状态更新

这些职责的共同特点是：

1. 不直接决定业务分支
2. 更接近“上下文聚合”
3. 可以成为多个 `execute/*` service 的共享入口

---

## 3. 本批次范围

### 3.1 纳入范围

1. 新建 `recorder-debug-session.facade.ts`
2. 从 `RecorderDebugService` 下沉会话聚合相关逻辑
3. 保持 `RecorderDebugService` 仍是 controller 的唯一 Facade
4. 让 `RecorderDebugService` 通过新 facade 获取 session / observation / refresh 能力

### 3.2 不纳入范围

1. `RecorderDebugChatFlowService` 进一步拆分
2. `RecorderDebugExecutionService` 进一步拆分
3. `RecorderDebugResponseService` 重写
4. `BrowserExecutionControllerService` 改造
5. `RecorderDebugService` 全量 public 方法重排

说明：

本批次是“第一刀下沉”，不是 `RecorderDebugService` 的最终态。

---

## 4. 目标职责边界

### 4.1 `RecorderDebugService` 保留职责

`RecorderDebugService` 在 `R6` 之后仍保留：

1. 对外 `chat(...)` 总入口
2. 顶层业务分支路由
3. 各子服务调用编排
4. 最终响应返回

### 4.2 `RecorderDebugSessionFacade` 新增职责

建议新 Facade 负责：

1. `loadOrCreateSession(...)`
2. `saveSession(...)`
3. `ensureBrowserReady(...)`
4. `observePageSafely(...)`
5. `refreshObservationAfterExecution(...)`
6. `applyRecorderControlTokensBeforeExecution(...)` 中与 session/observation 更新强相关的部分
7. `applyRecorderControlTokensAfterExecution(...)` 中与 session 状态回写强相关的部分

### 4.3 不应放入 `RecorderDebugSessionFacade` 的职责

以下逻辑仍应留在其他 service：

1. 对话流判定 -> `RecorderDebugChatFlowService`
2. 浏览器命令执行 -> `RecorderDebugChatExecutionService` / `RecorderDebugExecutionService`
3. 导出产物生成 -> `RecorderExportAssemblyService`
4. 返回结构组装 -> `RecorderDebugResponseService`
5. 条件分支分析 -> `RecorderConditionalBranchService`

原则：

`RecorderDebugSessionFacade` 只负责“上下文聚合与维护”，不负责业务语义决策。

---

## 5. 目标依赖设计

`RecorderDebugSessionFacade` 建议依赖：

1. `RecorderDebugSessionCoordinatorService`
2. `RecorderObservationService`
3. `RecorderDebugObservationRefreshService`
4. `RecorderLoopService`，仅在确实需要写入 loop/session 状态时使用
5. `BrowserExecutionControllerService`，如果浏览器 ready/init 行为要统一沉入 facade

不建议直接依赖：

1. `RecorderDebugChatFlowService`
2. `RecorderDebugChatExecutionService`
3. `RecorderDebugResponseService`
4. `RecorderExportAssemblyService`

这样可以避免新的 facade 反过来变成第二个 God Object。

---

## 6. 建议实施步骤

### Step 1：先建立空 facade 骨架

先创建：

```ts
@Injectable()
export class RecorderDebugSessionFacade {}
```

并先完成模块注册，不立刻迁移所有方法。

### Step 2：优先迁移 session 生命周期方法

建议先迁移最稳定的方法：

1. `loadOrCreateSession(...)`
2. `saveSession(...)`

原因：

1. 风险低
2. 易于验证
3. 不涉及复杂业务分支

### Step 3：迁移 observation 获取与刷新

建议接着迁移：

1. `observePageSafely(...)`
2. `refreshObservationAfterExecution(...)`
3. `ensureBrowserReady(...)`

这一步完成后，`RecorderDebugService.chat(...)` 中大量上下文准备逻辑会明显变薄。

### Step 4：迁移 session 状态回写

最后再迁移：

1. `session.lastObservation` 更新
2. `session.currentPageUrl` 更新
3. 控制 token 前后对 session 的回写动作

注意：

如果控制 token 逻辑与业务语义强绑定，应只迁移“状态回写部分”，不要把全部 token 解析逻辑一起搬走。

### Step 5：将 `RecorderDebugService` 改成委托

最终形态示意：

```ts
const session = await this.recorderDebugSessionFacade.loadOrCreateSession(...)
await this.recorderDebugSessionFacade.ensureBrowserReady(session)
const observation = await this.recorderDebugSessionFacade.observePageSafely(session)
```

---

## 7. 验收标准

### 7.1 结构验收

1. 新增 `recorder-debug-session.facade.ts`
2. `RecorderDebugService` 不再直接承载主要 session 生命周期方法
3. `RecorderDebugService` 构造函数依赖数量下降

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少验证以下范围：

1. `recorder-debug.core.spec.ts`
2. `recorder-debug-execution.service.spec.ts`
3. `recorder-debug` 相关测试辅助代码未因依赖变动失效

### 7.4 运行时验收

至少验证以下链路：

1. 录制态 chat 请求
2. 页面 observation 获取
3. execution 后 observation 刷新
4. session history 仍能正常持久化和回放

---

## 8. 风险点

### 8.1 最大风险

1. 把“上下文聚合”和“业务决策”一起搬进新 facade，导致换了个文件继续膨胀
2. session 与 observation 的状态回写顺序变化，引入录制态行为回归
3. facade 新增后依赖过多，形成第二个 God Object

### 8.2 控制策略

1. 只迁移会话聚合职责，不迁移业务决策
2. 每迁移一个方法就跑一次 `recorder-debug` 相关测试
3. 优先迁移低风险方法，再迁移 observation 刷新
4. facade 的 constructor 必须显著少于当前 `RecorderDebugService`

---

## 9. 回滚策略

若本批次引入回归，按以下顺序回滚：

1. 先恢复 `RecorderDebugService` 对 session / observation 方法的直接实现
2. 保留 `recorder-debug-session.facade.ts` 空骨架或整体回滚
3. 暂不推进 `R7`，待重新确认边界后再继续

推荐提交粒度：

1. facade 骨架与模块注册一个 commit
2. session 生命周期方法迁移一个 commit
3. observation 获取与刷新迁移一个 commit

---

## 10. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 新建 `recorder-debug-session.facade.ts`
2. 迁移 `loadOrCreateSession(...)`
3. 迁移 `saveSession(...)`
4. 迁移 `observePageSafely(...)`
5. 更新 `RecorderDebugService` 委托调用
6. 更新必要测试

首轮 PR 不建议同时包含：

1. `RecorderDebugService` 全量 public 方法重写
2. `RecorderDebugChatFlowService` 再拆分
3. `export` / `loop` 的业务逻辑继续下沉

---

## 11. 结论

`Batch R6` 的核心价值，是先把 `RecorderDebugService` 从“会话上下文装配器 + 业务 Facade”的混合体，拆成更清晰的两层：

1. `RecorderDebugService` 负责总入口和业务路由
2. `RecorderDebugSessionFacade` 负责 session / observation 上下文聚合

只要这第一层拆分成立，后续 `R7` 再继续瘦身 `RecorderDebugService` 时，改动风险会明显更低，职责边界也会更稳定。
