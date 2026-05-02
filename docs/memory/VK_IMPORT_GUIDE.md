# VK Framework 导入指南

## ⚠️ CRITICAL RULES（强制规则）

**AI Agent 必须严格遵守以下规则，违反将导致流程失败：**

### Rule 1: 必须先理解框架
```
在执行任何任务前，AI Agent 必须：
1. 读取 memory/MEMORY.md
2. 读取 memory/VK_IMPORT_GUIDE.md
3. 读取 memory/vk-plan.md
4. 读取 memory/vk-execute.md
5. 确认理解两技能分离设计
```

### Rule 2: 必须按顺序执行
```
❌ 禁止：跳过 VK-Plan 直接执行 VK-Execute
❌ 禁止：不生成 OpenSpec 就启动 Workspace
❌ 禁止：不等待用户确认就调用 MCP

✅ 正确流程：
VK-Plan (REFINE → SPLIT → PLAN → 用户确认) → VK-Execute → 询问是否自动执行
```

### Rule 3: 需求细化提问 + 自我确认 + 用户确认
```
VK-Plan REFINE 阶段，必须：
1. 对用户需求进行细化提问，至少 3 次追问
2. 每次追问聚焦不同维度：
   - 第1次：功能目标和使用场景
   - 第2次：输入输出和边界条件
   - 第3次：性能安全和兼容性

VK-Plan 完成后，必须：
1. 先进行自我整体确认检查：
   - 检查所有任务是否独立（不创建子任务）
   - 检查任务名称是否带有阶段信息
   - 检查任务粒度是否适中（模块级，非过度拆分）
   - 检查 OpenSpec 格式是否完整
   - 检查接口定义是否完整
   - 检查业务需求是否明确
   - 检查文件所有权矩阵是否无冲突

2. 输出确认报告：
   "自我确认完成：
   - 共 {N} 个独立任务（模块级粒度）
   - 任务命名格式：[阶段]-[功能名称]
   - 所有 OpenSpec 格式完整
   - 接口定义完整，业务需求明确
   - 文件所有权无冲突

   请确认是否开始执行？"

3. 等待用户明确回复"确认"后，才能进入 VK-Execute
```

### Rule 4: 任务粒度规则（避免过度拆分）
```
❌ 禁止：过度拆分任务（如：创建实体、DTO、Service分别作为独立任务）

✅ 正确做法：
- 每个任务对应一个完整模块/服务
- 相关功能合并为一个任务
- 预计工时 4-8 小时
- 任务总数建议控制在 5-15 个

示例：
- Core-UserModule（包含实体、DTO、Service、Controller、前端页面）
- Core-TemplateModule（包含模板CRUD、验证、前端页面）
- Integration-APIGateway（包含所有API端点整合）
```

### Rule 5: OpenSpec 是任务执行指令
```
❌ 禁止：OpenSpec 只是规格文档，AI只了解内容不执行操作

✅ 正确做法：
- OpenSpec 必须包含 🎯 TASK INSTRUCTION（明确的执行指令）
- 使用祈使句告诉AI要做什么（如："创建XXX模块"、"实现XXX功能"）
- AI读取后必须执行操作，不只是了解内容

OpenSpec 必须包含：
- 🎯 TASK INSTRUCTION: 明确的执行指令（使用祈使句）
- Interface Specifications: AI必须实现的接口
- Constraints and Rules: AI必须遵守的规则
- Implementation Steps: 具体执行步骤
- Deliverables: 完成后必须存在的文件
- Test Cases: 验收标准（Given/When/Then）
```

### Rule 6: 检查 MCP 可用性
```
VK-Execute 开始前，必须：
1. 检查 Vibe-Kanban MCP 是否连接
2. 调用 mcp__vibe_kanban__get_context 确认环境
3. 如 MCP 不可用，报告错误并停止
```

### Rule 7: 任务独立性原则
```
❌ 禁止：创建父子关系的子任务（parent_issue_id）
❌ 禁止：任务嵌套或层级依赖

✅ 正确做法：
- 所有任务都是独立的 Issue
- 任务之间通过 create_issue_relationship 设置依赖
- 依赖类型使用 "blocking"（阻塞关系）
- 每个任务可以独立分配到不同 Workspace
```

### Rule 8: 任务命名规范
```
任务名称必须包含阶段信息，格式：
[阶段]-[功能名称]

示例：
- Foundation-ProjectSetup
- Core-AuthModule
- Core-TemplateModule
- Integration-WebSocketGateway
- Release-Documentation

阶段标识：
- Foundation: 基础设施
- Core: 核心功能模块
- Integration: 整合层
- Release: 发布准备
```

