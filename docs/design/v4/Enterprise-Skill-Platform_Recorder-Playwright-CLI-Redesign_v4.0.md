# 企业级 Skill 平台 Recorder + Playwright CLI 改造设计稿

**Recorder Playwright CLI Redesign v4.0**  
日期：2026-05-05

> 本文定义 `/recorder` 页面、`browser-worker` 运行时与 `playwright-cli` 的整合方案。  
> 目标是在保留现有 React AI 交互体验、模板能力与 noVNC 预览能力的前提下，将浏览器执行内核从当前自研 `codegen-api.py + 单实例浏览器状态机` 升级为基于 CLI Session 的统一浏览器运行时。

---

## 1. 文档目标

本文回答以下问题：

- 为什么当前 `/recorder` 需要引入 `playwright-cli`
- 现有实现的主要问题在哪里
- 新架构下前端、AI 编排层、浏览器运行时、模板层如何协作
- 如何同时支持完整浏览器调用、会话保持、脚本生成与模板沉淀
- Docker 与运行时资源模型需要如何调整
- 如何分阶段迁移，避免影响现有录制能力

---

## 2. 现状总结

当前 `/recorder` 已具备较强的产品雏形，主要能力包括：

- React 页面提供 AI 模式与手动录制模式
- `ai-orchestrator` 可将自然语言解析为结构化浏览器命令
- `browser-worker` 可执行结构化动作并返回截图、文本、快照等结果
- `browser-chrome` 提供可视化浏览器、Playwright codegen、noVNC 访问
- 前端可将执行结果沉淀为模板步骤，并进一步保存到模板服务

当前关键实现链路如下：

1. 前端 `/recorder` 收集用户输入
2. AI 模式调用 `ai-orchestrator` 将自然语言转为结构化命令
3. `browser-worker` 将命令转换为对 `browser-chrome` 内部 HTTP API 的调用
4. `browser-chrome` 内通过 `codegen-api.py` 操作 Playwright 或 codegen 进程
5. 前端根据结果展示浏览器状态、截图、脚本和模板内容

该方案可运行，但已经暴露出可扩展性与一致性问题。

---

## 3. 当前问题

### 3.1 AI 模式与手动录制模式并非同一运行时

- AI 模式通过 `browser-worker -> codegen-api.py(ai endpoints)` 执行动作
- 手动录制模式通过 `browser-worker -> recorder gateway -> codegen-api.py(/start /stop /script)` 驱动 `playwright codegen`
- 两条链路都依赖 Playwright，但会话、状态、产物结构不统一

结果是：

- AI 执行历史难以无损转换为标准脚本
- 手动录制得到的脚本未完全纳入 AI 模式的统一步骤模型
- 模板生成链路分裂，维护成本持续上升

### 3.2 浏览器状态模型是单实例，不适合并发

当前实现中存在明显的单实例特征：

- `browser-worker` 的 AI 浏览器会话为单 `session`
- `codegen-api.py` 使用全局变量持有 `ai_page`、`ai_browser`、`codegen_process`
- `recorder` WebSocket 虽表现为多 client，但浏览器资源并非真正多实例隔离

结果是：

- 多用户、多会话下容易互相覆盖浏览器状态
- React AI 无法稳定支持长会话、多轮操作和并发执行
- 未来接入更大规模 agent workflow 时难以支撑

### 3.3 浏览器协议为私有 HTTP API，维护成本高

当前浏览器动作由自定义 HTTP endpoint 驱动，例如：

- `/navigate`
- `/click`
- `/fill`
- `/snapshot`
- `/smart_search`

问题在于：

- 每个动作都需要自行维护参数解析、错误语义和返回结构
- 前后端对能力的理解依赖私有约定，难以复用成熟浏览器运行时工具
- 新增动作成本较高，且测试矩阵分散

### 3.4 脚本生成与模板沉淀缺乏统一中间层

当前存在三类产物：

- 手动录制脚本
- AI 执行结果中的 `template_info`
- 前端动态生成的模板 DSL / JS 脚本

这些产物缺少统一的“步骤中间表示”，导致：

- 同一浏览器行为会在多个地方重复建模
- 导出 Playwright 脚本与导出模板的逻辑不一致
- 参数化与变量替换规则散落在前端

### 3.5 浏览器资源与 Worker Pool 语义不完全一致

