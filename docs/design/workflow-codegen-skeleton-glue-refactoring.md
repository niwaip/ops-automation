# Workflow 代码生成重构：骨架 + 胶水架构设计与落地方案

状态：核心链路已实施；插件 ABI 与真实探测见后续设计  
日期：2026-08-07  
适用范围：Temporal Workflow 代码生成、Activity 代码生成、确定性编译路径扩展  
关联文档：
- [`docs/design/unified-capability-contract-and-validation-design.md`](./unified-capability-contract-and-validation-design.md)（统一能力契约设计，P1 落地目标的上游设计）
- `docs/design/deterministic-task-decomposition-design.md`
- [`docs/design/activity-plugin-spec-and-real-probe-implementation.md`](./activity-plugin-spec-and-real-probe-implementation.md)（2026-08-12 的插件 ABI、真实探测和编译 fallback 落地）

---

## 1. 问题陈述与诊断

### 1.1 现状与已确认问题

当前 Temporal Workflow 的代码生成路径分为两条：

```text
generateWorkflowCode()
 ├─ [优先] buildDeterministicWorkflowCode()   ← 命中则走固定模板，零 AI 调用
 │         ↓ miss 时降级
 └─ [后备] generateWorkflowCodeViaAi()        ← 最多 2 次 AI 调用，耗时 60s~140s
```

在 AI 生成路径（`generateWorkflowCodeViaAi`）中，存在以下严重问题：

1. **AI 生成量过大**：一次要生成完整的 Python 模块，包含所有 Activity 实现、Workflow 类定义、入参读取与校验、超时配置、重试策略以及 `_build_workflow_result()` 结果信封组装。
2. **Prompt 极度复杂**：Prompt 中包含 **38 条严苛规则**约束 AI 行为；任意一条规则违反（如生成了 `workflow.unsafe` 或遗漏了 Envelope 字段），就会导致 Gate 1 AST 校验失败并触发 AI 重试，产生双倍时延（最长达 360 秒）。
3. **信封组装不可信**：`_build_workflow_result()` 由 AI 自由生成，字段随时可能遗漏（已出现 WebSearch 生产环境中 `responseMetadata` 丢失事故，导致下游确定性调度器拒绝校验）。
4. **多节点任务失败率高**：下游步骤依赖上游 `businessData` 中的特定契约字段，AI 随意改变字段命名或遗漏契约字段直接导致链式多步骤任务崩溃。

### 1.2 根因分析

现有设计让 AI 兼任了两种完全不同性质的角色：

- **业务逻辑实现者**：实现 Activity 函数体（如发起 HTTP 请求、解析特定 JSON 数据），高度依赖业务和自然语言描述，**非常适合 AI 生成**。
- **协议胶水与骨架编排者**：Workflow 类的 Python 语法结构、参数校验框架、Activity 调度序列、超时/重试代码、结果 Envelope 组装。这部分属于**结构化固定模式，可由 DSL 编译直接生成**，不应让 AI 自由发挥。

### 1.3 重构目标

> **核心原则：让 AI 只生成 Activity 业务逻辑（“什么”），让编译器确定性生成 Workflow 骨架与契约胶水（“如何组装”）。**

```text
┌─────────────────────────────────────────────────────────┐
│  骨架编译器生成（WorkflowSkeletonCompiler，零 AI 调用）  │
│  ● Workflow 类定义与 run() 函数入口                     │
│  ● 入参读取与 required 必填校验                          │
│  ● Activity 调度序列（含超时与重试配置）                  │
│  ● _build_workflow_result() 信封组装 (强契约 v2Output)  │
│  ● 步骤间数据传递 (_resolve_step_input / _resolve_ref) │
└─────────────────────────────────────────────────────────┘
                            +
┌─────────────────────────────────────────────────────────┐
│  AI 生成（仅 Activity 函数体，12 条精简规则 Prompt）     │
│  ● @activity.defn 实现（业务 HTTP / 数据处理逻辑）       │
│  ● 异常捕捉与 retryable 边界                            │
│  ● 响应解析与数据提取                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 与现有统一契约设计的对齐

本文是 [`unified-capability-contract-and-validation-design.md`](./unified-capability-contract-and-validation-design.md) **§15.2 P1：DSL 和代码生成强约束** 的落地方案。

上游契约设计文档中的核心要求：

1. **AI 只生成 Activity 业务代码**（§15.2 改造项 4）。
2. **DSL 编译器生成 Result Builder**（§15.2 改造项 3）。
3. **AI 生成代码无法覆盖编译器生成的 Result Builder**（§15.2 验收标准 2）。

本文档在继承上述要求的原则下，进一步补充：

- **Workflow 骨架编译器**的完整架构与生成模板规范（§4）。
- **Activity 专属精简 Prompt 规范**（§5）。
- **多节点任务步骤间数据传递**与 v2Output 契约映射机制（§6）。
- **分阶段无痛落地路径**（§8）。

---

## 3. 核心架构与生成流程

### 3.1 生成流程总览

```text
WorkflowDsl + ActivityDsl
       │
       ▼