### Rule 9: 创建 Issue 后询问执行方式
```
VK-Execute 创建完所有 Issue 后，必须询问用户：

"已创建 {N} 个 VibeKanban Issue：
- Issue 1: {名称}
- Issue 2: {名称}
- ...

请问是否自动执行这些任务？
- 自动执行：立即启动 Workspace 执行所有任务
- 手动执行：只创建 Issue，用户手动触发执行
- 选择性执行：用户指定哪些任务自动执行"
```

---

AI Agent 读取此指南后，可自动配置 VK Framework 开发体系。

---

## 概述

VK Framework 是一套基于 OpenSpec + Harness 的开发方法论，分为两个独立技能：

| 技能 | 名称 | 依赖 | 用途 |
|------|------|------|------|
| **VK-Plan** | 项目规划与拆解 | 无（纯方法论） | 需求细化、任务划分、规格生成 |
| **VK-Execute** | Vibe-Kanban 执行 | Vibe-Kanban MCP | 创建 Issues、启动 Workspaces、执行开发 |

**执行顺序**：VK-Plan 完成后 → VK-Execute 开始

---

## 导入步骤

### Step 1: 读取框架定义

将以下内容保存到项目 memory 目录：

```markdown
# VK Framework 核心定义

## Layer 1: METHODOLOGY（方法论）

开发流程阶段：
1. REFINE  - 需求细化，输出功能点清单
2. SPLIT   - 任务划分，输出原子化任务列表 + 依赖图
3. PLAN    - 规划，输出 OpenSpec 规格文档
4. DEVELOP - 开发实现
5. TEST    - 单体测试 + 集成测试
6. DEPLOY  - 部署发布

执行模式：
- A (auto):        完全自动，无确认
- B (semi_auto):   PLAN和DEPLOY前确认
- C (interactive): 每阶段确认

## Layer 2: SPECIFICATIONS（规格）

### OpenSpec 格式模板
每个任务规格包含：
- Execution Order: RUN_FIRST | RUN_PARALLEL | RUN_AFTER:[deps]
- Branch Isolation Rules: READ-ONLY / OWNED / FORBIDDEN 文件
- Objective: 一句话目标
- Deliverables: 交付文件清单
- Implementation: 实现骨架代码
- Test Cases: 测试用例表格
- Acceptance Criteria: 验收命令

### Harness 测试模板
核心函数：assert_eq, assert_contains, assert_exit_code, run_tests

## Layer 3: ORCHESTRATION（编排）

批次执行策略：
- Batch 0: Foundation (先行，必须完成)
- Batch 1: Core Features (并行，依赖Batch 0)
- Batch 2: Integration (整合，依赖Batch 1)

文件所有权原则：每个任务独占文件，避免合并冲突
```

### Step 2: 配置 Skill 1 (VK-Plan)

将以下内容作为 Agent 的规划技能：

```markdown
# VK-Plan: 项目规划与拆解

## 触发
用户提出新需求时调用

## 输入
用户需求描述

## 输出
- 功能点清单
- 任务列表 + 依赖图
- OpenSpec 规格文档
- 文件所有权矩阵

## 执行步骤

### Phase 1: REFINE（需求细化）

1. 澄清需求：
   - 解决什么问题？
   - 用户是谁？
   - 输入/输出是什么？
   - 边界条件？

2. 输出功能点清单表格：
   | ID | 功能点 | 优先级 | 复杂度 | 依赖 |

### Phase 2: SPLIT（任务划分）

1. 拆解原则：
   - 单一职责
   - 文件隔离
   - 可测试
   - 粒度适中 (0.5-4h)

2. 分析依赖关系

3. 划分执行批次：
   - Batch 0: Foundation
   - Batch 1: Core (并行)
   - Batch 2: Integration

4. 输出任务清单表格：
   | Task ID | 任务名 | 文件所有权 | 依赖 |

5. 输出文件所有权矩阵：
   | 文件 | T00 | T01 | T02 | ... |
   图例: ✍️=所有者 👁️=只读 ❌=禁止

### Phase 3: PLAN（规格生成）

为每个任务生成 OpenSpec 文档：

```markdown
# {Task-ID} — {Title}

## Execution Order
**{order}**

## Branch Isolation Rules
READ-ONLY: {files}
OWNED: {files}
FORBIDDEN: {files}

## Objective
{一句话}

## Deliverables
- [ ] {file} — {desc}

## Implementation
{骨架代码}

## Test Cases
| ID | Desc | Input | Expected |

## Acceptance Criteria
{验收命令}
```

## 完成标志
所有任务的 OpenSpec 文档生成完毕，等待用户确认

## 下一步
确认后调用 VK-Execute (Vibe-Kanban MCP)
```

### Step 3: 配置 Skill 2 (VK-Execute)

将以下内容作为 Agent 的执行技能：

