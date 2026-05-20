# AI + Playwright CLI + Codegen Hybrid Takeover DTO and Pseudocode

日期：2026-05-20

## 1. 文档目的

本文用于补充 takeover 方案的开发细节，重点提供：

- DTO 建议定义
- 状态字段建议
- 接口 JSON 示例
- 关键 service / controller 的伪代码
- patch steps 与 resume commands 的数据流规范

本文默认建立在以下两份文档之上：

- `doc/AI-PlaywrightCLI-Codegen-Takeover-Design.md`
- `doc/AI-PlaywrightCLI-Codegen-Takeover-Implementation-Plan.md`

## 2. 命名约定

建议统一以下命名：

- 浏览器执行会话：`runtimeSessionId`
- 人工接管会话：`takeoverSessionId`
- AI 对话/编排会话：`sessionId`
- 失败步骤：`failedStepId`
- 失败命令：`failedCommand`
- 接管补录步骤：`patchSteps`
- 恢复策略：`strategy`
- 恢复命令：`resumeCommands`

建议避免混用：

- `session`, `runtimeId`, `recordingId`, `manualId`

如果没有强烈历史兼容需求，后续新增接口全部采用上述命名。

## 3. Domain Types

## 3.1 TakeoverStatus

```ts
export type TakeoverStatus =
  | 'idle'
  | 'required'
  | 'frozen'
  | 'recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming'
  | 'completed'
  | 'error';
```

## 3.2 ResumeStrategy

```ts
export type ResumeStrategy =
  | 'replace_failed_step'
  | 'insert_patch_steps'
  | 'replan_from_current_state';
```

## 3.3 ManualPatchSource

```ts
export type ManualPatchSource = 'manual' | 'manual_takeover';
```

## 3.4 FailedCommand

```ts
export interface FailedCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  errorMessage?: string;
  errorCode?: string;
}
```

## 3.5 ObservationSnapshot

```ts
export interface ObservationSnapshot {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  timestamp: string;
}
```

## 3.6 PatchScriptMeta

```ts
export interface PatchScriptMeta {
  rawScript: string;
  lineCount: number;
  parserVersion: string;
  recordedAt: string;
}
```

## 4. Request / Response DTO

## 4.1 StartTakeoverRequest

```ts
export interface StartTakeoverRequest {
  runtimeSessionId: string;
  sessionId?: string;
  backend: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: FailedCommand;
  reason?: string;
  metadata?: {
    requestedBy?: string;
    source?: 'ui' | 'auto' | 'api';
  };
}
```

## 4.2 StartTakeoverResponse

```ts
export interface StartTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'frozen' | 'recording';
  controlMode: 'HUMAN_CONTROL';
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
  startedAt: string;
}
```

### JSON 示例

```json
{
  "runtimeSessionId": "rt_123",
  "sessionId": "chat_123",
  "backend": "cli",
  "failedStepId": "step_09",
  "failedCommand": {
    "tool": "click",
    "params": {
      "selector": "text=登录"
    },
    "description": "点击登录按钮",
    "errorMessage": "strict mode violation"
  },
  "reason": "AI step failed and needs manual takeover"
}
```

```json
{
  "success": true,
  "runtimeSessionId": "rt_123",
  "takeoverSessionId": "tk_123",
  "status": "recording",
  "controlMode": "HUMAN_CONTROL",
  "endpoints": {
    "novnc": "http://localhost:6080/vnc.html?path=/websockify",
    "cdp": "ws://localhost:9222/devtools/browser/xxx"
  },
  "startedAt": "2026-05-20T09:30:00.000Z"
}
```

## 4.3 StopTakeoverRequest

```ts
export interface StopTakeoverRequest {
  runtimeSessionId: string;
  takeoverSessionId: string;
  keepHumanControl?: boolean;
}
```

## 4.4 StopTakeoverResponse

```ts
export interface StopTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'reconciling' | 'ready_to_resume';
  patchScript: PatchScriptMeta;
  patchSteps: BrowserActionStep[];
  observation: ObservationSnapshot;
}
```

### JSON 示例

```json
{
  "runtimeSessionId": "rt_123",
  "takeoverSessionId": "tk_123"
}
```

```json
{
  "success": true,
  "runtimeSessionId": "rt_123",
  "takeoverSessionId": "tk_123",
  "status": "ready_to_resume",
  "patchScript": {
    "rawScript": "await page.getByRole('button', { name: '平台登录' }).click();",
    "lineCount": 1,
    "parserVersion": "v1",
    "recordedAt": "2026-05-20T09:31:10.000Z"
  },
  "patchSteps": [
    {
      "id": "patch_001",
      "action": "click",
      "params": {
        "role": "button",
        "name": "平台登录"
      },
      "source": "manual"
    }
  ],
  "observation": {
    "currentPageUrl": "https://example.com/dashboard",
    "title": "控制台",
    "text": "欢迎回来",
    "timestamp": "2026-05-20T09:31:15.000Z"
  }
}
```

