# 企业级 Skill 平台 Recorder + Playwright CLI 实施 Backlog

**Recorder Playwright CLI Implementation Backlog v4.0**  
日期：2026-05-05

> 本文将 `Recorder + Playwright CLI 改造设计稿` 下沉为可执行任务清单。  
> 目标是让团队能够按阶段推进 `/recorder` 的演进，在不破坏现有手动录制与 AI 能力的前提下，引入 `CLI` 模式，并为未来的 `MCP` 模式预留标准适配位。

---

## 1. Backlog 目标

本 backlog 聚焦以下目标：

- 在现有录制器中追加“执行后端”维度，而非直接推翻现有模式
- 将交互模式与执行后端解耦，支持 `手动`、`AI` 与 `Legacy`、`CLI`、`MCP`
- 先优先落地 `AI + CLI`
- 统一浏览器步骤中间层，为脚本导出和模板导出打基础
- 让 `browser-worker` 成为统一浏览器 Runtime Adapter 层

---

## 2. 模式模型

## 2.1 推荐产品模型

录制器不建议只有一个“模式”枚举，而建议拆成两个维度：

### 交互模式

- `manual`
- `ai`

### 执行后端

- `legacy`
- `cli`
- `mcp`

### 推荐默认组合

- `manual + legacy`
- `ai + cli`

### 后续支持组合

- `ai + legacy`
- `ai + mcp`
- `manual + cli`

---

## 2.2 为什么这样拆

- `手动 / AI` 决定用户如何发起浏览器行为
- `Legacy / CLI / MCP` 决定浏览器行为由什么运行时执行
- 前端可复用同一套页面与结果展示
- 后端可复用同一套 Runtime 接口与结果 DTO
- 支持灰度切换和 A/B 对比

---

## 3. 实施原则

### 3.1 先加模式，不先删旧能力

- 先把 `CLI` 作为新后端接入
- 保留当前 `Legacy` 方案作为回退路径
- 暂不移除 `codegen-api.py`

### 3.2 先打通 AI，再统一手动录制

- 第一优先级是 `AI + CLI`
- 手动录制器继续可用
- 手动录制的统一收敛放在第二阶段

### 3.3 先统一中间层，再统一产物

- 先统一 `BrowserActionStep`
- 再统一导出 Playwright 脚本与平台模板

### 3.4 MCP 预留接口，但不首期强推

- 本期为 `McpBrowserAdapter` 预留标准接口
- 不将 `MCP` 作为首个落地后端
- 首期以后端稳定性和会话保持为优先

---

## 4. 接口草案

## 4.1 前端 Recorder 视图模型

```ts
type RecorderInteractionMode = 'manual' | 'ai';
type RecorderExecutionBackend = 'legacy' | 'cli' | 'mcp';

interface RecorderViewState {
  interactionMode: RecorderInteractionMode;
  executionBackend: RecorderExecutionBackend;
  runtimeSessionId: string;
  browserStatus:
    | 'idle'
    | 'connecting'
    | 'ready'
    | 'recording'
    | 'executing'
    | 'paused'
    | 'frozen'
    | 'closed'
    | 'error';
  currentUrl?: string;
  browserSessionId?: string;
}
```

### 说明

- `interactionMode` 控制页面 UI 与交互方式
- `executionBackend` 控制动作发往哪个后端
- `runtimeSessionId` 作为整个录制页的核心会话标识

---

## 4.2 统一步骤中间层

```ts
interface BrowserActionStep {
  id: string;
  source: 'ai' | 'manual' | 'imported';
  backend: 'legacy' | 'cli' | 'mcp';
  action: string;
  locator?: {
    type: 'css' | 'text' | 'role' | 'ref';
    value: string;
  };
  params?: Record<string, unknown>;
  status?: 'pending' | 'success' | 'error';
  snapshotId?: string | null;
  artifacts?: Array<{
    type: 'screenshot' | 'html' | 'text' | 'script';
    ref: string;
  }>;
  replayable?: boolean;
  replaceableParams?: string[];
  timestamp: number;
}
```

### 说明

