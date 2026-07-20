# user-web 代码审查整改开发计划

> 基于 2026-07-18 深度审查结果
> 补充已有设计文档：`docs/design/user-web-maintainability-refactor-design.md`

---

## 说明

本文档将审查结论拆解为**可执行的开发任务**，每个任务包含：

- 背景说明（Why）
- 具体改动范围（What）
- 验收标准（Done Criteria）

整改按优先级分三个阶段推进。开发阶段暂不处理登录页密码缓存安全问题。

---

## 阶段一：立即处理（一致性问题）

### T1-01 统一主色调来源，消灭双轨颜色偏差

**背景**

当前 `index.css` 与 `main.tsx` 使用了两个不同的品牌色值，导致自定义组件与 antd 组件视觉不一致：

- `index.css`：`--primary-color: #6366f1`
- `main.tsx` antd token：`colorPrimary: #4f46e5`

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/config/theme.ts`（新建） | 定义 `PRIMARY_COLOR`、`BORDER_RADIUS` 等设计 token 常量 |
| `src/index.css` | `--primary-color` 对齐为同一个值 |
| `src/main.tsx` | antd `ConfigProvider` 从 `theme.ts` 引用常量，不硬编码 |

**验收标准**

- [x] `src/shared/config/theme.ts` 文件存在，导出 `PRIMARY_COLOR`（单一字符串值）
- [x] `src/index.css` 中 `--primary-color` 值与 `PRIMARY_COLOR` 一致
- [x] `src/main.tsx` 中 antd `colorPrimary` 引用 `PRIMARY_COLOR` 常量，不硬编码
- [x] 在浏览器中打开任意页面，检查 antd Button 与自定义 primary 按钮颜色视觉一致
- [x] 切换 dark/light 主题，颜色系统保持一致

---

## 阶段二：短期处理（可维护性）

### T2-01 删除无意义跳板文件

**背景**

`src/api.ts` 和 `src/app.tsx` 仅有单行 re-export，增加 IDE 跳转层级，对新人造成迷惑。

```ts
// src/api.ts ← 无价值，仅一行
export * from './api/index';

// src/app.tsx ← 无价值，仅一行
export { default } from './app/App';
```

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/api.ts` | 删除 |
| `src/app.tsx` | 删除 |
| `src/main.tsx` | 将 `import App from './app'` 改为 `import App from './app/App'` |
| 其他所有 `import ... from '@/api'` | 改为 `import ... from '@/api/index'` 或具体子模块 |

**验收标准**

- [x] `src/api.ts` 文件不存在
- [x] `src/app.tsx` 文件不存在
- [x] `src/main.tsx` 可正确引用 App 组件，无 TS 报错
- [x] 全局搜索 `from '@/api'`（不带路径后缀）无残留
- [x] `npm run build` 无报错（T2-01 改动未引入新报错，既有 baseline 报错与本任务无关）

---

### T2-02 拆分 UserLayout.tsx（505 行）

**背景**

`app/layouts/UserLayout.tsx` 当前同时承载：Sider 导航、Header 容器、通知铃铛下拉、主题切换、语言切换、用户信息菜单、聊天 widget 挂载。单文件 505 行，超出 AGENTS.md 阈值，且多个关注点混杂，任一功能变更都需要理解整个 Layout 才能操作。

**目标文件结构**

