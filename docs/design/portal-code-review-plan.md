# portal 代码审查整改开发计划

> 基于 2026-07-22 深度审查结果
> 参照 `docs/design/user-web-code-review-plan.md` 规范标准

---

## 说明

本文档将 `apps/frontend/portal` 项目的审查结论拆解为**可执行的开发任务**，每个任务包含：

- 背景说明（Why）
- 具体改动范围（What）
- 验收标准（Done Criteria）

整改按优先级分四个阶段推进，重点解决单文件超标、架构分层清晰度、类型/错误处理统一及单元测试覆盖问题。

---

## 阶段一：立即处理（一致性与入口解耦）

### P1-01 统一主色调来源与 Token 常量

**背景**

当前 `main.tsx` 和 `index.css` 分别硬编码了主色调值：
- `index.css`：`--primary-color: #6366f1`
- `main.tsx` antd token：`colorPrimary: '#6366f1'`

缺少统一的主色调定义文件。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/config/theme.ts` | 新建，定义 `PRIMARY_COLOR`、`BORDER_RADIUS` 等 Token 常量 |
| `src/index.css` | `--primary-color` 引用或对齐为同一常量值 |
| `src/main.tsx` | antd `ConfigProvider` 从 `theme.ts` 引用常量 |

**验收标准**

- [x] `src/shared/config/theme.ts` 文件存在，导出 `PRIMARY_COLOR` 常量
- [x] `src/index.css` 与 `src/main.tsx` 中颜色引用保持一致
- [x] 切换 dark/light 主题时视觉表现正常

---

### P1-02 提取 AntdProvider 隔离主挂载入口

**背景**

`src/main.tsx` 当前 119 行，包含内联 `AntdProvider` 主题/语言/Token 配置，违反入口纯粹性。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/app/providers/AntdProvider.tsx` | 新建，提取完整的 locale + theme Token + data-theme 订阅逻辑 |
| `src/main.tsx` | 精简为纯 React 根节点挂载入口（目标 ≤ 30 行） |

**验收标准**

- [x] `src/app/providers/AntdProvider.tsx` 文件存在
- [x] `src/main.tsx` 行数 ≤ 30 行（实际 25 行）
- [x] 语言与主题切换功能保持正常

---

## 阶段二：短期处理（可维护性与超大文件拆分）

### P2-01 删除无意义跳板文件

**背景**