- 所有 AI 执行结果最终都要沉淀为 `BrowserActionStep`
- 手动录制结束后解析脚本，也要映射为 `BrowserActionStep`
- 导出 Playwright 脚本和平台模板都从此模型生成

---

## 4.3 `browser-worker` 适配接口

```ts
type BrowserExecutionBackend = 'legacy' | 'cli' | 'mcp';

interface InitBrowserSessionInput {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  mode: 'manual' | 'ai';
  initialUrl?: string;
  keepAlive?: boolean;
  metadata?: Record<string, unknown>;
}

interface ExecuteBrowserCommandInput {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  commands: Array<{
    action: string;
    locator?: {
      type: 'css' | 'text' | 'role' | 'ref';
      value: string;
    };
    params?: Record<string, unknown>;
  }>;
}

interface BrowserCommandResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'takeover_required';
  currentUrl?: string;
  outputs?: Record<string, unknown>;
  steps?: BrowserActionStep[];
  errorCode?: string;
  errorMessage?: string;
}

interface BrowserExecutionAdapter {
  name: BrowserExecutionBackend;
  initSession(input: InitBrowserSessionInput): Promise<{
    runtimeSessionId: string;
    browserSessionId: string;
    status: 'ready' | 'recording';
    currentUrl?: string;
  }>;
  execute(input: ExecuteBrowserCommandInput): Promise<BrowserCommandResult>;
  resetSession(runtimeSessionId: string): Promise<void>;
  closeSession(runtimeSessionId: string): Promise<void>;
  freezeSession?(runtimeSessionId: string, reason?: string): Promise<void>;
  resumeSession?(runtimeSessionId: string): Promise<void>;
}
```

---

## 4.4 `browser-worker` API 草案

### `POST /browser/init`

```json
{
  "runtimeSessionId": "recorder-123",
  "backend": "cli",
  "mode": "ai",
  "initialUrl": "about:blank",
  "keepAlive": true
}
```

### `POST /browser/execute`

```json
{
  "runtimeSessionId": "recorder-123",
  "backend": "cli",
  "commands": [
    {
      "action": "navigate",
      "params": {
        "url": "https://www.baidu.com"
      }
    }
  ]
}
```

### `POST /browser/export-script`

```json
{
  "runtimeSessionId": "recorder-123",
  "target": "playwright",
  "parameterize": true
}
```

### `POST /browser/export-template`

```json
{
  "runtimeSessionId": "recorder-123",
  "name": "百度搜索模版",
  "parameterize": true
}
```

---

## 5. 分阶段任务

## 5.1 Phase 0: 契约冻结与页面模式改造

目标：

- 在不改变默认行为的前提下，为录制器增加“执行后端”概念

### Portal

- [ ] 为 `/recorder` 引入 `interactionMode` 与 `executionBackend` 双状态
- [ ] 在 `AIControls` 中新增“执行后端”切换 UI
- [ ] 默认保持 `manual + legacy`
- [ ] 默认 AI 推荐 `ai + cli`，但在首阶段可通过 Feature Flag 隐藏

### Browser Worker

- [ ] 定义 `BrowserExecutionAdapter` 接口
- [ ] 将现有逻辑封装为 `LegacyCodegenAdapter`
- [ ] 为所有浏览器 API 增加 `runtimeSessionId`
- [ ] 为所有浏览器 API 增加 `backend`

### 文档 / 测试

- [ ] 更新 API 文档与类型定义
- [ ] 增加基础单元测试，确保 `backend=legacy` 时行为不变

### 验收标准

- [ ] 不开启新后端时，现有手动录制和 AI 执行行为不回归
- [ ] 前端可切换 `executionBackend`，但旧逻辑仍保持默认

---

## 5.2 Phase 1: 多 Session 改造

目标：

- 将 `browser-worker` 从单实例浏览器状态机升级为多 session 管理器

### Browser Worker

- [ ] 将 `BrowserService` 中单 `session` 改为 `Map<runtimeSessionId, BrowserRuntimeSession>`
- [ ] 新增 `browser-session.registry.ts`
- [ ] 定义 session 生命周期：`ready -> executing -> frozen -> closed`
- [ ] 支持按 `runtimeSessionId` 关闭、重置、恢复

