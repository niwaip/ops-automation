# Portal 拆分迁移指南 v2：Admin + User-Core + User-Web

> **背景**：当前 `apps/frontend/portal` 同时承载管理后台和用户侧功能。随着用户侧需求扩展到 Web、移动端、桌面端和小程序，必须把“用户侧业务能力”从 `portal` 中拆出，形成可复用、可测试、可持续演进的核心层。

> **当前范围约束**：本轮只完整交付 `user-web`。移动端、桌面端、社交平台容器相关内容仅保留接口定义、适配器约定和脚手架级代码，不纳入完整业务页面与交互交付范围。这里的社交平台容器可以是 WeChat、LINE、LIFF、Telegram Mini App、Taro 宿主等，而不预先写死为某一个平台。

> **本版目标**：将原始“迁移清单”收敛为“可执行方案”。重点不是复制文件，而是先定义稳定边界，再做分阶段迁移。

---

## 一、目标与原则

### 目标

1. `portal` 收敛为纯管理后台（Admin Only）。
2. 新建 `user-web` 作为用户侧 Web 薄壳。
3. 新建 `packages/user-core` 作为用户侧平台无关核心层。
4. 后续移动端、桌面端、社交平台容器优先复用 `user-core`，而不是复用 `portal` 页面代码；但本轮仅保留这些平台的接口和脚手架，不交付完整功能。

### 核心原则

1. **先定义边界，再迁移代码**
   - 禁止把 `portal` 现有目录直接整体搬到 `user-core`。

2. **user-core 只承载平台无关能力**
   - 允许：API client、领域服务、纯数据计算、状态容器、类型、协议转换。
   - 禁止：React 组件、路由、DOM、浏览器存储直连、平台 UI 依赖。

3. **user-web 是薄壳，不是 portal 的克隆**
   - 不推荐 `cp -r apps/frontend/portal apps/frontend/user-web` 后再做减法。
   - 推荐新建 `user-web` 最小骨架，再按场景迁移功能。

4. **先抽纯逻辑，再抽复杂交互**
   - 第一批迁移纯函数、类型、API 层。
   - 最后处理含 JSX 的执行详情、聊天、通知等复杂链路。

---

## 二、目标架构

### 目录结构

```text
ops-automation/
├── packages/
│   ├── contracts/                # 已有：后端接口类型
│   └── user-core/                # 新建：用户侧平台无关核心
│
└── apps/
    └── frontend/
        ├── portal/               # 保留：管理后台
        └── user-web/             # 新建：用户侧 Web 壳
```

### 分层依赖

```text
┌─────────────────┐   ┌─────────────────────────────────────────────────┐
│  portal (admin) │   │          用户侧平台层（薄壳）                              │
│  仅 Admin 功能  │   │  user-web (Web) │ mobile (RN) │ desktop │ social-platform │
│  不依赖 user-core│   └────────────────┬────────────────────────────────┘
└─────────────────┘                    │ 依赖
         │                            ▼
         │                  ┌──────────────────┐
         │                  │  @ops/user-core  │
         │                  │  API │ State │    │
         │                  │  Domain │ Ports  │
         └──────────────────┴──────┬───────────┘
                  共同依赖          │ 依赖
                                   ▼
                          ┌──────────────────┐
                          │ @ops/contracts   │
                          │ 后端接口类型      │
                          └──────────────────┘
```

> **注意**：`portal` 作为纯管理后台，目标状态下**不依赖 `user-core`**。`user-core` 只被用户侧各平台消费；迁移过程中允许短期并存，但最终应移除 `portal -> user-core` 依赖。
>
> **交付边界**：本轮实际落地平台只有 `user-web`。`mobile`、`desktop`、`social-platform` 在本图中表示未来接入方向，当前只保留消费 `user-core` 的接口和脚手架设计。

### user-core 的真实定位

`user-core` 不是“用户侧所有代码的大杂烩”，而是以下三类能力的组合：

1. **API 层**
   - HTTP client
   - DTO 请求与响应封装
   - 服务端协议适配