当前 `session-broker` 的 worker pool 是逻辑资源池，但浏览器实际仍主要指向同一个 `browser-chrome` 容器。

结果是：

- “有 10 个 worker” 不等于 “有 10 个独立浏览器会话”
- 会话保持、资源回收、人工接管的语义不够清晰

---

## 4. 引入 Playwright CLI 的理由

`playwright-cli` 具备以下特征：

- 以 CLI 为核心，适合 coding agent 和服务端执行器调用
- 支持浏览器 session，能够在多次调用间保持页面状态、Cookie 与 Storage
- 支持浏览器操作、脚本辅助、监控与会话管理
- 相比将大量页面结构直接暴露给模型，CLI 调用更轻量，更适合高频自动化执行

对本项目而言，引入 `playwright-cli` 的核心价值不是“新增一个工具”，而是：

- 以标准 CLI Session 取代当前单实例私有浏览器状态机
- 将 AI 模式和录制模式收敛到统一浏览器运行时
- 将浏览器操作、会话保持、脚本生成与运行监控收敛到统一抽象

---

## 5. 设计目标

本次改造的目标如下：

- 保留现有 `/recorder` 的 React AI 体验与 noVNC 预览体验
- 将 `browser-worker` 升级为可插拔浏览器执行适配层
- 引入 `PlaywrightCliAdapter` 作为新的默认浏览器执行后端
- 支持多 session 并发与会话保持
- 统一“浏览器动作步骤模型”，让脚本生成与模板生成共享同一中间层
- 保持与 `v4 Runtime Capability Protocol` 对齐

非目标如下：

- 不在第一阶段移除 noVNC
- 不在第一阶段废弃手动录制模式
- 不在第一阶段完全移除现有 `codegen-api.py`
- 不将自由文本理解下沉到 Runtime，AI 解析仍由 `ai-orchestrator` 负责

---

## 6. 新架构概览

目标架构建议如下：

`Portal Recorder UI -> ai-orchestrator -> browser-worker(Runtime Adapter) -> Playwright CLI Session -> Browser Runtime`

同时保留一条可视化观察链路：

`Portal noVNC / Session Monitor -> Browser Container / Session Dashboard`

### 6.1 分层职责

#### `portal`

负责：

- React AI 对话与控制台
- 手动录制入口与浏览器预览
- 执行结果展示
- 模板步骤编辑、变量参数化、导出入口

不负责：

- 真正浏览器动作执行
- Playwright 会话生命周期管理
- 运行态浏览器协议细节

#### `ai-orchestrator`

负责：

- 自然语言到结构化浏览器命令的转换
- 对模板步骤进行结构化补全建议
- 为复杂场景生成多步动作计划

不负责：

- 直接操作浏览器
- 持有浏览器资源状态

#### `browser-worker`

升级后负责：

- 持有 Runtime Session 与 Browser Session 的映射关系
- 将统一浏览器动作转换为 CLI 调用
- 返回标准化执行结果、截图、快照与错误码
- 管理会话生命周期、回收、冻结与恢复

#### `playwright-cli`

负责：

- 真实浏览器会话执行
- 会话状态保持
- 浏览器动作调用
- 会话管理与监控能力

#### `template / control-plane / session-broker`

继续负责：

- 模板存储与校验
- 执行编排
- 资源分配与运行时治理

---

## 7. 核心设计

## 7.1 引入 `PlaywrightCliAdapter`

在 `browser-worker` 内新增适配器层：

```ts
interface BrowserExecutionAdapter {
  initSession(input: InitBrowserSessionInput): Promise<BrowserSessionRef>;
  execute(input: ExecuteBrowserCommandInput): Promise<BrowserCommandResult>;
  closeSession(sessionId: string): Promise<void>;
  freezeSession(sessionId: string): Promise<BrowserControlState>;
  resumeSession(sessionId: string): Promise<BrowserControlState>;
  captureState(sessionId: string): Promise<BrowserStateSnapshot>;
}
```

第一版实现两个 Adapter：

- `LegacyCodegenAdapter`
- `PlaywrightCliAdapter`

这样可以实现：

- 灰度切换
- 回归对比
- 逐步迁移而不破坏当前功能

### 7.1.1 `PlaywrightCliAdapter` 的执行方式

适配器通过 `RunCommand` 类似的本地/容器命令执行能力调用：

