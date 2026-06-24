# release-manager

当前目录代表未来 `registry-release/release-manager` 的统一逻辑视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/capability-release`

本目录在当前批次的职责，是把当前 `capability-release` 模块统一解释为发布侧中心，
并明确它与 `skill-registry`、`workflow-registry`、`control-plane`、runtime worker
的边界。

## 该目录负责

- Release 草稿、构建、校验、发布与回滚编排
- Release Manifest 生成与设计时资产装配
- 面向发布阶段的运行时绑定、部署与 smoke 校验
- 发布侧审计语义与审计事件映射
- 作为未来发布门禁中心的统一逻辑入口

## 该目录不负责

- Skill 定义、匹配、访问与工具绑定的注册入口
- Flow / Workflow / Activity 的设计时模板注册
- Control-plane 的执行状态推进
- Runtime worker 中的真实原子执行
- 浏览器域、文档域、专项 Agent 的内部高频运行逻辑

## 当前统一归属

当前应统一按以下方式理解：

- `capability-release`
  - 偏向发布编排、Manifest 装配、部署绑定、发布前校验与回滚

虽然当前仍物理位于 `core/platform`，但逻辑归属已经统一切换到：

- `registry-release/release-manager`

## 与注册侧的关系

`release-manager` 不承载设计时注册资产本身，而负责把注册侧资产收口为可执行发布态。

当前注册侧至少包含：

- `skill-registry`
- `workflow-registry`

约束：

- 新的 Skill 注册逻辑应进入 `skill-registry`
- 新的 Flow / Workflow / Activity 注册逻辑应进入 `workflow-registry`
- 新的发布编译、Manifest 装配、部署绑定逻辑应进入 `release-manager`

## 与执行链的关系

`release-manager` 是设计时资产进入执行链前的唯一受控门禁。

统一链路应保持为：

```text
skill-registry
  + workflow-registry
    -> release-manager
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- 任何新的可执行入口都不应绕开 `Release Manifest`
- `control-plane` 应消费发布态资产，而不是直接消费注册态对象
- runtime worker 应消费控制面下发的执行信息，而不是直接读取注册态定义

## 当前逻辑分层

未来 `release-manager` 至少应稳定包含以下几类逻辑：

- `release`
  - Release 主入口、控制器、Manifest 装配
- `compiler`
  - 构建、浏览器录制装配、Temporal schema 辅助
- `validator`
  - 发布前校验与录制动作约束
- `publisher`
  - 发布、部署、运行时绑定与 smoke 校验
- `audit`
  - 审计事件映射与发布侧审计语义

当前已补充的子层说明：

- `release/README.md`
  - 明确发布主入口、Manifest 装配与主流程收口边界
- `compiler/README.md`
  - 明确构建、浏览器录制装配与 Temporal schema 辅助边界
- `validator/README.md`
  - 明确发布前校验、录制动作约束与执行计划验证边界
- `publisher/README.md`
  - 明确发布动作、部署绑定、运行时绑定与 smoke 校验边界
- `audit/README.md`
  - 明确发布侧审计语义、事件映射与审计结果收口边界

## 当前物理实现映射

当前对应关系如下：

- `capability-release/release`
  - 对应未来 `release`
- `capability-release/compiler`
  - 对应未来 `compiler`
- `capability-release/validator`
  - 对应未来 `validator`
- `capability-release/publisher`
  - 对应未来 `publisher`
- `capability-release/audit`
  - 对应未来 `audit`

## 当前结论

本轮之后，`registry-release` 平面里的发布侧骨架已进一步显式化：

- `capability-release` 统一属于 `release-manager`
- `release-manager` 与 `skill-registry`、`workflow-registry` 在平面内形成完整三段式结构
- 发布门禁、发布前校验、审计收口与 Release Manifest 生成继续集中在 `release-manager`
- 执行语义继续属于 `control-plane` 与 runtime worker
- 当前先固定统一逻辑视图，不在本批次引入物理迁移