2. **Domain 层**
   - 执行、聊天、报告、通知等业务规则
   - 纯数据转换
   - 展示模型生成

3. **Ports / Adapters 层**
   - 存储、i18n、socket、时间、环境读取等能力的抽象接口
   - 平台通过注入方式接入

---

## 三、功能归属划分

### 留在 `portal`（管理后台）

| 功能 | 路由 | 说明 |
|---|---|---|
| 用户管理 | `/admin/users` | 管理员专属 |
| AI 模型配置 | `/admin/models` | 管理员专属 |
| 技能管理 | `/admin/skills` | 管理员专属 |
| 系统工具管理 | `/admin/tools` | 管理员专属 |
| Temporal 工作流 | `/admin/temporal` | 系统级别 |
| 能力发布中心 | `/admin/capabilities` | 管理员专属 |
| 执行流配置 | `/admin/flows` | 管理员专属 |
| 工作单元 | `/admin/activities` | 管理员专属 |
| Prompt 调试台 | `/admin/prompt-debug` | 管理员专属 |
| 录制器 | `/recorder` | 管理工具 |
| 浏览器模板管理 | `/templates` | 管理工具 |
| Carbone 模板管理 | `/carbone-templates` | 管理编辑，用户侧只读或间接使用 |

### 迁移到 `user-web`（用户侧 Web）

| 功能 | 路由 | 说明 |
|---|---|---|
| 执行列表 | `/executions` | 核心用户功能 |
| 创建执行 | `/executions/new` | 核心用户功能 |
| 执行详情 | `/executions/:id` | 核心用户功能 |
| AI 对话 | `chat/` | 核心用户功能 |
| 报告列表/详情 | `/reports/**` | 核心用户功能 |
| 仪表盘 | `/dashboard` | 简化版保留 |
| 已发布技能 | `/published-skills` | 用户查看 |
| 执行通知中心 | `notifications/` | 跟随用户功能 |

### 迁移到 `packages/user-core`（核心层）

| 类型 | 当前来源 | 目标位置 |
|---|---|---|
| API client | `src/shared/api/http/client.ts` | `user-core/api/client.ts` |
| 执行 / 会话 / 报告 / 技能 API | `src/api/*.ts` | `user-core/api/*.ts` |
| 聊天 API | `src/features/chat/chatApi.ts` | `user-core/api/chat.api.ts` |
| 状态元数据与纯工具 | `src/shared/lib/*.ts` | `user-core/lib/*` |
| 执行领域纯逻辑（见下表） | `src/features/executions/lib/` | `user-core/domain/executions/*` |
| 类型定义 | `src/features/**/types.ts`、`src/shared/**/types.ts` | `user-core/types/*` |
| 状态容器 | 现有 store 中与 UI 无关部分 | `user-core/state/*` |
| 通知规则 | `src/shared/notifications/*` 中纯规则部分 | `user-core/domain/notifications/*` |

**`executions/lib/` 文件明细**（需区分处理方式）：

| 文件 | 是否含 JSX | 处理方式 |
|---|:---:|---|
| `artifacts.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `browser.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `common.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `listHelpers.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `listView.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `phase.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `runtimeSession.ts` | ❌ | ✅ 直接迁入 `user-core` |
| `detailView.tsx` | ✅ | ⚠️ 拆分：数据建模部分迁 `user-core`，JSX 留 `user-web` |
| `inputFields.tsx` | ✅ | ⚠️ 拆分：字段定义迁 `user-core`，渲染留 `user-web` |
| `json.tsx` | ✅ | ⚠️ 拆分：JSON 解析逻辑迁 `user-core`，展示留 `user-web` |

> 注意：现有 store、通知、聊天逻辑不能机械复制，必须先剥离其中的 React、i18n、storage、router、socket 依赖。

---

## 四、硬边界定义

### user-core 允许做的事

```text
✅ HTTP API 封装
✅ DTO -> Domain Model -> View Model 转换
✅ 平台无关状态容器
✅ 纯 TypeScript 工具函数
✅ 业务规则、状态机、通知归并逻辑
✅ 类型定义、错误定义、领域常量
✅ 通过接口注入 storage / i18n / socket / clock / env
```