Stage 0: DSL 合法性校验 (Gate 0)
  ● 检查步骤拓扑与 Activity 引用
  ● 校验 v2Output.fields 依赖的步骤与路径合法性
       │
       ▼
Stage 1: Activity 代码生成
  对每个 Activity：
  ├─ 已有 generatedCode (如内置模板/历史代码) → 跳过
  └─ 自定义 Activity → AI 生成函数体 (使用 12 条精简 Activity Prompt)
       │ （所有 Activity 函数体 generatedCode 已就绪）
       ▼
Stage 2: Workflow 骨架编译 (WorkflowSkeletonCompiler)
  ● 读取 WorkflowDsl 与 ActivityDsl
  ● 生成确定性 Python Workflow 类
  ● 注入 Activity 函数体代码
  ● 由编译器编译生成 _build_workflow_result() (v2Output 断言)
       │                          │ （若属于复杂拓扑 conditionals/signals/saga）
       │                          └─► 降级至受约束的 AI 骨架生成路径 (注入固化 Result Builder)
       ▼
Stage 3: Gate 1 AST 静态分析
  ● 语法/编译校验 (py_compile + ast.parse)
  ● 三层 import 白名单检查
  ● 确定性黑名单检查 (禁止 IO/时间/随机数/unsafe)
  ● 结果 Envelope 完整性断言
       │
       ▼
  生成完成（符合生产规范的 Python 模块）
```

### 3.2 编译路径对比

| 场景 | 现有路径 | 重构后路径 | AI 调用次数 |
|---|---|---|---|
| 所有步骤均有 generatedCode (如内置 Activity) | 走 `buildDeterministicWorkflowCode` | 统一走 **骨架编译器** | **0** |
| 含自定义 Activity (无 generatedCode) 的单步/多步流 | 尝试确定性编译失败 → 降级全量 AI 生成 | Stage 1 AI 生成 Activity → Stage 2 走 **骨架编译器** | **N** (仅 Activity 函数体) |
| 复杂拓扑 (条件分支/信号/Saga) | 全量 AI 生成 | AI 骨架生成 (但 **Result Builder 由编译器强硬注入**) | **1~2** |

---

## 4. Workflow 骨架编译器技术规范

### 4.1 骨架结构规范

编译器基于 `WorkflowDsl` 输出如下标准的 Python 模块结构，结构完全固定，动态部分由 DSL 计算注入：

```python
# ── 固定 Import 声明（由编译器注入，不可被篡改） ───────────────────
import json
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

# ── Activity 实现块（来自 ActivityDsl.generatedCode，原样拼接） ──────
# [ACTIVITY_CODE_BLOCK]

