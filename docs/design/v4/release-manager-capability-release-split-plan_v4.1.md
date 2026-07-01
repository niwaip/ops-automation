# release-manager / capability-release 拆分方案 (v4.1)

日期：2026-06-24

> 本文对应 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 中的 P0 任务，用于把 `core/platform/src/modules/capability-release` 拆成可迁移、可回滚、可逐批交付的结构。
>
> 历史状态说明：本文保留 2026-06-24 拆分设计时的旧路径描述，供回看迁移方案使用；截至当前 Phase D，`core/platform/src/modules/capability-release/*` 已整体退化为兼容壳，稳定实现与默认消费入口已收口到 `core/platform/src/release-manager/*` 与 `@ops/release-manager/*`。

---

## 1. 任务目标

本方案的目标不是立即把 `capability-release` 搬到新目录，而是先完成三件事：

1. 把超大文件拆成稳定职责子层。
2. 让 `capability-release` 真正符合 `release-manager` 的逻辑视图。
3. 为后续物理迁移到 `apps/backend/registry-release/release-manager/` 建立低风险前提。

本批次明确不追求：

- 改对外路由
- 改发布协议
- 一次性改完全部调用方

---

## 2. 当前现状

### 2.1 当前目录

当前模块位于：

`apps/backend/core/platform/src/modules/capability-release/`

已存在的逻辑分组有：

- `release/`
- `compiler/`
- `validator/`
- `publisher/`
- `audit/`

但这些分组目前仍主要是逻辑视图，真实实现仍集中在几个大文件内。

### 2.2 当前主要文件

当前最值得关注的文件包括：

- `capability-release.service.ts`
- `capability-release-runtime.service.ts`
- `capability-release-publish.service.ts`
- `capability-release-manifest.service.ts`
- `capability-release-manifest.mapper.ts`
- `capability-release-skill-draft.service.ts`
- `capability-release-temporal-schema.service.ts`
- `capability-release-browser-recording.service.ts`
- `browser-recording-action-policy.service.ts`
- `browser-recording-execution-plan-validator.service.ts`
- `capability-release-deployment.service.ts`
- `capability-release-deployment-smoke.service.ts`

### 2.3 当前核心问题

当前问题不是“文件很多”，而是两个主文件承担了过多异质职责：

#### `capability-release.service.ts`

同时承担：

1. Release 草稿与主入口编排
2. 设计时资产读取与装配
3. Skill 草稿关联
4. Manifest 生成前的主流程组织
5. 发布前置逻辑协调

#### `capability-release-runtime.service.ts`

同时承担：

1. Runtime 绑定
2. 发布后桥接
3. 部署相关动作
4. smoke 校验
5. 运行时适配辅助
6. 局部发布后审计上下文

这意味着当前目录虽然已经写成了 `release-manager` 的逻辑口径，但内部实现仍然是“中心大 Service + 多个协作者”的形态。

---

## 3. 本批次范围

### 3.1 纳入范围

本方案纳入：

1. `capability-release.service.ts` 的职责瘦身
2. `capability-release-runtime.service.ts` 的职责瘦身
3. `release / compiler / validator / publisher / audit` 五个子层的真实落点设计
4. 为后续迁移到 `registry-release/release-manager` 准备稳定导出面

### 3.2 不纳入范围

本方案不纳入：

1. 对外 HTTP 路由重命名
2. `@ops/release-manager` 包立刻接管全部实现
3. `control-plane` 对发布侧协议的改造
4. Compose、workspace、部署脚本路径切换
5. 浏览器域或 Temporal 域的真实实现迁移

说明：

本批次是“先在原位置拆对”，不是“先搬新位置”。

---

## 4. 目标职责边界

### 4.1 `release/`

#### 负责

- Release 主入口
- Release 草稿的创建、读取、更新、删除
- 面向发布流程的顶层编排
- Manifest 组装总入口

#### 建议承载文件

- `capability-release.controller.ts`
- `capability-release.service.ts` 中真正属于主入口 façade 的部分
- `capability-release-manifest.service.ts`
- `capability-release-manifest.mapper.ts`
- `capability-release.mapper.ts`

#### 不负责

- 浏览器录制执行策略细节
- Temporal schema 编译细节
- 运行时部署与 smoke

