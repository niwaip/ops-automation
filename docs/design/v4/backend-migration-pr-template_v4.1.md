# Backend Migration PR Template (v4.1)

日期：2026-06-25

> 本文配套 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md)、[backend-migration-first-batch-backlog_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-first-batch-backlog_v4.1.md) 与 [backend-migration-review-checklist_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-review-checklist_v4.1.md)，用于统一迁移 PR 的描述结构，降低评审和回滚成本。

---

## 1. 使用方式

本模板用于以下类型的迁移 PR：

1. 职责拆分 PR
2. 包级落地 PR
3. 物理迁移 PR
4. 收口清理 PR

使用原则：

1. 一个 PR 只解决一个主问题。
2. PR 描述必须显式写出“不处理什么”。
3. PR 描述必须能支撑 reviewer 判断边界、验证和回滚。

---

## 2. 推荐模板

以下模板可直接复制到 PR 描述中使用：

```md
## 主问题
- 本批次只处理：
- 本批次不处理：

## 背景
- 当前问题：
- 为什么现在做：

## 变更边界
- 涉及模块：
- 涉及路径：
- 保持稳定：

## 方案说明
- 本批次采用的迁移方式：
- 新增的 façade / adapter / bridge / 兼容层：
- 暂未处理的遗留点：

## 兼容策略
- 保留的旧入口：
- 仍存在的兼容壳：
- 计划在哪一批删除：

## 风险点
- 可能影响：
- 已采取的控制策略：

## 验证记录
- typecheck / build：
- tests：
- API / 行为验证：
- Docker / 容器验证：

## 回滚方式
- 回滚 commit：
- 恢复的兼容层或导出面：
- 回滚后仍保留的目录骨架：

## 关联文档
- 总设计：
- backlog：
- review checklist：
```

---

## 3. 字段填写说明

### 3.1 主问题

必须能一句话说清本批次的唯一目标，例如：

- 隔离 `temporal-workflow` 的 runtime 辅助
- 收紧 `planner` 对 `browser/*` 的深层依赖
- 为 `backend-contracts/common-dto` 补齐源码与构建链

不推荐写法：

- “做了一些迁移准备”
- “顺手优化若干结构问题”

### 3.2 变更边界

这里要明确：

1. 改了哪些模块
2. 没改哪些相邻模块
3. 是否触及路由、DTO、Schema、Compose、workspace

目标是让 reviewer 一眼看出这批 PR 是否超范围。

### 3.3 兼容策略

迁移 PR 最大的问题通常不是“没改动”，而是“改动后没法回头”。

因此这里必须写清：

1. 是否保留旧 façade
2. 是否保留旧导出面
3. 是否保留旧目录壳
4. 后续哪一批再删

### 3.4 验证记录

最少应覆盖：

1. 编译验证
2. 与本批次直接相关的测试
3. 至少一个行为级验证
4. 若涉及 Docker / 路径迁移，则补容器验证

### 3.5 回滚方式

必须能回答：

1. 如果出问题，回退哪个 commit
2. 回退后保留哪些兼容层
3. 是否能只回退当前批次，而不影响其他迁移工作

---

## 4. 示例

### 4.1 示例一：职责拆分 PR

```md
## 主问题
- 本批次只处理：隔离 `temporal-workflow` 中的 runtime 执行辅助
- 本批次不处理：browser 辅助外移、`execution-flow` 重构、物理目录迁移

## 背景
- 当前问题：`temporal-workflow` 同时混有设计时模板管理和运行时执行辅助
- 为什么现在做：需要先恢复 `activity/` 的设计时语义，为后续迁到 `workflow-registry` 做准备

## 变更边界
- 涉及模块：`apps/backend/core/platform/src/modules/temporal-workflow/`
- 涉及路径：`temporal-activity-execution.service.ts`、相关 helper、迁移期 `runtime-bridge`
- 保持稳定：controller、module、导出入口不变

## 方案说明
- 本批次采用的迁移方式：先加过渡层，再收敛主层职责
- 新增的 façade / adapter / bridge / 兼容层：`runtime-bridge`
- 暂未处理的遗留点：browser 辅助仍保留在当前模块

## 兼容策略
- 保留的旧入口：原 controller 和 module
- 仍存在的兼容壳：原 activity 主层入口
- 计划在哪一批删除：后续 browser-bridge 与 codegen 收敛批次后再评估

## 风险点
- 可能影响：activity 执行链路
- 已采取的控制策略：保留旧导出，先改内部接线

## 验证记录
- typecheck / build：通过
- tests：`temporal-workflow-core.test.ts`、`temporal-workflow-codegen.test.ts`
- API / 行为验证：验证一个 workflow / activity 核心入口
- Docker / 容器验证：如涉及运行路径验证，则通过 `./docker/start-smart.sh` 验证当前 worktree 代码已加载

## 回滚方式
- 回滚 commit：当前 PR commit
- 恢复的兼容层或导出面：恢复 execution helper 到原主层委托
- 回滚后仍保留的目录骨架：`runtime-bridge` 目录可保留
```

### 4.2 示例二：契约包落地 PR

```md
## 主问题
- 本批次只处理：让 `backend-contracts/common-dto` 成为可维护源码包
- 本批次不处理：其他契约包迁移、批量切全部消费方、删除 `@ops/contracts`

## 背景
- 当前问题：新契约包仍主要是编译产物壳
- 为什么现在做：需要先验证新契约包的源码化与构建方式

## 变更边界
- 涉及模块：`packages/backend-contracts/common-dto` 和一条最短消费链
- 涉及路径：`src/`、`tsconfig`、build 脚本、package 导出
- 保持稳定：`packages/contracts` 兼容壳保留

## 方案说明
- 本批次采用的迁移方式：先源码化一个子包，再切一条最短消费链
- 新增的 façade / adapter / bridge / 兼容层：无新增运行时桥接，保留兼容包
- 暂未处理的遗留点：其他子包仍沿用旧方式

## 兼容策略
- 保留的旧入口：`@ops/contracts`
- 仍存在的兼容壳：`packages/contracts`
- 计划在哪一批删除：主要消费方切换完成后再评估

## 风险点
- 可能影响：消费方导入路径、构建流程
- 已采取的控制策略：只切最短消费链，保留兼容入口

## 验证记录
- typecheck / build：目标子包和消费方均通过
- tests：消费方相关测试通过
- API / 行为验证：验证一条使用新 DTO 的核心调用链
- Docker / 容器验证：如消费方运行在 Docker 中，则验证容器加载当前 worktree 代码

## 回滚方式
- 回滚 commit：当前 PR commit
- 恢复的兼容层或导出面：恢复消费方到 `@ops/contracts`
- 回滚后仍保留的目录骨架：新子包 `src/` 结构可保留
```

---

## 5. Reviewer 快速核对项

提交 PR 前，作者可先自检以下问题：

1. 主问题是否单一？
2. 不纳入范围是否写清？
3. 是否写清保留哪些兼容层？
4. 是否有至少一个行为级验证？
5. 回滚是否只影响当前批次？

若上述任一问题回答不清，建议不要进入 review。

---

## 6. 一句话结论

迁移 PR 模板的价值不在于“格式统一”，而在于强迫每一批改动把主问题、边界、验证和回滚说清楚，避免迁移工作在评审阶段失控。