# ── Workflow 骨架类（编译器确定性生成） ─────────────────────────────
@workflow.defn(name="{{workflowDisplayName}}")
class {{workflowClassName}}:
    ACTIVITY_START_TO_CLOSE_TIMEOUT = timedelta(seconds={{defaultTimeoutSeconds}})
    STEP_CONFIGS = {{stepConfigsLiteral}}
    STEP_KINDS = {{stepKindsLiteral}}

    # ── 入参规范化与必填校验 ─────────────────────────────────────────
    @classmethod
    def _build_base_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            # {{#each inputParams}}
            "{{key}}": cls._normalize(params.get("{{key}}", {{defaultValueLiteral}})),
            # {{/each}}
        }

    @staticmethod
    def _validate_required_params(base_input: Dict[str, Any]) -> None:
        required_params = {{requiredParamsList}}
        missing = [k for k in required_params if not str(base_input.get(k, "")).strip()]
        if missing:
            raise ApplicationError(f"缺少必需参数: {', '.join(missing)}", non_retryable=True)

    @staticmethod
    def _normalize(value: Any) -> str:
        return "" if value is None else str(value)

    # ── 步骤间数据解析与模板渲染（通用固定实现） ──────────────────────
    @staticmethod
    def _resolve_ref(ref: str, base_input: Dict[str, Any], step_results: Dict[str, Any]) -> Any:
        # ... [解析 {param} 与 {{stepId.path}} 的标准实现]

    @classmethod
    def _resolve_step_input(cls, step_index: int, base_input: Dict[str, Any], step_results: Dict[str, Any]) -> Dict[str, Any]:
        # ... [渲染 STEP_CONFIGS[step_index] 的标准实现]

    @staticmethod
    def _normalize_step_result(step_index: int, raw: Any, params: Dict[str, Any]) -> Any:
        # ... [结果归一化标准实现]

    # ── 契约与结果工具函数 ───────────────────────────────────────────
    @staticmethod
    def _extract_summary(value: Any) -> Optional[str]: ...
    @staticmethod
    def _extract_detail_text(value: Any) -> Optional[str]: ...
    @classmethod
    def _collect_artifacts(cls, value: Any) -> List[Dict[str, Any]]: ...

    # ── 强契约 Result Builder (根据 v2Output 编译生成) ───────────────
    @classmethod
    def _build_workflow_result(cls, step_results: Dict[str, Any]) -> Dict[str, Any]:
        # [编译器由 v2Output.fields 编译产生的强契约提取与断言代码]

    # ── Workflow 执行入口 ─────────────────────────────────────────────
    @workflow.run
    async def run(self, params: dict) -> dict:
        base_input = self._build_base_input(params or {})
        self._validate_required_params(base_input)
        step_results: Dict[str, Any] = {}

        # 步骤 0: {{step0.name}}
        step_input_0 = self._resolve_step_input(0, base_input, step_results)
        workflow.logger.info("执行 Activity: {{step0.name}}")
        raw_result_0 = await workflow.execute_activity(
            {{step0.activityFn}},
            step_input_0,
            start_to_close_timeout=timedelta(seconds={{step0.timeoutSeconds}}),
        )
        step_result_0 = self._normalize_step_result(0, raw_result_0, params or {})
        step_results["{{step0.id}}"] = step_result_0

        # ... (后续步骤依次执行)

        return self._build_workflow_result(step_results)
```

### 4.2 编译器接口定义

```typescript
// apps/backend/core/platform/src/modules/temporal-workflow/workflow-skeleton-compiler.ts

export enum SkeletonFallbackReason {
  HAS_CONDITIONALS        = 'has_conditionals',
  HAS_SIGNAL_HANDLERS     = 'has_signal_handlers',
  HAS_SAGA_ERROR_HANDLING = 'has_saga_error_handling',
  HAS_PARALLEL_STEPS      = 'has_parallel_steps',
  ACTIVITY_CODE_MISSING   = 'activity_code_missing',
}

export interface SkeletonCompileResult {
  success: boolean;
  code?: string;
  error?: string;
  fallbackReason?: SkeletonFallbackReason;
}

