# 企业级 Skill 平台 MCP 与开放集成 RFC

**MCP Integration RFC v2.0**  
日期：2026-04-19

> 本文补充了 `Enterprise-Skill-Platform_Master_v2.0.md`，专门论述平台如何通过 MCP (Model Context Protocol) 暴露能力，以实现标准化的企业级 AI 集成。

---

## 1. 背景与目标

当前 `ai-orchestrator` 和 `browser-worker` 之间的工具调用采用了内部定制的 JSON 格式。随着 Anthropic 推出 MCP 等行业标准，平台需要一种标准化、安全且易于接入的协议。

**目标**：
- 摒弃无边界的 CLI 调用，将平台能力（Capabilities 和 Skills）封装为标准 MCP Tools。
- 允许企业内部的自研 Agent、Copilot 甚至是第三方大模型应用，安全地发现和调用本平台的 Skill。
- 在协议层实现细粒度的 RBAC 鉴权与审计。

---

## 2. MCP 架构定位

MCP Server 应作为 `skill-control-plane` 的一个独立接入网关。

### 2.1 核心职责
- **Resource 暴露**：将企业内的模板库（Templates）、历史报告（Artifacts）、组织知识（Org Memory）以 MCP Resources 的形式暴露，供大模型读取。
- **Tool 暴露**：将经过审批上线的 `published` 状态的 Skill，以及基础的原子能力（如 `document.render`）暴露为 MCP Tools。
- **Prompt 暴露**：将最佳实践和场景化系统提示词暴露为 MCP Prompts。

### 2.2 与现有系统的关系
外部大模型客户端 -> `MCP Server` (鉴权/拦截) -> `skill-orchestrator` -> `Runtime`

---

## 3. 为什么是 MCP 而不是直接 CLI？

1. **权限沙箱**：CLI 默认拥有终端用户的全部系统权限。而 MCP 可以在 `auth` 模块的 `SkillPermission` 表层面进行拦截。
2. **状态可控**：通过 MCP 触发的长期运行任务，平台可以返回一个 `Execution ID`，客户端可以通过 MCP Resource 持续轮询状态，甚至接收 `pending_approval` 的挂起事件，而不是像 CLI 那样直接阻塞终端。
3. **上下文感知**：MCP 原生支持大模型请求附带上下文，这与平台的 Memory 分层治理完美契合。

---

## 4. 实施建议

1. 在 `skill-control-plane` 中新增 `@modelcontextprotocol/sdk` 依赖。
2. 将数据库中 `isPublic=true` 且 `isActive=true` 的 `SkillConfig` 动态注册为 MCP Tools。
3. 确保所有的 MCP Tool 执行最终都会生成一条完整的 `Execution` 记录，供后续审计。
