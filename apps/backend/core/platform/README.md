# core/platform 过渡说明

`apps/backend/core/platform` 不是目标态目录名，而是当前迁移期保留的遗留聚合壳。

## 为什么现在看起来不合理

- `core` 与 `platform` 都过于宽泛，叠在一起后无法表达真实业务边界
- 当前目录里同时混放了治理能力与设计时注册/发布能力
- 如果继续沿这个名字扩展，新代码会默认把它当成长期“万能平台服务”

## 当前真实归属

- `governance`
  - `src/governance/identity-access/*`
  - `src/governance/organization/*`
- `registry-release`
  - `modules/skill`
  - `modules/execution-flow`
  - `modules/temporal-workflow`
  - `src/release-manager`

## 当前规则

- `core/platform` 只作为迁移期物理承载位置，不应被视为最终边界
- 新增治理逻辑应按 `governance` 归属设计
- 新增注册、模板、发布逻辑应按 `registry-release` 归属设计
- 评审时如果需求描述仍以“放到 platform 里”作为结论，应先追问真实所有权

## 当前边界文件

- 治理侧总览：`src/governance-boundaries.md`
- 注册发布侧：
  - `src/modules/skill/README.md`
  - `src/modules/execution-flow/README.md`
  - `src/modules/temporal-workflow/README.md`
  - `src/release-manager/platform/release-manager-runtime-adapter.module.ts`
  - `../registry-release/release-manager/README.md`

## 后续方向

- 先完成治理侧与注册发布侧的边界冻结
- 再按 `governance/*` 与 `registry-release/*` 做物理归位
- 迁移稳定后，`core/platform` 应退场或只保留迁移说明壳
