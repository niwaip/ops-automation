# 企业级 Skill 平台 Browser Runtime 接口 DTO 草案

**Browser Runtime DTO Draft v4.0**  
日期：2026-05-07

> 本文给出 `browser-worker` 在 `v4` 体系下的接口 DTO 草案。  
> 目标是将当前已经存在的 `/browser/*` 端点、`BrowserExecutionAdapter` 接口、`Runtime Capability Protocol` 和后续 `BrowserActionStep[]` 统一起来，形成“现状可兼容、未来可扩展”的浏览器运行时契约。

---

## 1. 文档目标

本文回答以下问题：

- `browser-worker` 当前接口与 `v4 Runtime Capability Protocol` 应如何对齐
- 哪些 DTO 需要作为浏览器运行时正式冻结
- `BrowserCommand[]` 与 `BrowserActionStep[]` 的关系是什么
- 运行时 `ref`、稳定 locator、参数化、脚本片段应该如何表达
- 当前 `/browser/*` 接口应如何平滑升级到更稳定的契约

---

## 2. 设计原则

### 2.1 兼容当前实现

DTO 草案必须兼容当前已存在的能力：

- `/browser/init`
- `/browser/execute`
- `/browser/reset`
- `/browser/execute-step`
- `/browser/freeze`
- `/browser/resume`

### 2.2 对齐 Runtime 协议

浏览器 DTO 不应游离于 `RuntimeStepInvokeRequest / RuntimeStepInvokeResult` 之外，而应成为 `runtimeType = browser` 下的专用输入输出模型。

### 2.3 支持过渡形态与目标形态并存

当前过渡形态：

- `BrowserCommand[]`
- 简化版 `ExecuteStepDto`

目标形态：

- `BrowserActionStep[]`
- 带参数、locator、修正历史和脚本片段的统一步骤结果

### 2.4 运行时与持久化分离

- 运行时允许存在 `runtimeTargetRef`
- 持久化 DTO 必须允许保存稳定 locator
- 导出脚本不得依赖运行时 `ref`

---

## 3. 当前接口盘点

当前 `browser-worker` 主要接口如下：

- `POST /browser/init`
- `POST /browser/execute`
- `POST /browser/reset`
- `POST /browser/execute-step`
- `POST /browser/freeze`
- `POST /browser/resume`

当前代码中已存在的核心 DTO 和接口包括：

- `BrowserExecutionBackendDto`
- `ExecuteStepDto`
- `ExecuteStepResultDto`
- `FreezeBrowserSessionDto`
- `ResumeBrowserSessionDto`
- `BrowserControlStateDto`
- `BrowserExecutionAdapter`

当前代码中已存在的浏览器适配器：

- `LegacyCodegenAdapter`
- `PlaywrightCliAdapter`
- `ChromeDevtoolsCliAdapter`

因此，本草案不是从零设计，而是对已有结构做统一升级。

---

## 4. 顶层契约定位

推荐将浏览器运行时接口划分为三层：

### 4.1 L1 Controller DTO

面向：

- `browser.controller.ts`
- 前端 Recorder
- 调试页面
- 平台内部调试接口

特点：

- 面向 HTTP
- 尽量简洁
- 可兼容当前调用方式

### 4.2 L2 Browser Runtime DTO

面向：

- `browser.service.ts`
- `BrowserExecutionAdapter`
- 适配器间统一输入输出

特点：

- 表达浏览器语义
- 能区分运行时数据和持久化数据
- 能支持脚本导出和参数化

### 4.3 L3 Runtime Capability DTO

面向：

- `control-plane`
- `Execution`
- 跨 Runtime 协议

特点：

- 平台统一契约
- 不关心浏览器内部细节
- 通过 `input/output` 承载专用对象

---

## 5. 类型总览

建议正式冻结以下类型：

- `BrowserExecutionBackend`
- `BrowserSessionPreferences`
- `BrowserRuntimeSessionRef`
- `BrowserRuntimeLocator`
- `BrowserRuntimeParamBinding`
- `BrowserCommand`
- `BrowserActionStep`
- `BrowserExecuteRequest`
- `BrowserExecuteResult`
- `BrowserArtifactRef`
- `BrowserSnapshotRef`
- `BrowserControlState`
- `BrowserError`

---

## 6. 基础类型

### 6.1 `BrowserExecutionBackend`

```ts
type BrowserExecutionBackend = 'legacy' | 'cli' | 'chrome-devtools' | 'mcp';
```