- `playwright-cli open`
- `playwright-cli goto`
- `playwright-cli click`
- `playwright-cli fill`
- `playwright-cli type`
- `playwright-cli hover`
- `playwright-cli screenshot`
- `playwright-cli close`
- `playwright-cli list`

每个运行时会话都绑定一个 CLI Session 名称，例如：

- `recorder-{runtimeSessionId}`
- `execution-{executionId}`

这样同一会话内的多次动作调用都可保持状态。

---

## 7.2 统一浏览器步骤中间层

引入统一步骤模型 `BrowserActionStep`，作为浏览器动作的单一事实来源。

```ts
interface BrowserActionStep {
  id: string;
  source: 'ai' | 'manual' | 'imported';
  action: string;
  target?: string;
  locator?: {
    type: 'css' | 'text' | 'role' | 'ref';
    value: string;
  };
  params?: Record<string, unknown>;
  artifacts?: ArtifactRef[];
  snapshot?: SnapshotRef | null;
  scriptFragment?: string | null;
  templateInfo?: {
    replayable: boolean;
    replaceableParams?: string[];
  };
  timestamp: number;
}
```

统一后：

- AI 模式每执行一步，产出一个 `BrowserActionStep`
- 手动录制的脚本也会被解析为一组 `BrowserActionStep`
- 模板导出和 Playwright 脚本导出都基于这组步骤生成

这会显著减少当前前端中的重复建模逻辑。

---

## 7.3 React AI 支持完整浏览器调用

改造后，React AI 不再直接依赖“私有浏览器 endpoint 集合”，而是依赖统一动作集。

建议保留并扩展现有动作集合：

- `navigate`
- `click`
- `fill`
- `type_text`
- `hover`
- `wait`
- `scroll`
- `press_key`
- `screenshot`
- `snapshot`
- `read_page`
- `get_text`
- `drag`
- `select`
- `upload_file`
- `assert_visible`
- `assert_text`

其中：

- AI 负责把自然语言转换为结构化动作
- `browser-worker` 负责把结构化动作映射到 `playwright-cli`
- 前端只负责展示和编辑

这意味着 React AI 可以支持“完整浏览器调用”，但它不应该直接执行浏览器命令行，而应该通过 `browser-worker` 的统一 Runtime API 进行。

---

## 7.4 脚本生成策略

脚本生成应从“只靠手动录制脚本”升级为“双来源统一导出”：

- 来源 A：手动录制得到的 Playwright 脚本
- 来源 B：AI 执行步骤生成的 `BrowserActionStep[]`

最终输出分为三类：

### 7.4.1 标准 Playwright 脚本

基于 `BrowserActionStep[]` 生成：

- `page.goto`
- `page.click`
- `page.fill`
- `page.keyboard.type`
- `page.waitForTimeout`
- `page.screenshot`

适合：

- 开发调试
- 回归测试
- 交给工程师继续手工维护

### 7.4.2 平台模板 DSL

基于同一组步骤生成：

- `action`
- `locator`
- `params`
- `wait`
- `retry`
- `on_fail`

适合：

- 平台内执行
- 后续由 `control-plane` 和 `browser-runtime.adapter` 消费

### 7.4.3 可参数化脚本

在统一步骤模型上标记可替换参数后，可导出：

- 变量化 Playwright 脚本
- 变量化模板 DSL

从而避免当前“前端自行推断参数替换规则”的碎片化实现。

---

## 7.5 Session 模型升级

当前单实例模型需要升级为多 session 模型：

```ts
interface RecorderRuntimeSession {
  runtimeSessionId: string;
  browserSessionId: string;
  adapter: 'legacy_codegen' | 'playwright_cli';
  mode: 'ai' | 'manual' | 'hybrid';
  status: 'idle' | 'ready' | 'recording' | 'executing' | 'paused' | 'frozen' | 'closed' | 'error';
  ownerUserId?: string;
  executionId?: string;
  currentUrl?: string;
  createdAt: number;
  updatedAt: number;
}
```

设计原则：

- 每个 React `/recorder` 页签拥有自己的 `runtimeSessionId`
- 每个执行会话可以绑定已有 `executionId`
- `browser-worker` 内部用 `Map<runtimeSessionId, RecorderRuntimeSession>` 管理
- CLI Session 名称与 `runtimeSessionId` 一一映射

