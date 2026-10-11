# 扩展性与运维专项审查 — 2026-10-08

基线：`fb9539fbd8a7d9d09888625fb7d2d1f654cbaad9`。

按最新要求，本轮暂不处理安全功能，重点审查横向扩容、运行时扩展、任务恢复、发布与存储。仅新增审查文档，没有修改业务源码、配置、数据库，也没有启动或停止容器。前轮安全发现保留在原报告中，不列入本轮实施顺序。

## 判断

项目已有适合继续演进的基础：API / dispatcher / schedule 角色拆分、数据库 Outbox、原子步骤抢占、外发效果账本、运行时 Adapter 注册机制及独立迁移入口。前轮包架构校验通过，51 个 workspace 的包级依赖无环。

当前主要缺口是：**部署声明支持多副本，浏览器会话仍依赖单进程状态；任务租约没有覆盖实际执行生命周期；生产交付缺少从干净镜像到真实浏览器会话的闭环验证。** 增加副本前应先解决这些问题。

以下为 9 项专项发现，另汇总前轮已经确认的发布阻塞。P1 表示可能造成任务错误、会话中断、数据丢失或生产路径不可用；P2 表示影响容量、恢复效率和运维可信度。

## 专项发现

### O01 · [P1] 步骤租约固定 5 分钟，没有续租或代际校验

位置：[deterministic-plan-scheduler.service.ts:267](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.service.ts:267)。

`executeStep` 原子领取步骤时固定设置 5 分钟租约，owner 固定为 `deterministic-scheduler`，执行期间没有续租。过期步骤既可以被另一个 scheduler 直接领取，也会被恢复扫描重置为 pending。原调用并没有因此被取消。

这与实际执行策略不一致：[LLM Adapter:58](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/adapters/llm-operation-runtime.adapter.ts:58) 允许最长 600000 ms。即使远端调用不超过 5 分钟，领取后输入解析、浏览器初始化、结果处理也会占用租约时间。

更关键的是，成功回写只按步骤 ID 更新，例如 [scheduler:1084](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.service.ts:1084)，没有核对当前持有者或领取代次。旧执行可能覆盖新执行的状态与输出。

**验证：** 从当前源码 AST 提取实际 `executeStep`，保留完整租约逻辑，以内存 DB 和虚拟时钟验证。租约内第二次调用被阻止；推进至 300001 ms，第一调用仍在等待 adapter，第二调用已进入同一步骤。实际 LLM timeout 方法也确认接受 600000 ms。未连接真实数据库。

**建议：** 提取 LeaseService，使用唯一 owner 与递增 generation；执行中续租，所有状态提交带条件更新；失去租约时取消本地执行或拒绝提交。保留并扩展已有幂等/效果账本。验证的是步骤重入，并不意味着所有外发副作用都会重复，现有账本仍可能阻止部分重复提交。

### O02 · [P1] 浏览器会话没有跨副本归属路由

位置：[worker.service.ts:54](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/worker/worker.service.ts:54)、[browser-session.registry.ts:6](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/browser/infrastructure/browser-session.registry.ts:6)。

WorkerService 的 worker / runtimeSession 索引、BrowserSessionRegistry 和 PlaywrightSessionManager 的会话都保存在进程内 Map。`getWorker` / `deleteWorker` 只查询本地索引；`ensureSessionWorker` 在本地没有索引时直接创建容器。

但生产 [Compose:154](/Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.production.yml:154) 默认声明两个 runtime-worker 副本。Session Broker 的 [AllocationService:9](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/allocation/allocation.service.ts:9) 与 [CdpWorkerClientService:8](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/execution/cdp-worker-client.service.ts:8) 使用服务级固定 URL，没有根据 session owner 选择实例。

当同一会话后续请求到达另一副本，会出现找不到 worker、无法释放原容器，或重新创建浏览器而丢失页面状态。单副本重启后也没有恢复上述索引的流程。

