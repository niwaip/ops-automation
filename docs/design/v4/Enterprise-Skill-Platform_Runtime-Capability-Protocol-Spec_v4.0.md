# 企业级 Skill 平台 Runtime Capability 协议规范

**Runtime Capability Protocol Spec v4.0**  
日期：2026-05-01

> 本文定义 `v4` 下平台与各类 Runtime Adapter 之间的统一协议。  
> 目标是让 `browser-worker`、`carbone-engine`、`temporal-worker` 以及未来第三方 Runtime Adapter 都通过同一类结构化契约接入平台，而不是继续依赖各自私有接口和散落的返回语义。

---

## 1. 文档目标

本文回答以下问题：

- Runtime Adapter 应接收什么样的统一请求
- Runtime Adapter 应返回什么样的统一结果
- Browser / Document / Workflow / 第三方 Runtime 的共性和差异在哪里
- `takeover`、`approval`、`snapshot`、`artifact`、`retry` 应如何表达
- 平台如何逐步把当前私有 Runtime 接口收敛到统一协议

---

## 2. 核心原则

### 2.1 Runtime 只执行结构化能力

- Runtime 不接受自由文本任务
- Runtime 只接受结构化 step 请求
- Runtime 不负责“理解意图”，只负责“执行动作”

### 2.2 Runtime 不定义业务真相

- Runtime 成功只代表执行链路成功
- 业务是否成功由 `Execution + Verification` 判定
- Runtime 不直接写 `Execution.status`

### 2.3 Runtime 必须返回证据

执行结果不能只返回“成功/失败”，至少应返回：

- 输出结果
- 错误码
- snapshot
- artifact
- 需要接管的信号

### 2.4 Runtime 必须可插拔

- Browser Runtime 可以替换
- Document Runtime 可以替换
- Workflow Runtime 可以替换
- 第三方 Adapter 可以并行共存

前提是协议保持稳定。

---

## 3. Runtime 分类

`v4` 正式承认以下 Runtime 类型：

- `browser`
- `document`
- `workflow`
- `api`
- `code`
- `custom`

### 3.1 `browser`

适用：

- 页面导航
- 点击
- 输入
- 滚动
- 断言
- snapshot
- human takeover

### 3.2 `document`

适用：

- 模板填充
- 文档渲染
- 导出
- 预览

### 3.3 `workflow`

适用：

- Temporal Workflow
- 长流程任务
- 多步骤编排执行

### 3.4 `api`

适用：

- 内部 API 调用
- 标准化结构化更新

### 3.5 `code`

适用：

- 受控脚本执行
- 数据转换
- 小规模计算

### 3.6 `custom`

适用：

- 未来第三方 Runtime Adapter
- 行业专项执行器

---

## 4. 协议总览

统一 Runtime 协议由四类对象组成：

1. `RuntimeStepInvokeRequest`
2. `RuntimeStepInvokeResult`
3. `ArtifactRef`
4. `SnapshotRef`

建议统一走如下逻辑链路：

`ExecutionStep -> RuntimeStepInvokeRequest -> Runtime Adapter -> RuntimeStepInvokeResult -> Execution/Event/Artifact`

---

## 5. `RuntimeStepInvokeRequest`

### 5.1 定义

```ts
interface RuntimeStepInvokeRequest {
  requestId: string;
  executionId: string;
  stepId: string;
  runtimeType: 'browser' | 'document' | 'workflow' | 'api' | 'code' | 'custom';
  runtimeSessionId?: string | null;
  skillId?: string | null;
  publishedSkillId?: string | null;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  policyContext?: PolicyContext;
  traceContext?: TraceContext;
  metadata?: Record<string, unknown>;
}
```

### 5.2 字段说明

- `requestId`
  - 本次 Runtime 调用请求 ID
- `executionId`
  - 归属的 Execution
- `stepId`
  - 归属的 ExecutionStep
- `runtimeType`
  - 目标 Runtime 类型
- `runtimeSessionId`
  - 若 Runtime 依赖资源会话，则必须传递
- `skillId / publishedSkillId`
  - 帮助 Runtime 做审计、策略判断和日志关联
- `capabilityType`
  - 平台级能力类型，如 `browser.step`、`document.render`、`workflow.run`
- `action`
  - 该能力下的具体动作
- `input`
  - 结构化输入
- `policyContext`
  - 当前 step 级风险与治理上下文
- `traceContext`
  - 链路追踪上下文

### 5.3 `PolicyContext`

```ts
interface PolicyContext {
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  requiresApproval?: boolean;
  requiresConfirmation?: boolean;
  environmentTag?: string;
  allowExternalNetwork?: boolean;
  allowPersistentSession?: boolean;
  allowedDomains?: string[];
  allowedResourceScopes?: string[];
}
```