### Portal

- [ ] 页面初始化时生成 `runtimeSessionId`
- [ ] 将 `runtimeSessionId` 透传给所有 `/browser/*` 接口
- [ ] 展示当前 session 状态、URL、后端类型

### 验收标准

- [ ] 两个不同录制页页签可同时持有不同 session
- [ ] 一个 session 的动作不会覆盖另一个 session

---

## 5.3 Phase 2: 引入 `PlaywrightCliAdapter`

目标：

- 先落地 `AI + CLI`，获得更稳定的浏览器调用与会话保持能力

### Docker / Runtime

- [ ] 在浏览器执行环境安装 `@playwright/cli`
- [ ] 验证 CLI 在容器内的会话保持能力
- [ ] 增加环境变量：
  - [ ] `BROWSER_EXECUTION_BACKEND`
  - [ ] `PLAYWRIGHT_CLI_SESSION_PREFIX`
  - [ ] `PLAYWRIGHT_CLI_PERSISTENT`
  - [ ] `PLAYWRIGHT_CLI_HEADED`

### Browser Worker

- [ ] 实现 `PlaywrightCliAdapter`
- [ ] 支持 `open/goto/click/fill/type/hover/scroll/wait/screenshot`
- [ ] 统一将 CLI 输出转换为 `BrowserCommandResult`
- [ ] 支持基于 `runtimeSessionId` 复用 CLI Session

### Portal

- [ ] AI 模式下支持选择 `CLI`
- [ ] 结果历史区标识当前步骤来自 `CLI`
- [ ] 新增“当前后端”展示

### 验收标准

- [ ] `AI + CLI` 可完成导航、点击、填充、滚动、截图
- [ ] 同一会话多次调用可保留页面状态
- [ ] 用户刷新前端后，若 session 仍存活，可恢复继续执行

---

## 5.4 Phase 3: 统一步骤模型与导出链路

目标：

- 让 AI 执行和手动录制都收敛到统一中间层

### Browser Worker

- [ ] 引入 `BrowserActionStep`
- [ ] 每次执行命令时同步产出步骤模型
- [ ] 新增脚本导出服务 `browser-script-export.service.ts`

### Portal

- [ ] 用统一步骤模型渲染执行历史
- [ ] 新增“导出 Playwright 脚本”
- [ ] 新增“保存为平台模板”
- [ ] 将参数可替换逻辑迁移到统一步骤模型

### Template

- [ ] 统一从 `BrowserActionStep[]` 生成模板 DSL
- [ ] 明确 `replaceableParams` 到 `params_schema` 的转换规则

### 验收标准

- [ ] AI 执行步骤可导出为 Playwright 脚本
- [ ] AI 执行步骤可保存为平台模板
- [ ] 两种导出共享同一份步骤数据

---

## 5.5 Phase 4: 手动录制统一收敛

目标：

- 让手动录制不再是独立产物链路

### Browser Worker

- [ ] 手动录制结束后将脚本解析为 `BrowserActionStep[]`
- [ ] 若无法完全解析，保留 `scriptFragment`

### Portal

- [ ] 手动录制结束后自动进入“步骤审阅”视图
- [ ] 支持编辑、剔除、参数化步骤
- [ ] 支持导出 Playwright 脚本与平台模板

### 验收标准

- [ ] 手动录制结果可与 AI 执行结果共用同一模板编辑区
- [ ] 手动录制链路不再只是“展示原始脚本”

---

## 5.6 Phase 5: `MCP` 预留与扩展

目标：

- 在 `CLI` 稳定后，引入第三种标准后端

### Browser Worker

- [ ] 预留 `McpBrowserAdapter`
- [ ] 将 introspection、snapshot、自愈类能力从 Adapter 能力层抽象

### Portal

- [ ] 将 `MCP` 标记为实验功能
- [ ] 在 UI 中明确区分 `CLI` 与 `MCP` 的适用场景

### 验收标准

