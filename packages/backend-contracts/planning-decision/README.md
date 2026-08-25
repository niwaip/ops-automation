# Planning Decision Contract

`PlanningDecisionV1` 是 Intelligence 与 Execution Control 之间的版本化路由决策合同。

- Intelligence 负责生成和解释决策。
- 持久化入口必须先调用 `validatePlanningDecisionV1`。
- Control Plane 只消费已验证合同，不重新推断路由。
- 新字段应通过新 Schema 版本演进，禁止静默改变 v1 语义。
