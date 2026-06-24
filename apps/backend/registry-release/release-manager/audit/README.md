# release-manager/audit

当前目录代表未来 `registry-release/release-manager/audit` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/capability-release/audit`
- `apps/backend/core/platform/src/modules/capability-release/capability-release.mapper.ts`
- `apps/backend/core/platform/src/modules/capability-release/interfaces.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release.service.ts`

本目录在当前批次的职责，是把当前发布侧审计事件映射、审计结果 DTO 与审计语义收口逻辑，
统一解释为 `release-manager` 内部的 `audit` 子层。

## 该子层负责

- 发布侧审计事件的结构映射
- Release 审计结果 DTO 与统一语义收口
- 把发布主流程中的关键动作整理成可查询的审计事件
- 为上游查询或展示层提供稳定的审计事件形状

## 该子层不负责

- Release 主入口控制器与 Manifest 主装配
- 发布前构建、录制装配与策略校验
- 发布动作执行、部署绑定、运行时绑定与 smoke 校验
- Skill / Workflow 注册入口本身
- 控制面执行状态推进

## 与其他子层的关系

`audit` 是 `release-manager` 中负责“发布侧审计语义与事件映射”的子层，
但不是发布主流程编排、门禁校验或发布后桥接所在层。

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
  - 负责发布侧审计语义、事件映射与审计结果收口

约束：

- 新的发布侧审计事件映射逻辑应进入 `audit`
- 新的发布前校验或发布动作实现不应继续堆入 `audit`
- `audit` 负责描述和映射事件，不负责驱动发布主流程本身

## 与发布链的关系

`audit` 子层伴随发布链工作，为发布主流程与发布后动作提供统一的审计表达，
但不替代主入口或发布动作执行。

统一关系应保持为：

```text
release-manager/release
  + release-manager/compiler
  + release-manager/validator
  + release-manager/publisher
    -> release-manager/audit
      -> audit events / query DTOs
```

约束：

- `audit` 只消费发布链中的事实与结果，不重新定义发布态资产
- `control-plane` 不应依赖 `audit` 子层内部映射细节驱动执行

## 当前物理实现映射

当前对应关系如下：

- `capability-release/audit/index.ts`
  - 对应未来 `audit` 子层稳定出口
- `mapCapabilityAuditEvent()`
  - 对应未来发布侧审计事件映射
- `ReleaseAuditEventDTO`
  - 对应未来统一审计事件结果结构
- `capability-release.service.ts#getAuditEvents()`
  - 对应未来审计事件查询收口入口

## 当前结论

本轮之后，`release-manager` 内部的审计子层已进一步显式化：

- `audit` 统一承接发布侧审计语义、事件映射与审计结果收口
- `audit` 继续作为发布链的查询与可观测语义补充层
- 主入口、构建、校验、发布后桥接继续留在各自子层
- 当前先固定逻辑边界，不在本批次引入物理迁移
