# AI + Playwright CLI + Codegen Hybrid Takeover Implementation Plan

日期：2026-05-20

## 1. 文档目的

本文是 `AI-PlaywrightCLI-Codegen-Takeover-Design.md` 的实施版补充，目标不是重复设计背景，而是将方案拆解为：

- 可执行的分期任务
- 文件级职责落点
- 关键接口调用顺序
- 核心 service 的伪代码骨架
- MVP 落地范围与验收标准

适用范围：

- `apps/backend/runtime/browser-worker`
- `apps/backend/core/ai-orchestrator`
- `apps/frontend/portal`

## 1.1 当前实现快照（2026-05-20）

基于当前代码仓库，本文中的 P0 与 P1 已不再是纯计划项，而是已经有较完整实现：

- `browser-worker`
  - takeover DTO、controller、orchestrator、parser 已存在
  - `recorder.service.ts` 已具备 takeover bridge 能力
  - `browser-session.registry.ts` 已纳入 takeover 状态

- `ai-orchestrator`
  - `execution-reconcile.service.ts` 已存在
  - `recorder-debug.service.ts` / `recorder-debug.controller.ts` 已接入 reconcile

- `portal`
  - takeover 开始、结束、恢复执行的 UI 与 API 调用已存在
  - takeover 状态展示已接入页面

因此本文后续阅读方式建议调整为：

- P0：从“待开发”调整为“已基本完成，待联调回归”
- P1：从“规划中”调整为“主链路已落地，待增强覆盖率和体验”
- P2：仍为后续演进方向

## 2. 实施原则

### 2.1 先闭环，后无缝

第一阶段优先实现：

- AI 失败
- 人工接管
- codegen 补录
- 解析 patch steps
- 再观测
- AI 续跑

而不是第一天就追求：

- codegen 真正附着到完全相同的 page 对象
- 自动恢复 100% 无需用户确认

### 2.2 先保留 legacy 手动录制，再扩 takeover 能力

现有手动录制链路仍可继续使用，不在第一阶段替换掉：

- `RecorderGateway`
- `RecorderService`
- `codegen-api.py`

但要给它补一层“可被 runtime 调用”的桥接能力。

### 2.3 统一数据出口

最终输出必须统一为：

- `patchSteps: BrowserActionStep[]`
- `observation`
- `resumeCommands`

不要让 raw script 直接成为恢复流程的唯一输入。

## 3. 推荐分期

## 3.1 P0：MVP 闭环

目标：

- 允许 AI 执行失败后进入人工接管
- 停止接管后返回增量 script
- 将 script 解析为 `patchSteps`
- 再执行 observation
- 用户可手动触发“继续执行”

范围：

- 新增 takeover controller/service
- 新增 codegen script parser
- 扩展前端失败态与 takeover 按钮
- 先不做自动 reconcile

验收标准：

- 任一 click/fill 类失败后可以进入人工接管
- 接管结束能拿到 patch steps
- 页面可重新观测
- 用户可点击“继续执行”，由 AI 基于当前状态重新规划

当前状态：

- 已基本达成
- 当前剩余工作主要是补真实联调、补更多 parser 规则、补异常场景回归

## 3.2 P1：自动 reconcile

目标：

- 系统自动判断是替换失败步骤、插入补充步骤，还是重新规划
- 前端展示恢复策略说明

范围：

- 新增 `ExecutionReconcileService`
- 扩展 `RecorderDebugService`
- 新增 reconcile API

验收标准：

- 常见登录失败、弹窗遮挡、错误点击三类场景可自动给出恢复方案
- 失败上下文和 patch steps 被统一纳入恢复 prompt

当前状态：

- 主能力已落地
- 已存在 `ExecutionReconcileService`
- 已存在 `reconcile` API
- 当前仍需继续推进 resume command 覆盖率、前端 patch 可视化细节和更多用例验证

## 3.3 P2：无缝 takeover

目标：

- 提升 takeover 体验，尽量共享当前 session 上下文
- 减少用户感知的模式切换

范围：

- 优化 recorder 与 runtime session 的映射
- 优化 noVNC / 页面预览状态同步
- 完善 takeover 审计与历史回放

验收标准：

- 用户明显感知是在“当前执行流”上接管，而不是重开一次独立录制
- takeover 历史可以在 UI 中查看

当前状态：

- 尚未系统推进
- 仍是接下来的主要体验优化方向