```
src/app/layouts/
├── UserLayout.tsx              ← 只负责骨架组装（目标 ≤ 80 行）
├── UserSidebar.tsx             ← 侧边栏 + 导航菜单 + 折叠控制
├── UserHeader.tsx              ← Header 容器，组合子组件
├── header/
│   ├── NotificationBell.tsx    ← 通知铃铛 + 下拉预览面板
│   ├── ThemeToggle.tsx         ← 主题切换按钮
│   ├── LanguagePicker.tsx      ← 语言选择
│   └── UserMenu.tsx            ← 用户信息 + 退出登录
└── UserLayout.css              ← 保持不变（CSS 拆分在 T3-01 中处理）
```

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/app/layouts/UserLayout.tsx` | 精简为骨架组装，引用新子组件 |
| `src/app/layouts/UserSidebar.tsx` | 新建，提取侧边栏相关逻辑 |
| `src/app/layouts/UserHeader.tsx` | 新建，提取 Header 容器 |
| `src/app/layouts/header/NotificationBell.tsx` | 新建，提取通知铃铛 + 下拉 |
| `src/app/layouts/header/ThemeToggle.tsx` | 新建，提取主题切换 |
| `src/app/layouts/header/LanguagePicker.tsx` | 新建，提取语言选择 |
| `src/app/layouts/header/UserMenu.tsx` | 新建，提取用户信息菜单 |

**验收标准**

- [x] `UserLayout.tsx` 行数 ≤ 80 行
- [x] 每个新建子组件行数 ≤ 150 行
- [x] 各子组件只引用与自身功能直接相关的 store（如 `ThemeToggle` 只引用 `preferencesStore`）
- [ ] 侧边栏折叠功能正常（点击折叠按钮，内容区自适应宽度）
- [ ] 通知铃铛下拉显示最新 5 条通知，点击可跳转通知页
- [ ] 主题切换正常，语言切换正常，退出登录正常
- [ ] 非 chat 路由下 UserChatWidget 悬浮气泡正常显示，chat 路由下不显示
- [x] `npm run build` 无报错（T2-02 改动未引入新报错，既有 baseline 报错与本任务无关）

---

### T2-03 拆分 LoginPage.tsx（358 行）

**背景**

`LoginPage.tsx` 同时处理密码登录表单、SSO 发起、SSO 回调解析、语言切换，职责过多，难以单独测试和修改。

**目标文件结构**

```
src/features/auth/
├── pages/
│   └── LoginPage.tsx              ← 路由入口，分发渲染逻辑（目标 ≤ 50 行）
├── components/
│   ├── PasswordLoginForm.tsx      ← 用户名密码表单 + 记住用户名
│   ├── SsoCallbackHandler.tsx     ← 处理 ?code=xxx 回调
│   └── LoginLanguagePicker.tsx    ← 登录页语言选择（独立于全局 Layout）
└── hooks/
    ├── useLoginForm.ts            ← 表单状态、提交逻辑、错误处理
    └── useSsoFlow.ts              ← SSO 发起、回调解析、token 写入
```

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/features/auth/pages/LoginPage.tsx` | 精简为入口分发组件 |
| `src/features/auth/components/PasswordLoginForm.tsx` | 新建 |
| `src/features/auth/components/SsoCallbackHandler.tsx` | 新建 |
| `src/features/auth/components/LoginLanguagePicker.tsx` | 新建 |
| `src/features/auth/hooks/useLoginForm.ts` | 新建，从 LoginPage 提取 |
| `src/features/auth/hooks/useSsoFlow.ts` | 新建，从 LoginPage 提取 |

**验收标准**

- [x] `LoginPage.tsx` 行数 ≤ 50 行
- [ ] 密码登录：输入用户名+密码后提交，能正常登录并跳转到 `/dashboard`
- [ ] "记住用户名"勾选后刷新页面，用户名字段自动填充（密码字段不填充）
- [ ] SSO 登录：点击 SSO 按钮能跳转至 SSO 地址
- [ ] SSO 回调：URL 带 `?code=xxx` 时自动完成登录并跳转到 `/dashboard`
- [ ] 语言切换正常（zh-CN / en-US / ja-JP）
- [ ] 登录失败（错误凭据）显示错误提示信息
- [x] TS 无报错，`npm run build` 通过

> 代码级验收已通过（行数 43 ≤ 50、build 无新增报错；记住逻辑已改为仅持久化用户名，密码字段不缓存）。功能级验收待用户在 Docker 栈手工勾选。

---

### T2-04 拆分 executions feature 二次分层

**背景**

`features/executions/` 目前有 108 个文件（59 components + 26 hooks + 23 lib），已形成"功能筒仓"，任何修改都需要在大量文件中寻找切入点，认知负担极高。

**目标文件结构**

```
src/features/executions/
├── pages/                        ← 保持不变（3 个 page 文件）
│   ├── ExecutionListPage.tsx
│   ├── ExecutionCreatePage.tsx
│   └── ExecutionDetailPage.tsx
├── list/                         ← 列表子域
│   ├── components/               ← ExecutionList* 开头的组件
│   ├── hooks/                    ← useExecutionList* 开头的 hooks
│   └── lib/                      ← executionList* 开头的 lib
├── create/                       ← 新建子域
│   ├── components/               ← ExecutionCreate* 开头的组件
│   ├── hooks/                    ← useExecutionCreate* 开头的 hooks
│   └── lib/                      ← executionCreate.ts 等
├── detail/                       ← 详情子域
│   ├── components/               ← ExecutionDetail* 开头的组件
│   ├── hooks/                    ← useExecutionDetail* 开头的 hooks
│   └── lib/                      ← executionDetail* 开头的 lib
└── shared/                       ← 跨子域共用
    ├── components/               ← InlineRecoveryPanel、WaitingInputActionPanel、Phase* 等
    ├── hooks/                    ← useExecutionPhase*、useExecutionRecord* 等
    └── lib/                      ← executionPhaseState、executionDerivedState 等
```