**验证：** 用真实 WorkerService 创建两个实例，以内存替身表示已分配 worker：A 能读取；B 对相同 worker ID 返回 NotFound，对相同 session ID 返回 null。未运行真实负载均衡测试。

**建议：** 将 `runtimeSessionId → workerId / ownerInstance / endpoint / generation` 持久化，提供原子分配和归属查询。浏览器连接与页面对象继续留在归属进程；调用方按归属路由，失联后通过显式恢复策略迁移。共享 Redis Map 本身不能迁移活跃浏览器连接；粘性路由可作临时缓解，仍须解决重启恢复。

### O03 · [P1] 重启清理用 worker ID 查询 runtime session

位置：[worker.service.ts:183](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/worker/worker.service.ts:183)。

启动后的 Docker orphan sweep 从 `ops-browser-session-${workerId}` 提取 worker ID；若本地 Map 没有记录，就把它当作 runtimeSessionId 查询 broker。实际 `createWorker` 每次生成独立 UUID，runtimeSessionId 来自请求，两者没有相等保证，也没有通过 Docker label 保存映射供恢复。

在 broker 对错误 ID 正常返回 404 的部署中，活跃会话也会触发 `remove({force:true})`。重启使本地 Map 为空；共享同一 Docker daemon 的新副本也看不到另一副本的 Map，因此都可能误判。若查询无法完成而返回其他状态，代码会保留容器，这也不等于已正确恢复归属。

**验证：** 真实 sweep 与 `runtimeSessionExists`，替身 broker 对真实 session ID 返回 active，对 worker ID 返回 404；真实 session 存在，但 sweep 仍调用强制删除。Docker driver 完全为替身，没有删除真实容器。

**建议：** 创建时持久化并写入容器标签的 session / worker / owner 标识；启动时先重建或核实归属，再清理已确认关闭的会话。清理规则需要宽限期、跨实例互斥和可审计原因，不能以“本进程没有记录”判断容器废弃。

### O04 · [P1] 生产 runtime-worker 未配置当前容器驱动所需资源

位置：[docker-compose.production.yml:130](/Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.production.yml:130)。

当前 [WorkerModule:14](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/worker/worker.module.ts:14) 始终注入基于 Unix socket 的 DockerodeContainerDriver，默认 `/var/run/docker.sock`。生产 runtime-worker 未声明 socket 挂载，也没有远程驱动替代配置。

同时，WorkerService 创建会话容器使用默认网络 `ops-network`；生产 Compose 定义的是 control / runtime / data 网络，没有设置 `NETWORK_NAME` 或声明该外部网络。其会话镜像默认 `ops-browser-chrome:local`，也没有生产镜像配置或该镜像的生产交付说明。

这些前提不是仅供 `/workers` 管理接口使用：[PlaywrightSessionManager:287](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/browser/adapters/playwright/playwright-session.manager.ts:287) 初始化浏览器时也先调用 `ensureSessionWorker`，正常模块装配会注入 WorkerService。

**证据类型：** 对照当前 provider、浏览器初始化链及生产 Compose 的静态结论；没有执行生产容器启动。若部署另有仓库外 overlay 提供这些资源，应把它纳入交付契约和验证，目前不能从仓库配置确认。

**建议：** 明确 worker 使用本机 daemon 还是远程容器平台，补齐对应驱动、可访问网络和固定版本的会话镜像；纳入生产配置检查及真实会话冒烟。仅验证 HTTP /health 或 Compose 能渲染不足以覆盖该路径。

### O05 · [P1] 产物与默认上传存储没有跨副本、跨容器生命周期保障

位置：[browser-artifact-ref.factory.ts:10](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/browser-worker/src/modules/browser/application/browser-artifact-ref.factory.ts:10)、[chat-media.service.ts:746](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-media.service.ts:746)。

浏览器 HTML / 截图 / snapshot 产物读取和写入本地 artifactDir，URL 指向公共 worker 入口，没有存储对象键或实例归属。另一副本收到下载请求时未必有文件；容器替换后没有持久卷保留文件。

