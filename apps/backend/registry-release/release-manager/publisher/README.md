# release-manager/publisher

当前目录代表未来 `registry-release/release-manager/publisher` 的逻辑子层视图。

当前仓库里，相关实现当前主要收口到：

- `apps/backend/registry-release/release-manager/src/publisher`

旧兼容入口已在首批 Phase E 中删除：

- `apps/backend/core/platform/src/modules/capability-release/publisher`
- 该旧兼容目录与根入口已在后续 Phase E 中完成删除

本目录在当前批次的职责，是把当前发布后的部署、运行时绑定、发布动作与 smoke 校验逻辑，
统一解释为 `release-manager` 内部的 `publisher` 子层。

## 该子层负责

- 发布动作执行与发布后状态收口
- 部署绑定与运行时绑定辅助
- 发布后 smoke 校验
- 发布态运行时上下文组装与访问器

## 该子层不负责

- Release 主入口控制器与 Manifest 主装配
- 发布前构建、浏览器录制装配与 Temporal schema 辅助
- 发布前细粒度策略校验裁决
- 发布侧审计事件映射
- Skill / Workflow 注册入口本身

## 与其他子层的关系

`publisher` 是 `release-manager` 中负责“发布后落地与运行时接轨”的子层，
但不是注册态资产装配或主入口编排所在层。

当前应按以下方式理解：

- `release`
  - 负责主入口、主流程编排、Manifest 装配
- `compiler`
  - 负责构建、录制装配、Temporal schema 辅助
- `validator`
  - 负责发布前校验与约束判断
- `publisher`
  - 负责发布动作、部署绑定、运行时绑定与 smoke 校验
- `audit`
  - 负责发布侧审计语义与事件映射

约束：

- 新的发布后部署或绑定逻辑应进入 `publisher`
- 新的 Manifest 主装配逻辑不应继续堆入 `publisher`
- 新的发布前构建辅助不应继续堆入 `publisher`

## 与执行链的关系

`publisher` 子层处于 Release Manifest 已收口之后、执行链正式承接之前的桥接位置。

统一链路应保持为：

```text
skill-registry / workflow-registry
  -> release-manager/compiler
    -> release-manager/release
      -> Release Manifest
        -> release-manager/publisher
          -> control-plane
            -> runtime worker
```

约束：

- `publisher` 不重新定义 Release Manifest，只消费发布态结果并完成后续绑定
- `control-plane` 不应直接承接 `publisher` 内部中间辅助结构

## 与运行时的关系

`publisher` 子层负责把发布态资产桥接到运行时承接边界，但不进入 runtime worker 内部执行。

当前主要承担：

- 部署绑定
- 运行时上下文收口
- smoke 校验

约束：

- `publisher` 不负责 worker 内部执行实现
- `publisher` 不负责控制面状态推进本身

## 当前物理实现映射

当前对应关系如下：

- `capability-release/publisher/index.ts`
  - 对应未来 `publisher` 子层稳定出口
- `capability-release-deployment.service.ts`
  - 对应未来部署绑定与访问器
- `capability-release-deployment-smoke.service.ts`
  - 对应未来发布后 smoke 校验
- `capability-release-publish.service.ts`
  - 对应未来发布动作执行
- `capability-release-runtime.service.ts`
  - 对应未来运行时上下文组装与运行时绑定辅助

## 当前结论

本轮之后，`release-manager` 内部的发布后桥接子层已进一步显式化：

- `publisher` 统一承接发布动作、部署绑定、运行时绑定与 smoke 校验
- `publisher` 继续作为 Release Manifest 进入执行链前的桥接层
- 主入口、构建、校验、审计继续留在各自子层
- `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