## 4.5 ReconcileAfterTakeoverRequest

```ts
export interface ReconcileAfterTakeoverRequest {
  sessionId: string;
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: FailedCommand;
  originalCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
  patchSteps: BrowserActionStep[];
  observation: ObservationSnapshot;
}
```

## 4.6 ReconcileAfterTakeoverResponse

```ts
export interface ReconcileAfterTakeoverResponse {
  strategy: ResumeStrategy;
  explanation: string;
  confidence?: number;
  resumeCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
}
```

### JSON 示例

```json
{
  "sessionId": "chat_123",
  "runtimeSessionId": "rt_123",
  "backend": "cli",
  "failedStepId": "step_09",
  "failedCommand": {
    "tool": "click",
    "params": {
      "selector": "text=登录"
    },
    "description": "点击登录按钮",
    "errorMessage": "timeout 10000ms exceeded"
  },
  "originalCommands": [
    {
      "tool": "navigate",
      "params": {
        "url": "https://example.com/login"
      },
      "description": "打开登录页"
    },
    {
      "tool": "click",
      "params": {
        "selector": "text=登录"
      },
      "description": "点击登录按钮"
    }
  ],
  "patchSteps": [
    {
      "id": "patch_001",
      "action": "click",
      "params": {
        "role": "button",
        "name": "平台登录"
      },
      "source": "manual"
    }
  ],
  "observation": {
    "currentPageUrl": "https://example.com/dashboard",
    "title": "控制台",
    "text": "欢迎回来",
    "timestamp": "2026-05-20T09:31:15.000Z"
  }
}
```

```json
{
  "strategy": "replan_from_current_state",
  "explanation": "人工接管后已进入控制台首页，原登录步骤无需继续，建议基于当前页面重新规划后续任务。",
  "confidence": 0.91,
  "resumeCommands": [
    {
      "tool": "snapshot",
      "params": {},
      "description": "获取当前页面结构"
    },
    {
      "tool": "search",
      "params": {
        "query": "订单管理"
      },
      "description": "定位订单管理入口"
    }
  ]
}
```

## 4.7 ResumeAfterTakeoverRequest

```ts
export interface ResumeAfterTakeoverRequest {
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  takeoverSessionId?: string;
  strategy?: ResumeStrategy;
  resumeCommands: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
}
```

## 4.8 ResumeAfterTakeoverResponse

```ts
export interface ResumeAfterTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  status: 'resuming' | 'completed' | 'error';
  results: Array<Record<string, unknown>>;
  generatedSteps?: BrowserActionStep[];
}
```

## 5. Session State 建议

## 5.1 BrowserRuntimeSessionState 扩展字段

```ts
export interface BrowserRuntimeSessionState {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  status: BrowserSessionStatus;
  currentUrl?: string;
  endpoints?: BrowserEndpoints;
  controlMode?: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  reason?: string;
  takeoverStatus?: TakeoverStatus;
  activeTakeoverSessionId?: string;
  lastFailedStepId?: string;
  lastFailureReason?: string;
  lastObservationAt?: string;
  updatedAt: string;
}
```

## 5.2 TakeoverSessionState

```ts
export interface TakeoverSessionState {
  takeoverSessionId: string;
  runtimeSessionId: string;
  sessionId?: string;
  backend: 'cli' | 'chrome-devtools';
  status: TakeoverStatus;
  startedAt: string;
  stoppedAt?: string;
  failedStepId?: string;
  failedCommand?: FailedCommand;
  reason?: string;
  patchScript?: PatchScriptMeta;
  patchSteps?: BrowserActionStep[];
  observation?: ObservationSnapshot;
  strategy?: ResumeStrategy;
  resumeCommands?: Array<{
    tool: string;
    params: Record<string, unknown>;
    description?: string;
  }>;
}
```

## 6. BrowserActionStep 最小要求

为了让 manual patch steps 后续可复用、可导出、可审计，建议至少包含以下字段：

```ts
export interface BrowserActionStep {
  id: string;
  action: string;
  params?: Record<string, unknown>;
  locator?: {
    type?: 'selector' | 'role' | 'text' | 'label' | 'placeholder';
    value?: string;
    role?: string;
    name?: string;
  };
  source?: 'ai' | 'manual' | 'manual_takeover';
  backend?: 'cli' | 'chrome-devtools' | 'legacy';
  replayable?: boolean;
  scriptFragment?: string;
  createdAt?: string;
}
```

## 7. Controller Pseudocode

## 7.1 TakeoverController

