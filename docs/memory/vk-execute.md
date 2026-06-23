# VK-Execute: Vibe-Kanban 执行技能

**依赖 Vibe-Kanban MCP Server**

---

## ⚠️ 强制规则

```
1. 本技能必须在 VK-Plan 完成且用户确认后执行
2. 必须检查 Vibe-Kanban MCP 可用性
3. 必须有完整的 OpenSpec 规格文档作为输入
4. 禁止跳过任何 Batch 阶段
5. 所有 Issue 必须独立创建，不使用 parent_issue_id
6. Issue 标题必须使用阶段前缀命名
7. 创建完所有 Issue 后，必须询问用户是否自动执行
```

---

## 前置条件检查

**开始执行前，必须验证：**

```python
# 1. 检查 MCP 连接
context = mcp__vibe_kanban__get_context()
if context is None:
    raise Error("Vibe-Kanban MCP 未连接，停止执行")

# 2. 检查 VK-Plan 已完成
if not has_openspec_documents():
    raise Error("缺少 OpenSpec 规格文档，请先执行 VK-Plan")

# 3. 检查用户已确认
if not user_confirmed:
    raise Error("用户未确认规划，请等待确认")

# 4. 检查任务独立性
for task in tasks:
    if task.has_parent:
        raise Error(f"任务 {task.id} 有父子关系，请修改为独立任务")
```

---

## 技能概述

| 属性 | 值                                  |
| ---- | ----------------------------------- |
| 名称 | VK-Execute                          |
| 依赖 | Vibe-Kanban MCP Server              |
| 触发 | VK-Plan 完成且用户确认              |
| 输入 | OpenSpec 规格、任务列表、依赖图     |
| 输出 | 创建的 Issues、Workspaces、开发结果 |

---

## 前置条件

1. **Vibe-Kanban MCP 已连接**
2. **VK-Plan 已完成**，用户已确认规划
3. **有可用的 Repository**（在 Vibe-Kanban 中注册）

---

## MCP API 参考

### 核心 API

| API                                           | 用途           | 参数                                          |
| --------------------------------------------- | -------------- | --------------------------------------------- |
| `mcp__vibe_kanban__get_context`               | 获取当前上下文 | 无                                            |
| `mcp__vibe_kanban__list_repos`                | 获取可用仓库   | 无                                            |
| `mcp__vibe_kanban__list_organizations`        | 获取组织       | 无                                            |
| `mcp__vibe_kanban__list_projects`             | 获取项目       | organization_id                               |
| `mcp__vibe_kanban__create_issue`              | 创建任务       | title, description, priority, project_id      |
| `mcp__vibe_kanban__create_issue_relationship` | 设置依赖       | issue_id, related_issue_id, relationship_type |
| `mcp__vibe_kanban__start_workspace`           | 启动开发环境   | name, executor, repositories, prompt          |
| `mcp__vibe_kanban__run_session_prompt`        | 执行任务       | session_id, prompt                            |
| `mcp__vibe_kanban__list_workspaces`           | 查询状态       | workspace_id (可选)                           |
| `mcp__vibe_kanban__list_sessions`             | 查询会话       | workspace_id                                  |
| `mcp__vibe_kanban__update_issue`              | 更新状态       | issue_id, status                              |
| `mcp__vibe_kanban__assign_issue`              | 分配执行者     | issue_id, user_id                             |

### 状态值

| Status             | 说明         |
| ------------------ | ------------ |
| pending            | 待执行       |
| in_progress        | 进行中       |
| needs_fix          | 需修复       |
| tested_unit        | 单体测试通过 |
| tested_integration | 集成测试通过 |
| review             | 待审查       |
| released           | 已发布       |
| completed          | 完成         |

### 依赖类型

| Type          | 说明                                |
| ------------- | ----------------------------------- |
| blocking      | 阻塞关系（A 必须先完成 B 才能开始） |
| related       | 相关关系（参考关联）                |
| has_duplicate | 重复关系                            |

---

## 执行流程

### Phase 0: 环境准备

**目标**：获取执行所需的上下文信息

#### 步骤

```python
# 1. 获取当前上下文
context = mcp__vibe_kanban__get_context()
# 返回：project, issue, workspace, orchestrator-session 信息

# 2. 获取可用仓库
repos = mcp__vibe_kanban__list_repos()
# 选择目标 repo，获取 repo_id

# 3. 获取项目（如果需要）
orgs = mcp__vibe_kanban__list_organizations()
projects = mcp__vibe_kanban__list_projects(organization_id=org_id)
# 获取 project_id
```

