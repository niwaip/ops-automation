# runtime module boundary

当前模块代表 `browser-domain/semantics` 的运行时解析接口。

## 运行时接口

- `GET /runtime/semantic-rules/resolve`

## 目标边界

- 本模块只负责根据 domain、host、tenant、user、skill、page type 等条件解析最合适的已发布规则集。
- 它不负责设计时编辑，也不负责发布审批、激活、回滚。
- 后续无论发布门禁是否迁到 `release-manager`，运行时解析接口都应继续保持南向稳定。
