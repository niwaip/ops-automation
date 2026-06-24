# template module boundary

当前模块代表 `browser-domain/templates` 的设计时模板入口。

## 设计时接口

- `GET /templates`
- `GET /templates/:id`
- `POST /templates`
- `PATCH /templates/:id`
- `DELETE /templates/:id`
- `POST /templates/compile`
- `POST /templates/validate`
- `POST /templates/:id/review`

## 当前本地发布态接口

- `POST /templates/:id/publish`
- `POST /templates/:id/deprecate`
- `POST /templates/:id/revoke`

## 目标边界

- 模板的创建、编辑、编译、校验属于设计时模板资产层。
- 当前本地 `publish / deprecate / revoke` 仍是过渡期接口。
- 目标态下，统一发布门禁应收敛到 `release-manager`，而不是继续在模板服务内扩张。