这样可自然支持：

- 多标签页并发录制
- 多用户并发执行
- 会话恢复
- 长会话持续操作

---

## 7.6 手动录制模式的改造策略

手动录制模式建议分两期演进：

### 第一期

- 保留现有 `playwright codegen` 手动录制能力
- 录制结束后将脚本解析为 `BrowserActionStep[]`
- 与 AI 模式共用后续模板编辑与脚本导出链路

### 第二期

- 评估是否使用 `playwright-cli` 的录制/辅助能力逐步替换现有 `codegen-api.py`
- 将手动模式也收敛到 CLI Session

这样做的原因是：

- 现有手动录制体验可继续工作
- 改造风险更低
- 可先统一产物模型，再统一底层录制器

---

## 7.7 noVNC 与可视化观察能力

本次改造不移除 noVNC。

建议保留两类观察能力：

- `noVNC`：面向当前已有工作流和人工接管
- `Playwright session monitor / dashboard`：面向多 session 观察与排障

未来可将两者整合为统一“浏览器会话观测台”，但不作为本阶段前提。

---

## 8. 接口与模块变更建议

## 8.1 `browser-worker`

### 新增模块

- `modules/browser/adapters/playwright-cli.adapter.ts`
- `modules/browser/adapters/legacy-codegen.adapter.ts`
- `modules/browser/browser-session.registry.ts`
- `modules/browser/browser-script-export.service.ts`
- `modules/browser/browser-step.mapper.ts`

### 改造点

- `BrowserService` 从单 session 改为多 session
- `/browser/init` 支持传入 `runtimeSessionId`
- `/browser/execute` 支持指定目标 session
- `/browser/reset` 改为按 session 粒度执行
- `/browser/execute-step` 对齐统一 Runtime 协议，并支持 adapter 选择

---

## 8.2 `portal`

### 主要改造点

- `RecorderPage` 增加当前 `runtimeSessionId` 管理
- `AIControls` 的结果历史改为绑定统一 `BrowserActionStep[]`
- 模板步骤、脚本预览与导出都从统一步骤模型生成
- 手动录制结束后自动进入“步骤解析 + 参数编辑 + 双产物导出”流程

### UI 增强建议

- 增加“执行后端”标识：`Legacy` / `Playwright CLI`
- 增加“导出 Playwright 脚本”与“保存平台模板”双按钮
- 增加“恢复上次会话”入口
- 增加“当前 Session 名称 / 状态 / URL”展示

---

## 8.3 `ai-orchestrator`

### 维持不变

- 自然语言解析能力保留
- 结构化命令输出保留

### 增强建议

- 输出更明确的 locator 语义
- 对脚本生成友好的动作归一化
- 在返回结果中标记动作是否适合模板沉淀

---

## 8.4 `session-broker`

建议调整其资源语义：

- 从“逻辑 worker 数量”逐步转向“浏览器 session 配额 + 资源池”
- 若保留 worker 概念，则应明确“worker 是否映射独立浏览器实例”
- 对 `browser` runtime 增加 session 生命周期事件

---

## 9. Docker 与部署设计

## 9.1 开发态

建议在 Docker 中继续保留 `browser-chrome`，但其职责调整为：

- 提供可视化浏览器环境
- 托管 Playwright CLI 所需浏览器与会话运行环境
- 对外暴露最少必要端口

建议新增或调整环境变量：

- `BROWSER_EXECUTION_BACKEND=playwright_cli`
- `PLAYWRIGHT_CLI_SESSION_PREFIX=ops-recorder`
- `PLAYWRIGHT_CLI_HEADLESS=false`
- `PLAYWRIGHT_CLI_PERSISTENT=true`

### 9.1.1 安全建议

应收紧以下暴露面：

- 不建议在共享环境直接公开 CLI 控制接口
- 若仍保留 codegen HTTP API，应只在内部网络开放
- noVNC 建议在后续引入鉴权或会话级访问控制

## 9.2 生产态

生产态不建议依赖“单容器全员共享浏览器”的模式。

更合理的方向是：

- `browser-worker` 按会话创建或绑定独立浏览器资源
- `playwright-cli` 会话与浏览器资源一一对应
- `session-broker` 管理资源配额与回收

---

## 10. 迁移方案

