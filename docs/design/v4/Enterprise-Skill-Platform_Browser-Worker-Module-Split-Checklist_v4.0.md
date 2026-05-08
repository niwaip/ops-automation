# 企业级 Skill 平台 browser-worker 模块拆分清单

**Browser Worker Module Split Checklist v4.0**  
日期：2026-05-07

> 本文给出 `browser-worker` 的模块拆分清单。  
> 目标是在不破坏当前 `Legacy / CLI / Chrome DevTools` 能力的前提下，将 `browser-worker` 从“适配器 + 服务聚合体”升级为一个职责清晰、可扩展、可测试、可对接 `BrowserActionStep[]` 与脚本导出的标准浏览器 Runtime Host。

---

## 1. 文档目标

本文回答以下问题：

- 当前 `browser-worker` 的模块结构有哪些边界
- 哪些职责应该从 `BrowserService` 和各 adapter 中拆出
- 新模块应该如何分层和命名
- 模块拆分的优先级和顺序是什么
- 拆分过程中有哪些风险点和回归面

---

## 2. 当前结构盘点

当前目录结构如下：

```text
src/modules/browser/
  adapters/
    browser-execution.adapter.ts
    chrome-devtools-cli.adapter.ts
    legacy-codegen.adapter.ts
    playwright-cli.adapter.ts
  browser.controller.ts
  browser.module.ts
  browser.service.ts
```

当前已经具备的基础能力：

- `BrowserExecutionAdapter` 接口已存在
- `Legacy / CLI / Chrome DevTools` 三个 adapter 已落地
- `BrowserController` 已提供 `/browser/*` 端点
- `BrowserService` 已承担 adapter 分发

当前主要问题：

### 2.1 `BrowserService` 仍偏“网关型大类”

- 目前负责 adapter 路由
- 也承担接口粘合逻辑
- 后续若继续加入步骤提交、参数化、脚本导出、自动修正，容易膨胀

### 2.2 adapter 中已有较多“非适配器纯执行”逻辑

以 `PlaywrightCliAdapter` 为例，已经包含：

- session 生命周期
- 页面观察
- artifact 丰富化
- 错误解析
- 屏幕截图读取
- 搜索结果抽取
- tab 处理

这些逻辑并非都必须放在 adapter 内部。

### 2.3 缺少统一的步骤提交层

目前还没有一个独立模块专门负责：

- 把执行结果转换为 `BrowserActionStep`
- 提取参数
- 生成脚本片段
- 记录修正历史

### 2.4 缺少 locator 解析与修正层

运行时 ref、持久化 locator、自动修正策略目前没有独立归口。

---

## 3. 目标结构

建议将 `browser-worker` 的浏览器模块重构为如下结构：

```text
src/modules/browser/
  adapters/
    browser-execution.adapter.ts
    chrome-devtools-cli.adapter.ts
    legacy-codegen.adapter.ts
    playwright-cli.adapter.ts

  api/
    browser.controller.ts
    browser-session.controller.ts
    dto/
      browser-api.dto.ts
      browser-step.dto.ts
      browser-session.dto.ts

  application/
    browser.service.ts
    browser-session.service.ts
    browser-command.service.ts
    browser-step.service.ts
    browser-repair.service.ts
    browser-script-export.service.ts
    browser-parameterization.service.ts
    browser-observation.service.ts
    locator-resolution.service.ts

  domain/
    browser.types.ts
    browser-session.types.ts
    browser-step.types.ts
    browser-error.types.ts
    browser.constants.ts

  infrastructure/
    browser-session.registry.ts
    browser-artifact.repository.ts
    browser-cli.runner.ts
    browser-snapshot.store.ts

  mappers/
    browser-step.mapper.ts
    browser-runtime.mapper.ts
    browser-api.mapper.ts

  browser.module.ts
```

说明：

- `api` 负责 HTTP 契约
- `application` 负责用例编排
- `domain` 负责稳定类型与规则
- `infrastructure` 负责状态和外部依赖
- `adapters` 只负责 backend-specific 执行

