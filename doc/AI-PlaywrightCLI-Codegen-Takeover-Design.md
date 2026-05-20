# AI + Playwright CLI + Codegen Hybrid Takeover Design

日期：2026-05-20

## 1. 背景

当前浏览器自动化存在两类互补能力：

- `AI + Playwright CLI` 适合做主执行链路，具备多 session、状态保持、结构化结果返回、页面观测、后续模板导出等能力。
- `playwright codegen` 适合在局部失败、复杂页面、人工接管场景下快速补操作、录制真实交互路径。

问题在于，二者目前仍然偏并列存在：

- AI 执行和手动录制未完全共享同一个运行时会话。
- 手动录制产物主要还是原始脚本，没有统一回灌到标准步骤模型。
- AI 失败后缺乏一个标准的“人工接管 -> 补录 -> 回灌 -> 继续执行”闭环。

因此，需要设计一条标准化混合流程：

`AI 执行 -> 局部失败 -> 人工接管 + codegen 补录 -> 增量脚本解析 -> 页面再观测 -> AI/CLI 继续执行`

## 2. 目标

本方案目标如下：

- 在 AI 执行局部失败时，允许用户随时进入人工接管。
- 人工接管期间通过 `playwright codegen` 记录增量操作。
- 将录制脚本解析为统一 `BrowserActionStep[]`，而不是只保留 raw script。
- 让 AI 读取接管后的页面状态和补录步骤，决定如何继续执行。
- 尽量保持同一个 `runtimeSessionId`，维持同一条执行历史。
- 保留 `AI + Playwright CLI` 作为主路径，把 `codegen` 定位为 takeover 子能力。

非目标如下：

- 第一阶段不强求 `codegen` 真正附着到同一个 Playwright page 对象。
- 第一阶段不替换现有所有手动录制逻辑。
- 第一阶段不要求 100% 自动恢复，允许用户确认恢复方案。

## 3. 核心原则

### 3.1 同一运行时标识

- takeover 前后必须绑定同一个 `runtimeSessionId`。
- 所有失败上下文、补录脚本、补录步骤、续跑命令都挂在同一条执行链上。

### 3.2 同一事实来源

- 唯一事实来源是统一步骤模型 `BrowserActionStep[]`。
- raw script 只是中间产物，不作为最终恢复依据。

### 3.3 人工补录是局部修复，不是全局重来

- 局部失败后只补当前失败点附近的操作。
- 尽量只记录增量步骤，不重复整段流程。

### 3.4 先再观测，再续跑

- 人工接管后页面状态一定发生了变化。
- AI 不应盲目接着执行旧计划，而应先读取最新页面状态，再决定续跑策略。

## 4. 目标流程

### 4.1 高层时序

1. `Portal` 发送用户目标到 `ai-orchestrator`
2. `ai-orchestrator` 解析为结构化命令
3. `browser-worker` 使用 `PlaywrightCliAdapter` 执行
4. 某一步执行失败，返回 `takeover_required`
5. 前端提示用户进入人工接管
6. `browser-worker` 冻结当前 session
7. 启动 takeover 录制
8. 用户在当前页面手动点击/填写
9. 停止录制并获得增量 script
10. 将增量 script 解析为 `BrowserActionStep[]`
11. 对当前页面重新执行 observation
12. `ai-orchestrator` 基于失败上下文 + patch steps + 最新 observation 生成恢复策略
13. `browser-worker` resume，并使用 `PlaywrightCliAdapter` 继续执行

### 4.2 续跑策略

系统需要支持以下三种策略：

- `replace_failed_step`
  - 用人工补录步骤替换失败步骤。
- `insert_patch_steps`
  - 将人工补录步骤插入到原计划中，再继续后续步骤。
- `replan_from_current_state`
  - 人工接管后页面已进入新阶段，直接基于当前页面状态重新规划剩余步骤。

## 5. 状态机设计

建议新增统一状态机：

- `ready`
- `executing`
- `failed`
- `takeover_required`
- `frozen`
- `human_recording`
- `reconciling`
- `resuming`
- `completed`
- `error`

推荐状态转换：

- `executing -> failed`
- `failed -> takeover_required`
- `takeover_required -> frozen`
- `frozen -> human_recording`
- `human_recording -> reconciling`
- `reconciling -> resuming`
- `resuming -> executing`
- `executing -> completed`

## 6. 数据结构建议

### 6.1 TakeoverSessionState