### user-core 禁止做的事

```text
❌ React 组件
❌ JSX / TSX
❌ Ant Design / 任何 UI 组件库
❌ react-router / 路由跳转
❌ 直接操作 DOM / window / document
❌ 直接调用 localStorage / sessionStorage
❌ 直接读取 import.meta.env
❌ 直接管理页面生命周期（useEffect / useLayoutEffect）
```

### 禁止出现的 import

```ts
import React from 'react';                  // ❌
import { JSX } from 'react';                // ❌
import { Button } from 'antd';              // ❌
import { useNavigate } from 'react-router-dom'; // ❌
```

### 推荐的适配器接口

```ts
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface I18nPort {
  changeLanguage(language: string): Promise<void> | void;
}

export interface RuntimeConfigPort {
  apiBaseUrl: string;
  websocketBaseUrl?: string;
}
```

---

## 五、推荐目录结构

## `packages/user-core`

```text
packages/user-core/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── index.ts
│   ├── api/
│   │   ├── index.ts
│   │   ├── client.ts
│   │   ├── auth.api.ts
│   │   ├── execution.api.ts
│   │   ├── report.api.ts
│   │   ├── session.api.ts
│   │   ├── skill.api.ts
│   │   ├── streaming.api.ts
│   │   └── chat.api.ts
│   ├── domain/
│   │   ├── executions/
│   │   ├── chat/
│   │   ├── reports/
│   │   └── notifications/
│   ├── state/
│   │   ├── auth.state.ts
│   │   ├── chat.state.ts
│   │   └── notification.state.ts
│   ├── ports/
│   │   ├── storage.port.ts
│   │   ├── i18n.port.ts
│   │   ├── socket.port.ts
│   │   └── runtime.port.ts
│   ├── lib/
│   │   ├── executionStatusMeta.ts
│   │   ├── runtime.ts
│   │   ├── waitingInputDisplay.ts
│   │   └── publicUrl.ts
│   └── types/
│       ├── chat.types.ts
│       ├── execution.types.ts
│       └── notification.types.ts
└── dist/
```

### 状态层建议

`user-core` 中的状态容器必须使用 `zustand` 的 **vanilla store**，而不是 React hooks 版本：

```ts
// ✅ user-core 内使用（无 React 依赖）
import { createStore } from 'zustand/vanilla';

export const authStore = createStore<AuthState>()((set) => ({
  accessToken: null,
  // ...
}));

// ✅ user-web 中使用（React 层包装）
import { useStore } from 'zustand';
import { authStore } from '@ops/user-core/state';

export const useAuthStore = () => useStore(authStore);

// ❌ 禁止在 user-core 中出现
import { create } from 'zustand'; // create() 返回的是 React Hook
```

- React hook 包装（`useStore`）留在 `user-web`
- 各平台（RN / Taro）使用各自的绑定方式订阅同一个 vanilla store

### `package.json` 建议

```json
{
  "name": "@ops/user-core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./api": "./dist/api/index.js",
    "./domain": "./dist/domain/index.js",
    "./state": "./dist/state/index.js",
    "./ports": "./dist/ports/index.js",
    "./lib": "./dist/lib/index.js",
    "./types": "./dist/types/index.js"
  },
  "dependencies": {
    "@ops/contracts": "workspace:*",
    "axios": "^1.6.2",
    "zustand": "^4.4.7"
  },
  "peerDependencies": {
    "typescript": "^5.3.3"
  }
}
```

### 工程化要求

1. 使用 workspace 依赖，不长期使用 `file:../../../...`
2. `exports` 指向 `dist` 编译产物，而不是 `.ts` 源文件
3. `user-core` 必须可独立构建和 `tsc --noEmit`
4. `user-core` 增加 lint 规则，直接禁止 UI / React / router 依赖

## `apps/frontend/user-web`