- [ ] `browser-worker` 可通过同一 adapter 接口路由到 `mcp`
- [ ] 前端无需额外改造业务层即可切换后端

---

## 6. 模块级任务拆解

## 6.1 `portal`

### `RecorderPage`

- [ ] 增加 `runtimeSessionId` 管理
- [ ] 增加 `executionBackend` 管理
- [ ] 将状态展示升级为 `interactionMode + backend + browserStatus`

### `AIControls`

- [ ] 新增“执行后端”选择器
- [ ] 在发送 AI 指令时带上 `backend`
- [ ] 历史记录项增加 `backend` 标记
- [ ] 新增“导出脚本”与“保存模板”入口

### `recorder.service.ts`

- [ ] WebSocket 消息结构增加 `runtimeSessionId`
- [ ] 手动录制链路允许感知 `backend`

---

## 6.2 `browser-worker`

### `browser.service.ts`

- [ ] 拆出 adapter 管理
- [ ] 拆出 session registry
- [ ] 将命令执行逻辑改为委托给 adapter

### 新增文件

- [ ] `modules/browser/adapters/browser-execution.adapter.ts`
- [ ] `modules/browser/adapters/legacy-codegen.adapter.ts`
- [ ] `modules/browser/adapters/playwright-cli.adapter.ts`
- [ ] `modules/browser/session/browser-session.registry.ts`
- [ ] `modules/browser/export/browser-script-export.service.ts`
- [ ] `modules/browser/steps/browser-step.mapper.ts`

---

## 6.3 `ai-orchestrator`

- [ ] 让浏览器命令输出更明确表达 locator 和 params
- [ ] 为 `CLI` 模式补充动作映射提示
- [ ] 标记哪些动作适合模板沉淀

---

## 6.4 `template`

- [ ] 引入统一步骤到模板步骤的转换器
- [ ] 统一参数替换规则
- [ ] 明确脚本导出与模板导出的共享元数据

---

## 7. Feature Flag 建议

建议引入以下开关：

- `RECORDER_ENABLE_CLI_BACKEND`
- `RECORDER_DEFAULT_AI_BACKEND=cli`
- `RECORDER_ENABLE_MCP_BACKEND`
- `RECORDER_ENABLE_STEP_EXPORT`
- `RECORDER_ENABLE_MANUAL_PARSE_TO_STEPS`

这样可做到：

- 小范围灰度
- 不同环境分阶段开放
- 方便回退

---

## 8. 测试计划

## 8.1 单元测试

- [ ] `LegacyCodegenAdapter` 行为对齐测试
- [ ] `PlaywrightCliAdapter` 参数映射测试
- [ ] `BrowserActionStep` 导出器测试
- [ ] 模板参数化转换测试

## 8.2 集成测试

- [ ] `AI + Legacy`
- [ ] `AI + CLI`
- [ ] `manual + Legacy`
- [ ] 导出 Playwright 脚本
- [ ] 导出平台模板

## 8.3 回归测试

- [ ] noVNC 预览仍可正常工作
- [ ] 原有模板保存和测试链路不回归
- [ ] session-broker 不因新 session 模型失效

---

## 9. 里程碑建议

### M1: 后端可切换

- 完成双维度模式模型
- 完成 adapter 接口
- `legacy` 行为零回归

### M2: `AI + CLI` 可用

- `PlaywrightCliAdapter` 跑通
- 会话保持可用
- AI 基本动作稳定

### M3: 导出链统一

- `BrowserActionStep` 生效
- 脚本导出和模板导出统一

### M4: 手动录制收敛

- 手动录制进入统一步骤模型
- 旧录制器不再是孤立链路

### M5: `MCP` 扩展准备完成

- adapter 边界稳定
- 前端模式与后端模式可扩展

---

## 10. 一句话总结

> 这次实施不应该把 `CLI` 当成“第三个零散入口”，而应该把它纳入录制器现有体系，形成“交互模式 × 执行后端”的统一模型，让 `manual / ai` 与 `legacy / cli / mcp` 组合演进，并最终收敛到同一个浏览器步骤与产物体系。