---

## 4. 模块拆分原则

### 4.1 adapter 只保留“后端差异”

adapter 应保留：

- CLI 命令映射
- Legacy API 调用映射
- Chrome DevTools 命令映射
- backend-specific 错误解析

adapter 不应无限承担：

- 统一参数抽取
- 脚本导出
- 通用步骤提交
- UI 用的结果拼装

### 4.2 session 状态集中管理

- session 不应散落在多个 service 和 adapter 内
- 应有统一 registry 管理 `runtimeSessionId`
- 所有 session 生命周期操作应可审计

### 4.3 观察、执行、修复、提交分层

建议把浏览器链路分成四个明确服务：

- `browser-observation.service`
- `browser-command.service`
- `browser-repair.service`
- `browser-step.service`

### 4.4 导出和参数化独立成服务

脚本导出和参数抽取后续会被：

- AI 调试页使用
- Recorder UI 使用
- Skill 发布链路使用

因此不应内嵌在单一 adapter 中。

---

## 5. 推荐模块清单

## 5.1 `api/`

### `browser.controller.ts`

职责：

- 对外暴露 `/browser/init`、`/browser/execute`、`/browser/reset`
- 将 HTTP body 转为应用层输入

建议保留。

### `browser-session.controller.ts`

职责：

- 单独暴露 session 查询/状态接口
- 支持 `GET session state`、`GET session artifacts`、`GET session snapshots`

建议新增。

### `api/dto/browser-api.dto.ts`

职责：

- 存放 Controller 层请求/响应 DTO
- 与 Swagger 文档直接对齐

建议新增。

### `api/dto/browser-step.dto.ts`

职责：

- 存放 `execute-step` 相关 DTO

建议新增。

### `api/dto/browser-session.dto.ts`

职责：

- 存放 session 状态、控制、列表接口 DTO

建议新增。

---

## 5.2 `application/`

### `browser.service.ts`

职责：

- 保持为总入口 Facade
- 仅做用例编排和 service 协调

不建议继续塞入复杂业务逻辑。

### `browser-session.service.ts`

职责：

- 创建、绑定、重置、关闭 session
- 管理 `runtimeSessionId -> browserSessionId`
- 对接 `browser-session.registry.ts`

建议新增。

### `browser-command.service.ts`

职责：

- 负责命令执行主流程
- 调用 adapter 执行
- 统一处理 execute request/result

建议新增。

### `browser-observation.service.ts`

职责：

- 获取 snapshot、可见文本、页面结构
- 统一页面观察逻辑
- 向 AI/调试链路提供标准观察对象

建议新增。

### `browser-repair.service.ts`

职责：

- 处理失败后的自动修正逻辑
- 统一限定最大重试次数
- 记录修正历史

建议新增。

### `browser-step.service.ts`

职责：

- 将执行结果提交为 `BrowserActionStep`
- 写入 locator、参数、脚本片段、修正历史

建议新增。

### `browser-parameterization.service.ts`

职责：

- 识别哪些字段可参数化
- 生成 `replaceableParams`
- 生成参数元数据

建议新增。

### `browser-script-export.service.ts`

职责：

- 基于 `BrowserActionStep[]` 生成 Playwright 脚本
- 生成参数化脚本与模板 DSL

建议新增。

### `locator-resolution.service.ts`

职责：

- 处理 `runtimeTargetRef -> locator` 转换
- 统一 locator 风险打分
- 对接 `generate-locator`

建议新增。

---

## 5.3 `domain/`

### `browser.types.ts`

职责：

- 定义 `BrowserExecutionBackend`
- 定义 `BrowserArtifactRef`、`BrowserSnapshotRef`

建议新增。

### `browser-session.types.ts`

职责：

- 定义 `BrowserRuntimeSessionRef`
- 定义 session status / control mode

建议新增。

### `browser-step.types.ts`

职责：

