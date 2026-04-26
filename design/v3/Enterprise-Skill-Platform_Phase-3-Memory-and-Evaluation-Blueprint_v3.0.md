# 企业级 Skill 平台 Agent OS Phase 3 记忆与复盘实施蓝图

**Phase 3 Memory and Evaluation Blueprint v3.0**  
日期：2026-04-26

> 本文是 `Phase 3` 的实施蓝图，目标是在 `Phase 1` 已收敛执行主链、`Phase 2` 已收敛治理与 runtime 扩展的基础上，把 Memory 和 Evaluation 做成正式系统能力。重点不是“再往 Prompt 里塞更多上下文”，而是让记忆成为正式对象，让复盘成为正式输入。

---

## 1. 文档目标

本文聚焦以下问题：

- `Phase 3` 到底落哪些对象、接口和服务改动
- `MemoryItem` 如何按 `session / skill / user / org` 分层
- `Evaluation` 如何从 `Execution / Step / Artifact` 中生成正式复盘结果
- Planner 和 Verifier 如何开始使用结构化 Memory

---

## 2. 阶段定位

`Phase 3` 的核心不是“让模型记更多”，而是：

- 把执行中的经验沉淀为可治理、可检索、可过期的 Memory
- 把每次执行结束后的结果沉淀为标准化 Evaluation

一句话概括：

> `Phase 1` 解决执行，`Phase 2` 解决治理，`Phase 3` 解决经验如何被可靠积累和复用。

---

## 3. In-Scope

- `Session Memory`
- `Skill Memory`
- `User Memory` 最小版
- `MemoryItem`
- `Evaluation`
- Memory 检索接口
- Memory 写入接口
- Evaluation 生成入口
- Planner / Verifier 的 Memory Context 注入

## 3.1 Out-of-Scope

- 自动 `CandidatePatch`
- SkillVersion Draft 自动生成
- 发布 / 灰度 / 回滚闭环
- Code Runtime 的长期经验学习

---

## 4. 阶段目标

### 4.1 Memory 目标

- 让记忆脱离聊天历史和 Prompt 附属地位
- 让不同 scope 的记忆具备正式边界和生命周期

### 4.2 Evaluation 目标

- 让每次执行结束后产生标准化复盘对象
- 为 `Phase 4` 的 Patch 生成提供结构化输入

### 4.3 Planner 目标

- Planner 和 Verifier 能读取结构化记忆，而不是主要依赖消息堆叠

---

## 5. Memory 分层

### 5.1 `Session Memory`

范围：

- 单次 `Execution`

适合保存：

- 当前参数补全结果
- 当前关键 observation
- step 间中间变量
- 恢复执行所需上下文

### 5.2 `Skill Memory`

范围：

- `Skill` 或 `SkillVersion`

适合保存：

- 常见失败模式
- 常见稳定执行策略
- 页面、接口、模板的注意事项
- 某类成功案例的归纳经验

### 5.3 `User Memory`

范围：

- 用户级

适合保存：

- 偏好
- 常用参数
- 常用输出风格
- 常用组织和系统范围

### 5.4 `Org Memory`

范围：

- 组织级

适合保存：

- 稳定业务约束
- 平台侧可治理知识摘要

说明：

- `Org Knowledge` 在 `Phase 5` 可继续增强，但 `Phase 3` 先允许最小记忆化表示

---

## 6. `Evaluation` 的角色

`Evaluation` 不是简单日志汇总，而是“执行复盘对象”。

至少要回答：

- 本次执行做了什么
- 最终结果是什么
- 哪些 step 失败或偏离
- 是否发生人工接管
- 有哪些可沉淀经验
- 是否值得进入 `Phase 4` 的 Patch 生成链

---

## 7. 关键对象

### 7.1 `MemoryItem`

职责：

- 作为平台长期记忆单元

### 7.2 `Evaluation`

职责：

- 作为执行结束后的标准复盘对象