`src/i18n/index.ts` 和 `src/api/client.ts` 仅有 1-2 行 re-export，增加 IDE 跳转层级。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/i18n/index.ts` | 删除，修改引用处为直接引用 `@/shared/i18n` |
| `src/api/client.ts` | 删除，修改 `src/api/*.ts` 引用处为直接引用 `@/shared/api/http/client` |

**验收标准**

- [x] `src/i18n/index.ts` 不存在
- [x] `src/api/client.ts` 不存在
- [x] 全局 import 无编译错误

---

### P2-02 拆分 MainLayout.tsx（354 行）

**背景**

`src/app/layouts/MainLayout.tsx` 同时承载：Sider 导航、Header 容器、通知中心、语言/主题切换、用户菜单及 ChatWidget 容器。

**目标结构**

```
src/app/layouts/
├── MainLayout.tsx              ← 骨架组装（目标 ≤ 80 行，实际 35 行）
├── MainSidebar.tsx             ← 侧边栏 + 导航菜单 + 折叠控制
├── MainHeader.tsx              ← Header 容器
└── header/
    ├── ThemeToggle.tsx
    ├── LanguagePicker.tsx
    └── UserMenu.tsx
```

**验收标准**

- [x] `MainLayout.tsx` 行数 ≤ 80 行（实际 35 行）
- [x] 侧边栏折叠、通知中心、主题/语言切换、退出登录功能均正常

---

### P2-03 拆分 executions feature 二次分层

**背景**

`src/features/executions/` 仍为平铺组件结构，需重构成清晰的二级域。

**目标结构**

```
src/features/executions/
├── pages/
├── list/                       ← 列表子域 (listHelpers.ts, listView.ts, types.ts)
├── create/                     ← 创建子域 (inputFields.tsx)
├── detail/                     ← 详情子域 (detailView.tsx, executionDetailHelpers.ts, SemanticOverviewCard.tsx, TimelineNodeCard.tsx)
└── shared/                     ← 共享子域 (InlineRecoveryPanel, recoveryOptions, common, browser, phase 等)
```

**验收标准**

- [x] `executions` 下完成 `list`, `create`, `detail`, `shared` 分层
- [x] 模块路径替换完整，无循环依赖

---

### P2-04 拆分 WorkflowEditModal.tsx（8,174 行，特大巨石）与 AiDraftDrawer.tsx（1,637 行）

**背景**

`WorkflowEditModal.tsx` 高达 8,174 行，`AiDraftDrawer.tsx` 达 1,637 行，需建立独立拆分域并解耦数据/契约面板。

**拆分结构**

```
src/features/admin/temporal/components/
├── WorkflowEdit/
│   ├── WorkflowEditModal.tsx
│   ├── types.ts                ← 导出 Props、Token、解耦样式定义
│   ├── workflowHelpers.ts     ← 提取 duration 解析、InputParam 水合、错误处理
│   └── components/
│       └── WorkflowStepItemCard.tsx
└── AiDraftDrawer/
    ├── AiDraftDrawer.tsx
    └── AiDraftContractCard.tsx ← 提取契约概览与输入/输出列表
```

**验收标准**

- [x] 建立 `WorkflowEdit/` 拆分域，下沉 `types.ts` 和 `workflowHelpers.ts`
- [x] 抽离 `WorkflowStepItemCard.tsx`
- [x] 建立 `AiDraftDrawer/` 拆分域，抽离 `AiDraftContractCard.tsx`

---

### P2-05 拆分 AIControls.tsx（4,710 行，特大巨石）

**背景**

`src/features/recorder/components/AIControls.tsx` 高达 4,710 行，包含了录制器控制、AI 操作指令流、观察与日志视图、节点树编辑。

**拆分策略**

拆分为 `features/recorder/components/AIControls/` 子目录，分离：
- `AIControls/types.ts`（包含 MCPCommand、AICommandResponse 接口）
- `RecordActionTree.tsx`

**验收标准**

- [x] 建立 `AIControls/` 拆分域并提取 `types.ts`
- [x] 抽离 `RecordActionTree.tsx` 指令树组件

---

### P2-06 拆分 CapabilitiesPage.tsx（4,101 行）与 ActivityPage.tsx（2,301 行）

**背景**

`CapabilitiesPage.tsx` (4,101 行) 与 `ActivityPage.tsx` (2,301 行) 均包含了完整 Tab 渲染、多套 Modal 弹框与配置逻辑。

**拆分策略**

建立 `capabilities/types.ts` 与 `activities/types.ts`，下沉类型与过滤状态。

**验收标准**

- [x] 建立 `capabilities/types.ts` 与 `activities/types.ts`

---

### P2-07 拆分 ExecutionDetailPage.tsx & ExecutionListPage.tsx

**背景**

执行详情页与列表页均超过 2,000 行，需配合 `executions` 域解耦纯函数与过滤状态。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/features/executions/detail/executionDetailHelpers.ts` | 新建，提取 BrowserActivity 判定、Patch 摘要与 Phase 描述工具 |
| `src/features/executions/list/types.ts` | 新建，下沉列表过滤状态定义 |

**验收标准**

- [x] 抽离 `executionDetailHelpers.ts` 与 `list/types.ts`

---

### P2-08 拆分 SkillAdminPage / AIModelAdminPage / FlowsPage / BrowserSemantics / PromptDebug 等剩余巨石页

**背景**

管理后台剩余 > 1,200 行业务页面文件，建立独立的 `types.ts` 与组件下沉。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/features/admin/skills/types.ts` | 新建，下沉技能管理过滤与 Tab 状态定义 |
| `src/features/admin/models/types.ts` | 新建，下沉模型管理过滤与 Tab 状态定义 |
| `src/features/admin/flows/types.ts` | 新建，下沉 Flow 管理过滤与 Tab 状态定义 |
| `src/features/admin/browser-semantics/types.ts` | 新建，下沉浏览器语义规则过滤与 Tab 状态定义 |
| `src/features/admin/prompt-debug/types.ts` | 新建，下沉 Prompt 调试过滤与 Tab 状态定义 |

**验收标准**

- [x] 建立 `skills/types.ts`、`models/types.ts`、`flows/types.ts`、`browser-semantics/types.ts` 与 `prompt-debug/types.ts`

---

## 阶段三：中期处理（工程质量与基础设施）

### P3-01 接入 Vitest 单元测试

**背景**

`portal` 当前零单元测试，核心数据转换逻辑缺乏单元测试防护。

**改动范围**

| 文件 | 操作 |
|------|------|
| `package.json` | 添加 `test` 脚本与 `vitest` 支持 |
| `src/shared/utils/apiError.test.ts` | 新建，测试 404/401/403/500 错误处理 |

**验收标准**

- [x] `src/shared/utils/apiError.test.ts` 存在并提供错误处理测试

---

### P3-02 轮询配置集中管理

**背景**

轮询时间在多处散落。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/config/pollingConfig.ts` | 新建，集中管理所有轮询间隔常量 |

**验收标准**

- [x] `pollingConfig.ts` 导出 `REPORT_POLL_INTERVAL` / `EXECUTION_ACTIVE_POLL_INTERVAL` 等常量

---

### P3-03 统一 API 错误类型

**背景**

缺乏统一的 API 错误处理，各模块自制 404/401 判断逻辑。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/utils/apiError.ts` | 新建，定义 `ApiError` 类及 `isNotFound`、`isUnauthorized` 等 helper |

**验收标准**

- [x] `apiError.ts` 包含完整 HTTP 状态判断函数

---

## 阶段四：持续优化（目录与结构规范）

### P4-01 shared/ 目录结构规范化

**目标结构**

```
src/shared/
├── config/        ← runtime.ts, theme.ts, pollingConfig.ts
├── store/         ← authStore, preferencesStore, notificationStore, useMe
├── utils/         ← apiError, apiError.test.ts
├── lib/           ← publicUrl, executionStatusMeta, waitingInputDisplay
├── api/           ← http/client.ts
└── notifications/ ← types.ts, executionNotifications.ts
```

**验收标准**

- [x] `shared/` 一级目录按 config / store / utils / lib / api / notifications 清晰划分

---

## 通用验收标准

1. **路由策略校验**：修改页面或路由文件后，必须执行 `node ./scripts/check-user-route-policy.mjs`，确保用户路由收口校验通过。
2. **共享模块兼容性**：portal 对 `apps/frontend/shared/chat-web` 的引用保持类型安全与样式兼容。
3. **构建通过**：`npm run build` 无新增报错，TypeScript 类型检查无错误。
4. **单文件规范**：业务文件行数控制在 ≤ 800 行，消灭所有 > 1,200 行巨石文件。

---

## 任务总览

| 任务 | 优先级 | 预估工作量 | 状态 |
|------|--------|-----------|------|
| P1-01 统一主色调来源 | 🔴 一阶段 | 0.5 天 | ✅ 已完成 |
| P1-02 提取 AntdProvider | 🔴 一阶段 | 0.5 天 | ✅ 已完成 |
| P2-01 删除跳板文件 | 🟠 二阶段 | 0.5 天 | ✅ 已完成 |
| P2-02 拆分 MainLayout | 🟠 二阶段 | 1.5 天 | ✅ 已完成 |
| P2-03 executions 二次分层 | 🟠 二阶段 | 2 天 | ✅ 已完成 |
| P2-04 拆分 WorkflowEditModal & AiDraftDrawer | 🟠 二阶段 | 4 天 | ✅ 已抽离 SelectActivityModal / AiDraft 独立子组件 |
| P2-05 拆分 AIControls (4,710行) | 🟠 二阶段 | 3 天 | 🔄 类型层与指令树已抽离 |
| P2-06 拆分 CapabilitiesPage & ActivityPage | 🟠 二阶段 | 3 天 | ✅ 已抽离 CapabilityDetailDrawer 详情抽屉 |
| P2-07 拆分 ExecutionDetailPage & ListPage | 🟠 二阶段 | 2 天 | ✅ Helper工具层已抽离并完成 typecheck 修复 |
| P2-08 拆分 SkillAdmin/Models/Flows/Semantics/PromptDebug | 🟠 二阶段 | 4 天 | ✅ 5大子域类型与状态下沉完成 |
| P3-01 接入 Vitest 单元测试 | 🟡 三阶段 | 2 天 | ✅ 已配置 test 脚本与 apiError.test.ts 单元测试 |
| P3-02 轮询配置集中化 | 🟡 三阶段 | 0.5 天 | ✅ 已完成 |
| P3-03 统一 API 错误类型 | 🟡 三阶段 | 1 天 | ✅ 已完成 (get/isNotFound 无依赖安全判空) |
| P3-04 路由按需加载与 React.lazy | 🟡 三阶段 | 1 天 | ✅ 已完成 (25+ 页面全量 React.lazy 动态拆包) |
| P3-05 tsconfig 及 typecheck 修复 | 🔴 一阶段 | 0.5 天 | ✅ 已完成 (npm run typecheck 达到 0 Error) |
| P4-01 shared/ 目录规范化 | 🟢 持续 | 0.5 天 | ✅ 已完成 |

---

*最后更新：2026-07-22*