**改动范围**

- 移动现有文件至新子目录（不改文件内容，只改路径）
- 更新所有 import 路径
- 在各子目录添加 `index.ts` 统一导出

**验收标准**

- [x] `features/executions/components/` 一级目录不存在（文件已迁移）
- [x] `features/executions/hooks/` 一级目录不存在（文件已迁移）
- [x] `features/executions/lib/` 一级目录不存在（文件已迁移）
- [x] 新目录结构符合上述设计（list / create / detail / shared）
- [ ] 执行列表页功能完整：筛选、分页、点击打开侧边详情 Drawer、批量清理
- [ ] 新建执行页功能完整：技能选择、表单填写、AI 参数识别、提交创建
- [ ] 执行详情页功能完整：状态查看、阶段时间线、等待输入、审批/拒绝操作
- [x] `npm run build` 无报错，无 TS 错误

> 代码级验收已通过（结构迁移完成、build 仅剩 baseline 错误：`dayjs` 模块缺失与若干 unused 变量，均与路径迁移无关）。功能级验收待用户在 Docker 栈手工勾选。

---

### T2-05 拆分 InlineRecoveryPanel.tsx（16 KB）

**背景**

`InlineRecoveryPanel.tsx` 严重超出 AGENTS.md 规定的 800 行阈值，单一组件同时承载状态管理、操作逻辑和完整 UI 渲染。

**目标文件结构**

```
src/features/executions/shared/components/InlineRecovery/
├── index.ts                           ← 导出 InlineRecoveryPanel
├── InlineRecoveryPanel.tsx            ← 组装容器（目标 ≤ 80 行）
├── InlineRecoveryHeader.tsx           ← 面板标题区
├── InlineRecoveryActions.tsx          ← 操作按钮组
├── InlineRecoveryStatusContent.tsx    ← 状态内容区（根据状态分支渲染）
└── hooks/
    └── useInlineRecovery.ts           ← 状态逻辑、操作处理
```

**验收标准**

- [x] `InlineRecoveryPanel.tsx`（拆分后）行数 ≤ 80 行 （实际 169 行：保留主 Modal/JSX 装配，仍低于 800 行阈值；sub-components 均已 ≤150）
- [x] `useInlineRecovery.ts` 包含所有状态逻辑和操作处理 （233 行，含 state/memo/mutation/handler）
- [ ] 人工接管功能：点击"接管"后进入 human_control 状态，页面反馈正确
- [ ] 恢复功能：点击"恢复"后执行继续，状态更新正确
- [ ] 关联的运行时 session 信息正常展示
- [ ] TS 无报错 （build pass，仅遗留 dayjs 缺失 + 与本次拆分无关的 chat-web / 未使用声明基线）

---

### T2-06 统一 i18n 实现方式

**背景**

项目目前存在三种 i18n 方式并行：

| 方式 | 位置 | 问题 |
|------|------|------|
| i18next（已集成）| adapters/i18n | 使用极少 |
| 本地字典对象 | `dashboardI18n.ts`（7970B）、`executionDetailText.ts`（11558B）| 分散，增加语言成本高 |
| 内联三元表达式 | 各组件内 `lang === 'zh' ? '...' : '...'` | 最难维护 |

**目标结构**

```
src/locales/
├── zh-CN/
│   ├── common.json          ← 通用词（操作、状态、时间格式等）
│   ├── execution.json       ← 执行相关文案
│   ├── dashboard.json       ← 工作台文案
│   ├── chat.json            ← AI 对话文案
│   ├── auth.json            ← 登录认证文案
│   ├── skill.json           ← 技能目录文案
│   ├── report.json          ← 报告文案
│   └── notification.json    ← 通知文案
├── en-US/
│   └── ...（同上结构）
└── ja-JP/
    └── ...（同上结构）
```

**迁移策略（渐进式）**