## 4. 文件级任务拆解

## 4.1 browser-worker

### 新增：`takeover-orchestrator.service.ts`

路径：

`apps/backend/runtime/browser-worker/src/modules/browser/application/takeover-orchestrator.service.ts`

职责：

- 管理 AI 失败后的 takeover 生命周期
- 聚合以下操作：
  - freeze session
  - start recording
  - stop recording
  - parse patch script
  - inspect current page
  - resume execution

建议公开方法：

```ts
class TakeoverOrchestratorService {
  async startTakeover(input: StartTakeoverRequest): Promise<StartTakeoverResponse>
  async stopTakeover(input: StopTakeoverRequest): Promise<StopTakeoverResponse>
  async resumeTakeover(input: ResumeAfterTakeoverRequest): Promise<ResumeAfterTakeoverResponse>
  getTakeoverState(runtimeSessionId: string): TakeoverSessionState | undefined
}
```

### 新增：`codegen-script-parser.service.ts`

路径：

`apps/backend/runtime/browser-worker/src/modules/browser/application/codegen-script-parser.service.ts`

职责：

- 把 `playwright codegen` 输出解析成 `BrowserActionStep[]`
- 对 locator、params、scriptFragment 做归一化

建议公开方法：

```ts
class CodegenScriptParserService {
  parse(script: string, options?: {
    backend?: string
    runtimeSessionId?: string
    source?: 'manual'
  }): BrowserActionStep[]
}
```

### 新增：`takeover.controller.ts`

路径：

`apps/backend/runtime/browser-worker/src/modules/browser/takeover.controller.ts`

职责：

- 暴露 HTTP API：
  - `POST /browser/takeover/start`
  - `POST /browser/takeover/stop`
  - `POST /browser/takeover/resume`
  - `GET /browser/takeover/:runtimeSessionId`

### 新增：`takeover.types.ts`

路径：

`apps/backend/runtime/browser-worker/src/modules/browser/domain/takeover.types.ts`

职责：

- 统一 DTO 和 domain type

建议定义：

- `StartTakeoverRequest`
- `StartTakeoverResponse`
- `StopTakeoverRequest`
- `StopTakeoverResponse`
- `ResumeAfterTakeoverRequest`
- `ResumeAfterTakeoverResponse`
- `TakeoverSessionState`

### 改造：`recorder.service.ts`

当前问题：

- 更偏纯手动录制
- session 主键偏 `client.id`
- 返回值更偏原始录制脚本

改造目标：

- 支持 takeover 场景下由 runtimeSessionId 启动录制
- 增加增量录制语义

建议新增方法：

```ts
class RecorderService {
  async startTakeoverRecording(runtimeSessionId: string, options?: {
    startUrl?: string
    reuseExistingPage?: boolean
  }): Promise<{ sessionId: string }>

  async stopTakeoverRecording(runtimeSessionId: string): Promise<{
    rawScript: string
    recordedAt: string
  }>
}
```

### 改造：`recorder.gateway.ts`

目标：

- 原有手动录制保持可用
- 为 takeover 模式提供事件路由能力

建议新增事件：

- `TAKEOVER_START`
- `TAKEOVER_STOP`
- `TAKEOVER_STATUS`

### 改造：`browser-session.registry.ts`

目标：

- 存 takeover 相关状态，避免 takeover 状态散落在多个 service 中

建议增加字段：

```ts
type TakeoverStatus = 'idle' | 'required' | 'recording' | 'reconciling'
```

### 改造：`browser.module.ts`

目标：

- 注册：
  - `TakeoverOrchestratorService`
  - `CodegenScriptParserService`
  - `TakeoverController`

## 4.2 ai-orchestrator

### 新增：`execution-reconcile.service.ts`

路径：

`apps/backend/core/ai-orchestrator/src/modules/browser-command/execution-reconcile.service.ts`

职责：

- 输入：
  - 原始 commands
  - failed command
  - patch steps
  - latest observation
- 输出：
  - `strategy`
  - `resumeCommands`
  - `explanation`

建议方法：

```ts
class ExecutionReconcileService {
  async reconcile(input: ReconcileAfterTakeoverRequest): Promise<ReconcileAfterTakeoverResponse>
}
```

### 改造：`recorder-debug.service.ts`

目标：

- 从“调试对话服务”扩展为“恢复编排服务”

建议新增方法：

