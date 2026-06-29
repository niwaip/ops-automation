# report

文档能力域中的 `report` 子层承接报表任务、分析、通知与结果编排的统一逻辑入口。

## 当前归属

- 当前真实运行包根目录已经迁到 `apps/backend/capabilities/document-domain/report`。
- 该目录直接承接历史 `apps/backend/domain/report` 中的报表任务 API、分析、通知和结果编排。
- 与 `template`、`render` 共同组成统一的文档能力域，而不是孤立系统。

## 当前约束

- 路由、控制器入口和响应契约保持不变。
- 历史 `domain/report` 物理路径已退出仓库，不再作为启动入口、挂载根目录或兼容包壳存在。
- 新的报表任务共享契约与结果编排说明应优先进入该子层视图。
