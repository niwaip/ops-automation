# release-manager/validator

当前目录代表未来 `registry-release/release-manager/validator` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/capability-release/validator`
- `apps/backend/core/platform/src/modules/capability-release/browser-recording-action-policy.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/browser-recording-execution-plan-validator.service.ts`

本目录在当前批次的职责，是把当前发布前校验、录制动作约束与执行计划验证逻辑，
统一解释为 `release-manager` 内部的 `validator` 子层。

## 该子层负责

- 发布前细粒度校验与门禁判断
- 浏览器录制动作策略约束
- 浏览器执行计划的结构校验与可发布性判断
- 对发布输入做策略裁决前的验证收口

## 该子层不负责

- Release 主入口控制器与 Manifest 主装配
- 发布前构建、浏览器录制装配与 Temporal schema 辅助
- 发布动作执行、部署绑定、运行时绑定与 smoke 校验
- 发布侧审计事件映射
- Skill / Workflow 注册入口本身

## 与其他子层的关系

`validator` 是 `release-manager` 中负责“发布前约束判断与校验裁决”的子层，
但不是主入口编排、构建装配或发布后桥接所在层。

当前应按以下方式理解：

- `release`
  - 负责主入口、主流程编排、Manifest 装配
- `compiler`
  - 负责构建、录制装配、Temporal schema 辅助
- `validator`
  - 负责发布前校验、动作策略约束与执行计划验证
- `publisher`
  - 负责发布动作、部署绑定、运行时绑定与 smoke 校验
- `audit`
  - 负责发布侧审计语义与事件映射

约束：

- 新的发布前约束判断逻辑应进入 `validator`
- 新的 Manifest 主装配逻辑不应继续堆入 `validator`
- 新的发布后部署或运行时绑定逻辑不应继续堆入 `validator`

## 与构建和发布链的关系

`validator` 子层位于“构建辅助之后、最终发布动作之前”的门禁位置。

统一链路应保持为：

```text
skill-registry / workflow-registry / design-time assets
  -> release-manager/compiler
    -> release-manager/validator
      -> release-manager/release
        -> Release Manifest
          -> release-manager/publisher
            -> control-plane
              -> runtime worker
```

约束：

- `validator` 消费的是发布前输入或中间装配结果，不直接生成最终运行时执行入口
- `control-plane` 不应直接消费 `validator` 子层内部校验细节或策略中间结构

## 当前物理实现映射

当前对应关系如下：

- `capability-release/validator/index.ts`
  - 对应未来 `validator` 子层稳定出口
- `browser-recording-action-policy.service.ts`
  - 对应未来录制动作策略约束
- `browser-recording-execution-plan-validator.service.ts`
  - 对应未来执行计划结构校验与可发布性判断

## 当前结论

本轮之后，`release-manager` 内部的发布前校验子层已进一步显式化：

- `validator` 统一承接发布前校验、动作策略约束与执行计划验证
- `validator` 继续作为构建结果进入最终发布动作前的门禁层
- 主入口、构建、发布后桥接、审计继续留在各自子层
- 当前先固定逻辑边界，不在本批次引入物理迁移
