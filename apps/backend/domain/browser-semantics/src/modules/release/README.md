# release module boundary

当前模块代表 `browser-domain/semantics` 的本地发布态过渡接口。

## 当前发布态接口

- `POST /semantic-rule-sets/:id/promote/canary`
- `POST /semantic-rule-sets/:id/promote/active`
- `POST /semantic-rule-sets/:id/rollback`
- `POST /semantic-rule-sets/:id/validate`

## 当前语义

- 这里已经出现了版本提升、激活、回滚等发布态动作。
- 这些动作说明语义规则当前自带局部发布中心能力。

## 目标边界

- 语义规则是否进入可执行发布态，长期应收敛到 `release-manager`。
- 本模块后续更适合作为语义规则发布适配层或校验层，而不是平台最终的统一发布门禁。