AI 上传文件有内存缓存和磁盘元数据，也已有 StorageConfigService 的对象存储后端与读取兜底，不能认为项目完全没有远程存储能力。但生产 Compose 未注入 `STORAGE_*`，也没有持久卷；默认 [storage-config.service.ts:18](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/storage/storage-config.service.ts:18) 仍是 local。上传本地写失败只记录 warning；远端 saveFile 为异步调用，未等待成功就返回上传成功。

**证据类型：** 文件写读路径、已有后端与生产配置的静态核对，未做真实容器替换或对象存储故障实验。风险指默认仓库生产配置；已正确配置远端存储的部署可缓解 AI 文件部分风险。

**建议：** 复用现有对象存储能力，补齐生产环境配置，将浏览器产物也接入统一 ArtifactStore；关键上传必须在持久化成功后确认。保存对象键、哈希、大小和内容类型，独立管理缓存与保留期。若先用共享卷过渡，应同时验证多副本可见性和容器替换后的读取。

### O06 · [P2] Outbox 批量领取与串行执行生命周期不匹配

位置：[execution-dispatcher.service.ts:65](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/dispatcher/execution-dispatcher.service.ts:65)。

默认一次领取 20 条、租约 30 秒，随后在 `for...of` 内逐条 await `scheduler.advanceExecution`。该方法可以等待实际步骤并继续推进后续节点，不是立即返回的调度入队动作。首条慢任务因此阻塞同批后续任务。

[Outbox SQL:73](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/outbox/execution-outbox.service.ts:73) 允许其他副本重领已过期行，且每次领取都会增加 attempts。等待中的后续任务尚未开始执行就可能租约过期、重复领取并消耗尝试计数；当前没有续租方法。步骤锁会暂时拦住一部分重复推进，但不能解决领取计数与等待时长失真，结合 O01 还会增加步骤重入风险。

**验证：** 真实 dispatcher 配合延迟 scheduler，确认两条消息同时领取，第二条必须等待第一条结束；默认 limit=20、leaseMs=30000。没有用真实 PostgreSQL 演示二次领取，二次领取判断来自实际 SQL。

**建议：** 将“领取并可靠交接”与“长时间执行”分开；或者只领取空闲槽位数，采用有界并发并续租在途消息。明确 attempts 代表领取次数还是实际执行失败次数，避免慢任务被误判为毒消息。

### O07 · [P2] 恢复扫描无分页、无重入保护，每个 dispatcher 全量执行

位置：[deterministic-plan-recovery.service.ts:69](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-recovery.service.ts:69)、[execution-dispatcher.service.ts:38](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/dispatcher/execution-dispatcher.service.ts:38)。

恢复扫描读取全部 queued / running deterministic executions 及 planJson，没有 take、cursor 或仅需恢复记录的筛选。每个 dispatcher 默认每 30 秒调用，并逐条等待 `advanceExecution`。扫描超过周期时，下一轮仍会启动；同进程内也没有 recovery in-flight guard。

随着任务积压或副本增加，会重复读取同一批计划、重复尝试抢占步骤；一个慢计划还会延迟同一轮后续恢复。这不是“系统完全没有锁”，已有步骤原子抢占能阻止租约内的大部分重复执行；问题是扫描成本、恢复延迟和调度并发缺乏边界。

**验证：** 从当前源码提取实际 recovery 方法，以内存 DB 和阻塞 scheduler 并发调用两次，确认两轮同时查询且推进相同 execution，查询无分页参数。未做数据库容量压测。

**建议：** 按到期/失联条件领取有限恢复候选，提供分页与最大处理量；进程内避免扫描重叠，跨实例分片或用短租约认领候选；恢复只负责重新入队，不长期阻塞扫描。

### O08 · [P2] dispatcher 关闭没有执行排空，领取失败也未被轮询入口捕获