```ts
@Controller('browser/takeover')
export class TakeoverController {
  constructor(
    private readonly takeoverOrchestrator: TakeoverOrchestratorService,
  ) {}

  @Post('start')
  async start(@Body() body: StartTakeoverRequest) {
    return this.takeoverOrchestrator.startTakeover(body);
  }

  @Post('stop')
  async stop(@Body() body: StopTakeoverRequest) {
    return this.takeoverOrchestrator.stopTakeover(body);
  }

  @Post('resume')
  async resume(@Body() body: ResumeAfterTakeoverRequest) {
    return this.takeoverOrchestrator.resumeTakeover(body);
  }

  @Get(':runtimeSessionId')
  async getState(@Param('runtimeSessionId') runtimeSessionId: string) {
    return this.takeoverOrchestrator.getTakeoverState(runtimeSessionId);
  }
}
```

## 7.2 RecorderDebugController 扩展

```ts
@Post('reconcile')
async reconcile(@Body() body: ReconcileAfterTakeoverRequest) {
  return this.executionReconcileService.reconcile(body);
}
```

## 8. Service Pseudocode

## 8.1 TakeoverOrchestratorService

```ts
export class TakeoverOrchestratorService {
  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly recorderService: RecorderService,
    private readonly parser: CodegenScriptParserService,
    private readonly browserService: BrowserService,
    private readonly registry: BrowserSessionRegistry,
  ) {}

  async startTakeover(input: StartTakeoverRequest): Promise<StartTakeoverResponse> {
    const runtime = this.registry.get(input.runtimeSessionId);
    if (!runtime) {
      throw new NotFoundException('Runtime session not found');
    }

    await this.browserSessionService.freeze({
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      reason: input.reason ?? 'Takeover requested after failure',
    });

    const recording = await this.recorderService.startTakeoverRecording(
      input.runtimeSessionId,
      {
        reuseExistingPage: true,
      },
    );

    this.registry.patch(input.runtimeSessionId, {
      controlMode: 'HUMAN_CONTROL',
      takeoverStatus: 'recording',
      activeTakeoverSessionId: recording.sessionId,
      lastFailedStepId: input.failedStepId,
      lastFailureReason: input.failedCommand?.errorMessage ?? input.reason,
    });

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: recording.sessionId,
      status: 'recording',
      controlMode: 'HUMAN_CONTROL',
      endpoints: runtime.endpoints,
      startedAt: new Date().toISOString(),
    };
  }

  async stopTakeover(input: StopTakeoverRequest): Promise<StopTakeoverResponse> {
    const stopped = await this.recorderService.stopTakeoverRecording(input.runtimeSessionId);
    const patchSteps = this.parser.parse(stopped.rawScript, {
      backend: 'cli',
      source: 'manual',
      runtimeSessionId: input.runtimeSessionId,
    });

    const observation = await this.browserService.captureObservation({
      runtimeSessionId: input.runtimeSessionId,
      backend: 'cli',
    });

    this.registry.patch(input.runtimeSessionId, {
      takeoverStatus: 'ready_to_resume',
    });

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: input.takeoverSessionId,
      status: 'ready_to_resume',
      patchScript: {
        rawScript: stopped.rawScript,
        lineCount: stopped.rawScript.split('\n').length,
        parserVersion: 'v1',
        recordedAt: stopped.recordedAt,
      },
      patchSteps,
      observation,
    };
  }

  async resumeTakeover(input: ResumeAfterTakeoverRequest): Promise<ResumeAfterTakeoverResponse> {
    this.registry.patch(input.runtimeSessionId, {
      controlMode: 'AGENT_RUNNING',
      takeoverStatus: 'resuming',
    });

    await this.browserSessionService.resume({
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
    });

    const result = await this.browserService.execute({
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      commands: input.resumeCommands,
      includeSteps: true,
    });

    this.registry.patch(input.runtimeSessionId, {
      takeoverStatus: result.success ? 'completed' : 'error',
    });

    return {
      success: result.success,
      runtimeSessionId: input.runtimeSessionId,
      status: result.success ? 'completed' : 'error',
      results: result.results,
      generatedSteps: result.steps,
    };
  }
}
```

## 8.2 CodegenScriptParserService

```ts
export class CodegenScriptParserService {
  parse(script: string, context?: {
    backend?: string;
    source?: 'manual' | 'manual_takeover';
    runtimeSessionId?: string;
  }): BrowserActionStep[] {
    const lines = script
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const steps: BrowserActionStep[] = [];

    for (const line of lines) {
      if (line.startsWith('await page.goto(')) {
        steps.push(this.toGotoStep(line, context));
        continue;
      }

      if (line.includes('getByRole(') && line.endsWith('.click();')) {
        steps.push(this.toRoleClickStep(line, context));
        continue;
      }

      if (line.includes('getByText(') && line.endsWith('.click();')) {
        steps.push(this.toTextClickStep(line, context));
        continue;
      }

      if (line.includes('.locator(') && line.endsWith('.fill(')) {
        steps.push(this.toLocatorFillStep(line, context));
        continue;
      }

      if (line.includes('keyboard.press(')) {
        steps.push(this.toKeyboardPressStep(line, context));
        continue;
      }
    }

    return steps;
  }
}
```

