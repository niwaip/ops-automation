# skill-registry

当前目录代表未来 `registry-release/skill-registry` 的统一逻辑视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/skill`

本目录在当前批次的职责，是把当前 `skill` 模块统一解释为设计时 Skill 注册资产，
并明确它与 `workflow-registry`、`release-manager`、`control-plane` 的边界。

## 该目录负责

- Skill 定义管理与基础查询
- Skill 可见性、访问与角色绑定
- Skill 与工具目录的绑定关系
- Skill 匹配、AI 匹配返回契约与注册期校验
- Skill 发布态补充与运行时元数据富化
- 作为未来 Skill 注册中心的统一逻辑入口

## 该目录不负责

- Release 发布门禁、审批、回滚
- Workflow 模板与 Activity 模板设计时管理
- Control-plane 的执行状态推进
- Runtime worker 中的真实执行
- 浏览器模板、文档模板等非 Skill 注册资产

## 当前统一归属

当前应统一按以下方式理解：

- `skill`
  - 偏向 Skill 定义、访问、匹配、工具绑定与注册期校验

虽然当前仍物理位于 `core/platform`，但逻辑归属已经统一切换到：

- `registry-release/skill-registry`

## 与 `workflow-registry` 的关系

`skill-registry` 与 `workflow-registry` 同属于注册侧设计时资产，但两者职责不同：

- `skill-registry`
  - 负责 Skill 自身的注册、匹配、访问与补充元数据
- `workflow-registry`
  - 负责 Flow / Workflow / Activity 等工作流设计时资产

约束：

- 新的 Skill 匹配或工具绑定逻辑应进入 `skill-registry`
- 新的 Flow / Workflow / Activity 模板定义不应回流到 `skill-registry`

## 与发布链的关系

`skill-registry` 只承接设计时 Skill 资产，不直接产出可执行运行单元。

统一发布链应保持为：

```text
skill-registry
  + workflow-registry
    -> release-manager
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- Skill 不能绕开 `release-manager` 直接进入 `control-plane`
- Skill 的运行时可执行形态应以 Release Manifest 为准，而不是以注册态记录为准

## 当前逻辑分层

未来 `skill-registry` 至少应稳定包含以下几类逻辑：

- `registry`
  - Skill 注册与查询入口
- `binding`
  - Skill 与工具目录绑定
- `access`
  - Skill 授权、角色绑定与可见性
- `matching`
  - Skill 匹配与 AI 匹配返回契约
- `enrichment`
  - 发布态补充与运行时元数据富化
- `validation`
  - 注册期校验与匹配辅助

## 当前物理实现映射

当前对应关系如下：

- `skill/registry`
  - 对应未来 `registry`
- `skill/binding`
  - 对应未来 `binding`
- `skill/access`
  - 对应未来 `access`
- `skill/matching`
  - 对应未来 `matching`
- `skill/enrichment`
  - 对应未来 `enrichment`
- `skill/validation`
  - 对应未来 `validation`

当前已开始由目标包本身承接的最小源码能力：

- `src/registry`
  - 已承接激活可见性判定与 trigger keywords 汇总 helper，不再只是整层透传

## 当前结论

本轮之后，`skill` 的统一逻辑归属已进一步显式化：

- `skill` 统一属于 `skill-registry`
- `skill-registry` 与 `workflow-registry` 并列处于注册侧
- 发布门禁继续属于 `release-manager`
- 执行语义继续属于 `control-plane` 与 runtime worker
- 当前先固定统一逻辑视图，不在本批次引入物理迁移
- 包侧根入口 `src/index.ts` 聚合 barrel 已在后续 Phase E 删除；`access`、`binding`、`enrichment`、`matching`、`validation` 五个零消费者叶子入口也已在后续 Phase E 删除；当前只保留 `registry/index.ts` 作为最小逻辑视图占位
- `registry` 已开始由目标包承接最小稳定 helper，纯 re-export 状态已继续收口；其余五个零消费者叶子入口已不再保留包侧薄壳