```markdown
# VK-Execute: Vibe-Kanban 执行

## 触发
VK-Plan 完成且用户确认后调用

## 依赖
Vibe-Kanban MCP Server 已连接

## 输入
- OpenSpec 规格文档
- 任务依赖图
- 执行批次划分

## 输出
- 创建的 Issues
- 启动的 Workspaces
- 开发完成状态

## MCP API 映射

| 操作 | MCP API |
|------|---------|
| 获取上下文 | mcp__vibe_kanban__get_context |
| 获取 repo | mcp__vibe_kanban__list_repos |
| 创建 Issue | mcp__vibe_kanban__create_issue |
| 设置依赖 | mcp__vibe_kanban__create_issue_relationship |
| 启动 Workspace | mcp__vibe_kanban__start_workspace |
| 运行 Session | mcp__vibe_kanban__run_session_prompt |
| 查询状态 | mcp__vibe_kanban__list_workspaces |
| 更新 Issue | mcp__vibe_kanban__update_issue |

## 执行步骤

### Phase 1: 环境准备

1. 获取当前上下文：
   ```
   mcp__vibe_kanban__get_context
   ```

2. 获取可用 repo：
   ```
   mcp__vibe_kanban__list_repos
   ```

### Phase 2: 创建 Issues

1. 为每个任务创建 Issue：
   ```
   mcp__vibe_kanban__create_issue(
     title="{Task-ID}: {Title}",
     description="{OpenSpec内容}",
     priority="{优先级}"
   )
   ```

2. 设置依赖关系：
   ```
   mcp__vibe_kanban__create_issue_relationship(
     issue_id="{子任务ID}",
     related_issue_id="{父任务ID}",
     relationship_type="blocking"
   )
   ```

### Phase 3: 执行 Batch 0 (Foundation)

1. 启动 Foundation Workspace：
   ```
   mcp__vibe_kanban__start_workspace(
     name="VK-{Task-ID}",
     executor="CLAUDE_CODE",
     repositories=[{repo_id, branch}],
     prompt="{OpenSpec内容}"
   )
   ```

2. 等待完成：
   ```
   监控 mcp__vibe_kanban__list_workspaces 直到状态为 completed
   ```

### Phase 4: 执行 Batch 1 (Core - 并行)

1. 同时启动所有 Core Task Workspaces
2. 使用不同 branch 名称
3. 等待所有完成

### Phase 5: 执行 Batch 2 (Integration)

1. 启动 Integration Workspace
2. 整合所有 Core Task 结果

### Phase 6: 状态更新

根据结果更新 Issue 状态：
- 开发完成 → status: "tested_unit"
- 测试通过 → status: "tested_integration"
- 准备发布 → status: "review"

## Executor 选项

| Executor | 说明 |
|----------|------|
| CLAUDE_CODE | Claude Code Agent |
| AMP | Google AMP |
| GEMINI | Gemini |
| CODEX | OpenAI Codex |

## 失败处理

- Foundation 失败 → 停止，报告错误
- Core Task 失败 → 单独重试或跳过
- Integration 失败 → 检查依赖，修复后重试

## 完成标志
所有 Workspace 完成，Issues 状态更新为 tested_integration
```

---

## 快速导入命令

将以上内容保存到项目的 `docs/memory/` 目录：

```
docs/memory/
├── MEMORY.md          ← 框架核心定义
├── vk-plan.md         ← Skill 1: 规划技能
└── vk-execute.md      ← Skill 2: 执行技能
```

---

## Agent 读取后的行为

当 Agent 读取此指南后：

1. **识别框架结构**：了解分层架构和两技能分离
2. **配置规划技能**：VK-Plan 可独立使用，无需 MCP
3. **配置执行技能**：VK-Execute 需要 Vibe-Kanban MCP
4. **理解执行顺序**：先规划后执行

---

## 使用示例

### 场景：用户提出新需求

```
用户: 我需要添加用户认证功能

Agent (VK-Plan):
1. 执行 REFINE → 输出功能点清单
2. 执行 SPLIT → 输出任务列表 + 文件所有权矩阵
3. 执行 PLAN → 生成每个任务的 OpenSpec

Agent: 请确认以上规划，确认后将调用 Vibe-Kanban 执行

用户: 确认

Agent (VK-Execute):
1. 调用 MCP 创建 Issues
2. 启动 Foundation Workspace
3. 并行启动 Core Workspaces
4. 启动 Integration Workspace
5. 更新状态，报告结果
```

---

## 配置选项

可在 MEMORY.md 中添加配置：

```yaml
# 用户自定义配置
vk_config:
  execution_mode: semi_auto   # A/B/C
  executor: CLAUDE_CODE
  max_parallel: 5
  skip_phases: []             # 跳过的阶段
```

---

## 版本信息

- Framework Version: v2.0
- Last Updated: 2024-03-28
