# 企业级 Skill 平台 Artifact 与 Audit View 规范

**Artifact and Audit View Spec v2.0**  
日期：2026-04-19

> 本文补充 `Core Data Model`、`MVP Scope and Acceptance`、`Portal UX and Page Flow Spec`，专门定义第一阶段产物索引、审计事件、Portal 展示要求以及最小可追溯能力。

---

## 1. 文档目标

本文聚焦以下问题：

- MVP 阶段哪些执行结果应该沉淀为 Artifact
- 哪些关键状态变化必须进入 Audit
- Portal 的审计页和详情页最少展示什么
- 对象存储、索引表和页面展示如何对应
- 哪些能力是 MVP 必做，哪些可以后置

---

## 2. 核心原则

### 2.1 产物和审计必须平台化

- 执行结果不能只留在进程内存里
- 页面日志不能替代正式审计
- 截图、文档、导出结果应进入正式 Artifact 索引

### 2.2 Audit 关注“发生了什么”

审计记录的重点是：

- 谁做了什么
- 什么时候做的
- 对哪个 Execution / Step 做的
- 为什么发生了状态变化

### 2.3 Artifact 关注“留下了什么”

产物索引的重点是：

- 产物类型
- 来源 Execution
- 存储引用
- 访问范围

### 2.4 Portal 只展示已归档对象

- Portal 不直接读取底层文件路径
- Portal 通过 Artifact / Audit 索引展示数据

---

## 3. Artifact 定义

### 3.1 Artifact 是什么

Artifact 是一次 Execution 产生的可引用结果对象。

第一阶段典型 Artifact：

- 浏览器截图
- 页面快照引用
- 生成文档
- 导出文件
- 执行结果摘要文件

### 3.2 不属于正式 Artifact 的内容

以下内容第一阶段不必都建成正式 Artifact：

- 短期调试日志
- 临时中间变量
- 仅用于内存态重试的上下文

---

## 4. Audit 定义

### 4.1 Audit 是什么

Audit 是平台级事件和状态变化的正式记录。

第一阶段至少覆盖：

- Execution 创建
- Execution 状态变化
- RuntimeSession 分配 / 冻结 / 恢复 / 关闭
- Step 开始 / 成功 / 失败
- 审批触发 / 审批结果
- 接管触发 / Resume
- Artifact 创建

### 4.2 Audit 与 Step Log 的关系

- `ExecutionStep` 是执行明细
- `Audit` 是平台级可追溯事件

二者相关但不完全等同。

---

## 5. MVP 必须沉淀的 Artifact 类型

第一阶段建议至少支持以下类型：

### 5.1 `snapshot`

用途：

- step 级页面快照引用

### 5.2 `screenshot`

用途：

- 失败或关键步骤截图

### 5.3 `document_output`

用途：

- 文档生成结果

### 5.4 `result_summary`

用途：

- Execution 结果摘要

### 5.5 `trace_ref`

用途：

- 指向底层 trace 或录制引用

第一阶段可以先把 `trace_ref` 作为可选项。

---

## 6. Artifact 索引建议

建议与 `artifacts` 表对齐，第一阶段至少包含以下字段：

```text
id
execution_id
artifact_type
storage_ref
mime_type
visibility_level
checksum
size_bytes
created_by
created_at
```

建议补充字段：

```text
step_id
display_name
metadata_json
```

字段说明：

- `execution_id`：归属 Execution
- `step_id`：可选，指向某个 step
- `storage_ref`：对象存储引用
- `visibility_level`：控制谁可见
- `metadata_json`：保存页面标题、文件名、摘要等

---

## 7. Audit 事件模型建议

第一阶段建议基于 `execution_events` 实现最小审计。

推荐字段：

```text
id
execution_id
runtime_session_id
step_id
event_type
event_source
payload_json
created_at
```

推荐 `event_type`：

- `execution.created`
- `execution.started`
- `execution.pending_approval.entered`
- `execution.human_control.entered`
- `execution.resumed`
- `execution.succeeded`
- `execution.failed`
- `execution.cancelled`
- `runtime.allocated`
- `runtime.frozen`
- `runtime.resumed`
- `runtime.closed`
- `step.started`
- `step.succeeded`
- `step.failed`
- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `artifact.created`

---

## 8. Artifact 创建规则

## 8.1 必须创建 Artifact 的情况

- Execution 成功并产出正式文件
- 关键失败步骤产生截图
- 关键成功步骤产生快照
- 对外输出文档被正式生成

## 8.2 可以不创建正式 Artifact 的情况

- 普通中间状态截图
- 无业务价值的重复页面截图
- 仅调试用途临时日志