注：

- 第一版允许 parser 不完整
- 但要记录无法解析的行数，便于后续补规则

## 8.3 ExecutionReconcileService

```ts
export class ExecutionReconcileService {
  constructor(
    private readonly llmClient: LlmClient,
  ) {}

  async reconcile(
    input: ReconcileAfterTakeoverRequest,
  ): Promise<ReconcileAfterTakeoverResponse> {
    const prompt = this.buildResumePrompt(input);
    const raw = await this.llmClient.generateStructured(prompt);

    return {
      strategy: raw.strategy,
      explanation: raw.explanation,
      confidence: raw.confidence,
      resumeCommands: raw.resumeCommands,
    };
  }

  private buildResumePrompt(input: ReconcileAfterTakeoverRequest) {
    return {
      task: 'Reconcile browser execution after manual takeover',
      failedCommand: input.failedCommand,
      originalCommands: input.originalCommands,
      patchSteps: input.patchSteps,
      observation: input.observation,
      allowedStrategies: [
        'replace_failed_step',
        'insert_patch_steps',
        'replan_from_current_state',
      ],
    };
  }
}
```

## 9. 前端状态流建议

建议前端以一个显式状态字段驱动 takeover UI：

```ts
type RecorderExecutionMode =
  | 'idle'
  | 'executing'
  | 'failed'
  | 'takeover_required'
  | 'human_recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming'
  | 'completed';
```

推荐交互：

- `failed` 时显示错误信息和“人工接管”按钮
- `human_recording` 时展示“正在人工接管”
- `ready_to_resume` 时展示 patch steps 数量和恢复策略
- `resuming` 时禁用重复操作按钮

## 10. API 错误码建议

建议补充 takeover 相关错误码：

```ts
type TakeoverErrorCode =
  | 'TAKEOVER_RUNTIME_NOT_FOUND'
  | 'TAKEOVER_ALREADY_ACTIVE'
  | 'TAKEOVER_NOT_ACTIVE'
  | 'TAKEOVER_SCRIPT_EMPTY'
  | 'TAKEOVER_PARSE_FAILED'
  | 'TAKEOVER_RESUME_FAILED';
```

返回建议：

```json
{
  "success": false,
  "errorCode": "TAKEOVER_PARSE_FAILED",
  "message": "Failed to parse recorded script into patch steps"
}
```

## 11. 日志建议

至少记录以下关键事件：

- `takeover.started`
- `takeover.recording.stopped`
- `takeover.script.parsed`
- `takeover.reconcile.completed`
- `takeover.resume.started`
- `takeover.resume.completed`
- `takeover.resume.failed`

建议日志字段：

- `runtimeSessionId`
- `takeoverSessionId`
- `sessionId`
- `failedStepId`
- `strategy`
- `patchStepCount`
- `success`

## 12. 测试建议

## 12.1 DTO / parser

- `codegen-script-parser.service.spec.ts`
  - `page.goto` -> `navigate`
  - `getByRole(...).click()` -> `click`
  - `getByText(...).click()` -> `click`
  - `keyboard.press()` -> `press`

## 12.2 orchestration

- `takeover-orchestrator.service.spec.ts`
  - `startTakeover` 会 freeze + recording
  - `stopTakeover` 会 parse + observe
  - `resumeTakeover` 会 resume + execute

## 12.3 reconcile

- `execution-reconcile.service.spec.ts`
  - 根据 observation 判断 `replan_from_current_state`
  - 根据 patchSteps 长度判断 `replace_failed_step`
  - 根据前置动作判断 `insert_patch_steps`

## 13. 开发顺序建议

建议严格按以下顺序实现：

1. 定义 `takeover.types.ts`
2. 定义 DTO 与错误码
3. 完成 `TakeoverController`
4. 完成 `TakeoverOrchestratorService`
5. 完成 `CodegenScriptParserService`
6. 扩展 `RecorderService`
7. 增加 `ExecutionReconcileService`
8. 接入 `RecorderDebugController`
9. 前端接 takeover 状态流

## 14. 总结

如果说前两份文档定义的是：

- 为什么做
- 做哪些模块

那么本文定义的是：

- 字段怎么命名
- 接口怎么传
- service 怎么写
- 状态怎么流转

做到这一层，后续已经可以直接进入代码实现与分任务开发。