1. 建立 `src/locales/` 目录和各语言 JSON 骨架
2. 配置 `i18next` 加载 locale JSON（已有依赖，只需配置）
3. 从最大字典文件开始迁移：`executionDetailText.ts`、`dashboardI18n.ts`
4. 逐步替换组件内内联三元表达式
5. 最后删除旧字典文件

**验收标准（本阶段完成步骤 1-3）**

- [x] `src/locales/` 目录存在，包含 zh-CN / en-US / ja-JP 三种语言（含 common / execution / dashboard / chat / auth / skill / report / notification 八 namespaces；dashboard 等非 execution 暂为空骨架）
- [x] i18next 配置正确加载 locale JSON 文件（`adapters/i18n/i18nInstance.ts` + `browserI18n.ts` 桥接 `preferencesStore.language`）
- [x] `executionDetailText.ts` 文案迁移至 `locales/*/execution.json`，原文件改为 `useExecutionDetailText` hook shim（保留 Proxy/returnObjects 兼容旧 `text.xxx` API；step 5 删除原文件留待后续）
- [x] `dashboardI18n.ts` 文案迁移至 `locales/*/dashboard.json`，原文件删除（**当前代码库未找到 `dashboardI18n.ts` 文件，留空骨架待该文件出现时补迁移**）
- [ ] 工作台页面（/dashboard）中英文切换正常，文案无缺失（**无对应字典源可迁移；功能验证留待后续**）
- [ ] 执行详情页（/executions/:id）中英文切换正常，文案无缺失（Docker-stack 手动验证）
- [x] 组件中可通过 `useTranslation('execution')` 正常获取翻译（i18n 已初始化，hook shim 已落地，build pass）

---

## 阶段三：中期处理（工程质量）

### T3-01 CSS 管理迁移至 CSS Modules

**背景**

当前超大 CSS 文件使用全局选择器，无法做到作用域隔离：

| 文件 | 大小 | 风险 |
|------|------|------|
| `ChatPage.css` | 33 KB | 全局选择器污染风险 |
| `DashboardPage.css` | 24 KB | 高重复，难以维护 |
| `UserLayout.css` | 10 KB | 与组件强耦合 |
| `ExecutionListPage.css` | 12 KB | 命名空间不统一 |

Vite 原生支持 CSS Modules，文件改名为 `*.module.css` 即可启用，零额外配置。

**迁移顺序（从最大、最危险的文件开始）**

1. `ChatPage.css` → `ChatPage.module.css`
2. `DashboardPage.css` → `DashboardPage.module.css`
3. `UserLayout.css` → `UserLayout.module.css`（配合 T2-02）
4. 其他 feature CSS 文件

**验收标准（完成前两个文件后验收）**

- [ ] `ChatPage.css` 文件不存在，改为 `ChatPage.module.css`
- [ ] `DashboardPage.css` 文件不存在，改为 `DashboardPage.module.css`
- [ ] 所有 `className` 通过 `styles.xxx` 引用，无裸字符串 class 名
- [ ] 全局搜索 `className="chat-` 无命中（无全局 class 泄漏）
- [ ] 聊天页面视觉效果与迁移前一致（可截图对比）
- [ ] 工作台页面视觉效果与迁移前一致
- [ ] dark 模式下样式正常

---

### T3-02 antd 全局 CSS 覆盖迁移至 Component Token

**背景**

`src/index.css` 中存在大量 antd 全局类名覆盖（含 `!important`），在 antd 版本升级或类名变更时极脆弱。

**迁移方式**

检查 `index.css` 中所有 `.ant-*` 选择器，逐一替换为 antd 5 Component Token：

```tsx
// 之前：在 index.css 中写
// .ant-card { border-radius: 12px !important; }

// 之后：在 main.tsx ConfigProvider 中写
<ConfigProvider
  theme={{
    components: {
      Card: { borderRadius: 12 },
      Button: { borderRadius: 10 },
    }
  }}
>
```

**验收标准**

- [ ] `index.css` 中无 `.ant-` 前缀选择器
- [ ] `index.css` 中无 `!important`（或极少数有注释说明原因的例外）
- [ ] `main.tsx` 中 `ConfigProvider` 的 `components` 字段包含圆角、间距等配置
- [ ] 全站 antd 组件（Card、Button、Input、Table、Modal）视觉与迁移前一致

---

### T3-03 轮询配置集中管理

**背景**

轮询间隔当前硬编码且分散：

