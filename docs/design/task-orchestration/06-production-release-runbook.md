# Task Orchestration 生产发布运行手册

本手册把设计文档中的 P0/P1/P2 发布依赖收敛为可执行门禁。它不授权任何人绕过审批、修改生产数据或将实验性能力直接投入生产。

## 责任边界

| 角色 | 必须完成的事项 | 不可替代项 |
| --- | --- | --- |
| CI | 严格测试、构建、漏洞扫描、推送 SHA 对应镜像、产出 Digest | 不能执行 DBA 授权或打开业务灰度 |
| 发布负责人 | 将 CI Artifact 中的 Digest 写入发布配置，按顺序部署和回滚 | 不能使用浮动 Tag 或共享数据库登录 |
| DBA | 在生产基线副本验证迁移、创建角色、授予登录成员资格、执行负权限验证 | 不能由应用容器执行 `db push` 或 `roles.sql` |
| 业务审批人 | 批准 Risk V2、Candidate Recipe、Memory 与并行执行的 Canary | 不能以测试通过替代审批 |

## 1. 合并门禁与镜像产物

`.github/workflows/task-orchestration-delivery.yml` 是本设计的严格 CI 门禁。它不会继承旧 CI 中的 `|| exit 0` 容错语义。

它必须通过：Schema Owner、Planning Decision/Result Ref/Capability SDK 合同、AI 完整测试、Control Plane PostgreSQL 回归，以及 Production Compose 输入校验。

合入受保护 `main` 后，流水线对 Control Plane、AI Orchestrator 和 Runtime Worker 分别：

1. 使用冻结 Lockfile 构建。
2. 扫描 HIGH/CRITICAL 漏洞；发现未忽略漏洞即失败。
3. 仅以提交 SHA 标记镜像并推送到 GHCR。
4. 上传 `image@sha256:...` 与 Provenance Artifact；后者同时包含 Git Commit、`pnpm-lock.yaml` 的 SHA-256 和镜像 Digest，发布人只能使用该 Artifact 的引用。

不要将 `:main`、`:latest` 或任何浮动 Tag 填入 Production Compose。

## 2. 发布前机器校验

准备独立的控制面和 AI 数据库登录后，执行：

```bash
export CONTROL_PLANE_IMAGE='ghcr.io/example/ops-control-plane@sha256:...'
export AI_ORCHESTRATOR_IMAGE='ghcr.io/example/ops-ai-orchestrator@sha256:...'
export RUNTIME_WORKER_IMAGE='ghcr.io/example/ops-runtime-worker@sha256:...'
export CONTROL_PLANE_DATABASE_URL='postgresql://control_plane_app:...'
export AI_ORCHESTRATOR_DATABASE_URL='postgresql://ai_orchestrator_app:...'
export REDIS_HOST='...'
export REDIS_PASSWORD='...'
export SESSION_BROKER_URL='...'

./docker/scripts/validate-production-delivery.sh
```

该命令会拒绝非 Digest 镜像、共享的 Control/AI 数据库 URL，以及无法渲染的 Compose；它不会连接业务数据库，也不会部署服务。

## 3. DBA 门禁

DBA 先在生产基线副本按时间顺序执行全部 Prisma Migration，再执行 `database/security/roles.sql`，并以独立管理员连接验证：

```bash
export DATABASE_ADMIN_URL='postgresql://db_admin:...'
export CONTROL_PLANE_DB_LOGIN='control_plane_app'
export AI_ORCHESTRATOR_DB_LOGIN='ai_orchestrator_app'
export RUNTIME_WORKER_DB_LOGIN='runtime_worker_app'

./docker/scripts/validate-production-delivery.sh --verify-db-roles
```

验收必须证明：

- `PUBLIC` 没有 `public` Schema 的 `CREATE` 权限；
- Control Plane 拥有 Execution/Experience Writer、没有 Registry Writer；
- AI 拥有 Intelligence Writer、不能写 `executions`；
- Runtime Worker 使用独立登录；
- Control Plane 和 AI Orchestrator 注入不同的数据库 URL。

## 4. 部署与功能灰度顺序

1. 所有新开关关闭，使用 CI Artifact 的 Digest 部署 API、Dispatcher、Schedule 和 Runtime Worker。
2. 完成旧链路回归；确认 Dispatcher 和 Runtime Worker 可被独立扩缩容。
3. 打开 Planning Decision 和 Token Ledger 的只记录模式。
4. 打开 Result Ref 双写。
5. 打开 Outbox 双写，启动独立 Dispatcher 与 Schedule Trigger，再切换执行权。
6. 仅在内部低风险组织 Canary Risk V2 和 Scoped Memory；Memory 必须确认只进入 Planner Context。
7. 最后 Canary Safe Ready Set Parallel；Candidate Recipe 只在阈值和人工批准后进入 Canary。

每一步均需观察 Error、拒绝日志、Outbox Lease、Schedule Fire 唯一性和权限拒绝事件。失败时先停止独立 Worker，再关闭对应开关；审计表和 Migration 不回滚删除。
