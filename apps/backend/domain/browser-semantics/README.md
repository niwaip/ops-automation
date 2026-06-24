# browser-semantics -> browser-domain/semantics

当前服务仍物理位于 `apps/backend/domain/browser-semantics`，但逻辑归属已经切换为未来
`apps/backend/capabilities/browser-domain/semantics`。

## 该模块负责

- 浏览器语义规则集管理
- 语义规则生成、发布、运行时解析
- 语义命中日志与错误日志

## 该模块不负责

- 浏览器录制调试编排
- 浏览器模板设计时编辑
- Control-plane 执行生命周期推进
- Release Manager 的统一发布门禁

## 与 browser-domain 的关系

- 它是 `browser-domain` 的语义规则层。
- 它需要与模板资产、录制导出、运行时桥接一起被视为同一浏览器能力域。
- 后续浏览器语义新增能力，应优先按 `browser-domain/semantics` 归属设计。