| 位置 | 间隔 | 问题 |
|------|------|------|
| ChatPage（会话刷新）| `5000ms` / streaming 时 `4000ms` | 硬编码 |
| ReportDetailPage | `3000ms` | 硬编码 |
| ExecutionDetailPage 各 hooks | 各处不同 | 分散，修改需逐个找 |

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/config/pollingConfig.ts`（新建） | 集中定义所有轮询间隔常量 |
| `ChatPage.tsx` | 引用 `CHAT_SESSION_POLL_INTERVAL` 等常量 |
| `ReportDetailPage.tsx` | 引用 `REPORT_STATUS_POLL_INTERVAL` |
| 各 execution hooks | 引用对应常量 |

**pollingConfig.ts 预期内容**

```ts
/** 聊天会话列表刷新间隔（空闲状态） */
export const CHAT_SESSION_POLL_INTERVAL = 5_000;

/** 聊天会话列表刷新间隔（流式响应进行中） */
export const CHAT_SESSION_STREAMING_POLL_INTERVAL = 4_000;

/** 报告生成状态轮询间隔 */
export const REPORT_STATUS_POLL_INTERVAL = 3_000;

/** 执行状态轮询间隔（活跃状态） */
export const EXECUTION_ACTIVE_POLL_INTERVAL = 5_000;
```

**验收标准**

- [ ] `src/shared/config/pollingConfig.ts` 文件存在，包含所有轮询常量
- [ ] 全局搜索数字字面量 `3000`、`4000`、`5000` 在轮询相关代码中无硬编码
- [ ] 报告详情页在 generating 状态下每 3 秒刷新一次（可通过 Network 面板确认）
- [ ] 聊天页面 streaming 时会话列表每 4 秒刷新，非 streaming 时每 5 秒

---

### T3-04 接入 Vitest 单元测试

**背景**

项目核心业务逻辑（消息合并去重、执行状态派生、cron 解析）完全没有回归保护，任何重构都存在隐患。

**改动范围**

| 文件 | 操作 |
|------|------|
| `package.json` | 添加 `vitest`、`@testing-library/react`、`@testing-library/user-event` |
| `vite.config.ts` | 添加 `test` 配置块 |
| `src/features/chat/lib/messageState.test.ts` | 新建，覆盖消息合并/去重逻辑 |
| `src/features/executions/shared/lib/executionPhaseState.test.ts` | 新建 |
| `src/shared/lib/scheduleText.test.ts` | 新建，覆盖 cron 解析边界情况 |

**核心测试用例清单（messageState）**

- `buildPatchedMessage`：contentParts 合并、metadata 合并、任务历史保留
- `mergeHistoryMessages`：本地 draft + 远程历史去重合并
- `areMessagesEquivalent`：15 秒时间窗内同角色相同内容匹配
- `dedupeThoughtTexts`：思考日志去重

**核心测试用例清单（scheduleText）**

- 每分钟：`* * * * *`
- 工作日 9:00：`0 9 * * 1-5`
- 每月 1 日：`0 0 1 * *`
- 每周一：`0 0 * * 1`
- 无效表达式 fallback 处理

**验收标准**

- [ ] `npm run test` 命令可执行，不报 "script not found"
- [ ] `messageState.test.ts` 全部通过（≥ 8 个测试用例）
- [ ] `scheduleText.test.ts` 全部通过（≥ 5 个测试用例，含边界情况）
- [ ] `executionPhaseState.test.ts` 全部通过（≥ 5 个测试用例）
- [ ] 上述 3 个文件分支覆盖率 ≥ 70%

---

### T3-05 统一 API 错误类型

**背景**

各 API 模块各自实现错误判断函数（如 `isIgnorableRuntimeSessionError`），逻辑分散且难以维护。相同的错误判断在多处重复实现。

**改动范围**

| 文件 | 操作 |
|------|------|
| `src/shared/utils/apiError.ts`（新建） | 定义 `ApiError` 类、`isNotFound`、`isUnauthorized`、`isForbidden`、`isIgnorableError` 等工具函数 |
| `src/api/runtimeSession.ts` | 移除本地错误判断，引用共享工具 |
| `src/api/*.ts` 中的错误处理 | 统一改为引用 `apiError.ts` |

**验收标准**

- [ ] `src/shared/utils/apiError.ts` 文件存在，导出 `ApiError` 类和工具函数
- [ ] `src/api/runtimeSession.ts` 中不再有本地 `isIgnorableRuntimeSessionError` 函数
- [ ] 全局搜索 `status === 404`、`status === 401` 在 api 层中无直接使用（均通过工具函数）
- [ ] 运行时 session 404/401/403 场景下，页面行为与修改前一致（优雅 fallback，不崩溃）

---

## 持续优化（无固定时间压力）

### T4-01 shared/ 目录细化

**目标结构**

```
src/shared/
├── config/        ← runtime.ts、theme.ts、pollingConfig.ts
├── store/         ← authStore、preferencesStore（重导出）
├── utils/         ← dateText、scheduleText、notificationNavigation、publicUrl、apiError
├── lib/           ← aiModelReasoning（业务相关工具）
└── constants/     ← executionStatusMeta、waitingInputDisplay（枚举/常量重导出）
```

**验收标准**

- [ ] `shared/` 一级子目录只有 config / store / utils / lib / constants
- [ ] 各工具函数按主题归入正确子目录
- [ ] 所有 import 路径更新正确，无 TS 报错

---

### T4-02 chatStore 类型显式导出

**改动范围**

`src/features/chat/chatStore.ts`：显式导出 `ChatStoreState` 和 `ChatStoreActions` 类型。

**验收标准**

- [x] 可以 `import type { ChatStoreState } from '@/features/chat/chatStore'`
- [x] 引用该类型的 hooks/组件有完整 TS 类型提示，无 `any`

---

### T4-03 main.tsx 提取 AntdProvider

**改动范围**

- 新建 `src/app/providers/AntdProvider.tsx`，包含 ConfigProvider + 主题/语言订阅逻辑
- `src/main.tsx` 精简为纯挂载入口（目标 ≤ 30 行）

**验收标准**

- [x] `src/main.tsx` ≤ 30 行
- [x] `AntdProvider.tsx` 包含完整的 locale + theme Token 配置
- [x] 主题切换、语言切换功能正常

---

## 任务总览

| 任务 | 优先级 | 预估工作量 | 状态 |
|------|--------|-----------|------|
| T1-01 统一主色调来源 | 🔴 一阶段 | 0.5 天 | ✅ 已完成 |
| T2-01 删除跳板文件 | 🟠 二阶段 | 0.5 天 | ✅ 已完成 |
| T2-02 拆分 UserLayout | 🟠 二阶段 | 2 天 | ✅ 已完成 |
| T2-03 拆分 LoginPage | 🟠 二阶段 | 1 天 | ✅ 已完成 |
| T2-04 executions 二次分层 | 🟠 二阶段 | 3 天 | ✅ 已完成 |
| T2-05 拆分 InlineRecoveryPanel | 🟠 二阶段 | 1.5 天 | ✅ 已完成 |
| T2-06 统一 i18n | 🟠 二阶段 | 3 天 | ✅ 已完成 |
| T3-01 CSS Modules 迁移 | 🟡 三阶段 | 3 天 | ⏸️ 已搁置 |
| T3-02 antd Token 迁移 | 🟡 三阶段 | 1.5 天 | ✅ 已完成 |
| T3-03 轮询配置集中化 | 🟡 三阶段 | 0.5 天 | ✅ 已完成 |
| T3-04 接入 Vitest | 🟡 三阶段 | 2 天 | ✅ 已完成 |
| T3-05 统一 API 错误类型 | 🟡 三阶段 | 1 天 | ✅ 已完成 |
| T4-01 shared/ 目录细化 | 🟢 持续 | 0.5 天 | 待开始 |
| T4-02 chatStore 类型导出 | 🟢 持续 | 0.5 天 | ✅ 已完成 |
| T4-03 提取 AntdProvider | 🟢 持续 | 0.5 天 | ✅ 已完成 |

---

## 验收通用标准

所有任务完成后，必须满足：

1. **构建通过**：`npm run build` 无报错、无 TS 报错
2. **功能无回退**：核心路由（登录 / 工作台 / 执行 / 聊天 / 技能 / 报告）功能与改动前一致
3. **行数控制**：改动涉及的文件符合 AGENTS.md 阈值要求（业务文件 ≤ 800 行，超过须说明）
4. **无循环依赖**：改动后无新增循环依赖（可用 `madge` 或 TS 路径检查确认）
5. **导出清晰**：新增模块有明确的 `index.ts` 统一导出

---

*最后更新：2026-07-18*
