# release-manager/compiler

当前目录代表未来 `registry-release/release-manager/compiler` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/capability-release/compiler`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-build-validation.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-browser-recording.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-temporal-schema.service.ts`

本目录在当前批次的职责，是把当前构建、浏览器录制装配与 Temporal schema 辅助逻辑，
统一解释为 `release-manager` 内部的 `compiler` 子层。

## 该子层负责

- 发布前构建与装配辅助
- 浏览器录制结果进入发布态前的编译收口
- Temporal schema 与相关工作流发布装配辅助
- 构建阶段所需的结构归一化与辅助访问器

## 该子层不负责

- Release 主入口控制器与 Manifest 主装配
- 发布前细粒度策略校验裁决
- 发布后的部署、运行时绑定与 smoke 校验
- 发布侧审计事件映射
- Skill / Workflow 注册入口本身

## 与其他子层的关系

`compiler` 是 `release-manager` 中负责“把设计时资产整理成可发布输入”的辅助层，
但不是最终发布门禁或执行入口本身。

当前应按以下方式理解：

- `release`
  - 负责主入口、主流程编排、Manifest 装配
- `compiler`
  - 负责构建、录制装配、Temporal schema 辅助
- `validator`
  - 负责发布前校验与约束判断
- `publisher`
  - 负责发布后部署、运行时绑定与 smoke 校验
- `audit`
  - 负责发布侧审计语义与事件映射

约束：

- 新的构建与装配辅助逻辑应进入 `compiler`
- 新的 Manifest 主装配逻辑不应继续堆入 `compiler`
- 新的部署与运行时绑定逻辑不应继续堆入 `compiler`

## 与注册侧的关系

`compiler` 子层不承载注册入口，而是消费注册侧资产形成发布前输入。

当前主要上游来源包括：

- `skill-registry`
- `workflow-registry`
- 浏览器录制相关设计时产物

约束：

- `compiler` 不直接扩展 Skill 注册模型
- `compiler` 不直接扩展 Flow / Workflow / Activity 注册模型
- `compiler` 只负责“装配与整理”，不负责定义注册侧边界

## 与执行链的关系

`compiler` 子层处于设计时资产进入 Release Manifest 之前的构建辅助位置。

统一链路应保持为：

```text
skill-registry / workflow-registry / design-time assets
  -> release-manager/compiler
    -> release-manager/release
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- `compiler` 产出的是发布前装配结果，而不是最终执行入口
- `control-plane` 不应直接消费 `compiler` 子层内部中间结构

## 当前物理实现映射

当前对应关系如下：

- `capability-release/compiler/index.ts`
  - 对应未来 `compiler` 子层稳定出口
- `capability-release-build-validation.service.ts`
  - 对应未来构建阶段结构收口与访问器
- `capability-release-browser-recording.service.ts`
  - 对应未来浏览器录制装配辅助
- `capability-release-temporal-schema.service.ts`
  - 对应未来 Temporal schema 发布装配辅助

## 当前结论

本轮之后，`release-manager` 内部的构建辅助子层已进一步显式化：

- `compiler` 统一承接构建、录制装配与 Temporal schema 辅助
- `compiler` 继续作为注册态资产进入 Release Manifest 之前的中间装配层
- 主入口、校验、部署、审计继续留在各自子层
- 当前先固定逻辑边界，不在本批次引入物理迁移