### 7.3 依赖对象

- `Execution`
- `ExecutionStep`
- `Artifact`
- `RuntimeSession`

---

## 8. 服务改动

### 8.1 `ai-orchestrator`

必须补充：

- 接收 `MemoryContext`
- 在 `plans:generate` 中使用记忆
- 在 `plans:verify` 中使用记忆

不应新增：

- 直接写 Memory 主存
- 自己生成最终 Evaluation 主对象

### 8.2 `control-plane`

必须补充：

- 在执行结束后触发 `Evaluation generate`
- 统一归档失败摘要、结果摘要、接管摘要

### 8.3 新增或逻辑内聚的 `memory-service`

职责：

- 管理 `memory_items`
- 提供分 scope 检索
- 写入与过期控制
- 为 Planner 生成 `MemoryContext`

### 8.4 新增或逻辑内聚的 `evaluation-service`

职责：

- 聚合 `Execution / Step / Artifact`
- 生成 `Evaluation`
- 输出结构化失败分析和经验候选

---

## 9. 数据流

### 9.1 Planner 读 Memory

`Execution request -> memory search -> MemoryContext -> plans:generate`

### 9.2 Verifier 读 Memory

`step result -> memory search -> plans:verify`

### 9.3 执行结束写 Evaluation

`Execution finished -> evaluation generate -> Evaluation stored`

### 9.4 Evaluation 反哺 Memory

`Evaluation -> memory write candidates -> MemoryItem`

说明：

- `Phase 3` 只写 Memory
- 自动 Candidate Patch 留到 `Phase 4`

---

## 10. MemoryContext 注入原则

### 10.1 结构化注入

不要把所有记忆重新拼接成自由文本上下文。

应优先按类型注入：

- `preferences`
- `pitfalls`
- `patterns`
- `recent_session_context`

### 10.2 作用域优先级

建议优先级：

- `session`
- `skill`
- `user`
- `org`

### 10.3 注入约束

- 注入必须可追踪来源
- 注入必须可控数量
- 注入失败不能阻塞主执行链

---

## 11. 存储分工

### 11.1 PostgreSQL

新增或扩展保存：

- `memory_items`
- `evaluations`

### 11.2 Redis

适合保存：

- 热的 `Session Memory`
- 短期 MemoryContext cache

### 11.3 Object Storage

扩展保存：

- Evaluation 附件
- 对比快照
- 失败相关 trace

---

## 12. 接口方向

### 12.1 Memory

- `POST /internal/memory:search`
- `POST /internal/memory:write`
- `POST /internal/memory-context:build`

### 12.2 Evaluation

- `POST /internal/evaluations:generate`
- `GET /internal/evaluations/{id}`
- `GET /internal/evaluations?executionId=...`

---

## 13. 与前后阶段的边界

### 13.1 对 `Phase 2` 的依赖

必须已有：

- 稳定 `Execution`
- 稳定 `ExecutionStep`
- 稳定 `PolicyDecision`
- 稳定 Artifact 索引

### 13.2 对 `Phase 4` 的交接

`Phase 3` 必须产出：

- 结构化 `Evaluation`
- 可追踪来源的 `MemoryItem`
- 候选经验输出入口

---

## 14. 退出标准

以下条件全部满足时，可认为 `Phase 3` 完成：

- Planner 可读取 `session / skill / user` 记忆
- `Execution` 结束后可生成正式 `Evaluation`
- Memory 具备来源、置信度、生命周期
- `Evaluation` 可作为后续 Patch 生成输入

---

## 15. 明确后置

明确留到 `Phase 4+`：

- Candidate Patch 自动生成
- SkillVersion Draft 自动生成
- 发布与灰度链

---

## 16. 一句话总结

`Phase 3` 的任务不是“继续堆上下文”，而是：

> 让经验变成正式对象，让复盘变成正式输入，让后续进化不再建立在零散日志和临时 Prompt 之上。
