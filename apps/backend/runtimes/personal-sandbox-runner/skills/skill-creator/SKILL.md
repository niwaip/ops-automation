---
name: skill-creator
zh_name: "DSH 技能创建与迭代引擎"
description: |
  Meta-skill to create, modify, test, and optimize custom certified skills for DeepSeek Harness sandbox (/opt/dsh/skills).
zh_description: |
  技能开发元工具：指导智能体与用户创建、测试并优化沙箱定制技能包（遵循 Agent Skills 标准与 YAML 规范）。
tags:
  - "meta-skill"
  - "skill-development"
  - "extensibility"
triggers:
  - "创建skill"
  - "新增skill"
  - "做个skill"
  - "创建技能"
  - "编写技能"
  - "skill-creator"
---

# Skill Creator Meta-Skill

本技能用于指导在当前沙箱 `/opt/dsh/skills/` 目录下规范化创建新技能。

---

## 1. 技能标准目录结构

每个技能应当是一个独立文件夹，包含：

```text
/opt/dsh/skills/<skill-name>/
├── SKILL.md            # 核心技能定义（必需）
└── assets/             # 可选：模板文件、离线字体、样例数据
```

---

## 2. SKILL.md 编写规范（必须遵守）

1. **YAML FrontMatter**：
   - `name`: 纯英文标识符，中划线连接（如 `mysql-inspector`）
   - `zh_name`: 中文名称
   - `description`: 英文简要描述（用于意图匹配）
   - `zh_description`: 中文详细描述
   - `triggers`: 核心触发关键词列表
2. **离线与沙箱约束声明**：
   - 必须指明使用哪些已安装的环境库（如 Python 3、openpyxl、python-docx、jq 等）；
   - **严禁编写不可控的联网安装命令**（如 `pip install`、`npm install`、`curl 外部URL`）。
3. **闭环可执行代码模版**：
   - 提供直接可由 `bash` 调用的 Python / Shell 完整模版；
   - 模版中必须指定明确的输出路径（如 `/workspace/<output>`）。
4. **输出指引**：
   - 严禁向用户直接输出调试脚本草稿；
   - 执行完成后结构化汇报成果文件与查看方式。