- 定义 `BrowserCommand`
- 定义 `BrowserActionStep`
- 定义 locator / param binding

建议新增。

### `browser-error.types.ts`

职责：

- 定义浏览器运行时错误码
- 定义 `BrowserError`

建议新增。

### `browser.constants.ts`

职责：

- 常量集中管理
- 默认等待时长、自动修正上限、artifact 类型等

建议新增。

---

## 5.4 `infrastructure/`

### `browser-session.registry.ts`

职责：

- 存储 `runtimeSessionId` 相关运行态
- 统一管理内存态 session 信息

建议新增。

### `browser-cli.runner.ts`

职责：

- 统一封装 CLI 进程执行
- 处理 `playwright-cli` / `npx playwright-cli` 探测
- 统一 stdout/stderr/error 解析

建议新增。

### `browser-artifact.repository.ts`

职责：

- 统一 artifact 路径管理
- 统一读写截图、HTML、trace、脚本片段

建议新增。

### `browser-snapshot.store.ts`

职责：

- 管理 snapshot 元数据
- 支持回查某步对应 snapshot

建议新增。

---

## 5.5 `mappers/`

### `browser-step.mapper.ts`

职责：

- 将 adapter 原始结果映射为 `BrowserActionStep`

建议新增。

### `browser-runtime.mapper.ts`

职责：

- 将浏览器专用结果映射到 `RuntimeStepInvokeResult`

建议新增。

### `browser-api.mapper.ts`

职责：

- 将应用层模型映射到 Controller response DTO

建议新增。

---

## 6. 现有文件的建议调整

## 6.1 `browser.service.ts`

当前状态：

- adapter 路由器
- session 相关接口入口

建议调整后：

- 保留 Facade 角色
- 内部委托给：
  - `browser-session.service`
  - `browser-command.service`
  - `browser-step.service`

目标：

- 保持类短小
- 对外接口稳定

## 6.2 `playwright-cli.adapter.ts`

当前状态：

- 功能较重
- 同时承担执行、session、artifact、观察、搜索等逻辑

建议拆出：

- CLI 调用底座 -> `browser-cli.runner.ts`
- artifact 管理 -> `browser-artifact.repository.ts`
- locator 解析 -> `locator-resolution.service.ts`
- step 提交 -> `browser-step.service.ts`

adapter 保留：

- `playwright-cli` 命令映射
- backend-specific 行为差异

## 6.3 `legacy-codegen.adapter.ts`

建议：

- 与 `PlaywrightCliAdapter` 对齐接口语义
- 尽量共享 observation / step commit / export 逻辑

## 6.4 `chrome-devtools-cli.adapter.ts`

建议：

- 作为兼容后端保留
- 尽可能复用 session / step / export 公共服务

---

## 7. 依赖方向建议

推荐依赖方向：

```text
Controller -> Application Services -> Adapters / Infrastructure -> External Runtime
                           |
                           -> Mappers
                           |
                           -> Domain Types
```

约束：

- `domain` 不依赖 `application`
- `adapters` 不依赖 `controller`
- `infrastructure` 不依赖 `controller`
- `mappers` 不持有副作用

---

## 8. 分阶段拆分清单

## 8.1 Phase 1: 低风险拆分

目标：

- 不改变对外接口
- 减轻 `BrowserService` 负担

任务：

- [ ] 新增 `domain/browser-*.types.ts`
- [ ] 新增 `application/browser-session.service.ts`
- [ ] 新增 `application/browser-command.service.ts`
- [ ] `browser.service.ts` 改为 Facade

验收：

- [ ] 现有 `/browser/*` API 行为不变
- [ ] adapter 路由逻辑仍正确

## 8.2 Phase 2: 公共能力下沉

目标：

- 从 adapter 中拆出非 backend-specific 逻辑

任务：

- [ ] 新增 `browser-cli.runner.ts`
- [ ] 新增 `browser-artifact.repository.ts`
- [ ] 新增 `browser-observation.service.ts`
- [ ] 新增 `locator-resolution.service.ts`

