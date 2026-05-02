# 企业级 Skill 平台 Agent OS Memory 数据模型

**Memory Data Model v3.0**  
日期：2026-04-26

> 本文定义 `Phase 3` 所需的 Memory 数据模型，目标是把 `Session / Skill / User / Org` 记忆从非正式上下文收敛为正式对象。重点不是覆盖所有知识管理能力，而是先定义 `MemoryItem` 的最小稳定模型、作用域、生命周期和检索方式。

---

## 1. 文档目标

本文回答以下问题：

- `Phase 3` 中 Memory 需要哪些正式对象
- `MemoryItem` 的最小字段是什么
- 如何区分 `session / skill / user / org`
- Memory 如何和 `Execution / Step / Evaluation` 建立来源关系

---

## 2. 设计原则

### 2.1 记忆对象化

- 记忆不是消息历史
- 记忆不是 Prompt 附件
- 记忆必须是可查询、可更新、可过期的正式对象

### 2.2 作用域分层

- 不同 scope 的记忆不能混在一起
- 相同内容在不同 scope 下语义不同

### 2.3 来源可追踪

- 每条记忆都应能追溯到来源执行或人工输入

### 2.4 生命周期可治理

- 记忆可以过期
- 记忆可以停用
- 记忆可以被更新和替换

---

## 3. 核心对象

`Phase 3` 最少需要：

- `MemoryItem`
- `MemoryAccessLog`（可选但推荐）

推荐与现有对象关联：

- `Execution`
- `ExecutionStep`
- `Evaluation`

---

## 4. `MemoryItem` 定义

职责：

- 作为平台长期或半长期记忆单元

最小字段建议：

- `id`
- `scope_type`
- `scope_id`
- `memory_type`
- `title`
- `content`
- `structured_payload_json`
- `confidence`
- `status`
- `source_type`
- `source_execution_id`
- `source_step_id`
- `source_evaluation_id`
- `ttl_at`
- `last_used_at`
- `created_at`
- `updated_at`

---

## 5. 作用域模型

### 5.1 `session`

适用：

- 单次 `Execution`

特点：

- 生命周期短
- 与续跑和中间状态强相关

### 5.2 `skill`

适用：

- `Skill` 或 `SkillVersion`

特点：

- 与某个能力的稳定经验强相关

### 5.3 `user`

适用：

- 用户偏好与惯用输入

特点：

- 影响 Planner 默认行为

### 5.4 `org`

适用：

- 平台侧可治理的组织经验

特点：

- 稳定性更高
- 变更频率更低

---

## 6. Memory 类型建议

### 6.1 `preference`

示例：

- 默认语言
- 默认输出风格

### 6.2 `fact`

示例：

- 某类业务固定约束

### 6.3 `pattern`

示例：

- 某个 Skill 在某类页面上的稳定做法

### 6.4 `pitfall`

示例：

- 常见失败点
- 避坑提醒

### 6.5 `postmortem`

示例：

- 失败复盘摘要

### 6.6 `hint`

示例：

- 对 Planner 的轻量建议

---

## 7. 来源模型

### 7.1 `source_type`

建议值：

- `execution`
- `step`
- `evaluation`
- `manual`
- `imported`

### 7.2 来源关系

一条 Memory 应至少能关联到以下之一：

- `source_execution_id`
- `source_step_id`
- `source_evaluation_id`

意义：

- 支持审计
- 支持回放
- 支持后续 Patch 生成

---

## 8. 状态模型

### 8.1 `status`

建议值：

- `active`
- `inactive`
- `expired`
- `superseded`

### 8.2 状态语义

- `active`
  - 可被正常检索与注入
- `inactive`
  - 暂时停用，不应进入主检索
- `expired`
  - 已过期
- `superseded`
  - 被更新版本取代

---

## 9. 检索维度

建议 Memory 检索至少支持：

- `scope_type`
- `scope_id`
- `memory_type`
- `status`
- `confidence`
- `last_used_at`

推荐优先检索顺序：

- `session`
- `skill`
- `user`
- `org`

---

## 10. 推荐索引

### 10.1 `memory_items`

- `(scope_type, scope_id, status)`
- `(scope_type, scope_id, memory_type)`
- `(source_execution_id)`
- `(source_evaluation_id)`
- `(ttl_at, status)`

### 10.2 `memory_access_logs`

- `(memory_item_id, created_at desc)`
- `(execution_id, created_at desc)`

---

## 11. `MemoryAccessLog`（推荐）

职责：

- 记录记忆被谁、在什么执行中使用

最小字段建议：

- `id`
- `memory_item_id`
- `execution_id`
- `step_id`
- `access_type`
- `created_at`

`access_type` 可取：

- `planner_injection`
- `verifier_injection`
- `manual_view`

意义：

- 评估记忆价值
- 识别低质量记忆
- 未来支持自动淘汰

---

## 12. 写入原则

### 12.1 可直接写入

- `Session Memory`
- 明确的 `User preference`
- 明确的 `Skill pitfall`

### 12.2 需要经过 Evaluation 再写入

- `postmortem`
- 高价值 `pattern`
- 高价值 `pitfall`

### 12.3 不应直接写入

- 未经验证的自由文本猜测
- 无来源的泛化结论

---

## 13. 与现有对象的关系

### 13.1 `Execution`

关系：

- `Session Memory` 与 `Execution` 强绑定
- 记忆写入和检索都可由 `Execution` 触发

### 13.2 `ExecutionStep`

关系：

- step 可作为记忆来源和使用位置

### 13.3 `Evaluation`

关系：

- `Evaluation` 是高质量 Memory 的重要来源

---

## 14. 与当前仓库的映射

### 14.1 `ai-orchestrator`

适合消费：

- `MemoryContext`

不适合直接成为：

- Memory 主存

### 14.2 `control-plane`

适合触发：

- 执行结束后的记忆写入候选

### 14.3 新增或逻辑内聚的 `memory-service`

适合承接：

- `memory_items`
- `memory_access_logs`
- 检索与写入规则

---

## 15. 一句话总结

`Phase 3` 的 Memory 数据模型重点是：

> 让记忆有作用域、有来源、有生命周期、有使用记录，这样它才能成为正式资产，而不是越来越长的上下文垃圾桶。