## 8.3 第一阶段建议策略

- 成功路径保留结果摘要和关键产物
- 失败路径保留失败 step 相关截图或快照
- 不追求每个 step 都产出独立 Artifact

---

## 9. Audit 记录规则

## 9.1 必须写 Audit 的动作

- 创建 Execution
- Execution 状态变化
- 进入审批
- 审批通过 / 拒绝
- 进入人工接管
- Resume
- Runtime 关闭
- Artifact 创建

## 9.2 建议写 Audit 的动作

- Step 开始
- Step 成功
- Step 失败
- Retry

## 9.3 第一阶段不强制的动作

- 每次页面滚动
- 每次输入字符
- 高频调试级细粒度事件

---

## 10. Portal 展示规范

## 10.1 ExecutionDetailPage 中的 Artifact 区

必须展示：

- 产物名称
- 产物类型
- 创建时间
- 来源 step（如有）

建议支持：

- 预览
- 下载

### MVP 可接受简化

- 第一阶段可先提供列表 + 下载/打开入口
- 不强求复杂在线预览

## 10.2 ExecutionDetailPage 中的 Audit 区

建议展示：

- 关键状态变化时间线
- 审批事件
- 接管事件
- Runtime 关键事件

第一阶段不要求完整事件检索后台，但必须能看到主要链路事件。

## 10.3 AuditViewPage

用途：

- 平台审计视图

必须展示：

- Execution ID
- Skill 名称
- 发起人
- 事件类型
- 时间
- 事件摘要

建议支持：

- 按 Execution 查询
- 按状态查询
- 按时间排序

---

## 11. 展示文案建议

Artifact 类型建议展示为业务化文案：

- `snapshot`：页面快照
- `screenshot`：执行截图
- `document_output`：输出文档
- `result_summary`：结果摘要
- `trace_ref`：执行轨迹

Audit 类型建议展示为用户可理解文案：

- `execution.created`：已创建执行
- `execution.started`：开始执行
- `execution.human_control.entered`：进入人工处理
- `execution.resumed`：恢复自动执行
- `execution.failed`：执行失败
- `approval.approved`：审批通过
- `approval.rejected`：审批拒绝

不建议直接把内部事件名原样暴露给业务用户。

---

## 12. 访问控制建议

### 12.1 Artifact 可见性

第一阶段建议使用简化 `visibility_level`：

- `owner_only`
- `execution_participants`
- `admin_only`

### 12.2 Audit 可见性

默认建议：

- 发起人可见与自己相关的审计
- 审批人与接管处理人可见其参与记录
- 管理员可见全部

---

## 13. 对象存储路径建议

```text
artifacts/{execution_id}/{artifact_id}
snapshots/{execution_id}/{step_index}
screenshots/{execution_id}/{step_index}
results/{execution_id}/summary.json
```

说明：

- 不应把本地文件系统路径直接暴露给前端
- Portal 应始终通过索引对象访问

---

## 14. MVP 必做与后置项

### 14.1 MVP 必做

- Artifact 索引
- 关键截图或快照引用
- 结果摘要
- 关键状态 Audit
- 审批与接管事件 Audit

### 14.2 MVP 后置

- 富文本审计检索
- 复杂筛选和聚合分析
- 全量 trace 在线回放
- 高级产物预览器

---

## 15. 页面级验收标准

### 15.1 ExecutionDetailPage

- 成功执行后可看到结果摘要或产物列表
- 失败执行后可看到失败相关截图或快照引用
- 接管执行后可看到接管事件

### 15.2 AuditViewPage

- 可查看关键状态流转
- 可看到审批和接管结果
- 可按时间排序查看事件

---

## 16. 审计最小闭环

第一阶段建议至少保证以下链路可回看：

```text
execution.created
-> runtime.allocated
-> execution.started
-> step.started
-> step.succeeded / step.failed
-> execution.human_control.entered (如发生)
-> execution.resumed (如发生)
-> artifact.created (如发生)
-> execution.succeeded / execution.failed / execution.cancelled
```

若该链路无法完整回看，则不应视为审计闭环成立。

---

## 17. 与现有文档关系

- 数据模型：见 `Enterprise-Skill-Platform_Core-Data-Model_v2.0.md`
- MVP 范围：见 `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`
- 页面流：见 `Enterprise-Skill-Platform_Portal-UX-and-Page-Flow-Spec_v2.0.md`
- 接口规范：见 `Enterprise-Skill-Platform_Execution-API-Spec_v2.0.md`

本文定位是“结果与审计展示规范”，用于冻结第一阶段 Artifact 和 Audit View 的最低交付标准。
