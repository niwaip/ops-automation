# document-domain

当前目录作为文档能力域的目标逻辑路径，用来统一承接以下现态模块：

- `apps/backend/domain/document-engine`
- `apps/backend/domain/report`

## 模块归属说明

- `template`
  - 对应当前 `domain/document-engine` 中的 Studio 模板上传、变量发现、模板元数据和工作流辅助编排
  - 也承接当前 `domain/report` 中偏报表模板管理的一侧
- `render`
  - 对应当前 `domain/document-engine` 的预览、校验与正式渲染能力
  - 也承接当前 `domain/report` 的 Word / Excel / PDF 生成流水线
- `report`
  - 对应当前 `domain/report` 中的报表任务 API、分析、通知和结果编排
- `runtime-facade`
  - 表示文档域面向执行链路的稳定运行时入口
  - 当前主要落在 `document-engine` 的 `/studio/render-resolved`

## 该能力域负责

- 文档模板资产与 Studio 编辑辅助
- 文档渲染、预览、校验与输出生成
- 报表模板、报表任务与结果分发编排
- 面向执行链路的文档域运行时入口

## 该能力域不负责

- 通用控制面的执行生命周期推进
- 平台级统一发布门禁
- 浏览器录制、语义规则与浏览器运行时能力

## 内部结构草图

```text
apps/backend/capabilities/document-domain/
├── template/         # 模板资产与 Studio 辅助编排
├── render/           # 预览、校验、正式渲染与生成流水线
├── report/           # 报表任务、分析、通知与结果编排
├── runtime-facade/   # 面向执行链路的稳定运行时入口
└── README.md
```

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