### 4.2 `compiler/`

#### 负责

- Release 编译期装配
- Browser Recording 相关编译和装配
- Temporal schema 相关编译辅助
- 设计时资产到 Release Manifest 中间结构的转换

#### 建议承载文件

- `capability-release-browser-recording.service.ts`
- `capability-release-temporal-schema.service.ts`
- `capability-release-build-validation.service.ts` 中偏编译装配的部分

#### 不负责

- 发布动作落地
- 运行时绑定后的 smoke

### 4.3 `validator/`

#### 负责

- 发布前校验
- 浏览器录制动作约束
- 执行计划合法性校验
- 编译结果的门禁校验

#### 建议承载文件

- `browser-recording-action-policy.service.ts`
- `browser-recording-execution-plan-validator.service.ts`
- `capability-release-build-validation.service.ts` 中偏校验的部分

#### 不负责

- 主入口编排
- Manifest 发布

### 4.4 `publisher/`

#### 负责

- 发布动作执行
- 发布后部署绑定
- Runtime 绑定
- smoke 校验

#### 建议承载文件

- `capability-release-publish.service.ts`
- `capability-release-runtime.service.ts` 中偏绑定和桥接的部分
- `capability-release-deployment.service.ts`
- `capability-release-deployment-smoke.service.ts`

#### 不负责

- Skill 草稿选择
- 编译期装配

### 4.5 `audit/`

#### 负责

- 发布侧审计事件语义
- 发布结果到审计模型的映射
- 与发布流程关联的审计上下文封装

#### 建议承载文件

- 先从 `capability-release-runtime.service.ts` 和主流程中抽出审计组装逻辑
- 后续形成独立 audit service 或 mapper

#### 不负责

- 真实发布动作
- Runtime 调度

---

## 5. 目标文件结构

本批次完成后，建议目录逐步演进为：

```text
apps/backend/core/platform/src/modules/capability-release/
├── release/
│   ├── index.ts
│   ├── capability-release.facade.ts
│   ├── release-draft.service.ts
│   ├── release-manifest.service.ts
│   └── release-manifest.mapper.ts
├── compiler/
│   ├── index.ts
│   ├── release-compiler.service.ts
│   ├── browser-recording-compiler.service.ts
│   └── temporal-schema-compiler.service.ts
├── validator/
│   ├── index.ts
│   ├── release-validator.service.ts
│   ├── browser-recording-action-policy.service.ts
│   └── browser-recording-execution-plan-validator.service.ts
├── publisher/
│   ├── index.ts
│   ├── release-publisher.service.ts
│   ├── release-runtime-binding.service.ts
│   ├── release-deployment.service.ts
│   └── release-deployment-smoke.service.ts
├── audit/
│   ├── index.ts
│   └── release-audit.service.ts
├── capability-release.controller.ts
├── capability-release.module.ts
├── capability-release.constants.ts
├── interfaces.ts
└── index.ts
```

说明：

- 第一阶段不要求所有文件名一次性调整到位。
- 第一阶段允许通过新 service 包装旧 service。
- 只要职责归属先稳定，文件名可以后续再统一。

---

## 6. 建议实施步骤

### Step 1：先把 `capability-release.service.ts` 收敛成 façade

目标：

让它只保留：

1. 控制器入口编排
2. 调用 `compiler / validator / publisher / audit` 的主流程
3. 返回统一响应

优先移出的内容：

1. Skill 草稿关联查询
2. Browser Recording 装配
3. Temporal schema 编译辅助
4. Manifest 组装细节

### Step 2：拆出 `publisher` 真正实现层

目标：

让 `capability-release-runtime.service.ts` 不再同时承担全部发布后动作。

优先拆出的内容：

1. Runtime 绑定
2. 部署动作
3. smoke 校验

推荐新服务：

- `release-runtime-binding.service.ts`
- `release-deployment.service.ts`
- `release-deployment-smoke.service.ts`

### Step 3：把编译装配与校验切开

当前容易混在一起的部分包括：

1. Browser Recording 计划合法性
2. 编译前检查
3. Manifest 装配前结构校验

建议：

- “生成可发布中间结构”的逻辑进入 `compiler`
- “判断能否发布”的逻辑进入 `validator`