---

### Phase 1: 创建 Issues

**目标**：将任务转化为 Vibe-Kanban Issues

#### 步骤

```python
# 遍历 VK-Plan 输出的任务列表
for task in tasks:
    # 创建 Issue
    issue = mcp__vibe_kanban__create_issue(
        title=f"{task.id}: {task.title}",
        description=task.openspec_content,  # OpenSpec 文档内容
        priority=task.priority,             # urgent/high/medium/low
        project_id=project_id               # 可选
    )
    task.issue_id = issue.id

    # 设置依赖关系
    for dep in task.dependencies:
        mcp__vibe_kanban__create_issue_relationship(
            issue_id=task.issue_id,
            related_issue_id=dep.issue_id,
            relationship_type="blocking"
        )
```

#### Issue 创建模板

**独立任务命名格式**：`[阶段]-[功能名称]`

```json
// 正确示例：独立任务，带阶段前缀
{
  "title": "Foundation-TestHarness",
  "description": "# Foundation-TestHarness\n\n## Execution Order\n**RUN_FIRST**\n\n...\n\n{完整 OpenSpec 内容}",
  "priority": "urgent",
  "project_id": "{project_uuid}"
  // 注意：不设置 parent_issue_id
}

{
  "title": "Core-SpellWords",
  "description": "# Core-SpellWords\n\n## Execution Order\n**RUN_PARALLEL**\n\n...",
  "priority": "high"
}

{
  "title": "Integration-FullPipeline",
  "description": "# Integration-FullPipeline\n\n## Execution Order\n**RUN_AFTER: [Core-SpellWords, Core-SpellLower]**\n\n...",
  "priority": "high"
}
```

**❌ 禁止做法**：

```json
// 错误：使用父子关系
{
  "title": "子任务：实现登录",
  "parent_issue_id": "xxx" // 禁止使用
}
```

**依赖关系通过 create_issue_relationship 设置**：

```python
# 设置依赖：Core-SpellWords 依赖 Foundation-TestHarness
mcp__vibe_kanban__create_issue_relationship(
    issue_id=core_spell_words_issue_id,
    related_issue_id=foundation_issue_id,
    relationship_type="blocking"  # 阻塞关系
)
```

#### ⚠️ 创建完成后必须询问用户

**所有 Issue 创建完成后，必须询问用户执行方式：**

```markdown
已创建 {N} 个 Vibe-Kanban Issue：

- Issue 1: Foundation-XXX
- Issue 2: Core-XXX
- Issue 3: Integration-XXX
- ...

请问如何执行这些任务？

选项：

1. **自动执行**：立即启动 Workspace 执行所有任务
2. **手动执行**：只创建 Issue，用户手动触发执行
3. **选择性执行**：用户指定哪些任务自动执行

请回复您的选择（1/2/3）。
```

**根据用户选择执行：**

```python
if user_choice == "1":  # 自动执行所有
    # 继续执行 Phase 2, 3, 4...
elif user_choice == "2":  # 手动执行
    # 输出 Issue 列表，结束流程
    print("Issue 创建完成，请手动触发执行")
elif user_choice == "3":  # 选择性执行
    # 询问用户指定哪些任务
    selected_tasks = ask_user_for_selection()
    # 只执行选中的任务
```

---

### Phase 2: 执行 Batch 0 (Foundation)

**目标**：完成基础设施任务

#### 步骤

```python
# 获取 Foundation 任务
foundation_task = tasks[0]  # T00

# 启动 Workspace
workspace = mcp__vibe_kanban__start_workspace(
    name=f"VK-{foundation_task.id}",
    executor="CLAUDE_CODE",  # 或其他 executor
    repositories=[
        {
            "repo_id": repo_id,
            "branch": f"vk/{foundation_task.id}"
        }
    ],
    prompt=foundation_task.openspec_content,
    issue_id=foundation_task.issue_id  # 关联 Issue
)

foundation_task.workspace_id = workspace.id

# 等待完成
while True:
    sessions = mcp__vibe_kanban__list_sessions(workspace_id=workspace.id)
    if all(s.completed for s in sessions):
        break
    # 可选：添加超时机制

# 更新 Issue 状态
mcp__vibe_kanban__update_issue(
    issue_id=foundation_task.issue_id,
    status="tested_unit"  # 或根据实际结果
)
```

