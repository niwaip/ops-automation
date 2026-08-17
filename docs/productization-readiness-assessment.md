# 产品化就绪度风险评估与治理建议

> 评估日期：2026-08-14  
> 评估范围：仓库结构、代码复杂度、协议一致性、CI/测试、部署、安全、文件数据链路与运维基础  
> 文档性质：基于当前代码现态的产品化治理基线，不替代专项安全审计和生产压测

## 1. 执行摘要

当前项目已经形成平台、编排、执行控制、能力域、运行时和前端等较清晰的领域边界，具备继续产品化的架构基础。但发布纪律、安全边界、文件数据链路和统一结果协议的发展明显落后于功能探索速度，当前不宜直接作为正式生产版本大规模对外发布。

综合产品化成熟度估计约为 **3/10**：

| 维度 | 判断 | 主要依据 |
| --- | ---: | --- |
| 架构方向 | 6/10 | 已形成平台、编排、运行时、能力域等边界 |
| 代码可维护性 | 3/10 | 存在巨型文件、高复杂度热点和多套兼容逻辑 |
| CI 与发布 | 1/10 | 构建、类型检查和测试失败仍可能显示通过 |
| 测试质量 | 3/10 | 测试资产不少，但缺少有效门禁和统一覆盖率要求 |
| 安全与数据治理 | 2/10 | 内部接口暴露、默认密钥、文件 Base64 全链路传递 |
| 运维能力 | 3/10 | 可重复构建、数据库迁移、健康检查和 SLO 尚未体系化 |

产品化阶段不建议进行大爆炸式目录重构，也不建议同时把所有探索能力转为正式能力。优先目标应是建立一条可证明地安全、可测试、可部署、可观测、可回滚的“黄金链路”，再让 PDF、浏览器、文档和后续 Skills 通过同一套准入门禁进入生产。

## 2. 当前基础与正向资产

项目并非需要推倒重来，以下基础值得保留并强化：

- 已按 governance、intelligence、registry/release、capabilities、runtimes、execution-control 等方向划分后端职责。
- 已建设 backend-contracts、确定性计划冻结、Schema 校验、能力证明和运行时契约等基础能力。
- 已存在 Trace ID、执行事件、部分运行手册、数据库 migration 和较多测试文件。
- 根级 `AGENTS.md` 已明确单文件复杂度、Docker 入口和修改后验证要求。
- `docs/design`、`docs/runbook` 已形成设计与运行资料的基本组织方式。

因此，治理策略应以收敛、加固和建立准入机制为主，而不是先做全面重写。

## 3. P0：正式发布阻断项

### 3.1 CI 无法真实证明代码可发布

根目录类型检查当前报告约 5,978 个错误，分布在约 523 个文件。错误包括模块模式不一致、路径别名无法解析、装饰器配置冲突、隐式 `any`、浏览器与 Node 构建配置互相影响等。

更严重的是，关键工作流使用了 `|| exit 0` 和 `continue-on-error`：

- `.github/workflows/ci.yml` 中 lint、format、typecheck、边界验证和 build 可以失败后继续。
- `.github/workflows/test.yml` 中 unit 和 integration test 可以失败后继续。
- `.github/workflows/e2e-test.yml` 中 build 和 E2E 可以失败后继续，并存在已失效的服务目录。

这意味着 CI 绿色目前不能作为发布证据。

治理建议：

1. 修正 E2E 中的服务路径，删除关键检查上的 `|| exit 0` 和 `continue-on-error`。
2. 不再使用一个根级 NodeNext 配置检查 Web、Nest、Office、Mobile 等全部工程，改为 package-scoped typecheck/build/test 矩阵。
3. 按核心服务逐个清零错误，先覆盖黄金链路，不要求一次性修复全部存量。
4. 核心包禁止使用 `--passWithNoTests` 掩盖测试缺失，并设置最低覆盖率。
5. 分支保护强制要求 typecheck、build、unit、contract 和 E2E 通过。