### Step 4：把审计上下文单独收口

发布侧审计通常不是主链业务逻辑，但又横跨多个步骤，因此容易混进主流程。

建议：

1. 先建立 `release-audit.service.ts` 或等效 mapper
2. 把发布阶段的审计事件组装动作集中收口
3. 主流程只保留“何时记录”，不保留“如何组织审计 payload”

### Step 5：稳定 `index.ts` 与子层导出

目标：

让当前目录真正以 `release / compiler / validator / publisher / audit` 为稳定出口，而不是继续通过巨型 service 被外部依赖。

---

## 7. 建议的首轮 PR 范围

首轮 PR 建议只做最稳的第一刀：

1. 新建 `release/` 内的 façade 或 draft service
2. 新建 `publisher/` 内的 runtime binding service
3. 从 `capability-release.service.ts` 移出一组最清晰的编译或草稿装配逻辑
4. 从 `capability-release-runtime.service.ts` 移出一组最清晰的发布后绑定逻辑
5. 保持 controller 与 module 对外行为不变

首轮 PR 不建议同时做：

1. 包路径迁移到 `apps/backend/registry-release/release-manager`
2. 对外 DTO 改名
3. `control-plane` 侧接口适配
4. Browser Domain 或 Workflow Registry 的同步重构

---

## 8. 验收标准

### 8.1 结构验收

1. `capability-release.service.ts` 不再直接承载大段编译细节
2. `capability-release-runtime.service.ts` 不再同时承载全部发布后动作
3. `release / compiler / validator / publisher / audit` 不再只是 README 级分组，而是开始承接真实实现

### 8.2 编译验收

至少保证：

1. `apps/backend/core/platform` 可正常 typecheck
2. 原模块导出不破坏现有调用方

### 8.3 测试验收

优先回归以下测试范围：

1. `capability-release-core.test.ts`
2. `capability-release-runtime.service.test.ts`
3. `capability-release-skill-draft.test.ts`
4. `capability-release-temporal-schema.test.ts`
5. `capability-release-bridge-dto.test.ts`

### 8.4 架构验收

1. 新增发布逻辑可明确判断属于 `release / compiler / validator / publisher / audit` 哪一层
2. 后续物理迁移到 `registry-release/release-manager` 时不再需要整体搬运巨型 service

---

## 9. 风险点

### 9.1 最大风险

1. 拆出多个新 service，但主 service 仍保留同样逻辑，形成“双实现”
2. 把编译、校验、发布后动作继续混写到同一个新文件，换壳不换结构
3. 为了迁目录而先改大量 import，导致回归面失控

### 9.2 控制策略

1. 每一刀只迁一类职责
2. 每迁一类职责，都让旧 service 改成委托而不是复制
3. 优先拆“发布后绑定”和“编译装配”两类边界最清晰的部分
4. 先在原路径拆对，再做包级迁移

---

## 10. 回滚策略

若某一刀出现回归，按以下顺序回滚：

1. 回滚新 service 的委托接线
2. 保留目录与空骨架，不继续推进下一刀
3. 恢复到旧 service 直连实现

推荐提交粒度：

1. `release/` façade 首刀一个 commit
2. `publisher/` runtime binding 首刀一个 commit
3. 编译与校验切分一个 commit
4. 审计收口一个 commit

---

## 11. 与后续迁移的关系

本方案完成后，后续工作会明显更顺：

1. `registry-release/release-manager` 可以逐步承接真实实现，而不是只做 re-export
2. `workflow-registry` 与 `browser-domain` 可以更清楚地向发布中心提供设计时资产
3. `control-plane` 后续只需逐步消费更稳定的 Release 产物，而不是感知发布侧内部细节

---

## 12. 结论

`capability-release` 的首要问题不是“名字还旧”，而是“内部职责还没拆开”。因此本批次的正确顺序应是：

1. 先把 `capability-release.service.ts` 和 `capability-release-runtime.service.ts` 瘦身
2. 让 `release / compiler / validator / publisher / audit` 承接真实实现
3. 再把已经拆开的实现迁入 `registry-release/release-manager`

只有这样，`release-manager` 才不是一个新的目录壳，而是真正的发布中心实现边界。