```ts
class RecorderDebugService {
  async reconcileAfterTakeover(...)
  async buildResumePrompt(...)
  mergeManualPatchSteps(...)
  decideResumeStrategy(...)
}
```

### 改造：`recorder-debug.controller.ts`

建议新增接口：

- `POST /ai/recorder-debug/reconcile`
- `POST /ai/recorder-debug/resume-plan`

### 改造：`browser-command.module.ts`

目标：

- 注册 `ExecutionReconcileService`

## 4.3 portal

### 改造：`AIControls.tsx`

目标：

- 将“失败态”升级为“可恢复态”

建议新增 UI 状态：

- `takeoverRequired`
- `humanRecording`
- `reconciling`
- `resuming`

建议新增按钮：

- `人工接管`
- `重试当前步骤`
- `终止当前任务`
- `继续执行`

### 改造：`recorder.service.ts`

建议新增方法：

```ts
class RecorderService {
  async startTakeover(runtimeSessionId: string)
  async stopTakeover(runtimeSessionId: string)
  async resumeAfterTakeover(runtimeSessionId: string, commands: MCPCommand[])
}
```

### 改造：`RecorderPage.tsx`

目标：

- 页面级展示 takeover 过程中的模式切换与预览状态

建议展示：

- AI 执行中
- 人工接管中
- AI 恢复中

## 5. 接口调用顺序

## 5.1 失败后进入接管

```text
Portal
  -> browser-worker /browser/execute
browser-worker
  -> PlaywrightCliAdapter.executeCommands()
PlaywrightCliAdapter
  -> 返回失败
browser-worker
  -> 标记 session 为 takeover_required
Portal
  -> 用户点击“人工接管”
Portal
  -> browser-worker /browser/takeover/start
browser-worker
  -> freeze(runtimeSessionId)
  -> recorderService.startTakeoverRecording(runtimeSessionId)
  -> 返回 takeoverSessionId
```

## 5.2 结束接管并生成 patch

```text
Portal
  -> browser-worker /browser/takeover/stop
browser-worker
  -> recorderService.stopTakeoverRecording(runtimeSessionId)
  -> rawScript
  -> codegenScriptParser.parse(rawScript)
  -> inspectState + snapshot + read_page
  -> 返回 patchSteps + observation
```

## 5.3 reconcile 并恢复

```text
Portal
  -> ai-orchestrator /ai/recorder-debug/reconcile
ai-orchestrator
  -> executionReconcileService.reconcile(...)
  -> 返回 strategy + resumeCommands
Portal
  -> browser-worker /browser/takeover/resume
browser-worker
  -> resume(runtimeSessionId)
  -> browser.execute(resumeCommands)
  -> 返回结果
```

## 6. 关键伪代码骨架

## 6.1 TakeoverOrchestratorService

```ts
export class TakeoverOrchestratorService {
  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly recorderService: RecorderService,
    private readonly parser: CodegenScriptParserService,
    private readonly browserCommandService: BrowserCommandService,
  ) {}

  async startTakeover(input: StartTakeoverRequest): Promise<StartTakeoverResponse> {
    await this.browserSessionService.freeze({
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      reason: input.reason || 'Takeover requested',
    });

    const recording = await this.recorderService.startTakeoverRecording(
      input.runtimeSessionId,
      { reuseExistingPage: true },
    );

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: recording.sessionId,
      status: 'human_recording',
    };
  }

  async stopTakeover(input: StopTakeoverRequest): Promise<StopTakeoverResponse> {
    const stopped = await this.recorderService.stopTakeoverRecording(input.runtimeSessionId);
    const patchSteps = this.parser.parse(stopped.rawScript, {
      backend: 'cli',
      runtimeSessionId: input.runtimeSessionId,
      source: 'manual',
    });

    const state = await this.browserCommandService.inspectState({
      runtimeSessionId: input.runtimeSessionId,
      backend: 'cli',
    });

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: input.takeoverSessionId,
      rawScript: stopped.rawScript,
      patchSteps,
      observation: {
        currentPageUrl: state.pageUrl,
        title: state.pageTitle,
      },
    };
  }

  async resumeTakeover(input: ResumeAfterTakeoverRequest) {
    await this.browserSessionService.resume({
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
    });

    return this.browserCommandService.executeCommands(input.resumeCommands, {
      backend: input.backend,
      runtimeSessionId: input.runtimeSessionId,
      includeSteps: true,
    });
  }
}
```

