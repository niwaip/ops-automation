---
name: web-prototype
zh_name: "交互式前端原型与单页应用（已并入 frontend-design）"
aliases:
  - "frontend-design"
description: |
  交互式前端原型、Web 单页应用（SPA）与交互小游戏开发（本技能已与 frontend-design 深度整合并共享规范）。当用户需要制作前端页面原型、交互式 Demo、小游戏、Web UI 或交互页面时使用。输出为单文件包含 HTML/CSS/JS 的自包含页面。不要用于日常问答或 PDF 导出。
triggers:
  - "web-prototype"
  - "交互原型"
od:
  mode: prototype
  platform: desktop
  scenario: design
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
---

# Web Prototype Skill (已与 frontend-design 统合)

> 💡 **架构整合提示**：本技能已与 `frontend-design` 深度整合为统一的前端设计与交互原型规范。两者完全互通并共享同一套底层种子模板、8 大布局区块以及反 AI 廉价感（Anti-AI Slop）设计准则。

详细指引与数据图表可视化规范请直接参阅：`frontend-design/SKILL.md`。

## 核心约定与快速装配

1. **种子文件**：直接使用 `assets/template.html` 作为 `index.html` 的基底。
2. **布局组件**：从 `references/layouts.md` 选择最接近的 Section 骨架填入 `<main id="content">`。
3. **输出落盘**：始终完整输出自包含的物理文件（通常为 `/workspace/index.html`），切勿直接向对话窗口打印裸代码。
4. **拒绝关键字堆叠与硬编码**：语义准入层将根据任务真实需求调用此技能。严禁在提示词中堆砌无意义的近义词。
