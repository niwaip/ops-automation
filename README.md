# Ops Automation Monorepo

当前仓库按以下目录职责组织：

- `apps/`: 业务服务与运行时实现
- `packages/`: 共享包与契约
- `docker/`: 容器编排、Compose、运行脚本与 SQL 初始化文件
- `docs/`: 设计文档、历史资料与校验产物归档

当前实施基线：V4

- 设计导航：`docs/design/README.md`
- Docker 分层蓝图：`docs/design/v4/Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md`

常用入口：

```bash
pnpm docker:infra:up
pnpm docker:addin:up
pnpm docker:addin:smoke
pnpm docker:v4:validate
pnpm docker:v4:acceptance

./docker/start-smart.sh docker-compose.full.yml up -d
bash ./docker/addin-smoke.sh
bash ./docker/v4-acceptance.sh
```

兼容说明：

- 历史校验产物已归档到 `docs/artifacts/`
