# Registry-Release Plane

`apps/backend/registry-release` 是设计时注册资产与统一发布门禁的目标平面根目录。

## 当前负责

- Skill 注册资产
- Workflow / Flow / Activity 设计时资产
- Release 编译、校验、发布与审计
- 统一面向 `Release Manifest` 的可执行资产收口

## 当前子平面

- `skill-registry`
  - Skill 注册、匹配、绑定、富化与校验
- `workflow-registry`
  - Flow / Workflow / Activity 模板注册、校验与代码生成
- `template-registry`
  - Browser / Document 模板目录注册与设计时元数据
- `agent-catalog`
  - Agent Profile、能力矩阵与作用域策略
- `release-manager`
  - Release 编译、校验、发布、运行时绑定与审计

## 当前迁移原则

- 先固定目标平面的逻辑边界与稳定子层，再逐步承接 `core/platform` 中的真实实现。
- 新的设计时注册资产与发布门禁能力应优先按 `registry-release/*` 归属设计。
- 新的模板目录与 Agent 准入画像模型，也应优先收敛到本平面。
- 不把执行生命周期、浏览器录制细节或运行时原子执行实现回流到本平面。

## 当前现态

- `registry-release/index.ts` 根聚合壳已在后续 Phase E 删除。
- `template-registry` 与 `agent-catalog` 包根入口 `src/index.ts` 已在后续 Phase E 删除。
- 当前优先保留各子包的稳定子路径入口，而不是额外维持零消费者 root shell。