```text
apps/frontend/user-web/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx
    │   ├── layouts/
    │   │   └── UserLayout.tsx
    │   └── router/
    │       └── routes.tsx
    ├── features/
    │   ├── executions/
    │   ├── chat/
    │   ├── reports/
    │   ├── dashboard/
    │   ├── skills/
    │   └── auth/
    ├── adapters/
    │   ├── storage/
    │   ├── i18n/
    │   └── socket/
    └── shared/
        └── hooks/
```

### user-web 的职责

1. 渲染页面和组件
2. 绑定路由
3. 注入平台适配器
4. 组合 React Query、React hooks、UI 反馈
5. 从 `user-core` 获取业务能力，而不是把业务能力重新写一遍

### 非 Web 端当前范围

本轮对以下平台只做“可接入准备”，不做完整产品化交付：

1. mobile / React Native
2. desktop / Electron
3. social-platform（WeChat / LINE / LIFF / Taro / Telegram Mini App 等）

允许产出：

- 目录骨架
- 适配器接口
- 初始化工程
- 示例页面或占位页
- 与 `user-core` 的最小接线示例

不纳入本轮范围：

- 完整页面迁移
- 完整交互闭环
- 多端 UI 适配
- 多端测试与发布流程

---

## 六、迁移前必须确认的决策

> 以下事项必须先定，再开始大规模迁移。

### 1. `portal` 用户路由如何处置

二选一：

- **方案 A：保留跳转壳**
  - `portal` 保留少量旧路由
  - 统一跳转到 `user-web`
  - 适合平滑迁移

- **方案 B：彻底移除**
  - `portal` 只保留管理后台
  - 用户侧全部走 `user-web`
  - 适合架构最干净的长期方案

### 2. 登录态共享方式

需要明确：

- 是否同域
- 是否共享 cookie
- 是否需要 portal 与 user-web 单点登录

### 3. 通知 / WebSocket 生命周期归属

- 连接建立与断开由平台层负责
- 事件解析、状态归并、未读数计算由 `user-core` 负责

### 4. i18n 归属

- `user-core` 只接受 `I18nPort`
- 各平台自行决定使用 `react-i18next`、原生 i18n 或其他方案

### 5. 执行详情中的 JSX 逻辑拆分方式

以下文件不能直接迁入 `user-core`：

- `detailView.tsx`
- `inputFields.tsx`
- `json.tsx`

必须先拆成两层：

1. 纯数据建模层：进入 `user-core`
2. JSX 渲染层：留在 `user-web`

---

## 七、分阶段迁移策略

## Phase 0：加约束，不迁业务

目标：先建立边界，避免后续越迁越乱。

动作：

1. 创建 `packages/user-core` 基础骨架
2. 配置 workspace、tsconfig、build、lint、exports
3. 增加规则：
   - 禁止 `react`
   - 禁止 `antd`
   - 禁止 `react-router-dom`
   - 禁止 `.tsx`

验收：

- `packages/user-core` 可独立构建
- CI 可校验边界

## Phase 1：迁移纯基础层

目标：先抽无争议的纯逻辑与协议层。

优先迁移：

1. `runtime` 配置 schema
2. HTTP client
3. `auth.api.ts`
4. `execution.api.ts`
5. `report.api.ts`
6. `session.api.ts`
7. `skill.api.ts`
8. 纯工具函数和纯类型

注意：

- 这一步不迁页面
- 不迁 JSX
- 不迁 React hooks

## Phase 2：迁移领域逻辑

目标：抽出执行、报告、聊天等可复用业务规则。

动作：

1. 把执行列表和执行详情中的纯计算部分抽成 domain helpers
2. 定义 DTO -> View Model 的转换函数
3. 拆分通知规则与未读数逻辑

注意：

- 只迁“数据建模”和“业务判断”
- UI 交互、组件拆分继续留在 `portal`

## Phase 3：建立 `user-web` 最小骨架

目标：不要复制 `portal`，而是建立最小可运行用户壳。

只实现三条主链路：

1. 登录
2. 执行列表
3. 执行详情

不建议做法：

```bash
cp -r apps/frontend/portal apps/frontend/user-web
```

推荐做法：

