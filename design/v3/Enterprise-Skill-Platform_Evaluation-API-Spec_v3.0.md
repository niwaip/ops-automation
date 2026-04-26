# 企业级 Skill 平台 Agent OS Evaluation API 规范

**Evaluation API Spec v3.0**  
日期：2026-04-26

> 本文定义 `Phase 3` 的 Evaluation API、DTO 和状态约束，目标是把执行结束后的复盘从临时日志和人工观察，收敛为正式可查询、可复用、可作为后续进化输入的对象。

---

## 1. 文档目标

本文回答以下问题：

- `Evaluation` 相关正式接口有哪些
- `Execution` 结束后如何触发 `Evaluation`
- `Evaluation` 的 DTO 应长什么样
- 谁负责生成、谁负责查询、谁不能直接改 `Execution`

---

## 2. 设计原则

### 2.1 Evaluation 是执行后的正式对象

- Evaluation 不是简单日志拼接
- Evaluation 是执行结束后的标准复盘结果

### 2.2 Evaluation 不直接修改线上 Skill

- Evaluation 只输出分析结果和候选经验
- Patch 生成留给 `Phase 4`

### 2.3 Generation 与 Consumption 分离

- `evaluation-service` 负责生成
- `control-plane` 负责触发
- `portal` 负责查询展示

---

## 3. 角色划分

### 3.1 调用方

- `Execution Control Plane`
- `portal`

### 3.2 被调用方

- `evaluation-service`

### 3.3 相关协作方

- `memory-service`
- `ai-orchestrator`

---

## 4. 外部与内部边界

### 4.1 外部 API

对 Portal 暴露：

- `GET /executions/{id}/evaluations`
- `GET /evaluations/{id}`

### 4.2 内部 API

由 `evaluation-service` 提供：

- `POST /internal/evaluations:generate`
- `GET /internal/evaluations/{id}`
- `GET /internal/evaluations?executionId=...`

---

## 5. 统一响应格式

### 5.1 成功响应

```json
{
  "success": true,
  "data": {}
}
```

### 5.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "EVALUATION_NOT_FOUND",
    "message": "Evaluation not found",
    "details": {}
  }
}
```

---

## 6. DTO 规范

### 6.1 `EvaluationDto`

```ts
interface EvaluationDto {
  id: string;
  executionId: string;
  evaluationType: 'success' | 'failure' | 'takeover' | 'mixed';
  status: 'pending' | 'generated' | 'failed';
  summary: string;
  inputSnapshot: Record<string, unknown>;
  resultSnapshot?: Record<string, unknown> | null;
  failureAnalysis?: Record<string, unknown> | null;
  humanDiff?: Record<string, unknown> | null;
  candidateMemoryWrites?: Array<Record<string, unknown>>;
  createdAt: string;
}
```

### 6.2 `GenerateEvaluationRequestDto`

```ts
interface GenerateEvaluationRequestDto {
  executionId: string;
  reason: 'execution_finished' | 'execution_failed' | 'human_control_finished';
  includeArtifacts?: boolean;
}
```

### 6.3 `EvaluationListItemDto`

```ts
interface EvaluationListItemDto {
  id: string;
  executionId: string;
  evaluationType: 'success' | 'failure' | 'takeover' | 'mixed';
  status: 'pending' | 'generated' | 'failed';
  summary: string;
  createdAt: string;
}
```

---

## 7. 内部 API 详细规范

## 7.1 `POST /internal/evaluations:generate`

用途：

- 在执行结束后生成正式 `Evaluation`

请求体：

```json
{
  "executionId": "exe_123",
  "reason": "execution_failed",
  "includeArtifacts": true
}
```

行为：

- 读取 `Execution`
- 读取 `ExecutionStep`
- 读取 `Artifact`
- 读取接管记录
- 生成结构化 `Evaluation`

返回：

- `EvaluationDto`

### 7.2 `GET /internal/evaluations/{id}`

用途：

- 查询单个 Evaluation

返回：

- `EvaluationDto`

### 7.3 `GET /internal/evaluations?executionId=...`

用途：

- 按执行查询 Evaluation 列表

返回：

- `EvaluationListItemDto[]`

---

## 8. 外部查询接口

### 8.1 `GET /executions/{id}/evaluations`

用途：

- 在 Portal 中查看某个执行的复盘结果列表

返回：

- `EvaluationListItemDto[]`

### 8.2 `GET /evaluations/{id}`

用途：

- 查看单个复盘详情

返回：

- `EvaluationDto`

---

## 9. 生成逻辑约束

### 9.1 生成触发时机

建议在以下时机触发：

- `Execution.succeeded`
- `Execution.failed`
- `Execution.human_control` 完成后

### 9.2 输入来源

必须至少读取：

- `Execution`
- `ExecutionStep`
- `Artifact`

优先读取：

- `PolicyDecision`
- `ApprovalRequest`
- 接管记录

### 9.3 输出要求

至少输出：

- 总结
- 失败分析
- 人工差异
- 候选记忆写入

---

## 10. 状态写入约束

### 10.1 `Evaluation`

只允许由 `evaluation-service` 生成和更新。

### 10.2 `Execution`

不允许由 `evaluation-service` 直接修改。

### 10.3 `MemoryItem`

`evaluation-service` 可输出候选写入，但正式写入应走 `memory-service`。

---

## 11. 推荐错误码

### 11.1 Evaluation

- `EVALUATION_NOT_FOUND`
- `EVALUATION_GENERATION_FAILED`
- `EVALUATION_ALREADY_EXISTS`

### 11.2 Input

- `EXECUTION_NOT_FOUND`
- `EXECUTION_NOT_FINISHED`
- `EVALUATION_INPUT_MISSING`

---

## 12. 典型时序

### 12.1 失败执行生成复盘

`Execution.failed -> evaluations:generate -> Evaluation.generated`

### 12.2 接管后生成复盘

`Execution.human_control finished -> evaluations:generate -> Evaluation.generated`

### 12.3 Portal 查询复盘

`GET /executions/{id}/evaluations -> GET /evaluations/{id}`

---

## 13. 与当前仓库的映射

### 13.1 适合承接触发入口

- `control-plane`

### 13.2 适合承接分析逻辑

- 新增或逻辑内聚的 `evaluation-service`

### 13.3 可作为输入来源

- `ai-orchestrator`
  - 失败分类结果
- `browser-worker`
  - takeover / snapshot / trace

---

## 14. 一句话总结

`Phase 3` 的 Evaluation API 核心是：

> 让每次执行结束都能产出一个正式、可查询、可复用的复盘对象，为记忆沉淀和下一阶段进化提供干净输入。
