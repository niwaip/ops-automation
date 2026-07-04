# render

文档能力域中的 `render` 子层承接预览、校验、正式渲染与生成流水线的统一逻辑入口。

## 当前归属

- 对齐历史 `apps/backend/domain/document-engine` 的预览、校验与正式渲染能力。
- 对齐历史 `apps/backend/domain/report` 的 Word / Excel / PDF 生成流水线；当前真实运行根已收口到 `apps/backend/capabilities/document-domain/report`。

## 当前约束

- 当前先固定目标子层命名与入口，不在本批次移动真实渲染实现。
- 新的渲染链路共享契约与导出面应优先落到该子层语义下。