说明：

- `legacy` 对应现有 `codegen-api.py`
- `cli` 对应 `PlaywrightCliAdapter`
- `chrome-devtools` 保留当前兼容后端
- `mcp` 为预留后端

### 6.2 `BrowserSessionPreferences`

```ts
interface BrowserSessionPreferences {
  mode?: 'interactive' | 'agent';
  enableCodegen?: boolean;
  headless?: boolean;
  keepAlive?: boolean;
  reuseExisting?: boolean;
}
```

说明：

- 对齐当前 `initBrowser` 中的 `sessionPreferences`
- 为后续 session 策略扩展留位

### 6.3 `BrowserRuntimeSessionRef`

```ts
interface BrowserRuntimeSessionRef {
  runtimeSessionId: string;
  browserSessionId?: string;
  backend: BrowserExecutionBackend;
  status: 'ready' | 'recording' | 'executing' | 'paused' | 'frozen' | 'closed' | 'error';
  currentUrl?: string;
  endpoints?: {
    novnc?: string;
    cdp?: string;
    vnc?: string;
  };
}
```

说明：

- 可作为 `/browser/init` 的正式返回对象
- `browserSessionId` 允许适配器映射到底层浏览器资源

---

## 7. locator 与参数 DTO

### 7.1 `BrowserRuntimeLocator`

```ts
interface BrowserRuntimeLocator {
  strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'text' | 'css' | 'ref';
  value: string;
  role?: string;
  name?: string;
  exact?: boolean;
  generatedBy?: 'cli' | 'ai' | 'manual' | 'system';
  confidence?: number;
  unique?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}
```

说明：

- `strategy = ref` 只适合运行时
- `riskLevel` 用于标记 CSS/text 这类易碎 locator

### 7.2 `BrowserRuntimeParamBinding`

```ts
interface BrowserRuntimeParamBinding {
  name: string;
  category?: 'credential' | 'business_input' | 'environment' | 'control' | 'expected';
  source: 'literal' | 'user_input' | 'secret' | 'derived' | 'context';
  required: boolean;
  secret?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  value?: unknown;
  exampleValue?: unknown;
  description?: string;
}
```

说明：

- `value` 可用于运行时直接执行
- `source` 和 `secret` 用于导出参数化脚本与模板

---

## 8. 过渡形态 DTO：`BrowserCommand`

### 8.1 定义

```ts
interface BrowserCommand {
  tool: string;
  description?: string;
  locator?: BrowserRuntimeLocator;
  params?: Record<string, unknown>;
  assertion?: {
    type: string;
    expected?: unknown;
  };
}
```

### 8.2 说明

- 当前 `MCPCommand[]` 实际承担了相似职责
- 建议逐步把 `target`、`text`、`selector` 等散落字段统一收敛到 `locator + params`
- `BrowserCommand[]` 是过渡层，不作为最终可导出事实来源

### 8.3 示例

```json
{
  "tool": "click",
  "description": "点击登录按钮",
  "locator": {
    "strategy": "ref",
    "value": "e53"
  }
}
```

---

## 9. 目标形态 DTO：`BrowserActionStep`

### 9.1 定义

```ts
interface BrowserActionStep {
  id: string;
  source: 'ai' | 'manual' | 'imported';
  backend: BrowserExecutionBackend;
  action: string;
  status: 'pending' | 'success' | 'error';

  intent?: string;
  runtimeTargetRef?: string;

  locator?: BrowserRuntimeLocator;
  params?: Record<string, unknown>;
  paramBindings?: BrowserRuntimeParamBinding[];

  snapshot?: BrowserSnapshotRef | null;
  artifacts?: BrowserArtifactRef[];

  scriptFragment?: string | null;
  assertionFragment?: string | null;

  replayable?: boolean;
  replaceableParams?: string[];

  repairHistory?: Array<{
    reason: string;
    oldLocator?: string;
    newLocator?: string;
    snapshotId?: string;
  }>;

  error?: BrowserError;
  timestamp: number;
}
```

### 9.2 说明

- `runtimeTargetRef` 只用于当前轮执行
- `locator` 是用于持久化与导出的稳定目标
- `scriptFragment` 是脚本导出的最小单元
- `repairHistory` 用于记录自动修正轨迹

---

## 10. 证据 DTO

### 10.1 `BrowserArtifactRef`