## 10.1 Phase 0: 契约冻结

- 冻结 `BrowserActionStep` 数据模型
- 冻结 `browser-worker` 内部 `BrowserExecutionAdapter` 接口
- 冻结 `runtimeSessionId -> browserSessionId` 映射语义

## 10.2 Phase 1: 引入 CLI Adapter，但不切默认流量

- 在 `browser-worker` 内实现 `PlaywrightCliAdapter`
- 新增配置开关选择 `legacy_codegen` 或 `playwright_cli`
- 通过隐藏配置先在开发环境验证

## 10.3 Phase 2: AI 模式切到 CLI

- React AI 继续复用现有解析逻辑
- 浏览器执行改为默认走 `PlaywrightCliAdapter`
- 对比截图、导航、填充、等待、读取页面等能力是否等价

## 10.4 Phase 3: 统一步骤模型与导出链路

- 让 AI 历史与手动录制都产出 `BrowserActionStep[]`
- 前端脚本导出、模板导出全部改为基于统一中间层

## 10.5 Phase 4: 手动录制模式收敛

- 手动录制结束后自动解析为步骤模型
- 评估是否逐步淘汰旧 `codegen-api.py`

## 10.6 Phase 5: 资源池与生产部署升级

- 改造 session-broker 的资源模型
- 支持真正多会话隔离
- 增加 session 观测与运维面板

---

## 11. 风险与缓解

### 11.1 CLI 与现有自定义结果结构不完全一致

风险：

- 当前前端依赖 `template_info`、截图 base64、页面文本等特定结构

缓解：

- 在 `PlaywrightCliAdapter` 内做统一结果归一化
- 前端只消费平台统一 DTO，不直接消费 CLI 原始输出

### 11.2 迁移期存在双运行时并存

风险：

- 调试路径复杂

缓解：

- 所有请求明确记录 `adapter=legacy|cli`
- 对关键命令提供 A/B 对比日志

### 11.3 手动录制脚本解析不稳定

风险：

- `playwright codegen` 输出脚本格式变化可能影响解析

缓解：

- 先以“尽量解析”为目标
- 无法解析的片段保留原始脚本片段
- 长期目标是逐步降低对脚本文本解析的依赖

### 11.4 多 session 带来资源压力

风险：

- 浏览器实例数量上升，CPU 与内存压力增大

缓解：

- 引入 session TTL、闲置回收
- 区分“前台可视会话”与“后台执行会话”
- 对并发 session 做配额控制

---

## 12. 验收标准

- [ ] `/recorder` 可在新后端上完成导航、点击、填充、截图、读取页面、滚动、等待
- [ ] 同一用户多轮 AI 操作可保持浏览器状态
- [ ] 不同 `runtimeSessionId` 可并发存在，彼此不覆盖
- [ ] AI 执行结果可导出为标准 Playwright 脚本
- [ ] AI 执行结果可导出为平台模板 DSL
- [ ] 手动录制结果可进入统一步骤模型并完成模板导出
- [ ] `browser-worker` 的接口继续对齐 `v4 Runtime Capability Protocol`
- [ ] Docker 开发环境可通过配置切换 `legacy_codegen` 与 `playwright_cli`

---

## 13. Backlog 建议

### P0

- [ ] 定义 `BrowserExecutionAdapter` 接口
- [ ] 定义 `BrowserActionStep` 模型
- [ ] 改造 `BrowserService` 为多 session

### P1

- [ ] 实现 `PlaywrightCliAdapter`
- [ ] 打通 AI 模式的 `navigate/click/fill/screenshot/read_page`
- [ ] 新增统一执行结果 DTO

### P2

- [ ] 打通脚本导出与模板导出的统一中间层
- [ ] 手动录制结果解析为 `BrowserActionStep[]`
- [ ] Portal UI 增加 session 状态与导出能力

### P3

- [ ] 评估并缩减 `codegen-api.py` 职责
- [ ] 调整 `session-broker` 资源池语义
- [ ] 增加浏览器 session 监控与运维能力

---

## 14. 一句话总结

> 本次改造的本质，不是把 `/recorder` 从“前端录制页”升级成“另一个命令行工具”，而是将其升级为一个以 React AI 为交互层、以统一步骤模型为产物层、以 Playwright CLI Session 为浏览器内核的标准化浏览器自动化工作台。
