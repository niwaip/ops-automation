# 项目审查报告 — 2026-10-08

审查基线：`fb9539fbd8a7d9d09888625fb7d2d1f654cbaad9`。审查开始时工作区无未提交改动。本次只新增本报告，不修改业务源码、配置或数据库。

本轮采用全仓库结构检查和风险导向的关键路径审查，发现 **10 项可操作问题：8 项 P1、2 项 P2**。P1 应优先修复；不建议在前三项鉴权缺陷修复前开放外部访问。

## 发现

### F01 · [P1] 公开注册接口允许直接创建管理员

主位置：[identity-access-auth.service.ts:102](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/identity-access/src/auth/identity-access-auth.service.ts:102)。

`POST /auth/register` 标记为 `@Public()`；`RegisterDto.role` 允许 `admin`；服务只拒绝 `agent`，随后原样持久化调用方提交的角色。Repository 同步建立对应角色关联，登录后签发 `role=admin` 的 JWT，而 `RbacGuard` 对该角色直接放行。未登录调用者可以自行获得平台管理员权限。

证据：使用真实 DTO 校验、Controller、AuthService 和 Guard，配合内存 Repository，确认匿名注册路由放行、`role=admin` 通过校验并进入持久化调用，RBAC 不再查询权限。未创建真实账号。

修复：公开注册在服务端固定为普通员工；管理员创建与提权走独立的受保护接口，不能依赖前端隐藏选项。

### F02 · [P1] 产物下载仅检查 Bearer 前缀，未验证令牌

主位置：[browser.controller.ts:202](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/browser/browser.controller.ts:202)。

`GET /browser/artifacts/:filename` 使用 `@Public()` 跳过全局内部鉴权；方法内将 `authorization.startsWith('Bearer ')` 当作授权依据。即使生产环境强制认证，只需 `Authorization: Bearer invalid` 就可绕过签名和有效期校验，下载已知文件名对应的截图、页面或其他执行证据。文件名不可枚举不能替代鉴权。

证据：`NODE_ENV=production`，创建临时测试产物，使用真实 InternalAuthGuard 和 Controller；没有产物 token，仅携带上述无效头，仍到达 `sendFile`。临时文件已删除。

修复：删除前缀授权分支；使用绑定文件名且有期限的签名产物 token，或者验证访问 JWT 后再检查产物归属。

### F03 · [P1] Refresh token 可直接访问业务接口

主位置：[jwt-auth.guard.ts:103](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/identity-access/src/guards/jwt-auth.guard.ts:103)。

Access token 和 refresh token 使用相同签名密钥，refresh token 包含完整用户角色、有效期为 7 天，并带有 `type=refresh`。Platform 的 JwtAuthGuard、Control Plane 的 AuthMiddleware、AI 的 `parseAndVerifyToken` 均未拒绝 refresh 类型。客户端可直接把 refresh token 放入 Authorization，绕过 15 分钟访问令牌期限；被盗 refresh token 也能直接调用业务接口。

证据：用真实 AuthService 签发 refresh token，三个实际校验入口均接受。对应代码还包括 [auth.middleware.ts:99](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/auth/auth.middleware.ts:99)、[ai-auth.guard.ts:59](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/common/guards/ai-auth.guard.ts:59)。

修复：统一访问令牌契约并检查 token 类型；refresh token 只允许刷新端点接受。若使用独立密钥或 audience，也必须在全部消费服务一致校验。

### F04 · [P1] Studio 模板名存在存储型 XSS

主位置：[studio-core.js:207](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/studio-web/studio-core.js:207)。

模板列表将 `t.fileName` 直接拼入 `innerHTML`。重命名接口又将 `newName` 原样写入模板元数据，没有 HTML 转义。攻击者可保存带事件处理器的标签作为模板名；其他人加载共享列表时，浏览器会把它解析为真实 HTML。

证据：从当前源码 AST 提取实际 `renderTemplateList`，以 jsdom 渲染包含 `<img src=x onerror="window.reviewXss=1">.docx` 的模板名，确认 DOM 中出现携带该事件处理器的 img 元素。该验证确认 HTML 注入，未执行真实浏览器中的事件。持久化入口见 [studio-template-controller.helper.ts:87](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/template/studio/utils/studio-template-controller.helper.ts:87)。

