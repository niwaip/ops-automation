# Document Domain 统一逻辑视图 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch C4`，用于把当前分散在多个服务中的文档相关能力，统一映射到未来的 `document-domain` 逻辑视图。

## 1. 当前归属映射

| 当前路径 | 当前职责 | 未来逻辑归属 |
| :--- | :--- | :--- |
| `apps/backend/domain/document-engine` | 文档模板工作台、变量发现、预览、正式渲染入口 | `document-domain/template` + `document-domain/render` + `document-domain/runtime-facade` |
| `apps/backend/domain/report` | 报表模板、报表生成、导出、通知、分析 | `document-domain/report` + 部分 `document-domain/render` |

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

- `document-engine` 与 `report` 暂不做物理搬迁。
- 新增文档域需求必须先判断属于 `template`、`render`、`report` 或 `runtime-facade`。
- 文档域新增功能不应继续在两个旧服务之间随机分散。

## 4. 当前观察

- `document-engine` 更偏文档模板工作台、变量解析、预览与正式渲染入口。
- `report` 更偏报表模板、导出生成、通知与结果整合。
- 两者已经共享同一类“模板 -> 渲染/生成 -> 产物输出”的业务主线，只是历史上分散在不同服务。

## 5. 对后续批次的衔接

- `Batch C5`：统一文档渲染结果与报表导出结果的产物结构，并与 `ArtifactRef` 对齐。
- 后续物理迁移时，应优先保持 `runtime-facade` 南向稳定，再逐步收拢内部模板与渲染实现。
