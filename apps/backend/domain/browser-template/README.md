# browser-template -> browser-domain/templates

当前服务仍物理位于 `apps/backend/domain/browser-template`，但逻辑归属已经切换为未来
`apps/backend/capabilities/browser-domain/templates`。

## 该模块负责

- 浏览器模板的设计时定义与查询
- 模板编译与校验
- 面向浏览器录制导出产物的模板承接

## 该模块不负责

- 浏览器录制调试会话管理
- 浏览器原子执行与运行时状态推进
- 语义规则运行时命中与发布态解析
- Release 编译、审批、回滚

## 与 browser-domain 的关系

- 它是 `browser-domain` 的模板资产层。
- 它与 `browser-semantics`、`ai-orchestrator/modules/browser` 一起构成浏览器域。
- 后续新增浏览器模板相关能力，应优先按 `browser-domain/templates` 归属设计。