1. 新建 `user-web`
2. 接入最小路由和布局
3. 逐页从 `portal` 迁 UI
4. 所有业务依赖从 `@ops/user-core` 引入

## Phase 4：迁移聊天、报告、通知

目标：补齐用户主链路。

顺序建议：

1. 报告
2. 聊天
3. 通知
4. 已发布技能
5. 仪表盘

## Phase 5：清理 portal 的用户侧代码

目标：真正把管理后台和用户侧分开。

动作：

1. 删除或跳转旧用户路由
2. 清理重复 API
3. 清理重复 store
4. 清理不再使用的 features

---

## 八、关键拆分示例

### 1. i18n 改造

改造前：

```ts
import i18n from '@/shared/i18n';

setLanguage: (language) => {
  i18n.changeLanguage(language);
  set({ language });
}
```

改造后：

```ts
import type { I18nPort } from '../ports/i18n.port';

setLanguage: async (language: string, i18n?: I18nPort) => {
  await i18n?.changeLanguage(language);
  setState({ language });
}
```

### 2. 浏览器存储改造

改造前：

```ts
const token = localStorage.getItem('token');
```

改造后：

```ts
const token = storagePort.getItem('token');
```

### 3. 执行详情拆分

改造前：

```tsx
export function renderTimelineNode(execution: ExecutionDto) {
  return <Card>{execution.name}</Card>;
}
```

改造后：

```ts
export function buildTimelineNodeViewModel(execution: ExecutionDto) {
  return {
    title: execution.name,
    status: execution.status
  };
}
```

`user-web` 再负责：

```tsx
export function TimelineNodeCard({ model }: { model: TimelineNodeViewModel }) {
  return <Card>{model.title}</Card>;
}
```

---

## 九、多端扩展建议

> 范围说明：本章节用于约束未来扩展方向。当前迭代只要求保留接口、适配器和脚手架级能力，不要求同时落地移动端、桌面端和社交平台容器的完整业务实现。

### 移动端 / 社交平台容器 / Electron 的复用原则

复用顺序应为：

1. `contracts`
2. `user-core`
3. 平台适配器
4. 各端自己的 UI

不推荐直接复用：

- `portal` 页面
- `user-web` 组件
- Web 专属 hooks

### 当前迭代对多端的最低交付要求

| 平台 | 当前要求 | 不要求 |
|---|---|---|
| React Native / App | 目录脚手架、adapter 接口、最小接线示例 | 完整业务页面与发布 |
| Electron / Desktop | renderer 侧骨架、`user-core` 接入示例 | 完整桌面端功能与打包 |
| social-platform | 宿主接入骨架、adapter 接口、最小 API / state 示例 | 完整社交平台页面、宿主适配细节与上线流程 |

### 建议保留的最小目录

```text
apps/
├── mobile/
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── src/
│       ├── app/
│       │   └── App.tsx
│       ├── adapters/
│       │   ├── storage/
│       │   ├── i18n/
│       │   └── runtime/
│       └── examples/
│           └── execution-list.example.tsx
│
├── desktop/
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── src/
│       └── renderer/
│           ├── main.tsx
│           ├── adapters/
│           └── examples/
│               └── execution-list.example.tsx
│
└── social-platform/
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    └── src/
        ├── bootstrap.ts
        ├── adapters/
        ├── hosts/
        │   ├── wechat/
        │   ├── line/
        │   └── generic/
        └── examples/
            └── execution-list.example.tsx
```

### 各端最小文件清单

| 平台 | 必须保留的文件 | 作用 |
|---|---|---|
| mobile | `package.json`、`tsconfig.json`、`README.md`、`src/app/App.tsx` | 说明工程可启动与后续接入点 |
| mobile | `src/adapters/*` | 对接 storage / i18n / runtime |
| mobile | `src/examples/execution-list.example.tsx` | 演示如何消费 `user-core` |
| desktop | `src/renderer/main.tsx` | 仅保留 renderer 入口骨架 |
| desktop | `src/renderer/adapters/*` | Electron renderer 侧适配器占位 |
| desktop | `src/renderer/examples/*` | 最小接线示例 |
| social-platform | `src/bootstrap.ts` | 社交平台宿主入口占位 |
| social-platform | `src/adapters/*` | 平台适配器占位 |
| social-platform | `src/hosts/*` | 宿主差异占位，如 WeChat / LINE / generic |
| social-platform | `src/examples/execution-list.example.tsx` | 最小页面或接线示例 |

