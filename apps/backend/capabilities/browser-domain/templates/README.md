# templates

浏览器能力域中的 `templates` 子层承接浏览器模板资产的统一逻辑入口，并已开始承接
`browser-template` 的真实运行 package。

## 当前归属

- 当前物理运行目录：`apps/backend/capabilities/browser-domain/templates`
- 承接原 `apps/backend/domain/browser-template` 的设计时模板定义、编译与校验
- 历史 `apps/backend/domain/browser-template` 物理路径已退出仓库

## 当前约束

- 新的浏览器模板需求与运行调整优先落在当前目录。
- `apps/backend/domain/browser-template` 的旧运行时代码与历史生成产物已完成删除。