---

### Phase 3: 执行 Batch 1 (Core - 并行)

**目标**：并行执行核心任务

#### 步骤

```python
# 获取 Batch 1 的所有任务
core_tasks = [t for t in tasks if t.batch == 1]

# 同时启动所有 Workspace
for task in core_tasks:
    workspace = mcp__vibe_kanban__start_workspace(
        name=f"VK-{task.id}",
        executor="CLAUDE_CODE",
        repositories=[
            {
                "repo_id": repo_id,
                "branch": f"vk/{task.id}"
            }
        ],
        prompt=task.openspec_content,
        issue_id=task.issue_id
    )
    task.workspace_id = workspace.id

# 等待所有完成
while True:
    all_done = True
    for task in core_tasks:
        sessions = mcp__vibe_kanban__list_sessions(workspace_id=task.workspace_id)
        if not all(s.completed for s in sessions):
            all_done = False
            break
    if all_done:
        break

# 更新所有 Issue 状态
for task in core_tasks:
    mcp__vibe_kanban__update_issue(
        issue_id=task.issue_id,
        status="tested_unit"
    )
```

---

### Phase 4: 执行 Batch 2 (Integration)

**目标**：整合所有模块

#### 步骤

```python
# 获取 Integration 任务
int_task = tasks[-1]  # T04 或最后一个

# 启动 Workspace
workspace = mcp__vibe_kanban__start_workspace(
    name=f"VK-{int_task.id}",
    executor="CLAUDE_CODE",
    repositories=[
        {
            "repo_id": repo_id,
            "branch": f"vk/{int_task.id}"
        }
    ],
    prompt=int_task.openspec_content,
    issue_id=int_task.issue_id
)

# 等待完成
# ... 同上

# 更新状态
mcp__vibe_kanban__update_issue(
    issue_id=int_task.issue_id,
    status="tested_integration"
)
```

---

### Phase 5: 结果报告

**目标**：汇总执行结果

#### 输出

```markdown
## VK-Execute 执行报告

### 执行摘要

- 总任务数: {N}
- 成功: {M}
- 失败: {F}
- 总耗时: {X} 分钟

### Issue 状态

| Task | Issue ID | Status      | Workspace |
| ---- | -------- | ----------- | --------- |
| T00  | {uuid}   | tested_unit | VK-T00    |
| T01  | {uuid}   | tested_unit | VK-T01    |
| T02  | {uuid}   | tested_unit | VK-T02    |
| T03  | {uuid}   | needs_fix   | VK-T03    |
| T04  | {uuid}   | pending     | -         |

### 失败任务详情

- T03: {错误原因}
  - 建议: {修复建议}

### 下一步

1. 修复失败任务后重新执行
2. 或跳过失败任务继续 Integration
3. 准备发布流程
```

---

## Executor 选择

| Executor    | 适用场景 | 能力     |
| ----------- | -------- | -------- |
| CLAUDE_CODE | 通用开发 | 强，推荐 |
| AMP         | 简单任务 | 中       |
| GEMINI      | 简单任务 | 中       |
| CODEX       | 简单任务 | 中       |

建议：

- Foundation / Integration → CLAUDE_CODE
- 简单 Core 任务 → 可用其他 executor

---

## 失败处理策略

| 失败类型         | 处理                             |
| ---------------- | -------------------------------- |
| Foundation 失败  | 停止整个流程，报告错误，等待修复 |
| Core Task 失败   | 单个任务重试，或标记为 needs_fix |
| Integration 失败 | 检查依赖任务，修复后重试         |
| MCP 连接失败     | 检查 MCP 配置，重试连接          |

---

## 配置选项

| 配置项        | 说明             | 默认值      |
| ------------- | ---------------- | ----------- |
| executor      | 执行器类型       | CLAUDE_CODE |
| branch_prefix | 分支前缀         | vk/         |
| max_parallel  | 最大并行数       | 5           |
| timeout       | 单任务超时（秒） | 3600        |
| retry_on_fail | 失败重试次数     | 1           |

---

## 完成标志

- ✅ 所有 Batch 执行完成
- ✅ Issues 状态已更新
- ✅ 执行报告已生成
- ✅ 验证阶段完成（可选）

**下一步**：VERIFY 验证 → ARCHIVE 归档 → 部署流程（可选）

---

## 可选阶段：VERIFY（验证实现）

**参考 OpenSpec /opsx:verify**