export class WorkflowSkeletonCompiler {
  /**
   * 尝试使用骨架编译器生成 Python Workflow 代码。
   * 复用现有 temporal-workflow-deterministic-builder.ts 逻辑。
   */
  compile(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): SkeletonCompileResult;
}
```

---

## 5. Activity 精简 Prompt 规范

### 5.1 精简说明

原 Prompt 包含 38 条规则，绝大多数是约束 AI 生成 Workflow 类、信封、ReplayGuard 等。
在 Activity 专属代码生成中，AI **只负责生成一个 `@activity.defn` 函数体**，Prompt 简化为以下 **12 条核心规则**：

1. **装饰器与命名**：函数必须带 `@activity.defn(name="{{fn}}")` 装饰器，函数名必须严格等于 `{{fn}}`。
2. **函数签名**：参数形式必须为 `async def {{fn}}(input_data: Dict[str, Any]) -> Dict[str, Any]:`。
3. **禁止 Workflow 结构**：严禁定义 `@workflow.defn` 类，严禁包含任何 Workflow 编排代码。
4. **禁止 Worker 客户端**：严禁包含 `temporalio.client.Client` 或 `Worker` 连接/启动逻辑。
5. **日志规范**：使用 `activity.logger.info()` 记录日志，禁止使用 Python 原生 `print()`。
6. **重试异常抛出**：网络/依赖服务暂时性失败，抛出 `ApplicationError(msg, non_retryable=False)`。
7. **不可重试异常**：业务参数缺失或非法时，抛出 `ApplicationError(msg, non_retryable=True)`。
8. **HTTP 状态检查**：所有 HTTP/API 请求后必须紧跟 `response.raise_for_status()`。
9. **心跳机制**：对于潜在的长耗时 API 调用或循环处理，必须在关键节点调用 `activity.heartbeat()`。
10. **返回类型**：必须返回 `Dict[str, Any]` 字典，且必须包含 `"status": "success"`。
11. **列表包装**：如果结果是列表类型，必须装载在字典字段中（如 `"searchResults": [...]` 或 `"items": [...]`）。
12. **禁止信封伪造**：**严禁自行拼装 `execution` / `trigger` / `result` / `presentation` 等 Workflow 信封字段**。

---

## 6. 多节点任务支持与契约映射

### 6.1 步骤间数据传递与解析

在骨架代码中，步骤间通信统一通过 `step_results` 字典完成：

```python
step_results: Dict[str, Any] = {}

# Step 0: search_step
step_input_0 = self._resolve_step_input(0, base_input, step_results)
raw_result_0 = await workflow.execute_activity(webSearch, step_input_0, ...)
step_result_0 = self._normalize_step_result(0, raw_result_0, params or {})
step_results["search_step"] = step_result_0

# Step 1: summary_step (其 STEP_CONFIGS 声明 content: "{{search_step.searchResults}}")
step_input_1 = self._resolve_step_input(1, base_input, step_results) # 自动提取 searchResults
raw_result_1 = await workflow.execute_activity(summarize, step_input_1, ...)
step_result_1 = self._normalize_step_result(1, raw_result_1, params or {})
step_results["summary_step"] = step_result_1
```

### 6.2 v2Output 强契约 Result Builder

编译器读取 `workflowDsl.v2Output.fields`，生成强校验的 `_build_workflow_result` 函数：

```python
@classmethod
def _build_workflow_result(cls, step_results: Dict[str, Any]) -> Dict[str, Any]:
    search_result = step_results.get("search_step") or {}
    summary_result = step_results.get("summary_step") or {}

    # 编译器强行生成的 required 字段运行时断言！(不再依赖 AI 是否记得写)
    cls._assert_required_path(search_result, "searchResults", "searchResults")
    cls._assert_required_path(search_result, "responseMetadata", "responseMetadata")

    business_data = {
        "searchResults":    search_result.get("searchResults"),
        "responseMetadata": search_result.get("responseMetadata"),
        "totalResults":     len(search_result.get("searchResults") or []),
        "summary":          summary_result.get("result") or summary_result.get("text"),
    }

    return {
        "execution": {"status": "success"},
        "trigger": {"type": "manual"},
        "result": {
            "resultType": "generic",
            "title": "WebSearchWorkflow",
            "summary": cls._extract_summary(business_data) or "执行完成",
            "businessData": business_data,
        },
        "artifacts": cls._collect_artifacts(step_results),
        "presentation": {
            "preferAiSummary": True,
            "preferStructuredView": True,
            "summaryFormat": "markdown",
            "detailFormat": "markdown",
            "detailText": cls._extract_detail_text(business_data),
        },
    }