位置：[worker-main.ts:13](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/worker-main.ts:13)、[execution-dispatcher.service.ts:37](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/dispatcher/execution-dispatcher.service.ts:37)。

worker 入口创建 application context 后没有注册 shutdown hooks，也没有保留 app 并显式处理终止信号。dispatcher 的 onModuleDestroy 只清定时器，不等待在途 dispatch / recovery。因此 Compose 的 60 秒 stop_grace_period 没有对应的“停止领取、完成或交接、退出”实现。滚动替换会依赖租约到期恢复，且可能留下仍在远端进行的调用。

另外，轮询直接 `void this.dispatchOnce()`；claimBatch 在内层消息 try/catch 之前。数据库领取失败会让整个 Promise reject，入口没有 catch。实际是否导致进程退出取决于 Node 启动选项及全局处理器，当前入口未提供局部故障恢复。

**证据类型：** 启动与生命周期代码静态检查；未向真实服务发送 SIGTERM，也未注入真实 DB 故障。仓库代码搜索未发现 enableShutdownHooks。

**建议：** 注册关闭流程，停止认领、暴露 draining 状态、等待有界时间、释放/交接租约并关闭连接。轮询入口捕获错误，记录原因并退避重试；关闭流程与 O01 的执行取消、代际提交一起设计。

### O09 · [P2] SSE 每连接独立轮询，重连从全部历史开始

位置：[execution-stream.service.ts:28](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/lifecycle/execution-stream.service.ts:28)、[execution.controller.ts:253](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/execution.controller.ts:253)。

每次订阅创建独立的 500 ms DB 轮询，初始 cursor 总是 undefined。Controller 只输出 `data:`，不输出 SSE `id:`，也不接受 Last-Event-ID 作为恢复游标。因此同任务多客户端会重复查库；连接重建会从历史起点回放。

仅按默认周期计算，1000 个持续空闲连接约产生 2000 次 listEventsAfter 调用/秒，历史回放还有额外查询。这是代码模型推算，不是实测吞吐或容量结论。

**验证：** 真实 stream service 对同 execution 建立两订阅，立即产生两次独立查询，初始 cursor 均为 undefined；读取实际 Controller 确认帧与参数行为。

**建议：** 同实例按 executionId 合并拉取并扇出；提供持久事件游标与 SSE id / Last-Event-ID；限制重放窗口与连接缓冲。若以后引入事件通知，保留 DB 游标补偿，不把易失消息当作唯一事实来源。

## 已有发布阻塞与运维可信度问题

以下复用前轮证据，没有重复计算为上述 9 项，也没有因暂缓安全功能而推迟基础发布配置：

| 优先级 | 问题 | 位置 / 证据 |
| --- | --- | --- |
| P1 | delivery fixture 未提供校验脚本要求的全部环境变量，verify 阻塞 publish | [workflow:100](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/task-orchestration-delivery.yml:100)，隔离脚本已复现退出码 1 |
| P1 | Docker build 未复制 tsconfig.base.json | [Dockerfile:7](/Users/chain/Documents/MyProject/ops-automation/docker/node-service/Dockerfile:7)，TypeScript 配置解析已复现 TS5083 |
| P1 | 只构建目标包，遗漏 AI 运行时依赖的 workspace dist | [Dockerfile:19](/Users/chain/Documents/MyProject/ops-automation/docker/node-service/Dockerfile:19)，构建链静态确认，未真实构建镜像 |
| P2 | 健康检查把 ECONNREFUSED 等网络错误当作健康 | [proxy.service.ts:177](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/proxy/proxy.service.ts:177)，真实方法已隔离复现 |
| P2 | PR 测试及必要 lint 使用失败吞噬 | [test.yml:36](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/test.yml:36)、[ci.yml:65](/Users/chain/Documents/MyProject/ops-automation/.github/workflows/ci.yml:65)，workflow 静态确认 |

## 扩展边界建议

