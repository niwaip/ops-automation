# Document Domain 统一逻辑视图 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch C4`，用于把当前分散在多个服务中的文档相关能力，统一映射到未来的 `document-domain` 逻辑视图。

## 1. 当前归属映射

| 当前路径 | 当前职责 | 未来逻辑归属 |
| :--- | :--- | :--- |
| `apps/backend/domain/document-engine` | 文档模板工作台、变量发现、预览、正式渲染入口 | `document-domain/template` + `document-domain/render` + `document-domain/runtime-facade` |
| `apps/backend/capabilities/document-domain/report` | 报表模板、报表生成、导出、通知、分析 | `document-domain/report` + 部分 `document-domain/render` |

## 2. 统一结构草图

```text
capabilities/document-domain/
├── template/
│   ├── studio/
│   ├── repository/
│   └── workflow-authoring/
├── render/
│   ├── preview/
│   ├── validation/
│   ├── resolved-render/
│   └── output-generators/
├── report/
│   ├── template/
│   ├── analyzer/
│   ├── notification/
│   └── report-api/
└── runtime-facade/
    ├── render-entry/
    └── artifact-bridge/
```

## 3. 当前迁移约束

- `document-engine` 当前仍保留历史目录 `apps/backend/domain/document-engine`，但真实运行入口、compose working directory 与默认脚本已切到 `apps/backend/capabilities/document-domain`；旧目录已退出活动 `pnpm-workspace` package 集合，且目录内 `package.json` / `package-lock.json`、`src/`、`prisma/` 与 `tsconfig.json` 已移除，当前仅保留 `README.md` 作为迁移说明锚点。
- `report` 的真实运行包根目录已经迁到 `apps/backend/capabilities/document-domain/report`，旧 `apps/backend/domain/report` 物理路径已在后续收口中完成删除。
- 新增文档域需求必须先判断属于 `template`、`render`、`report` 或 `runtime-facade`。
- 文档域新增功能不应继续在两个旧服务之间随机分散。

## 4. 当前观察

- `document-engine` 更偏文档模板工作台、变量解析、预览与正式渲染入口。
- `report` 更偏报表模板、导出生成、通知与结果整合。
- 两者已经共享同一类“模板 -> 渲染/生成 -> 产物输出”的业务主线，只是历史上分散在不同服务。

## 5. 对后续批次的衔接

- `Batch C5`：统一文档渲染结果与报表导出结果的产物结构，并与 `ArtifactRef` 对齐。
- `document-engine` 已完成基于 `./docker/start-smart.sh` 的 compose/test 入口收口，并验证独立 `carbone-engine` 服务可健康启动；旧包名 `carbone-engine` 的默认 `typecheck/build/test/test:e2e/migrate:sidecar-to-db` 脚本当前由 `apps/backend/capabilities/document-domain/carbone-engine-compat` 承接并转发到 `@ops/document-domain`。后续物理迁移时，应优先保持 `runtime-facade` 南向稳定，再逐步收拢内部模板与渲染实现。