```ts
interface BrowserArtifactRef {
  id: string;
  type: 'screenshot' | 'html' | 'text' | 'trace' | 'video' | 'script';
  path?: string;
  mimeType?: string;
  inlineText?: string;
  createdAt: string;
}
```

### 10.2 `BrowserSnapshotRef`

```ts
interface BrowserSnapshotRef {
  id: string;
  type: 'yaml' | 'aria' | 'dom' | 'image';
  path?: string;
  url?: string;
  title?: string;
  createdAt: string;
}
```

### 10.3 `BrowserError`

```ts
interface BrowserError {
  code: string;
  message: string;
  retryable?: boolean;
  takeoverSuggested?: boolean;
  raw?: Record<string, unknown>;
}
```

---

## 11. Controller 层 DTO 草案

### 11.1 `InitBrowserSessionRequestDto`

```ts
interface InitBrowserSessionRequestDto {
  backend?: BrowserExecutionBackend;
  runtimeSessionId?: string;
  initialUrl?: string;
  sessionPreferences?: BrowserSessionPreferences;
}
```

### 11.2 `InitBrowserSessionResponseDto`

```ts
interface InitBrowserSessionResponseDto {
  success: boolean;
  message?: string;
  session: BrowserRuntimeSessionRef;
}
```

### 11.3 `ExecuteBrowserRequestDto`

```ts
interface ExecuteBrowserRequestDto {
  backend?: BrowserExecutionBackend;
  runtimeSessionId: string;
  commands: BrowserCommand[];
  options?: {
    appendDefaultWait?: boolean;
    timeoutMs?: number;
    autoRepair?: boolean;
  };
}
```

### 11.4 `ExecuteBrowserResponseDto`

```ts
interface ExecuteBrowserResponseDto {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'takeover_required';
  currentUrl?: string;
  results: Array<{
    command: string;
    status: 'success' | 'error';
    message?: string;
    data?: Record<string, unknown>;
  }>;
  steps?: BrowserActionStep[];
  error?: BrowserError;
}
```

### 11.5 `ResetBrowserSessionRequestDto`

```ts
interface ResetBrowserSessionRequestDto {
  backend?: BrowserExecutionBackend;
  runtimeSessionId: string;
  clearArtifacts?: boolean;
  deleteSessionData?: boolean;
}
```

### 11.6 `FreezeBrowserSessionRequestDto`

```ts
interface FreezeBrowserSessionRequestDto {
  backend?: BrowserExecutionBackend;
  runtimeSessionId: string;
  reason?: string;
}
```

### 11.7 `ResumeBrowserSessionRequestDto`

```ts
interface ResumeBrowserSessionRequestDto {
  backend?: BrowserExecutionBackend;
  runtimeSessionId: string;
  stepId?: string;
}
```

### 11.8 `BrowserControlStateDto`

```ts
interface BrowserControlStateDto {
  runtimeSessionId: string;
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozen: boolean;
  reason?: string;
}
```

---

## 12. `execute-step` DTO 草案

### 12.1 为什么保留

`/browser/execute-step` 对以下场景仍然有价值：

- `ExecutionStep` 单步执行
- 南向 Runtime 调试
- 平台对标准化 step 的回放与验证

### 12.2 `ExecuteBrowserStepRequestDto`

```ts
interface ExecuteBrowserStepRequestDto {
  executionId: string;
  stepId: string;
  runtimeSessionId: string;
  backend?: BrowserExecutionBackend;

  action: string;
  intent?: string;
  locator?: BrowserRuntimeLocator;
  runtimeTargetRef?: string;
  params?: Record<string, unknown>;
  assertion?: {
    type: string;
    expected?: unknown;
  };
  metadata?: Record<string, unknown>;
}
```

### 12.3 `ExecuteBrowserStepResultDto`

```ts
interface ExecuteBrowserStepResultDto {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'takeover_required';
  step?: BrowserActionStep;
  output?: Record<string, unknown>;
  error?: BrowserError;
  shouldTakeover: boolean;
  takeoverReason?: string;
}
```

---

## 13. Adapter 层 DTO 草案

### 13.1 `InitBrowserSessionInput`

```ts
interface InitBrowserSessionInput {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  initialUrl?: string;
  sessionPreferences?: BrowserSessionPreferences;
}
```

### 13.2 `ExecuteBrowserCommandInput`

```ts
interface ExecuteBrowserCommandInput {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  commands: BrowserCommand[];
  options?: {
    appendDefaultWait?: boolean;
    timeoutMs?: number;
    autoRepair?: boolean;
  };
}
```

