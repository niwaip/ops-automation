---
name: frontend-design
zh_name: "Web前端界面、交互原型与数据可视化大屏"
aliases:
  - "web-prototype"
  - "prototype"
  - "ui-design"
description: |
  专业级 Web 前端页面、交互式原型、单页应用（SPA）、数据可视化大屏与图表（HTML柱状图/折线图等）及交互小游戏开发。结合顶级视觉品味、反 AI 廉价感规范与自包含工程模板。不要用于日常问答或文本总结；不要用于物理 PDF/Word/Excel 文档生成与报表导出。
triggers:
  - "frontend-design"
  - "web-prototype"
  - "web页面"
  - "交互原型"
  - "html图表"
deliverables:
  - ".html"
requires_execution: false
od:
  mode: prototype
  category: web-artifacts
  craft:
    requires: [typography, color, anti-ai-slop, data-visualization]
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "按部门统计金额并生成自包含的 HTML 柱状图展示，带有优雅坐标轴、数值标注与悬浮交互。"
---

# Frontend Design & Web Prototype (统一前端设计与交互原型技能)

本技能整合了 **高保真视觉设计规范**（Anthropic Frontend Design）与 **单文件交互原型脚手架**（OpenDesign Web Prototype），为智能体提供生产级、高审美、自包含的 Web 交付物指引。

---

## 1. 核心职责与适用场景

1. **数据可视化与统计图表（HTML 图表）**：
   - 当用户要求“生成 HTML 的柱状图/折线图/饼图/数据大屏”时，直接输出美观且自包含的网页图表。
2. **交互式页面原型与 Web 单页应用（SPA）**：
   - 制作产品功能原型、交互式 Demo、包含完整逻辑的网页小游戏（五子棋、计算器、贪吃蛇等）。
3. **营销落地页与产品介绍页（Landing Page）**：
   - 具有独特品牌调性、精致版式与节奏感的高质感宣传页面。
4. **组件与界面视觉翻新**：
   - 基于现有代码库（React / Vue / 原生）进行生产级 UI 美化、设计系统代币映射与组件重构。

---

## 2. 负向边界约束（Negative Boundaries）

- ❌ **严禁用于生成物理办公文档**：若用户明确要求输出 `.pdf`、`.docx`、`.xlsx` 物理文件，必须将任务分流至 `pdf`、`docx` 或 `xlsx` 技能，绝不能用网页样式打印或 HTML 代替物理文档！
- ❌ **严禁调用 openpyxl 生成 Excel 来应付 HTML 图表**：当用户指令包含“生成 html 柱状图/图表”时，必须直接在 HTML 中构建 SVG/Canvas/CSS 图表，严禁在后台执行 openpyxl 脚本生成电子表格！
- ❌ **拒绝 AI 廉价感套路（Anti-AI Slop）**：严禁滥用紫蓝渐变、泛滥的大圆角毛玻璃卡片、意义不明的漂浮彩色气泡、大面积模板化图标行。

---

## 3. 数据图表与可视化最佳实践 (Data Visualization)

当任务涉及“生成 HTML 柱状图/图表/看板”时，遵循以下规范：