修复：将名称通过 `textContent` 写入节点，或在所有文本插值处使用可靠转义；同类列表、toast、AI 返回内容也应按输出上下文检查。

### F05 · [P1] 网关代理未携带下游要求的内部鉴权

主位置：[proxy.controller.ts:224](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/proxy/proxy.controller.ts:224)。

Control Plane 的 `/api/workers/*` 和 `/api/sessions/*` 代理仅转发用户 Authorization 及用户标识，没有构造 `x-internal-auth`。browser-worker 与 session-broker 的 InternalAuthGuard 要求内部共享密钥，不能用普通用户 JWT 替代。因此合法登录用户通过这些代理访问受保护下游端点时会收到 401。

证据：调用真实 `proxyWorker` 捕获下游请求头，确认缺少内部鉴权；将其传入真实 worker Guard，触发拒绝。ProxyService 的 axios 实例也未配置该默认头。

修复：在服务端为获准代理的内部路由构造共享鉴权头，同时明确用户权限及资源归属；不要无条件信任或透传客户端声明的内部身份。

### F06 · [P1] 发布流水线的生产校验步骤必然缺少必填变量

主位置：[task-orchestration-delivery.yml:100](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/task-orchestration-delivery.yml:100)。

`validate-production-delivery.sh` 在加载 Compose 前强制要求 `JWT_SECRET`、`INTERNAL_API_SHARED_SECRET` 和 `USER_CREDENTIAL_ENCRYPTION_KEY`。Workflow 的该步骤只提供镜像、数据库、Redis 和服务地址，整个 job/workflow 没有补充这三个变量。`verify` 会失败，依赖它的 `publish` 无法发布镜像。

证据：使用与 workflow 完全相同的 fixture 环境隔离运行校验脚本，退出码为 1，输出 `Missing required environment variable: JWT_SECRET`。即使补上第一项，另外两项也仍缺失。必填列表见 [validate-production-delivery.sh:59](/Users/chain/Documents/MyProject/ops-automation/docker/scripts/validate-production-delivery.sh:59)。

修复：该步骤只做合成配置验证，可提供符合策略的测试专用值；真正部署时再注入生产密钥，不应将生产密钥用于此静态 fixture。

### F07 · [P1] 生产 Dockerfile 遗漏基础 TypeScript 配置

主位置：[Dockerfile:7](/Users/chain/Documents/MyProject/ops-automation/docker/node-service/Dockerfile:7)。

构建阶段只复制根目录 `tsconfig.json` 和 `nest-cli.json`，没有复制 `tsconfig.base.json`。browser-worker 和 ai-orchestrator 的 tsconfig 均继承这个基础文件；新镜像中不存在宿主机构建环境可补足它。runtime-worker 的 Nest/TypeScript 构建因此无法正常解析配置。

证据：检查完整 COPY 清单，并用 TypeScript 配置解析器模拟该文件在镜像内缺失，稳定得到 `TS5083 Cannot read file .../tsconfig.base.json`。本轮未构建或启动生产镜像。

修复：把全部实际依赖的根构建配置显式复制进 build 阶段；增加干净 Docker 上下文中的镜像构建验证。

### F08 · [P1] AI 生产镜像只构建目标包，遗漏运行时 workspace 依赖

主位置：[Dockerfile:19](/Users/chain/Documents/MyProject/ops-automation/docker/node-service/Dockerfile:19)。

镜像执行 `pnpm --filter "${PACKAGE_FILTER}" run build`，只构建目标包。AI Orchestrator 运行时导入 `@ops/browser-recorder`；该依赖的 exports 指向 `dist/index.js`，但 `.dockerignore` 排除了所有 dist，install/目标 build 均没有构建该依赖的 hook。即使修复 F07，SWC 可以编译导入语句，生成的服务仍会因依赖入口不存在而无法加载。`@ops/browser-runtime-facade` 同样声明为 dist 形式依赖，亦需纳入依赖构建。

证据：静态核对 Dockerfile、ignore、包 scripts/exports 和当前实际导入；比较 pnpm filter 选择，普通 filter 只有目标包，带 `...` 才包含 workspace 依赖。此项为完整构建链静态结论，没有执行镜像启动复现。