### 13.3 `BrowserCommandResult`

```ts
interface BrowserCommandResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'takeover_required';
  currentUrl?: string;
  output?: Record<string, unknown>;
  steps?: BrowserActionStep[];
  artifacts?: BrowserArtifactRef[];
  error?: BrowserError;
}
```

### 13.4 `BrowserExecutionAdapter`

```ts
interface BrowserExecutionAdapter {
  name: BrowserExecutionBackend;
  initSession(input: InitBrowserSessionInput): Promise<BrowserRuntimeSessionRef>;
  execute(input: ExecuteBrowserCommandInput): Promise<BrowserCommandResult>;
  executeStep?(input: ExecuteBrowserStepRequestDto): Promise<ExecuteBrowserStepResultDto>;
  resetSession(runtimeSessionId: string): Promise<void>;
  closeSession(runtimeSessionId: string): Promise<void>;
  freezeSession?(runtimeSessionId: string, reason?: string): Promise<BrowserControlStateDto>;
  resumeSession?(runtimeSessionId: string): Promise<BrowserControlStateDto>;
}
```

---

## 14. 与 `Runtime Capability Protocol` 的映射

### 14.1 请求映射

```ts
interface RuntimeStepInvokeRequest {
  requestId: string;
  executionId: string;
  stepId: string;
  runtimeType: 'browser';
  runtimeSessionId?: string | null;
  capabilityType: 'browser.step';
  action: string;
  input: ExecuteBrowserStepRequestDto;
}
```

### 14.2 结果映射

```ts
interface RuntimeStepInvokeResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  output?: {
    step?: BrowserActionStep;
    currentUrl?: string;
  };
  errorCode?: string;
  errorMessage?: string;
  artifacts?: ArtifactRef[];
  snapshot?: SnapshotRef | null;
  takeover?: {
    required: boolean;
    reason?: string;
  };
}
```

说明：

- `BrowserActionStep` 是浏览器专用 payload
- `RuntimeStepInvokeResult` 是平台统一 envelope

---

## 15. 兼容性建议

### 15.1 当前版本兼容策略

建议保持以下兼容：

- `/browser/init` 仍接受当前 body 结构
- `/browser/execute` 仍允许传 `commands: MCPCommand[]`
- `/browser/execute-step` 仍接受现有 `ExecuteStepDto`

同时逐步引入：

- `locator`
- `paramBindings`
- `steps`
- `error.code`
- `status`

### 15.2 建议废弃字段

后续可逐步废弃：

- `target` 这种混合语义字段
- `args` 中的隐式 locator 参数
- 仅返回 `success/results/message` 的弱结构结果

---

## 16. 建议新增错误码

建议浏览器运行时统一错误码：

- `BROWSER_SESSION_NOT_FOUND`
- `BROWSER_SESSION_FROZEN`
- `BROWSER_ACTION_UNSUPPORTED`
- `BROWSER_TARGET_NOT_FOUND`
- `BROWSER_TARGET_NOT_UNIQUE`
- `BROWSER_ACTION_TIMEOUT`
- `BROWSER_TAKEOVER_REQUIRED`
- `BROWSER_CLI_UNAVAILABLE`
- `BROWSER_SCRIPT_EXPORT_FAILED`
- `BROWSER_AUTO_REPAIR_EXHAUSTED`

---

## 17. 分阶段落地建议

### Phase 1

- 扩展现有 `ExecuteStepResultDto`，增加 `status`、`error`、`step`
- `/browser/execute` 返回 `steps?: BrowserActionStep[]`

### Phase 2

- 在 `execute` 链路中引入 `BrowserRuntimeLocator` 和 `BrowserRuntimeParamBinding`
- 执行成功后产出 `scriptFragment`

### Phase 3

- 把 `BrowserCommand[]` 升级为 `BrowserActionStep[]` 作为导出事实来源
- 对齐 `RuntimeStepInvokeRequest/Result`

### Phase 4

- 为 `mcp` 后端复用同一套 DTO
- 在 `platform` 层冻结浏览器运行时正式契约

---

## 18. 一句话总结

> 浏览器运行时 DTO 的核心不是“多定义几个请求对象”，而是把当前松散的命令调用、页面观察、运行时 ref、稳定 locator、参数绑定、脚本片段和错误语义统一到一套可兼容现状、可支撑导出和自修复的正式契约中。