在所有任务完成后，验证实现是否符合文档：

```markdown
## 验证检查

### 功能验证

- [ ] 所有 Given/When/Then 场景已测试
- [ ] 边界条件已覆盖
- [ ] 异常处理正确

### 代码质量

- [ ] 静态检查通过（shellcheck/lint）
- [ ] 测试覆盖率达标
- [ ] 无明显性能问题

### 规范符合

- [ ] 文件所有权规则已遵守
- [ ] 代码风格符合项目规范
- [ ] 文档已更新

### 验证结果

✅ 验证通过，所有实现符合文档要求
或
❌ 验证失败，需要修复：{问题列表}
```

---

## 可选阶段：ARCHIVE（归档）

**参考 OpenSpec /opsx:archive**

功能完成后，归档变更记录：

```markdown
## 归档操作

1. 创建归档目录：
   openspec/archive/{日期}-{变更名称}/

2. 移动文档：
   - proposal.md
   - specs/
   - design.md
   - tasks.md
   - 验证报告

3. 更新主规范（如有增量变更）

4. 关闭相关 Issues
```

---

## 项目上下文配置

**参考 OpenSpec context 注入**

在项目根目录创建配置文件，注入到所有文档：

```yaml
# vk-config.yaml
context: |
  技术栈：TypeScript, React, Node.js
  API 约定：RESTful, JSON 响应
  测试：Vitest 单元测试，Playwright e2e
  代码风格：ESLint + Prettier, 严格 TypeScript
  部署：自动 CI/CD

rules:
  openspec:
    - 使用 Given/When/Then 格式编写场景
    - 包含风险和回滚计划
    - 文件所有权必须明确
  verify:
    - 代码覆盖率 >= 80%
    - 所有测试场景通过
```

---

## 与 VK-Plan 的协作

```
VK-Plan 输出              VK-Execute 输入
────────────────────────────────────────
功能点清单        →      (参考)
任务列表          →      创建 Issues
依赖图            →      create_issue_relationship
批次划分          →      Workspace 启动顺序
文件所有权矩阵    →      (参考)
OpenSpec 规格     →      prompt 内容
```

---

## 监控命令

```python
# 实时监控所有 Workspace
def monitor_workspaces():
    while True:
        workspaces = mcp__vibe_kanban__list_workspaces()
        for ws in workspaces:
            sessions = mcp__vibe_kanban__list_sessions(workspace_id=ws.id)
            print(f"{ws.name}: {len(sessions)} sessions, status: {ws.status}")
        time.sleep(30)
```

---

## Harness Engineering 原则

参考 OpenAI Harness Engineering 方法论：

### 1. 机械化执行

- 文档会腐烂，lint 规则不会
- 验证阶段（VERIFY）作为不变量守护者
- 错误信息内嵌修复指令 → 智能体可自我纠正

```
❌ 普通：Error: Test failed.
✅ Harness：Error: Test test_login failed.
           Fix: Check AUTH.md#login-flow for expected behavior.
           Suggestion: Verify token expiration handling.
```

### 2. 熵管理 = 垃圾回收

- 智能体会复现仓库中已有的模式——包括坏模式
- ARCHIVE 阶段定期清理技术债
- 技术债 = 高息贷款，小额持续偿还

```
品味的传播路径：
人类审查评论 → 文档更新 → lint 规则 → 自动应用于所有代码
```

### 3. 吞吐量改变合并理念

- PR 生命周期很短
- 测试偶发失败通过后续重跑解决
- 智能体吞吐量远超人类注意力时，这是正确选择

### 4. 人类掌舵，智能体执行

- 人类时间是最稀缺的资源
- 出问题时，问：缺什么上下文/工具/约束？
- 工程师角色：设计环境 → 拆解任务 → 验证结果

### Ralph 循环原则

| 信条            | 应用                       |
| --------------- | -------------------------- |
| Fresh Context   | 每个 Workspace 独立上下文  |
| Disk Is State   | 文件是交接机制，Git 是记忆 |
| Let Ralph Ralph | 坐在循环上，不坐在循环里   |
| Backpressure    | 验证失败 = 门控拒绝        |

### 关键数据参考

OpenAI Harness Engineering 实践：

- 3 人团队 → 5 个月 → ~100 万行代码 → ~1500 个 PR
- 人均每天 3.5 个 PR
- 单次运行可持续 6+ 小时（通常在人类睡眠时间）
- 效率估算：约为手工编写的 1/10 时间
