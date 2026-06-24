# rule-set module boundary

当前模块代表 `browser-domain/semantics` 的设计时规则集入口。

## 设计时接口

- `GET /semantic-rule-sets`
- `GET /semantic-rule-sets/:id`
- `POST /semantic-rule-sets`
- `PUT /semantic-rule-sets/:id`
- `PUT /semantic-rule-sets/:id/categories/:category`

## 目标边界

- 规则集创建、编辑、分类替换属于设计时资产管理。
- 它负责规则内容与版本草稿，不负责统一发布门禁。
- 后续与 `release-manager` 对接时，应由发布中心消费设计时规则集，而不是在此模块继续堆叠发布编排。
