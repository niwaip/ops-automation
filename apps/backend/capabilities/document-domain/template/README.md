# template

文档能力域中的 `template` 子层承接模板资产与 Studio 辅助编排的统一逻辑入口。

## 当前归属

- 对齐历史 `apps/backend/domain/document-engine` 中的模板上传、变量发现、模板元数据。
- 对齐历史 `apps/backend/domain/report` 中偏报表模板管理的一侧；当前真实运行根已收口到 `apps/backend/capabilities/document-domain/report`。

## 当前约束

- 当前先提供稳定逻辑入口，不在本批次搬迁真实服务实现。
- 新的模板资产归属说明、共享 DTO 和导出面应优先收敛到该子层语义下。