### 3.2 内部服务边界存在越权和暴露风险

需要优先确认和修复的现态包括：

- Document Domain 的内容提取和 Markdown Artifact 接口未体现明确的服务认证保护。
- Document Domain CORS 使用 `origin: true` 且允许 credentials。
- Skill match 接口标记为 `@Public()`，同时接受请求体中的 `userId`。
- Compose 中存在 JWT、internal secret、数据库和 Redis 的默认值。
- Browser Worker 镜像中存在关闭 TLS 证书验证的配置。
- 多个内部 Guard 存在 `INTERNAL_API_SHARED_SECRET || JWT_SECRET` 的回退逻辑，用户认证密钥和服务认证密钥未彻底分离。

建议建立三类安全边界：

| 边界 | 最低要求 |
| --- | --- |
| 浏览器公开 API | 用户 JWT、租户校验、RBAC、限流、审计 |
| 内部服务 API | 独立服务身份、短期凭证或 mTLS，不接受客户端传入的用户身份作为信任来源 |
| 运行时能力 | 网络隔离、权限清单、资源配额、输入限制、操作审计 |

产品化前应对 PDF 解析、浏览器控制、外部 URL 请求、文件写入和 Artifact 下载进行专项威胁建模。

### 3.3 文件链路不支持可靠扩容与数据治理

当前聊天文件主要保存在进程内 `Map`，完整 Base64 会继续进入编排输入、执行输入和持久化链路。这会带来：

- 服务重启后文件丢失，多副本之间无法共享文件。
- Base64 使数据体积增加约三分之一，并可能在执行、步骤、事件中重复保存。
- 缺少可靠的租户归属、保留期、删除审计、加密和恶意文件检测。
- 大文件会增加数据库、消息传递、日志和内存压力。

目标链路应调整为：

```text
上传文件
  -> 对象存储
  -> 生成 fileId / tenantId / hash / MIME / size 等元数据
  -> 执行记录只保存 fileRef
  -> Worker 经授权后流式读取
```

PDF Skill 和后续文件类 Skill 应接收 `fileRef`，而不是整段 Base64。对象存储层需要 TTL、租户所有权校验、加密、大小限制、MIME 检测、病毒扫描和删除审计。

### 3.4 BusinessResult/WorkflowResult 缺少唯一协议来源

此前 `businessData.total_items`、`updated_at`、`market` 的断言问题，不只是单个草图或工作流问题，而是结果协议分散的系统性信号。

当前结果 Envelope、状态映射和规范化逻辑分布在多个位置：

- `packages/user-core/src/domain/executions/result.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/state/execution-result-normalizer.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-result-normalizer.service.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.types.ts`

建议建立唯一协议包：

```text
packages/backend-contracts/execution-result/
  schema.json
  types.ts
  normalizer.ts
  validators.ts
  fixtures/
```

要求：

- 类型、JSON Schema、校验器和测试 Fixture 来自同一来源。
- 生产者和消费者都运行契约测试。
- 旧结构兼容只能存在于入口 Adapter；标准化完成后，内部只允许一种结构。
- 明确区分协议层 `status`、数据库执行状态和业务空结果，禁止各服务自行映射。
- `businessData` 的 required、默认值和空结果语义必须由能力契约声明，不能由 LLM 临时推断。

## 4. P1：可维护性与组织风险

### 4.1 项目规模已进入平台治理阶段

当前生产 TypeScript/TSX 源码约 19.9 万行、1,771 个文件、39 个包，基础 Compose 启动约 18 个服务，并存在多个 Compose 变体和多份 lockfile。

主要风险不是服务数量本身，而是以下信息尚未成为强制元数据：

- 服务 owner 和值班责任人。
- 数据所有权与租户边界。
- 对外接口、内部接口和依赖方向。
- `production / experimental / deprecated` 生命周期。
- SLA/SLO、容量目标和故障降级方式。