### 示例代码允许做到什么程度

允许：

1. 初始化工程入口
2. 创建 adapter 占位实现
3. 从 `@ops/user-core` 导入 API、state、types
4. 写一个最小示例页，证明调用链可以接通
5. 在 README 中记录如何接入 `user-core`

不建议：

1. 复制 `user-web` 页面到其他端
2. 构建完整导航体系
3. 设计完整 UI 组件库
4. 打通完整登录态与业务闭环
5. 补齐多端测试、打包和发布流程

### 示例代码建议形式

推荐每个端最多保留 1 到 2 个示例文件，例如：

- 一个 API 调用示例
- 一个 state 订阅示例

示例目标应仅限于说明：

1. 如何注入 runtime / storage / i18n adapter
2. 如何消费 `user-core` 的 API
3. 如何订阅 `user-core` 的 vanilla store

### 一个简单判断标准

如果某段代码里出现以下内容，就不应进入 `user-core`：

- JSX
- `useEffect`
- `window`
- `document`
- `localStorage`
- `antd`
- `react-router-dom`

---

## 十、验收清单

### 边界验收

- [ ] `packages/user-core` 内无 `.tsx` 文件
- [ ] `packages/user-core` 内无 `react`、`antd`、`react-router-dom` 依赖
- [ ] `packages/user-core` 内无 `window`、`document`、`localStorage` 直接引用
- [ ] `packages/user-core` 可独立 `tsc --noEmit`
- [ ] `packages/user-core` 的 `exports` 指向 `dist` 产物

### 功能验收

- [ ] `apps/frontend/user-web` 能独立启动
- [ ] 登录、执行列表、执行详情可用
- [ ] 聊天、报告、通知链路迁移后可用
- [ ] `portal` 删除用户侧主链路后仍可正常启动

### 代码收敛验收

- [ ] `portal` 与 `user-web` 不再各自维护重复 API
- [ ] `portal` 与 `user-web` 不再各自维护重复 auth state
- [ ] 用户侧业务规则集中在 `user-core`

---

## 十一、执行建议

### 推荐执行顺序

1. 先做 `Phase 0`
2. 再做 `Phase 1`
3. 以“执行列表 + 执行详情”作为 `user-web` 首个里程碑
4. 成功后再迁聊天与通知
5. 最后清理 `portal`

### 不推荐的执行方式

1. 先复制整个 `portal`
2. 同时迁移所有用户功能
3. 未定义边界就把 store 和页面直接搬到 `user-core`

---

## 十二、一句话结论

这次拆分的关键不是“把用户代码从 `portal` 挪出去”，而是“建立一个真正平台无关、可长期复用的用户核心层”。只要先把边界、适配器和工程化出口写死，这次拆分就能成为后续多端扩展的基础设施，而不是一次性重命名工程。

---

## 十三、任务拆解

> 目标：把本方案拆成可以进入迭代排期和实际指派的任务项。

### A. 架构与决策任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| A1 | 确认 `portal` 用户路由处置方案 | 选定方案 A 或 B，形成结论记录 | P0 |
| A2 | 确认登录态共享方案 | 同域 / 跨域 / Cookie / Token 策略说明 | P0 |
| A3 | 确认通知与 WebSocket 生命周期归属 | `user-core` 与平台层职责边界说明 | P0 |
| A4 | 确认 i18n 注入方案 | `I18nPort` 接口和调用约定 | P0 |
| A5 | 确认执行详情 JSX 拆分边界 | 数据建模层与 UI 渲染层拆分清单 | P0 |

