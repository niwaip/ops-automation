# release-manager/release

当前目录代表未来 `registry-release/release-manager/release` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/capability-release/release`
- `apps/backend/core/platform/src/modules/capability-release/capability-release.controller.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-manifest.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-manifest.mapper.ts`

本目录在当前批次的职责，是把当前发布主入口、Manifest 装配与发布态详情聚合逻辑，
统一解释为 `release-manager` 内部的 `release` 子层。

## 该子层负责

- Release 主入口控制器与应用层收口
- Release 详情读取、主流程编排与入口级协调
- Release Manifest 装配与详情到 Manifest 的映射
- 对注册侧资产做发布主流程级收口
- 作为 `release-manager` 对上游的稳定主入口

## 该子层不负责

- 浏览器录制装配、Temporal schema 等构建细节
- 发布前细粒度校验策略
- 发布后的部署、运行时绑定与 smoke 校验
- 发布侧审计事件映射
- Skill / Workflow 设计时注册逻辑

## 与其他子层的关系

`release` 是 `release-manager` 的主入口层，但不是全部实现所在层。

当前应按以下方式理解五个子层关系：

- `release`
  - 负责主入口、主流程编排、Manifest 装配
- `compiler`
  - 负责构建与设计时装配辅助
- `validator`
  - 负责发布前校验与约束判断
- `publisher`
  - 负责发布后部署、运行时绑定与 smoke 校验
- `audit`
  - 负责发布侧审计语义与事件映射

约束：

- 新的主入口聚合或 Manifest 主装配逻辑，应进入 `release`
- 新的构建细节不应继续堆入 `release`
- 新的部署绑定逻辑不应继续堆入 `release`

## 与注册侧的关系

`release` 子层只负责把注册侧资产收口为发布主流程输入，不承载注册逻辑本身。

当前上游输入主要来自：

- `skill-registry`
- `workflow-registry`

约束：

- `release` 不直接扩展 Skill 注册模型
- `release` 不直接扩展 Flow / Workflow / Activity 注册模型
- `release` 应以“收口并装配”为职责，而不是重新定义注册侧边界

## 与执行链的关系

`release` 子层承接“设计时资产进入可执行发布态”的主入口语义。

统一链路应保持为：

```text
skill-registry
  + workflow-registry
    -> release-manager/release
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- 任何新的发布主入口都不应绕开 `Release Manifest`
- `control-plane` 应消费 `release` 子层产出的发布态结果，而不是直接读取注册态对象

## 当前物理实现映射

当前对应关系如下：

- `capability-release/release/index.ts`
  - 对应未来 `release` 子层稳定出口
- `capability-release.controller.ts`
  - 对应未来 `release` 子层控制器入口
- `capability-release.service.ts`
  - 对应未来 `release` 子层主流程编排
- `capability-release-manifest.service.ts`
  - 对应未来 `release` 子层 Manifest 装配
- `capability-release-manifest.mapper.ts`
  - 对应未来 `release` 子层 Manifest 映射

## 当前结论

本轮之后，`release-manager` 内部的主入口子层已进一步显式化：

- `release` 统一承接发布主入口与 Manifest 装配
- `release` 继续作为注册侧进入执行链前的主流程收口层
- 构建、校验、部署、审计继续留在各自子层
- 当前先固定逻辑边界，不在本批次引入物理迁移