```ts
interface TakeoverSessionState {
  takeoverSessionId: string;
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  status: 'idle' | 'recording' | 'stopped' | 'reconciling' | 'resumed' | 'error';
  startedAt: string;
  stoppedAt?: string;
  failedStepId?: string;
  failureReason?: string;
  rawScript?: string;
  patchSteps?: BrowserActionStep[];
}
```

### 6.2 BrowserRuntimeSessionState 扩展

```ts
interface BrowserRuntimeSessionState {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  status: BrowserSessionStatus;
  currentUrl?: string;
  endpoints?: BrowserEndpoints;
  controlMode?: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  reason?: string;
  takeoverStatus?: 'idle' | 'required' | 'recording' | 'reconciling';
  activeTakeoverSessionId?: string;
  lastFailedStepId?: string;
  lastFailureReason?: string;
  updatedAt: string;
}
```

### 6.3 Reconcile 输出

```ts
interface ReconcileAfterTakeoverResponse {
  strategy: 'replace_failed_step' | 'insert_patch_steps' | 'replan_from_current_state';
  explanation: string;
  resumeCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
}
```

## 7. 后端改造清单

### 7.1 browser-worker

#### 新增文件

- `apps/backend/runtime/browser-worker/src/modules/browser/application/takeover-orchestrator.service.ts`
  - 接收失败上下文
  - 调用 freeze/resume
  - 启动和停止人工接管
  - 聚合 raw script、patch steps、observation

- `apps/backend/runtime/browser-worker/src/modules/browser/application/codegen-script-parser.service.ts`
  - 解析 `playwright codegen` 输出脚本
  - 输出统一 `BrowserActionStep[]`

- `apps/backend/runtime/browser-worker/src/modules/browser/domain/takeover.types.ts`
  - 定义 takeover DTO 和状态类型

- `apps/backend/runtime/browser-worker/src/modules/browser/takeover.controller.ts`
  - 提供 takeover 相关 HTTP 接口

#### 改造文件

- `apps/backend/runtime/browser-worker/src/modules/recorder/recorder.service.ts`
  - 从“纯手动录制服务”升级为“可用于 AI 接管恢复”的录制桥接服务
  - 增加 `startTakeoverRecording()` / `stopTakeoverRecording()`
  - 优先按 `runtimeSessionId` 管理录制会话

- `apps/backend/runtime/browser-worker/src/modules/recorder/recorder.gateway.ts`
  - 增加接管相关事件
  - 将 `client.id` 和 `runtimeSessionId` 建立映射

- `apps/backend/runtime/browser-worker/src/modules/browser/infrastructure/browser-session.registry.ts`
  - 扩展 takeover 状态字段

- `apps/backend/runtime/browser-worker/src/modules/browser/browser.module.ts`
  - 注册新增 service 和 controller

### 7.2 ai-orchestrator

#### 新增文件

- `apps/backend/core/ai-orchestrator/src/modules/browser-command/execution-reconcile.service.ts`
  - 输入失败步骤、补录步骤、最新 observation
  - 输出恢复策略和续跑命令

#### 改造文件

- `apps/backend/core/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts`
  - 新增 `reconcileAfterTakeover()`
  - 新增 `buildResumePrompt()`
  - 新增 `mergeManualPatchSteps()`
  - 作为人机混合恢复编排入口

- `apps/backend/core/ai-orchestrator/src/modules/browser-command/recorder-debug.controller.ts`
  - 增加 reconcile / resume-plan 接口

- `apps/backend/core/ai-orchestrator/src/modules/browser-command/browser-command.module.ts`
  - 注册 `ExecutionReconcileService`

### 7.3 portal

#### 改造文件

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
  - 增加 takeover UI 状态
  - 在失败时展示“人工接管”“重试”“终止”按钮
  - 接管结束后展示 patch steps 和恢复策略

- `apps/frontend/portal/src/services/recorder.service.ts`
  - 增加 `startTakeover()` / `stopTakeover()` / `resumeAfterTakeover()`

- `apps/frontend/portal/src/features/recorder/pages/RecorderPage.tsx`
  - 增加 takeover 状态展示和 noVNC 提示

## 8. 接口设计

### 8.1 POST /browser/takeover/start

```ts
interface StartTakeoverRequest {
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: {
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  };
  reason?: string;
}

interface StartTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'frozen' | 'human_recording';
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
}
```

### 8.2 POST /browser/takeover/stop

```ts
interface StopTakeoverRequest {
  runtimeSessionId: string;
  takeoverSessionId: string;
}

interface StopTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  rawScript?: string;
  patchSteps: BrowserActionStep[];
  observation: {
    currentPageUrl?: string;
    title?: string;
    text?: string;
    snapshotPath?: string;
  };
}
```