### 首选方案 A：原生自包含 Inline SVG / CSS 图表（零外部依赖，极速稳定）
利用轻量 SVG 直接渲染柱状图，确保在任何离线或受限沙箱中 100% 正常显示：
```html
<div class="chart-container" style="padding: 24px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
  <h3 style="margin-top: 0; color: #1e293b;">部门别金额统计 (K)</h3>
  <svg viewBox="0 0 650 320" style="width: 100%; height: auto; font-family: sans-serif;">
    <!-- 网格线与 Y 轴刻度 -->
    <line x1="80" y1="20" x2="620" y2="20" stroke="#f1f5f9" stroke-width="1"/>
    <line x1="80" y1="130" x2="620" y2="130" stroke="#f1f5f9" stroke-width="1"/>
    <line x1="80" y1="240" x2="620" y2="240" stroke="#e2e8f0" stroke-width="1.5"/>
    <!-- 柱体与数值标注 (示例数据: 华东MIS原始值为677.59千元) -->
    <!-- 柱 1: 華東MIS (677.6K) -->
    <rect x="100" y="30" width="46" height="210" rx="4" fill="#2563eb"/>
    <text x="123" y="24" text-anchor="middle" font-size="12" font-weight="600" fill="#1e293b">677.6</text>
    <text x="123" y="260" text-anchor="middle" font-size="12" fill="#64748b">華東MIS</text>
    <!-- 柱 2: 華東BAS (328.8K) -->
    <rect x="180" y="138" width="46" height="102" rx="4" fill="#3b82f6"/>
    <text x="203" y="132" text-anchor="middle" font-size="12" font-weight="600" fill="#1e293b">328.8</text>
    <text x="203" y="260" text-anchor="middle" font-size="12" fill="#64748b">華東BAS</text>
  </svg>
</div>
```

### 次选方案 B：引入轻量 Chart.js / ECharts CDN
若需要丰富的悬停提示（Tooltip）或动态下钻，在 `<head>` 中引入 CDN 并在 `<script>` 注入真实聚合数据。

### ⚠️ 核心量纲与数值自洽性约束（严禁千倍放大事故）
在数据可视化、卡片汇总与表格呈现时，必须保持**数值量级与单位标签的严格自洽**：
1. **原件带单位列（如 `金额(K)`、`金额(千元)`、`金额(万元)`）**：
   - 若数值保持千元刻度（如 `677.59`），图表轴刻度、卡片、表格表头标为 `(K)` 或 `千元`；
   - 若数值已在后台换算为基础货币单位“元”（如 `677,585.44`），**严禁在数字后或表头叠加 `(K)`**！必须明确标为 `元` 或 `¥`，否则会引发 `677,585.44 K = 6.77 亿元` 的 **1000 倍荒谬放大**！
2. **汇总指标卡（Summary Cards）与图表 Tooltip**：
   - 必须保持全图量纲统一。不能在图表柱体上显示 `677.6K`，但在上方汇总卡片中却写出 `1,887,731.02 K`（把 188 万元写成 18.8 亿元）。
3. **文本洞察与排名解读**：
   - 严禁看错单位。如华东MIS为 67.7 万元，严禁在正文解读中写成“超 60 万 K”。所有文本结论必须与原件物理量纲对应。

---

## 4. 资源地图与页面装配 (Resource Map)

```
frontend-design/
├── SKILL.md                ← 当前核心指南
├── assets/
│   └── template.html       ← 自包含种子模板（含字体、重置样式、CSS 变量、暗黑适配）
└── references/
    ├── layouts.md          ← 8 种开箱即用的页面区块骨架（Hero/Features/Stats/Table/Split）
    └── checklist.md        ← P0/P1/P2 上线前设计自检清单
```

### 装配流程：
1. **优先复用模板**：制作独立单页或原型时，以 `assets/template.html` 为基底，映射 6 个核心 CSS 变量（`--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--surface`）。
2. **拒绝拼凑占位**：内容必须基于真实业务数据或用户输入，严禁使用“Lorem ipsum”或未定义的占位词。
3. **打上 Comment 锚点**：所有顶层业务 `<section>` 需携带 `data-od-id="<section-id>"`，便于界面标注与评论协同。

---

## 5. 输出契约与交付形式 (Output Contract)

1. **文件落盘模式**：
   - 默认将完整、自包含的 HTML 源码写入 `/workspace/index.html`（或用户明确指定的如 `/workspace/部门柱状图.html`）。
   - 写入完毕后，向用户汇报文件路径、核心功能概述，并提示可以在界面中展开在线预览或全屏交互。
2. **源码完整性**：
   - 严禁输出截断的 HTML；
   - 严禁仅输出口头文字“已为您设计完毕”而不落盘实体文件。