```

如此一来，无论 AI 如何生成 Activity，只要 v2Output 声明了 `responseMetadata` 为 `required`，编译器生成的代码就会在 `_assert_required_path` 校验。如果缺少，立即抛出 `ApplicationError(non_retryable=True)`，彻底杜绝下游确定性计划由于缺少关键字段而卡死。

---

## 7. 代码重构与改动清单

### 7.1 复用资产

现有代码库中已具备极高的复用基础：
- `temporal-workflow-deterministic-builder.ts` 中的 `buildUniversalLinearWorkflowCode` 已实现 2+ 步线性流的骨架编译。
- `temporal-workflow-result-builder.helpers.ts` 中的 `buildV2OutputResultBuilderLines` 已实现 v2Output 到 Python 的契约断言编译。
- `temporal-workflow-fixed-workflow-code.helpers.ts` 中的 `buildSharedResultSupportLines` 已实现通用 Envelope 组装。

### 7.2 变更文件明细

1. **`temporal-workflow-codegen.service.ts`**：
   - 改造 `generateWorkflowCode` 方法：在收到 DSL 时，若 Activity 未生成，先调用 `generateActivityCode` 为自定义 Activity 生成函数体；一旦所有 Activity 代码就绪，直接调用 `WorkflowSkeletonCompiler` 编译生成 Workflow 代码。
   - 简化 `generateWorkflowCodeViaAi`：若因复杂拓扑降级走 AI 骨架生成，在 Prompt 中强行注入 `_build_workflow_result` 编译器产物，禁止 AI 篡改。
2. **`activity-body-prompt-builder.ts`（新增）**：
   - 实现精简的 12 条 Activity 规则 Prompt 构建逻辑。
3. **`workflow-skeleton-compiler.ts`（新增）**：
   - 对 `buildUniversalLinearWorkflowCode` 进行封装，作为 Workflow 骨架编译的统一入口。

---

## 8. 落地实施计划 (Implementation Plan)

### Phase 1：扩展骨架编译器支持自定义 Activity 单步/多步流 (工期: 1.5 天)
- [x] 在 `temporal-workflow-codegen.service.ts` 中拆分 Activity 代码生成与 Workflow 骨架编译。
- [x] 当自定义 Activity 生成完成后，直接喂给 `buildUniversalLinearWorkflowCode` / `WorkflowSkeletonCompiler` 生成 Workflow。
- [x] 验证单步与 2 步自定义 WebSearch 工作流走骨架编译器成功生成。

### Phase 2：Activity Prompt 瘦身与精简 (工期: 1 天)
- [x] 引入 `activity-body-prompt-builder.ts`，将 Activity Prompt 从 38 条减少为 12 条。
- [x] 测试模型生成 Activity 函数体的响应速度与语法准确率。

### Phase 3：v2Output 强契约 Result Builder 嵌入 (工期: 1 天)
- [x] 确保所有走骨架编译器的多节点工作流，其 `_build_workflow_result` 均由 `buildV2OutputResultBuilderLines` 生成。
- [x] 执行端到端测试，验证遗漏 `responseMetadata` 时能够正确拦截并抛出非重试异常。

### Phase 4：复杂拓扑降级保护 (工期: 0.5 天)
- [x] 对于带 `conditionals` 等复杂拓扑的 Workflow，在降级 Prompt 中强行注入编译器生成的 Result Builder。

---

## 9. 验收测试矩阵

| 测试用例 | 预期生成路径 | AI 调用次数 | 期望耗时 | 校验重点 |
|---|---|---|---|---|
| 单步内置 Activity Workflow | 骨架编译器 | 0 次 | < 1 秒 | 零 AI，代码全确定性 |
| 单步自定义 WebSearch Workflow | Activity AI + 骨架编译器 | 1 次 | 20 ~ 30 秒 | 仅生成 Activity，Workflow 为确定性骨架 |
| 多步 (WebSearch + 摘要) Workflow | Activity AI (x2) + 骨架编译器 | 2 次 | 30 ~ 50 秒 | `responseMetadata` 断言强行存在 |
| 缺少 `responseMetadata` 的错误 Activity | 骨架编译器运行时拦截 | - | < 10 毫秒 | 抛出 `ApplicationError(non_retryable=True)` |