### 5.4 `TraceContext`

```ts
interface TraceContext {
  traceId?: string;
  userId?: string;
  actorType?: 'system' | 'user' | 'approver' | 'operator';
  sourceService?: string;
}
```

---

## 6. `RuntimeStepInvokeResult`

### 6.1 定义

```ts
interface RuntimeStepInvokeResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  requiresTakeover?: boolean;
  takeoverReason?: string;
  artifacts?: ArtifactRef[];
  snapshot?: SnapshotRef | null;
  metrics?: RuntimeMetrics;
  rawResult?: Record<string, unknown>;
}
```

### 6.2 `RuntimeMetrics`

```ts
interface RuntimeMetrics {
  durationMs?: number;
  attemptCount?: number;
  cpuMs?: number;
  memoryBytes?: number;
}
```

### 6.3 结果语义

- `success=true`
  - 表示本次 Runtime 调用已正常完成
- `status=completed`
  - 结构化成功
- `status=failed`
  - 确定失败
- `status=blocked`
  - 被策略、资源或上下文阻断
- `status=waiting`
  - Runtime 等待后续条件满足
- `status=takeover_required`
  - Runtime 建议切入人工接管

### 6.4 平台侧处理规则

- `status=completed`
  - Execution 引擎进入结果验证
- `status=failed`
  - Execution 引擎做失败分类
- `status=blocked`
  - Execution 引擎进入 `waiting_input` 或 `pending_approval`
- `status=takeover_required`
  - Execution 引擎进入 `human_control`

---

## 7. `ArtifactRef` 与 `SnapshotRef`

### 7.1 `ArtifactRef`

```ts
interface ArtifactRef {
  type: 'document' | 'snapshot' | 'log' | 'report' | 'trace' | string;
  id?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}
```

### 7.2 `SnapshotRef`

```ts
interface SnapshotRef {
  id: string;
  type: 'browser' | 'document' | 'workflow' | 'api' | 'custom';
  url?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}
```

### 7.3 规则

- 大体积产物不应直接塞入 `output`
- 产物必须通过 `ArtifactRef` 或 `SnapshotRef` 返回
- 平台后续可将这些对象统一纳入 `Artifact Service`

---

## 8. Browser Runtime 协议

### 8.1 `capabilityType`

建议统一使用：

- `browser.step`

### 8.2 `action`

建议标准化为：

- `goto`
- `click`
- `fill`
- `wait`
- `scroll`
- `hover`
- `press_key`
- `evaluate`
- `screenshot`
- `snapshot`

### 8.3 `input`

最小输入建议：

```ts
interface BrowserStepInput {
  target?: string;
  args?: Record<string, unknown>;
  assertion?: {
    type: string;
    expected?: string;
  };
}
```

### 8.4 Browser Runtime 特有规则

- 必须支持 `snapshot` 或等价证据输出
- 必须明确是否进入 `HUMAN_CONTROL`
- 不允许返回只靠自然语言解释的异常
- 对验证码、关键按钮、结构偏差等应优先返回 `takeover_required`

### 8.5 与当前现态映射

当前 `browser-worker` 的 `POST /browser/execute-step`、`freeze`、`resume` 可以视为该协议的原型，但需要统一返回结构、错误码和证据对象。

---

## 9. Document Runtime 协议

### 9.1 `capabilityType`

建议统一使用：

- `document.render`
- `document.preview`
- `document.export`

### 9.2 `action`

建议标准化为：

- `render`
- `preview`
- `download`

### 9.3 `input`

最小输入建议：

```ts
interface DocumentRenderInput {
  templateId: string;
  data: Record<string, unknown>;
  outputFormat?: string;
  outputName?: string;
}
```

### 9.4 Document Runtime 特有规则

- 输出文档必须通过 `ArtifactRef` 返回
- 若返回 `downloadUrl`，也应在 `artifacts` 中形成正式引用
- 文档渲染成功不等于业务流程最终完成

---

## 10. Workflow Runtime 协议

### 10.1 `capabilityType`

建议统一使用：

- `workflow.run`
- `workflow.signal`
- `workflow.query`

### 10.2 `action`

建议标准化为：

- `start`
- `resume`
- `signal`
- `query`

### 10.3 `input`

最小输入建议：

```ts
interface WorkflowRunInput {
  workflowName?: string;
  taskQueue?: string;
  params?: Record<string, unknown>;
  buildRef?: string;
}
```

### 10.4 Workflow Runtime 特有规则

- 可以返回 `waiting`
  - 表示工作流已启动但尚未最终完成
- 若为长流程，应返回可查询的工作流实例标识
- 日志、产物、结果应结构化输出

### 10.5 与当前现态映射

当前 `temporal-worker` 更像 worker 承载层，`auth/temporal-workflow` 更像构建与验证层。`v4` 要求二者在运行时链路上最终收敛到统一 `workflow.run` 语义。

