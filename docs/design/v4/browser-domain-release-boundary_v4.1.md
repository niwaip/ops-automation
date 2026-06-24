# Browser Domain 发布边界梳理 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch C2`，用于识别 `browser-template` 与 `browser-semantics` 当前的设计时、发布态、运行时接口，并明确它们与 `release-manager` 的目标边界。

## 1. browser-template 当前接口分层

| 层次 | 当前接口 | 当前职责 | 目标去向 |
| :--- | :--- | :--- | :--- |
| 设计时 | `GET/POST/PATCH/DELETE /templates` | 模板 CRUD | `browser-domain/templates` |
| 设计时 | `POST /templates/compile` | 模板编译 | `browser-domain/templates/compiler` |
| 设计时 | `POST /templates/validate` | 模板校验 | `browser-domain/templates/validation` |
| 过渡发布态 | `POST /templates/:id/review` | 评审前状态推进 | 未来并入发布门禁前置检查 |
| 过渡发布态 | `POST /templates/:id/publish` | 本地发布 | 长期收敛到 `release-manager` |
| 过渡发布态 | `POST /templates/:id/deprecate` | 本地下线 | 长期收敛到 `release-manager` |
| 过渡发布态 | `POST /templates/:id/revoke` | 本地撤销 | 长期收敛到 `release-manager` |

## 2. browser-semantics 当前接口分层

| 层次 | 当前接口 | 当前职责 | 目标去向 |
| :--- | :--- | :--- | :--- |
| 设计时 | `GET/POST/PUT /semantic-rule-sets` | 规则集 CRUD | `browser-domain/semantics/rule-set` |
| 设计时 | `PUT /semantic-rule-sets/:id/categories/:category` | 分类替换与规则整理 | `browser-domain/semantics/rule-set` |
| 过渡发布态 | `POST /semantic-rule-sets/:id/validate` | 发布前校验 | 未来作为发布适配校验输入 |
| 过渡发布态 | `POST /semantic-rule-sets/:id/promote/canary` | 金丝雀提升 | 长期收敛到 `release-manager` |
| 过渡发布态 | `POST /semantic-rule-sets/:id/promote/active` | 激活发布 | 长期收敛到 `release-manager` |
| 过渡发布态 | `POST /semantic-rule-sets/:id/rollback` | 回滚 | 长期收敛到 `release-manager` |
| 运行时 | `GET /runtime/semantic-rules/resolve` | 已发布规则集运行时解析 | 保持在 `browser-domain/semantics/runtime` |

## 3. 与 release-manager 的目标边界

- `browser-template` 与 `browser-semantics` 继续持有设计时资产读写能力。
- 是否形成平台可执行发布态，不应长期由各自服务单独决定。
- `publish / promote / rollback / deprecate / revoke` 这类动作应逐步抽象为 `release-manager` 统一门禁。
- `runtime/resolve` 这类南向稳定接口应保留在浏览器域内部，不应迁入 `release-manager`。

## 4. 当前迁移结论

- 模板与语义规则已经可以清晰区分为“设计时资产”和“过渡发布态接口”。
- 浏览器域后续应优先把本地发布态动作收口到统一发布门禁，而不是继续在各自服务内扩张。
