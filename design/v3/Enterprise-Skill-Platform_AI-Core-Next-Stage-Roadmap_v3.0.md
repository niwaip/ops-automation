# Enterprise Skill Platform AI Core Next-Stage Roadmap v3.0

## 1. 背景

当前 `ai-orchestrator` 已经具备以下基础能力：

- 基于 ReAct 文本协议的对话循环
- `CapabilitySnapshot` 驱动的权限可见性控制
- 工具执行层的白名单和运行时鉴权
- 文档生成链路与流程执行链路的资源级校验
- `ToolResult` 标准返回结构：`code`、`severity`、`meta`
- 事件层对结构化结果的透传

但与目标中的 AI Core 05-10 能力相比，仍存在明显差距：

- 上下文管理仍偏轻量，缺少 head/tail 保护、工具输出统一裁剪、滚动摘要
- 错误处理能力零散分布，尚未形成统一分类和恢复框架
- 多模型仍以注册与兼容层为主，未形成 smart routing 与 fallback
- Prompt 工程缺少 section 化来源管理和输入安全过滤
- 成本、限流、预算治理基本空白

本路线图用于指导下一阶段落地顺序，并明确首批高收益改造范围。

## 2. 收益排序

### P0

1. 上下文治理闭环
2. 错误分层与恢复策略统一

### P1

3. 模型路由与回退链
4. Prompt 工程从模板升级为策略层

### P2

5. 成本与速率控制体系
6. 辅助 LLM 能力分层

## 3. 分阶段说明

### 3.1 P0-1 上下文治理闭环

#### 目标

- 降低长任务的上下文膨胀
- 控制工具输出进入 prompt 的体积
- 让会话恢复时保留任务轨迹但不过度堆积原始输出

#### 现状问题

- `buildUserPrompt()` 直接拼接最近 5 条普通对话和全部 ReAct 历史
- 工具 Observation 会原样写入 ReAct 历史
- Session 恢复时没有滚动摘要字段

#### 首批落地项

1. 工具输出预裁剪
   - 将 Observation 写入 ReAct 历史前，统一进行长度裁剪
   - 保留 head/tail，避免大 JSON 或长日志撑爆 prompt
   - 用户侧流式事件仍保留原始输出，不影响交互体验

2. 滚动摘要
   - 当 ReAct 历史条数超过阈值时，将较早轮次压缩为结构化摘要
   - 摘要写入 `ReActState.contextSummary`
   - Prompt 生成时优先注入摘要，再拼接最近 tail 历史

3. Prompt 侧摘要注入
   - `buildUserPrompt()` 新增任务摘要 section
   - ReAct 历史只保留最近 tail 若干条

#### 非目标

- 本阶段不引入单独 summarizer 模型
- 本阶段不做多轮摘要质量优化
- 本阶段不做复杂文件上下文注入

#### 代码落点

- `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- `services/ai-orchestrator/src/modules/react-engine/prompt-builder.ts`
- `services/ai-orchestrator/src/modules/react-engine/interfaces.ts`
- 新增 `services/ai-orchestrator/src/modules/react-engine/context-window-manager.ts`

#### 验收标准

- 单轮超长工具输出不再完整写入历史
- ReAct 历史超过阈值时自动压缩
- Prompt 中能看到 `任务摘要`
- 原有文档链路 E2E 不回归

### 3.2 P0-2 错误分层与恢复策略统一

#### 目标

- 用统一错误码驱动恢复策略，而不是依赖文本模糊判断

#### 首批落地项

- 定义错误分类层：
  - `user_input_error`
  - `tool_auth_error`
  - `tool_runtime_error`
  - `provider_error`
  - `protocol_error`
- `react-engine.service.ts` 中优先依据 `ToolResult.code` 做恢复判断
- 将 `document_param_recover` 等特例恢复路径统一到错误策略表

#### 验收标准

- 恢复决策不再主要依赖 `output.includes(...)`
- 等待用户、自动恢复、直接失败三种路径有明确判断条件

### 3.3 P1-1 模型路由与回退链

#### 目标

- 让不同任务使用不同模型
- provider 异常时自动 fallback

#### 首批落地项

- 新增 `model-router.service.ts`
- 定义按任务类型的基础选模规则
- provider 调用失败时 fallback 到备用模型

#### 验收标准

- 至少支持 1 条主模型链和 1 条 fallback 链
- 调用日志能记录选择原因

### 3.4 P1-2 Prompt 工程升级

#### 目标

- 提升 Prompt 的可控性、可调试性和安全性

#### 首批落地项

- Prompt section 化：
  - `system policy`
  - `capability policy`
  - `task summary`
  - `recent trace`
  - `tool spec`
  - `skill index`
- 引入基础输入过滤：
  - 超长文本截断
  - 明显协议伪造片段清洗
  - 敏感字段屏蔽

### 3.5 P2-1 成本与速率控制体系

#### 目标

- 建立成本可见性和预算治理基础

#### 首批落地项

- 调用级 token 估算与记录
- 模型单价配置
- 基础 rate limit 观测

### 3.6 P2-2 辅助 LLM 能力分层

#### 目标

- 区分主执行模型和辅助模型

#### 首批落地项

- 归类辅助调用场景：
  - summarizer
  - error classifier
  - planner helper
  - param extractor

## 4. 建议实施顺序

### 第 1 周

- 完成工具输出裁剪
- 完成滚动摘要
- 完成 Prompt 摘要注入

### 第 2 周

- 完成错误分类映射
- 完成恢复策略表
- 用 `result.code` 替换文本模糊判断

### 第 3 周

- 完成最小版模型路由
- 完成 provider fallback

### 第 4 周

- 完成 Prompt section 化
- 完成基础安全过滤

### 第 5 周

- 完成 token/cost 记录
- 完成单价配置与初版预算治理

## 5. 当前执行策略

从本路线图开始，优先落地 `P0-1 上下文治理闭环`。

本次代码变更范围限定为：

- 新增上下文窗口管理 helper
- Observation 历史写入前统一裁剪
- ReAct 历史超过阈值时自动压缩为摘要
- Prompt 注入摘要并限制 recent tail

不在本次范围内的能力：

- 模型路由
- 成本计费
- 凭证池轮转
- Anthropic 原生适配