---

## 11. API Runtime 协议

### 11.1 `capabilityType`

建议统一使用：

- `api.call`

### 11.2 `action`

建议标准化为：

- `invoke`

### 11.3 `input`

最小输入建议：

```ts
interface ApiCallInput {
  host: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  schemaRef?: string;
}
```

### 11.4 API Runtime 特有规则

- 必须使用 allowlist
- 必须声明 method、host、path
- 必须标记是否可重试
- 默认不允许任意 URL 出网

---

## 12. Code Runtime 协议

### 12.1 `capabilityType`

建议统一使用：

- `code.run`

### 12.2 `action`

建议标准化为：

- `execute`

### 12.3 `input`

最小输入建议：

```ts
interface CodeRunInput {
  codeRef?: string;
  entrypoint?: string;
  language?: string;
  params?: Record<string, unknown>;
  limits?: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuQuota?: number;
  };
}
```

### 12.4 Code Runtime 特有规则

- 必须受控隔离
- 必须限制资源
- 必须归档 stdout/stderr
- 默认不开放任意文件系统和网络

---

## 13. 接管与冻结协议

### 13.1 `takeover_required`

当 Runtime 无法安全继续自治执行时，应返回：

```json
{
  "success": false,
  "status": "takeover_required",
  "requiresTakeover": true,
  "takeoverReason": "验证码无法自动处理"
}
```

### 13.2 平台处理规则

- `Execution.status -> human_control`
- `RuntimeSession.control_mode -> HUMAN_CONTROL`
- 自动 step 推进停止

### 13.3 `freeze / resume`

推荐后续统一为 RuntimeSession 级协议：

- `freeze(runtimeSessionId, reason, requestedBy)`
- `resume(runtimeSessionId, resumedBy)`

Browser Runtime 当前已有冻结恢复能力，后续其他 Runtime 也应对齐统一语义。

---

## 14. 错误码规范

### 14.1 Runtime 通用错误码

- `RUNTIME_UNAVAILABLE`
- `RUNTIME_INVALID_REQUEST`
- `RUNTIME_SESSION_NOT_FOUND`
- `RUNTIME_SESSION_FROZEN`
- `RUNTIME_STEP_EXECUTION_FAILED`
- `RUNTIME_POLICY_BLOCKED`
- `RUNTIME_TAKEOVER_REQUIRED`

### 14.2 Browser Runtime 错误码

- `BROWSER_NOT_INITIALIZED`
- `BROWSER_TARGET_NOT_FOUND`
- `BROWSER_ASSERTION_FAILED`
- `BROWSER_PAGE_MISMATCH`
- `BROWSER_CAPTCHA_DETECTED`

### 14.3 Document Runtime 错误码

- `DOCUMENT_TEMPLATE_NOT_FOUND`
- `DOCUMENT_RENDER_FAILED`
- `DOCUMENT_OUTPUT_MISSING`

### 14.4 Workflow Runtime 错误码

- `WORKFLOW_BUILD_NOT_FOUND`
- `WORKFLOW_START_FAILED`
- `WORKFLOW_QUERY_FAILED`
- `WORKFLOW_SIGNAL_FAILED`

---

## 15. 平台适配器要求

所有第三方 Runtime Adapter 必须满足：

1. 支持 `RuntimeStepInvokeRequest`
2. 返回 `RuntimeStepInvokeResult`
3. 返回稳定错误码
4. 支持 traceId 透传
5. 不自行定义业务成功语义
6. 能提供最小审计信息

推荐额外支持：

- 可选 snapshot
- 可选 artifact
- 可选 metrics

---

## 16. 当前代码迁移建议

### 16.1 `browser-worker`

应迁移方向：

- 保留现有浏览器步骤执行能力
- 输出对齐统一 `RuntimeStepInvokeResult`
- 统一错误码
- 把 snapshot / screenshot 正式映射为 `ArtifactRef` / `SnapshotRef`

### 16.2 `carbone-engine`

应迁移方向：

- 对外暴露标准 `document.render` 语义
- 统一返回 artifact
- 不再直接暴露仅面向当前实现的私有字段

### 16.3 `temporal-worker`

应迁移方向：

- 把 worker 执行能力收敛为 `workflow.run`
- 标准化长流程结果、日志和等待态

---

## 17. 最终结论

从 `v4` 开始，平台不再把 Browser、Document、Workflow 看成三套完全不同的私有执行体系，而是把它们统一建模为：

- 接受统一结构化请求
- 返回统一结构化结果
- 通过统一治理上下文执行
- 由 Execution 统一编排和审计

如果某个 Runtime Adapter 不能对齐这一协议，则它不应直接进入正式平台运行时体系。