## 6.2 CodegenScriptParserService

```ts
export class CodegenScriptParserService {
  parse(script: string): BrowserActionStep[] {
    const lines = script.split('\n');
    const steps: BrowserActionStep[] = [];

    for (const line of lines) {
      if (line.includes('page.goto(')) {
        steps.push(this.parseGoto(line));
        continue;
      }
      if (line.includes('.fill(')) {
        steps.push(this.parseFill(line));
        continue;
      }
      if (line.includes('.click(') || line.includes('.click()')) {
        steps.push(this.parseClick(line));
        continue;
      }
      if (line.includes('keyboard.press(')) {
        steps.push(this.parsePress(line));
      }
    }

    return steps;
  }
}
```

## 6.3 ExecutionReconcileService

```ts
export class ExecutionReconcileService {
  async reconcile(input: ReconcileAfterTakeoverRequest): Promise<ReconcileAfterTakeoverResponse> {
    const prompt = this.buildResumePrompt(input);
    const modelResponse = await this.callModel(prompt);
    const parsed = this.parseStrategy(modelResponse);

    return {
      strategy: parsed.strategy,
      explanation: parsed.explanation,
      resumeCommands: parsed.resumeCommands,
    };
  }
}
```

## 7. P0 详细任务单

## 7.1 browser-worker

- 新增 `takeover.types.ts`
- 新增 `takeover.controller.ts`
- 新增 `takeover-orchestrator.service.ts`
- 新增 `codegen-script-parser.service.ts`
- 改造 `recorder.service.ts`
- 改造 `browser.module.ts`
- 扩展 `browser-session.registry.ts`

当前判断：

- 上述主项已基本落地
- 继续工作的重点转为 parser 规则扩展和 recorder/runtime 的更深绑定

## 7.2 ai-orchestrator

- 扩展 `recorder-debug.controller.ts`，增加 `reconcile`
- 新增 `execution-reconcile.service.ts`
- 扩展 `browser-command.module.ts`

当前判断：

- 上述主项已基本落地
- 后续重点是恢复策略质量、提示词稳定性和更多 case 的策略分流

## 7.3 portal

- `AIControls.tsx` 增加失败恢复 UI
- 增加 takeover 的 API 调用
- 页面上显示 patch steps 数量和恢复策略

当前判断：

- 上述主项已基本落地
- 后续重点是 patch steps 明细可视化、恢复历史与更平滑的用户引导

## 8. MVP 验收场景

## 场景 A：登录按钮点击失败后人工补点

步骤：

1. AI 点击登录失败
2. 用户进入 takeover
3. 用户手动点击正确的登录入口
4. 停止录制
5. patch steps 返回
6. AI 基于最新页面状态继续执行

验收：

- patch steps 至少包含一个 `click`
- 恢复后不需要重新打开页面

## 场景 B：弹窗遮挡导致失败

步骤：

1. AI click 失败
2. 用户接管后先关闭弹窗
3. 停止录制
4. AI 继续执行原计划

验收：

- reconcile 结果为 `insert_patch_steps`

## 场景 C：登录完成后进入新页面

步骤：

1. AI 登录失败
2. 用户手动完成登录
3. 页面跳转后台首页
4. AI 再观测并重规划

验收：

- reconcile 结果为 `replan_from_current_state`

## 9. 风险控制

### 9.1 第一阶段不要做的事

- 不要把所有录制逻辑彻底迁移到新服务
- 不要一开始就做复杂 AST 级 JS 解析
- 不要强求 reconcile 全自动且无用户确认

### 9.2 第一阶段必须保证的事

- takeover 不破坏原有 AI CLI 主链路
- 原手动录制模式仍可正常使用
- 失败后用户至少能完成“接管 -> 补录 -> 继续执行”的最小闭环

## 10. 推荐下一步

基于当前进度，建议按以下顺序继续推进：

1. 扩展 `codegen-script-parser.service.ts` 对 `hover`、`check`、`selectOption`、iframe、tab 的支持
2. 增强 `ExecutionReconcileService` 的恢复命令映射与策略质量
3. 补 takeover 端到端联调用例，验证 `AI fail -> takeover -> patch -> resume`
4. 增加 patch 可视化、恢复历史、审计字段
5. 再推进真正同 session 的无缝 takeover 体验

这样更符合当前代码现状，也能把后续投入聚焦在成功率和体验上，而不是重复补已有骨架。