### B. `user-core` 基础设施任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| B1 | 创建 `packages/user-core` 目录骨架 | `src/api`、`src/domain`、`src/state`、`src/ports` 等目录 | P0 |
| B2 | 配置 workspace 依赖 | 根工作区可识别 `@ops/user-core` | P0 |
| B3 | 配置 `tsconfig` / `tsconfig.build.json` | `user-core` 可独立编译 | P0 |
| B4 | 配置 `package.json` 导出 | `exports` 指向 `dist` | P0 |
| B5 | 增加 lint / CI 边界规则 | 禁止 React / antd / router / `.tsx` | P0 |
| B6 | 定义 ports 接口 | `StoragePort`、`I18nPort`、`SocketPort`、`RuntimeConfigPort` | P0 |

### C. Phase 1 纯基础层迁移任务

| 编号 | 任务 | 来源 | 目标 | 优先级 |
|---|---|---|---|---|
| C1 | 迁移 runtime 配置 schema 与 normalize 逻辑 | `src/shared/config/runtime.ts` | `user-core/lib/runtime.ts` + `user-core/ports/runtime.port.ts` | P1 |
| C2 | 迁移 HTTP client | `src/shared/api/http/client.ts` | `user-core/api/client.ts` | P1 |
| C3 | 迁移认证 API | `src/api/auth.ts` | `user-core/api/auth.api.ts` | P1 |
| C4 | 迁移执行 API | `src/api/execution.ts` | `user-core/api/execution.api.ts` | P1 |
| C5 | 迁移报告 API | `src/api/report.ts` | `user-core/api/report.api.ts` | P1 |
| C6 | 迁移会话 API | `src/api/session.ts` | `user-core/api/session.api.ts` | P1 |
| C7 | 迁移技能 API | `src/api/skill.ts` | `user-core/api/skill.api.ts` | P1 |
| C8 | 迁移 streaming API | `src/api/streaming.ts` | `user-core/api/streaming.api.ts` | P1 |
| C9 | 迁移聊天 API | `src/features/chat/chatApi.ts` | `user-core/api/chat.api.ts` | P1 |
| C10 | 迁移纯类型 | `src/features/**/types.ts` | `user-core/types/*` | P1 |
| C11 | 迁移纯工具函数 | `src/shared/lib/*.ts` | `user-core/lib/*` | P1 |

### D. Phase 2 领域逻辑拆分任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| D1 | 梳理执行列表纯逻辑 | `domain/executions/list*` | P1 |
| D2 | 梳理执行详情纯逻辑 | DTO -> View Model 转换函数 | P1 |
| D3 | 拆分执行详情 JSX 依赖 | `detailView.tsx` 的纯数据部分清单 | P1 |
| D4 | 梳理聊天领域逻辑 | `domain/chat/*` | P2 |
| D5 | 梳理通知规则 | `domain/notifications/*` | P1 |
| D6 | 重构状态容器 | `state/auth.state.ts`、`state/chat.state.ts` 等 | P1 |
| D7 | 清理平台耦合 | 去除 i18n、storage、router、socket 直连 | P1 |

### E. `user-web` 建设任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| E1 | 新建 `apps/frontend/user-web` 最小骨架 | `main.tsx`、`App.tsx`、基础路由 | P1 |
| E2 | 构建 `UserLayout` | 统一布局与导航 | P1 |
| E3 | 接入适配器层 | storage / i18n / socket 注入实现 | P1 |
| E4 | 接入登录页 | `LoginPage` 可用 | P1 |
| E5 | 接入执行列表页 | 页面基于 `@ops/user-core` 运行 | P1 |
| E6 | 接入执行详情页 | 页面基于 View Model 渲染 | P1 |
| E7 | 接入报告页 | 最小报告链路可用 | P2 |
| E8 | 接入聊天页 | 最小聊天链路可用 | P2 |
| E9 | 接入通知中心 | 通知展示与未读数可用 | P2 |

### F. `portal` 收敛任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| F1 | 标记用户侧旧路由 | 待跳转 / 待删除清单 | P1 |
| F2 | 实施跳转或删除 | `portal` 仅保留管理后台能力 | P2 |
| F3 | 清理历史用户侧 API | `portal` 仅保留 Admin API，移除用户侧重复 API | P2 |
| F4 | 清理重复状态 | `portal` 不再维护重复 auth / notification 逻辑 | P2 |
| F5 | 清理用户侧遗留 features | 删除不再使用的代码 | P2 |

