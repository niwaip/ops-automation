# 企业级 Skill 平台记忆与进化架构草案

**Memory and Evolution Architecture v2.0**  
日期：2026-04-19

> 本文补充了 `Enterprise-Skill-Platform_Master_v2.0.md`，专门论述平台如何管理上下文记忆（Memory）以及如何通过闭环实现 Skill 的自我进化（Evolution）。

---

## 1. Memory 分层架构 (Point 4)

当前的大模型痛点已从“推理能力不足”转变为“缺乏精准的企业上下文”。系统不能仅仅依赖静态的 `MEMORY.md` 或硬编码的系统提示词。

### 1.1 记忆分层定义

- **Session Memory (会话记忆)**：
  - 范围：单次 `Execution` 的生命周期。
  - 内容：本次对话的历史记录、当前步骤产生的中间变量（如提取到的订单号）。
  - 存储：挂载在 `RuntimeSession` 对象上（Redis/DB 短期存储）。

- **User Memory (用户记忆)**：
  - 范围：特定用户（基于 `auth` 模块的 `userId`）。
  - 内容：用户的偏好（如“默认使用英文输出”、“常用报销银行卡号”）。
  - 存储：向量数据库或关系型 KV，在用户发起任务时自动注入 Prompt。

- **Skill Memory (技能记忆)**：
  - 范围：特定 `SkillVersion`。
  - 内容：该 Skill 过去执行时的“避坑指南”（如“在访问 SAP 门户时，等待加载的超时时间需设为 15s 而非默认的 5s”）。
  - 来源：由 Evolution 模块自动总结生成。

- **Org Knowledge (组织知识)**：
  - 范围：全局或特定部门。
  - 内容：企业规章制度、SOP 文档、API 接口文档。
  - 机制：基于 RAG（检索增强生成），通过 MCP Resources 或内部工具供 Planner 调用。

---

## 2. 进化与反馈闭环 (Point 3)

目前系统（如 `ai-orchestrator`）每次执行都是孤立的。为了让平台“越用越聪明”，必须建立 Evolution 闭环。

### 2.1 闭环数据流

1. **失败或接管 (Trigger)**：
   - 当 `Execution` 状态变为 `failed`，或进入 `human_control` 且用户手动纠正了操作后，触发 Evolution 评估。
2. **行为比对 (Diffing)**：
   - `evaluation-service` 提取大模型原本的执行计划（Planner 意图）与人类实际接管后产生的动作日志（CDP Step Log）。
3. **经验总结 (Candidate Patch Generation)**：
   - 后台大模型对 Diff 进行分析，总结出失败原因，并生成一条修复建议（Candidate Patch）。
4. **沉淀与更新 (Update)**：
   - 经验较轻：直接写入 `Skill Memory`，下次执行该 Skill 时作为注意事项注入。
   - 经验较重：生成一个新的 `SkillVersion` 草稿（Draft），包含更新后的 `ExecutionFlowTemplate`，推送给管理员进行 Review 和 Publish。

---

## 3. 人机协同 (Human-in-the-loop) 的前端闭环 (Point 2)

当前 `freeze.service.ts` 和 `takeover.service.ts` 提供了后端基础，但体验闭环需要前端支撑。

### 3.1 协同流程

1. **挂起 (Suspend)**：
   - Browser Worker 遇到未知弹窗或复杂验证码。
   - 调用 `TakeoverService`，将 `RuntimeSession` 置为 `frozen`，`Execution` 状态置为 `human_control`。
   - 系统向发起人发送 IM 通知（包含接管链接）。
2. **接管 (Takeover)**：
   - 用户点击链接进入 `Portal` 的 Execution 内联接管/恢复区。
   - 前端通过 WebRTC/noVNC 直接连接到底层的 Browser 实例，画面实时同步。
   - 用户手动点击通过验证码。
3. **恢复 (Resume)**：
   - 用户在页面点击“完成并交还控制权”。
   - 调用 `unfreezeSession`，`Execution` 恢复为 `running`，AI 接管后续流程。
4. **记录 (Record)**：
   - 用户的接管操作被底层的 Recorder 记录，直接输入到前述的 Evolution 闭环中。

---

## 4. 落地建议

- 在 MVP 阶段，优先实现 **Session Memory** 和 **User Memory** 的注入。
- 人机协同在 MVP 阶段先跑通“后端 Freeze -> 前端 noVNC 暴露 -> 后端 Resume”的主链路，不强求立刻实现自动化的 Candidate Patch 生成。
