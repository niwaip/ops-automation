# semantics

浏览器能力域中的 `semantics` 子层承接语义规则集、发布态查询与运行时解析的统一逻辑入口。

## 当前归属

- 当前真实运行包根目录已经迁到 `apps/backend/capabilities/browser-domain/semantics`。
- 该目录直接承接历史 `apps/backend/domain/browser-semantics` 的设计时规则管理、发布态查询和运行时解析。

## 当前约束

- 路由、控制器入口和响应契约保持不变。
- 历史 `domain/browser-semantics` 物理路径已退出仓库，不再作为运行时代码挂载根目录或回滚锚点存在。
- 新的浏览器语义规则共享契约与导出面应优先收敛到该子层语义下。

## 当前子层

- `rule-set`
  - 对应规则集设计时管理与版本草稿
- `release`
  - 对应本地发布态查询、promote、rollback、validate 等过渡发布接口
- `runtime`
  - 对应已发布规则集的稳定运行时解析接口

## 迁移期导出策略

- 优先使用 `semantics/rule-set`、`semantics/release`、`semantics/runtime` 三个子入口。
- `semantics/index.ts` 仍保留扁平导出，作为兼容期出口，避免一次性打断调用方。