### G. 验证与验收任务

| 编号 | 任务 | 输出物 | 优先级 |
|---|---|---|---|
| G1 | `user-core` 类型检查 | `tsc --noEmit` 通过 | P0 |
| G2 | `user-core` 边界扫描 | 无 React / antd / router / `.tsx` | P0 |
| G3 | `user-web` 启动验证 | 本地 dev 可启动 | P1 |
| G4 | 用户主链路回归 | 登录、执行列表、执行详情通过 | P1 |
| G5 | 聊天 / 报告 / 通知回归 | 主链路通过 | P2 |
| G6 | `portal` 管理后台回归 | Admin 功能不受影响 | P1 |

### 建议迭代切分

#### Sprint 1：架构决策（纯讨论/对齐，无代码）

包含任务：

- A1（portal 用户路由处置）
- A2（登录态共享方案）
- A3（通知 / WebSocket 归属）
- A4（i18n 注入方案）
- A5（执行详情 JSX 拆分边界）

交付目标：

- 5 个关键决策全部以文字形式落定
- 不产生代码，但后续所有 Sprint 不再因决策不清楚返工

> ⚠️ A 类任务必须在 B 类任务开始之前完成，否则工程化配置可能需要推倒重来

#### Sprint 2：user-core 基础设施

包含任务：

- B1（目录骨架）
- B2（workspace 依赖）
- B3（tsconfig）
- B4（exports 配置）
- B5（lint 边界规则）
- B6（ports 接口定义）
- G1（tsc 校验通过）
- G2（边界扫描通过）

交付目标：

- `user-core` 骨架完成，工程边界生效
- CI 可自动校验边界约束

#### Sprint 3：纯基础层迁移

包含任务：

- C1
- C2
- C3
- C4
- C5
- C6
- C7
- C8
- C9
- C10
- C11

交付目标：

- API、类型、工具层可从 `@ops/user-core` 导出
- `user-core` 可独立导出 API、类型与工具层，供 `user-web` 优先接入

#### Sprint 4：执行链路最小闭环

包含任务：

- D1
- D2
- D3
- D6
- D7
- E1
- E2
- E3
- E4
- E5
- E6
- G3
- G4

交付目标：

- `user-web` 首次可运行
- 登录、执行列表、执行详情形成最小闭环

#### Sprint 5：补齐用户侧主链路

包含任务：

- D4
- D5
- E7
- E8
- E9
- G5

交付目标：

- 报告、聊天、通知迁移完成
- 用户侧主流程基本独立于 `portal`

#### Sprint 6：portal 收敛与清理

包含任务：

- F1
- F2
- F3
- F4
- F5
- G6

交付目标：

- `portal` 收敛为管理后台
- 用户侧代码不再与 `portal` 长期混生

#### 后续 Backlog：多端脚手架

说明：

- 不进入当前主交付链路
- 只保留接口和脚手架级任务

建议任务：

- 创建 `apps/mobile` 骨架并接入 `user-core` 示例
- 创建 `apps/desktop` renderer 骨架并接入 `user-core` 示例
- 创建 `apps/social-platform` 骨架并接入状态订阅示例
- 为各端补最小 README 与 adapter 接入说明

Backlog 验收标准：

- 目录结构存在
- 入口文件存在
- adapter 占位存在
- 至少一个示例文件可展示 `user-core` 的接入方式
- README 说明清楚“当前仅为脚手架，不是完整应用”

### 首批建议立即执行的任务

如果现在就开始做，建议按下面顺序开工：

1. A1-A5：先把关键决策定掉
2. B1-B6：建立 `user-core` 基础设施
3. C2-C11：先迁 HTTP client、API、类型、工具函数
4. E1-E6：做 `user-web` 最小闭环
5. D1-D3：再持续拆执行详情中的纯逻辑
