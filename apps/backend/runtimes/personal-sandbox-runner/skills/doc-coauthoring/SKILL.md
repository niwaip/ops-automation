---
name: doc-coauthoring
zh_name: "结构化文档协作写作工作流"
description: |
  Guide users through a structured 3-stage workflow for collaborative technical specs, PRDs, proposals, and decision docs.
zh_description: |
  文档协作共创工作流：指导智能体与用户通过“背景采集 -> 逐节推敲 -> 读者盲测”三阶段共创高质量技术方案、PRD 与决策文档。
tags:
  - "coauthoring"
  - "prd"
  - "tech-spec"
  - "rfc"
  - "proposal"
triggers:
  - "写个文档"
  - "设计方案"
  - "技术方案"
  - "需求文档"
  - "PRD"
  - "编写规范"
  - "起草提案"
  - "决策文档"
---

# Document Co-Authoring Workflow

本技能提供高质量技术方案、PRD 与决策文档的协同写作方法论，杜绝一股脑输出万字空洞套话。

---

## 核心三阶段协作流程

### 阶段一：背景与意图采集 (Context Gathering)
在下笔写任何正文前，必须向用户确认 3 个关键元信息：
1. **文档类型与受众**：这是写给谁看的？（架构师、开发团队、管理层还是外部客户）
2. **核心目标与决策点**：读者读完后需要做出什么决定或采取什么行动？
3. **硬性约束与边界**：有哪些现存技术栈、时间线、性能要求或明确不做的内容？

### 阶段二：逐节构建与迭代打磨 (Refinement & Structure)
1. **先出大纲（Outline First）**：先向用户呈现文档架构目录（H1/H2/H3），征得确认；
2. **逐节深挖推敲**：每次只推进 1~2 个核心章节，提供真实架构权衡、数据结构与流程图；
3. **避免泛泛而谈**：所有技术论述必须包含具体的参数、接口或逻辑，不写模糊口号。

### 阶段三：无上下文读者视角盲检 (Reader Testing)
完成草稿后，跳出当前语境，模拟一名未参与背景讨论的新人开发或外部审计员：
- 是否有未解释的内部黑话或缩写？
- 是否有逻辑跳跃（从现状突然跳到结论，缺少推导论据）？
- 指标是否有衡量依据？
