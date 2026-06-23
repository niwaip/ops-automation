# VK Framework 核心索引

> **60行规则**：本文件保持简洁，详细内容在各子文件中渐进披露。

---

## ⚡ 一句话理解

```
传统工程：人类写代码 → 机器执行代码
VK Framework：人类设计约束 → 智能体生成规格 → 智能体执行开发
```

---

## 两技能分离

| 技能           | 文件            | 触发         | 说明                           |
| -------------- | --------------- | ------------ | ------------------------------ |
| **VK-Plan**    | `vk-plan.md`    | 用户提出需求 | 需求细化 → 任务划分 → OpenSpec |
| **VK-Execute** | `vk-execute.md` | 用户确认规划 | 创建 Issues → 启动 Workspaces  |

---

## 核心规则

1. **必须按顺序执行**：VK-Plan → 用户确认 → VK-Execute → 询问执行方式
2. **需求细化3次追问**：功能目标 → 输入输出 → 非功能需求
3. **任务粒度适中**：模块级粒度，避免过度拆分（建议 5-15 个任务）
4. **任务独立原则**：禁止 parent_issue_id，使用 relationship
5. **任务命名规范**：`[阶段]-[功能名称]`（Foundation/Core/Integration/Release）
6. **OpenSpec 是任务指令**：AI读取后必须执行操作，不只是了解内容
7. **Given/When/Then 格式**：测试场景标准格式
8. **创建 Issue 后询问**：询问用户是否自动执行

---

## 流程阶段

```
[配置确认] → EXPLORE → REFINE → SPLIT → PLAN → [确认] → EXECUTE → VERIFY → ARCHIVE
    ↑可选       ↑可选                                                  ↑可选
```

---

## OpenSpec 内容要点

**OpenSpec 是任务执行指令，不是规格文档。每个任务指示应包含：**

- **🎯 TASK INSTRUCTION**：明确告诉AI要做什么（使用祈使句）
- **Interface Specifications**：定义必须实现的接口
- **Constraints and Rules**：AI必须遵守的规则
- **Implementation Steps**：具体执行步骤
- **Deliverables**：完成后必须存在的文件
- **Test Cases**：验收标准（Given/When/Then）

在项目根目录创建 `vk-config.yaml` 注入项目上下文：

```yaml
context: |
  技术栈：Python, FastAPI, PostgreSQL
  测试：pytest
  代码风格：Black, isort
```

VK-Plan 会在 Phase 0 读取并确认配置。

---

## 详细文档

| 文件                 | 内容                    |
| -------------------- | ----------------------- |
| `VK_IMPORT_GUIDE.md` | 导入指南 + 强制规则详解 |
| `vk-plan.md`         | 规划技能完整文档        |
| `vk-execute.md`      | 执行技能完整文档        |

---

## Harness Engineering 原则

参考 OpenAI Harness Engineering：

- **仓库即记录系统**：不在仓库里的东西，对智能体不存在
- **地图而非手册**：渐进披露，从小入口开始
- **机械化执行**：lint 错误 = 修复指令，不只报错
- **熵管理**：技术债是高息贷款，持续小额偿还
- **Fresh Context**：每次迭代清空上下文重新读取
