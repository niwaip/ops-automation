# document-domain

当前目录作为文档能力域的目标逻辑路径，用来统一承接以下现态模块：

- 历史 `apps/backend/domain/document-engine`
- 历史 `apps/backend/domain/report`

## 模块归属说明

- `template`
  - 对应当前 `domain/document-engine` 中的 Studio 模板上传、变量发现、模板元数据和工作流辅助编排
  - 也承接历史 `domain/report` 中偏报表模板管理的一侧
- `render`
  - 对应当前 `domain/document-engine` 的预览、校验与正式渲染能力
  - 也承接历史 `domain/report` 的 Word / Excel / PDF 生成流水线
- `report`
  - 真实运行根目录已位于 `capabilities/document-domain/report`
  - 负责报表任务 API、分析、通知和结果编排
- `runtime-facade`
  - 表示文档域面向执行链路的稳定运行时入口
  - 当前主要落在 `document-engine` 的 `/studio/render-resolved`

## 当前物理状态

- `report` 已完成首轮真实运行包根目录迁移，当前应从
  `apps/backend/capabilities/document-domain/report` 启动。
- 历史 `apps/backend/domain/report` 物理路径已在后续收口中完成删除。
- `document-engine` 的主运行入口已经切到
  `apps/backend/capabilities/document-domain`，本地开发脚本、
  `docker-compose.carbone.yml` 与测试容器默认都从该目录启动。
- 历史 `apps/backend/domain/document-engine` 物理路径已退出仓库，
  不再作为默认运行包根目录。
- 历史 `carbone-engine` 包名仍暂时保留用于兼容 `pnpm --filter carbone-engine ...`
  一类命令；当前由 `apps/backend/capabilities/document-domain/carbone-engine-compat`
  这个轻量 shell 承接，再转发到 `@ops/document-domain`，包括 `test:e2e` 与
  `migrate:sidecar-to-db` 这类历史入口。
- `document-engine/carbone-engine` 的 Docker 启动入口必须统一从仓库根目录
  通过 `./docker/start-smart.sh` 执行，保证当前 worktree 挂载正确。

## 该能力域负责

- 文档模板资产与 Studio 编辑辅助
- 文档渲染、预览、校验与输出生成
- 报表模板、报表任务与结果分发编排
- 面向执行链路的文档域运行时入口

## 该能力域不负责

- 通用控制面的执行生命周期推进
- 平台级统一发布门禁
- 浏览器录制、语义规则与浏览器运行时能力

## 当前结构

```text
apps/backend/capabilities/document-domain/
├── template/         # 模板资产与 Studio 辅助编排
├── render/           # 预览、校验、正式渲染与生成流水线
├── report/           # 报表任务、分析、通知与结果编排
├── runtime-facade/   # 面向执行链路的稳定运行时入口
├── index.ts          # 文档能力域稳定根入口
└── README.md
```

当前批次中，`report` 与 `document-engine` 都已经完成首轮运行包根目录迁移；
`document-engine` 的旧物理路径已退出仓库主运行路径，不再承载本地源码、脚本或
Prisma 配置。

## 当前迁移原则

- 先统一 `document-engine` 与 `report` 的逻辑归属，再决定是否继续拆分物理服务。
- 文档模板、报表模板、渲染流水线与结果分发应被视为同一文档能力域的不同层，而不是互不相关的独立系统。
- 正式运行时入口应继续收敛到稳定 `runtime-facade`，不要在各子模块中继续扩散新的私有执行入口。

## 统一产物语义

- `document-engine`
  - 当前保留 `downloadUrl / fileName / format / size` 等私有返回字段。
  - 同时已补充统一 `artifacts: ArtifactRef[]`，用于表达正式渲染产物。
- `report`
  - 当前保留 `result_file` 作为过渡期私有字段。
  - 同时已补充统一 `artifacts: ArtifactRef[]`，用于表达报表导出产物。
- `ArtifactRef`
  - 文档域统一产物语义应优先落在 `ArtifactRef` 上。
  - 如需补充更多元数据，优先进入 `ArtifactRef.metadata`，不要继续扩散新的平行文件字段。
- 过渡说明
  - 旧字段暂不删除，避免打断现有调用方。
  - 新接入方与未来 `document-domain/runtime-facade` 应优先消费统一 `artifacts`。
  - 当前对齐细节记录在 `docs/design/v4/document-domain-artifact-alignment_v4.1.md`。