建议建立服务目录，并让 CI 校验核心字段。没有 owner、没有契约、没有运维手册的模块不能晋级为 production。

### 4.2 巨型文件扩大变更影响面

代表性热点包括：

- `playwright-cli.adapter.ts`：约 3,928 行。
- `AIControls.tsx`：约 4,710 行。
- `SkillAdminPage.tsx`：约 2,286 行。
- `recognizer.service.ts`：约 1,817 行。
- `execution-plan-normalization.service.ts`：约 1,540 行。

代码图谱还显示部分页面和校验函数具有较高扇出和认知复杂度。因此拆分顺序应按以下公式确定，而不只是机械按行数排序：

```text
治理优先级 = 变更频率 × 影响范围 × 认知复杂度 × 故障风险
```

建议优先拆分前十个热点：

- Adapter：协议适配、命令执行、错误映射、资源管理分别下沉。
- Service：编排层、领域逻辑、持久化、外部适配分离。
- React 页面：页面容器、业务区块、hooks、API/state/utils 分离。
- Normalizer：入口兼容、标准结构和 Schema 校验分离。

### 4.3 兼容逻辑和重复协议正在形成长期成本

生产源码中存在较多 legacy/compat 分支。探索阶段保留双路径是合理的，但产品化后必须为兼容逻辑设置：

- 明确 owner。
- 停止新增日期。
- 迁移完成条件。
- 删除期限。
- 兼容路径命中指标。

不应让每个消费者同时理解新旧协议；兼容处理必须集中在系统入口。

### 4.4 包管理和部署方式不可重复

当前存在 npm/pnpm 混用、多份 lockfile、容器启动时安装依赖、`--no-frozen-lockfile` 和 `prisma db push` 等探索环境做法。

生产环境应做到：

- 确定唯一包管理器和唯一依赖锁定策略。
- 构建阶段使用冻结锁文件，运行时禁止安装依赖。
- 发布不可变镜像并使用 digest。
- 数据库变更通过版本化 migration job 执行，不在每个服务启动时 `db push`。
- 每个服务配置 readiness、liveness、资源限制和优雅关闭。
- 开发 Compose 与生产部署定义分离，避免将开发便利配置带入生产。

## 5. 产品化组织建议

### 5.1 不先做大规模目录搬迁

现有领域方向具备合理性。短期内建议保持顶层边界稳定，先统一以下横向规则：

- 单一契约来源。
- 服务目录与 owner。
- 统一鉴权和租户上下文。
- 统一日志、指标、Trace 和错误码。
- 统一发布门禁。
- 统一文件引用和数据保留策略。

只有当模块依赖和所有权已经清晰后，再评估目录合并或服务收缩。

### 5.2 建立能力/Skill 晋级机制

建议为所有内置 Skill 和后续扩展 Skill 设置统一状态：

```text
draft -> experimental -> certified -> production -> deprecated
```

进入 `certified` 至少需要：

- Manifest 和版本信息。
- 明确的输入、输出及 BusinessResult Schema。
- 权限、网络、文件和租户声明。
- 正常、空结果、部分结果、异常结果 Fixture。
- 单元测试、契约测试和端到端测试。
- 超时、重试、幂等和配额策略。
- 日志脱敏、指标和 Trace。

PDF 能力不应作为特殊硬编码链路；它应成为文件类能力的第一个标准实现，验证 `fileRef -> 内容提取 -> 标准 BusinessResult -> Artifact` 的通用协议。

### 5.3 建立架构决策和变更责任

建议补充并执行：

- `CODEOWNERS`：关键目录至少两级 owner。
- ADR：记录协议、存储、鉴权、服务拆分等不可逆决策。
- `SECURITY.md`：漏洞处理、密钥规范、威胁模型入口。
- 发布手册：构建、迁移、灰度、回滚、数据兼容。
- 服务 SLO：成功率、P95/P99 延迟、队列积压、失败恢复时间。

## 6. 分阶段治理路线

### 阶段一：可信发布基线，第 1～2 周