### 8.3 POST /ai/recorder-debug/reconcile

```ts
interface ReconcileAfterTakeoverRequest {
  sessionId: string;
  runtimeSessionId: string;
  failedCommand?: {
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  };
  originalCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
  patchSteps: BrowserActionStep[];
  observation: {
    currentPageUrl?: string;
    title?: string;
    text?: string;
  };
}
```

### 8.4 POST /browser/takeover/resume

```ts
interface ResumeAfterTakeoverRequest {
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  resumeCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
}

interface ResumeAfterTakeoverResponse {
  success: boolean;
  results: Array<Record<string, unknown>>;
  steps?: BrowserActionStep[];
  message?: string;
}
```

## 9. codegen 脚本解析策略

第一版 parser 建议只覆盖高频语句：

- `await page.goto("...")`
- `await page.click("...")`
- `await page.fill("...", "...")`
- `await page.locator("...").click()`
- `await page.locator("...").fill("...")`
- `await page.getByRole("button", { name: "..." }).click()`
- `await page.getByText("...").click()`
- `await page.keyboard.press("Enter")`

输出时统一映射为：

- `action`
- `locator`
- `params`
- `scriptFragment`
- `source: 'manual'`
- `replayable: true`

后续再增强：

- iframe
- tab 切换
- 更复杂的 locator 组合
- `hover` / `drag` / `check` / `selectOption`

## 10. 恢复决策逻辑

### 10.1 replace_failed_step

适合：

- patch steps 很短
- 与失败动作高度相关
- 人工显然已经完成原目标

例子：

- AI 点击“登录”失败
- 人工点击“平台登录”
- patch steps 替换原 click

### 10.2 insert_patch_steps

适合：

- 人工补的是前置步骤
- 原计划后续仍有效

例子：

- 先关闭弹窗
- 再展开菜单
- 然后继续原 click/fill

### 10.3 replan_from_current_state

适合：

- 人工操作后页面已经进入新阶段
- 原计划后半段已经不可靠

例子：

- 人工完成登录
- 页面跳转后台首页
- AI 应重新读取当前页面并规划后续操作

## 11. MVP 分期

### P0：最小闭环

- 定义 takeover 状态机和 DTO
- 新增 `takeover/start`、`takeover/stop`
- 新增 codegen 脚本解析服务
- 停录后生成 `patchSteps`
- 做一次页面 re-observe
- 允许用户手动触发 AI 续跑

### P1：自动 reconcile

- 新增 `ExecutionReconcileService`
- 自动判断三种恢复策略
- 自动生成 `resumeCommands`
- 前端展示 patch steps 和恢复说明

### P2：无缝接管体验

- 优化为真正同 session 的 takeover 体验
- 完善 noVNC、manual recording、CLI session 的状态同步
- 增加恢复历史、操作审计、patch 可视化

## 12. 测试建议

### 单元测试

- `codegen-script-parser.service.spec.ts`
  - 验证常见 codegen 语句到 `BrowserActionStep[]` 的映射

- `takeover-orchestrator.service.spec.ts`
  - 验证 start/stop/reconcile/resume 流程

- `execution-reconcile.service.spec.ts`
  - 验证三种恢复策略判断

### 集成测试

- `AI fail -> takeover -> patch -> resume`
- `click fail -> manual click -> continue`
- `login fail -> manual login -> replan`

### 回归重点

- 不影响现有手动录制
- 不影响纯 AI CLI 执行
- `freeze/resume` 在 takeover 期间状态正确

## 13. 风险与约束

- `codegen` 是否能无缝附着到当前 session，是最大的技术难点。
- 增量脚本切分需要明确“接管开始点”，否则容易把整段历史一起带回。
- parser 初期能力有限，第一阶段应优先支持高频语句，不要追求全覆盖。
- 恢复策略不建议一开始全部自动执行，必要时应允许用户确认。

## 14. 推荐结论

推荐最终定位如下：

- AI：主驾驶，负责理解目标和恢复决策
- Playwright CLI：主运行时，负责浏览器状态保持和结构化执行
- codegen：人工接管与增量补录工具
- `BrowserActionStep[]`：唯一事实来源

这条路线的价值，不在于把 `codegen` 重新变成主干，而在于把它纳入 `AI + Playwright CLI` 的恢复闭环中，成为浏览器自动化失败后的标准修复机制。