修复：按依赖顺序构建目标及其 workspace 依赖，或显式构建必要依赖；验证镜像内的运行时模块解析与服务启动，不能只验证 SWC 转译成功。

### F09 · [P2] 健康检查将连接拒绝或 DNS 失败报告为健康

主位置：[proxy.service.ts:177](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/proxy/proxy.service.ts:177)。

`checkServiceHealth` 捕获无 HTTP 响应的异常后，仅把 `ECONNABORTED` 判断为失败。`ECONNREFUSED`、`ENOTFOUND` 等实际不可达错误均返回 true，随后 `/api/health` 将下游标为 healthy，误导冒烟检查和运维判断。

证据：让实际 axios 实例的 `get` 抛出 `ECONNREFUSED`，真实方法返回 true。

修复：无 HTTP 响应的网络异常一律返回 false；另外明确“可达”与“业务健康”的响应状态标准。

### F10 · [P2] PR 测试及 lint 门禁吞掉失败

主位置：[test.yml:36](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/test.yml:36)。

常规 push/PR 的单元和集成测试均使用 `|| exit 0`，再叠加 `continue-on-error: true`；测试命令失败也会显示步骤成功。CI 的 lint/format 同样如此。严格的 delivery workflow 只在 tag 或手动触发，不能弥补 PR 阶段的缺口。

证据：检查实际 workflow；集成测试位置为 [test.yml:97](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/test.yml:97)，lint 为 [ci.yml:65](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/ci.yml:65)。

修复：移除测试及必要 lint 命令的失败吞噬逻辑；需要允许失败的检查应明确限定范围，并保留真实失败状态。

## 已完成验证

- workspace 架构检查通过：51 个包，内部依赖协议和包级依赖无环。
- 全 workspace 已声明的 typecheck 脚本均通过。使用本地现有依赖及构建产物，未执行会重写 dist 的根 `typecheck:prepare`；这不能证明干净镜像可构建。
- browser-worker：19 个测试套件，86 个测试全部通过。
- Control Plane 的 outbox、审批、scheduler、确定性计划调度和风险评估：5 个测试套件，59 个测试全部通过。
- 外发副作用规则、schema ownership（95 张表）、migration authority、Docker V4 layering 检查通过。
- Docker 分层校验经仓库根目录的 `./docker/start-smart.sh` 渲染，PROJECT_ROOT 为当前仓库；未启动、停止或重启服务。
- 鉴权、代理、HTML 注入及健康检查使用当前源码配合内存替身隔离验证，不连接业务数据库、不发真实外部消息。
- 本地复现脚本保存在 `/private/tmp/ops-review-20261008.cjs` 与 `/private/tmp/ops-review-20261008-extra.cjs`，属于临时审查辅助文件；可在当前依赖环境运行后者重现六组代码路径。

## 维护性观察

复杂度门禁通过 1600 行硬限制，但有 9 个文件超过 1200 行建议线。其中包含 1595 行测试文件；其余主要为编译验证、确定性调度、聊天编排、协作运行器与工作空间服务。

建议下次相关需求进入时按职责拆分：编译验证分离验证流水线与运行时探测；确定性调度分离租约管理、节点执行和状态转换；聊天编排分离身份/上下文、模式路由及计划分发；工作空间与协作服务分离数据访问与外部运行时适配。本轮未把文件长度观察作为实际故障项。

## 验证边界

这是一轮全仓库风险审查，不是逐行穷尽审计。已覆盖后端各平面的入口与关键链路、前端及共享包类型检查、Studio 渲染、数据库治理、Docker 和 CI 配置。

未运行真实数据库 E2E、全量容器冒烟、生产镜像构建、Office 宿主交互或 ESP32 固件编译。`validate:migration-targets` 和 `validate:application-database-targets` 因缺少对应数据库 URL 未完成；这属于本地验证前提缺失，未计为代码缺陷。图索引用于发现符号，问题位置和复现均对照当前工作区源码，未把图中的行号或旧签名直接当作证据。

建议修复顺序：先 F01–F04，补齐对应拒绝路径回归测试；再处理 F05–F08 并验证干净构建与服务调用；最后修复 F09–F10，恢复健康检查和 PR 门禁的可信度。