- 冻结非必要的新能力开发。
- 修复 CI，使任何关键检查失败都能真实阻止合并。
- 建立核心服务 package-scoped typecheck/build/test 矩阵。
- 确定一个正式支持的 UI、一个执行入口和一条黄金工作流。
- 建立服务目录：owner、状态、依赖、数据、SLA。
- 记录当前发布基线和可重复验证命令。

完成标准：黄金链路只能从全绿流水线发布，且能够重复构建。

### 阶段二：安全和文件治理，第 3～4 周

- 封闭所有内部接口，建立服务身份。
- 移除默认密钥、JWT secret 回退和 TLS 绕过。
- 文件迁移到对象存储引用模式。
- 增加租户校验、限流、审计和保留期。
- 对 PDF、浏览器自动化和 Artifact 进行专项威胁建模。

完成标准：不能通过公开接口伪造 userId 调用内部能力，执行链路不再持久化完整文件 Base64。

### 阶段三：协议和代码治理，第 5～8 周

- 建立唯一 ExecutionResult/BusinessResult 合同包。
- 增加生产者—消费者契约测试。
- 拆分前十个高风险 Service、Adapter 和 React 页面。
- 清理重复 Normalizer、长期兼容分支和失效服务壳。
- 统一 package manager、lockfile 和生产镜像构建。
- 数据库发布切换到 migration。

完成标准：黄金链路中所有结果都能由同一 Schema 验证，服务构建不依赖运行时安装。

### 阶段四：持续运维治理

- 建立 SLO、告警、链路追踪、容量和成本指标。
- 执行备份恢复、故障注入和负载测试。
- 建立灰度、回滚和数据兼容演练。
- 所有新 Skill 强制经过统一认证门禁。

## 7. 建议跟踪指标

| 指标 | 第一阶段目标 |
| --- | ---: |
| 必需 CI 检查误通过数量 | 0 |
| 黄金链路 TypeScript 错误 | 0 |
| 核心包无测试但通过数量 | 0 |
| 生产内部接口匿名访问数量 | 0 |
| 执行记录中的原始文件 Base64 | 0 |
| 未声明 owner 的 production 服务 | 0 |
| 超过 1,200 行的新增业务文件 | 0 |
| 未通过契约测试的 production Skill | 0 |
| 可回滚发布比例 | 100% |

## 8. 关键证据位置

- CI：`.github/workflows/ci.yml`
- 单元与集成测试：`.github/workflows/test.yml`
- E2E：`.github/workflows/e2e-test.yml`
- Document Domain CORS：`apps/backend/capabilities/document-domain/main.ts`
- Document 内容提取接口：`apps/backend/capabilities/document-domain/runtime-facade/content-extraction/document-content-extraction.controller.ts`
- Skill match：`apps/backend/core/platform/src/modules/skill/skill.controller.ts`
- 聊天文件暂存：`apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-media.service.ts`
- 文件进入编排：`apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-orchestrator.service.ts`
- 执行结果规范化：`apps/backend/execution-control/control-plane/src/modules/execution/state/execution-result-normalizer.ts`
- 用户侧结果类型：`packages/user-core/src/domain/executions/result.ts`
- 开发环境依赖与数据库启动方式：`docker/compose/docker-compose.base.yml`
- Workspace 依赖初始化：`docker/scripts/bootstrap-workspace-deps.sh`

## 9. 决策建议

当前最合理的产品化决策是：

1. 暂不追求所有探索能力同时正式化。
2. 选定一条黄金链路作为 8 周治理目标。
3. 将 CI 真实性、安全边界、文件引用化和结果协议唯一来源列为发布阻断项。
4. 将代码拆分和目录治理围绕黄金链路渐进完成，避免大规模重写。
5. 以后所有能力，包括 PDF Skill，都必须通过相同的契约、安全、测试和运维门禁。

该策略能够保留现有探索成果，同时把未来新增能力的边际治理成本降下来。