验收：

- [ ] `PlaywrightCliAdapter` 行数明显下降
- [ ] observation / artifact 逻辑可复用

## 8.3 Phase 3: 步骤与参数统一

目标：

- 让浏览器执行具备正式产物层

任务：

- [ ] 新增 `browser-step.service.ts`
- [ ] 新增 `browser-step.mapper.ts`
- [ ] 新增 `browser-parameterization.service.ts`
- [ ] `execute` 链路开始返回 `BrowserActionStep[]`

验收：

- [ ] 执行结果能沉淀为统一步骤
- [ ] 参数化信息能随步骤产出

## 8.4 Phase 4: 修正与导出

目标：

- 支持有限自动修正和脚本导出

任务：

- [ ] 新增 `browser-repair.service.ts`
- [ ] 新增 `browser-script-export.service.ts`
- [ ] 新增 `browser-snapshot.store.ts`

验收：

- [ ] 失败时可有限修正
- [ ] 成功步骤可导出 Playwright 脚本

## 8.5 Phase 5: session 与治理增强

目标：

- 提升运维可见性与平台接入稳定性

任务：

- [ ] 新增 `browser-session.controller.ts`
- [ ] 新增 session 查询接口
- [ ] 新增 `browser-runtime.mapper.ts`
- [ ] 对齐 `RuntimeStepInvokeResult`

验收：

- [ ] session 状态可观察
- [ ] 平台调用契约更稳定

---

## 9. 优先级建议

### P0

- `browser-session.service.ts`
- `browser-command.service.ts`
- `domain/*`

### P1

- `browser-observation.service.ts`
- `locator-resolution.service.ts`
- `browser-cli.runner.ts`

### P2

- `browser-step.service.ts`
- `browser-step.mapper.ts`
- `browser-parameterization.service.ts`

### P3

- `browser-repair.service.ts`
- `browser-script-export.service.ts`
- `browser-session.controller.ts`

---

## 10. 风险与注意事项

### 10.1 不要重复发明 adapter 抽象

当前 `BrowserExecutionAdapter` 已存在，不建议另起一套“RuntimeAdapter2”。

### 10.2 不要在拆分过程中破坏现有端点

应优先保持：

- `/browser/init`
- `/browser/execute`
- `/browser/reset`
- `/browser/execute-step`

### 10.3 避免把所有逻辑都下沉到 adapter

否则拆分后仍然会回到“大 adapter”问题。

### 10.4 注意 session 状态的唯一事实来源

- session 内存态
- worker 资源态
- 浏览器底层实际态

三者需要明确同步策略。

### 10.5 注意自动修正和导出逻辑的副作用

- 修正不能改变用户业务目标
- 导出不能依赖临时 ref
- 参数化不能泄露 secret

---

## 11. 建议的第一批文件

如果只做第一轮最小落地，建议先新增：

- `src/modules/browser/domain/browser.types.ts`
- `src/modules/browser/domain/browser-step.types.ts`
- `src/modules/browser/application/browser-session.service.ts`
- `src/modules/browser/application/browser-command.service.ts`
- `src/modules/browser/infrastructure/browser-session.registry.ts`

这是最小但收益最大的拆分组合。

---

## 12. 验收清单

- [ ] `BrowserService` 不再继续膨胀
- [ ] session 生命周期有统一归口
- [ ] observation / repair / commit / export 分层清晰
- [ ] adapter 仅保留 backend-specific 行为
- [ ] DTO、步骤模型、导出服务可被多个 backend 复用
- [ ] 后续 `mcp` 后端可复用同一套浏览器域模型

---

## 13. 一句话总结

> `browser-worker` 的模块拆分核心，不是简单把大文件拆小，而是把“会话管理、命令执行、页面观察、locator 解析、步骤提交、参数抽取、自动修正、脚本导出”这些不同生命周期和稳定性要求的职责真正拆开，让 adapter 回归后端差异层，让 `browser-worker` 成为标准 Runtime Host。