- **运行时能力：** 继续使用 [RuntimeAdapterRegistry](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/adapters/runtime-adapter.registry.ts:46) 的 provider discovery、routeKeys 和冲突检测。新能力实现 adapter 与契约，避免继续向 scheduler 填运行时特例。统一超时、取消、错误分类和幂等语义。
- **调度领域：** scheduler 当前超过 1200 行建议线，适合按租约、节点执行、状态提交三个职责小步下沉。先建立所有权不变量，再抽代码，避免只按行数分文件。
- **运行时资源：** 将 worker 归属登记、容器驱动、浏览器状态和产物存储分开；多宿主机时，容器地址与 profile 路径也必须属于对应宿主机，不能仅共享进程 Map。
- **容量与观测：** 在已有日志/指标基础上增加队列最老等待时间、实际启动延迟、在途槽位、租约续期失败/过期次数、恢复扫描数量/耗时、孤儿清理原因、产物写入失败及 SSE 查询量。扩副本前明确 CPU/内存、浏览器容器数量、DB 连接和外部模型配额预算。

## 建议实施顺序与验收

| 顺序 | 工作 | 必须验证的结果 |
| --- | --- | --- |
| 1 | 补齐发布 fixture、根构建配置和 workspace 依赖构建；明确 worker 的 daemon / network / 会话镜像配置 | 干净上下文构建三类镜像，启动并创建真实浏览器会话；严格 PR 门禁保留真实失败状态 |
| 2 | O01 租约续期、唯一 owner、generation、条件提交；O06 有界领取与执行交接 | 长于 5 分钟任务持续运行；双 dispatcher 竞争时只有当前代次能提交；慢任务不阻塞无关短任务 |
| 3 | O02 / O03 worker 归属持久化、请求路由和恢复清理 | 两副本交替请求同会话仍使用同一浏览器；滚动重启不误删其他实例活跃容器；确认关闭会话能被回收 |
| 4 | O05 接通既有对象存储并统一浏览器产物；上传失败可观测且不误报成功 | A 上传、B 下载；替换容器后链接可读；存储不可用时得到明确失败或可查询的处理中状态 |
| 5 | O07 / O08 有界恢复、退避与关闭排空，修正健康信号 | 大量积压时扫描有边界且不重叠；DB 短暂断连后自动恢复；SIGTERM 后停止领取并完成/交接在途任务 |
| 6 | O09 合并订阅与重连游标，建立容量基线 | 重连只重放游标之后事件；同任务多订阅不线性增加 DB 轮询；记录排队/执行/恢复延迟和资源曲线 |

实施中的 Docker 构建、启动、停止、测试仍须从仓库根目录经 `./docker/start-smart.sh` 执行，确认 PROJECT_ROOT 和挂载路径；变更运行配置后按服务模式重启并验证真实链路。

## 验证范围

本轮隔离复现脚本：[ops-scalability-review-20261008.cjs](/private/tmp/ops-scalability-review-20261008.cjs)。7 组断言通过，覆盖错误 orphan ID、跨实例状态缺失、租约过期重入、LLM 最长超时、批量串行阻塞、SSE 独立拉取和恢复扫描重叠。脚本使用当前源码真实方法或明确标注的 AST 方法提取，DB / Docker / scheduler 的外部行为为替身，没有真实业务副作用。

沿用前轮验证结果：workspace 类型检查全部通过；browser-worker 19 套件 / 86 测试、Control Plane 所选 5 套件 / 59 测试通过；架构、数据库职责和 Docker 分层静态检查通过。这些结果不能覆盖上述新增多实例、长任务及故障场景。

本轮没有做生产镜像构建、多容器负载均衡、真实 DB 故障注入、SIGTERM 排空、对象存储故障实验或容量压测。静态缺口与代码模型推断均已单独注明；本报告不宣称现有吞吐上限或实际 RTO。完整前轮记录见 [project-review-2026-10-08.md](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/project-review-2026-10-08.md)。
