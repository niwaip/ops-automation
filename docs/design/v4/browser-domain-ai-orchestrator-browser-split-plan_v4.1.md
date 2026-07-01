# browser-domain / ai-orchestrator browser 模块拆分方案 (v4.1)

日期：2026-06-24

> 本文对应 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 中的 P0 任务，用于把 `ai-orchestrator/src/modules/browser/*` 从“混居在主 Planner 服务中的浏览器实现堆”收敛为可迁移的 `browser-domain` 结构。

---

## 1. 任务目标

本方案的目标不是马上把整个浏览器模块搬到 `capabilities/browser-domain`，而是先完成三件事：

1. 让 `ai-orchestrator` 明确回到“通用规划 + 委派入口”的职责。
2. 让 `modules/browser/*` 内部按能力域子层真实收口。
3. 为后续迁到 `capabilities/browser-domain` 与部分逻辑外移到 `browser-nl-agent` 准备稳定边界。

本批次不追求：

- 一次性拆完所有 `browser/*` 文件
- 一次性重写录制链路
- 一次性独立部署 `browser-domain`

---

## 2. 当前现状

### 2.1 当前目录

当前浏览器相关实现位于：

`apps/backend/intelligence/ai-orchestrator/src/modules/browser/`

其中主要子目录包括：

- `api/`
- `execute/`
- `export/`
- `gateway/`
- `intent/`
- `loop/`
- `observe/`
- `observation/`
- `recovery/`
- `runtime-facade/`
- `session/`

### 2.2 当前代表性实现

当前最有代表性的文件包括：

- `execute/recorder-debug.service.ts`
- `execute/recorder-debug-session.facade.ts`
- `execute/recorder-debug-observation.facade.ts`
- `execute/recorder-debug-chat-flow.service.ts`
- `execute/recorder-debug-chat-execution.service.ts`
- `observe/recorder-observation.service.ts`
- `observe/recorder-debug-observation-refresh.service.ts`
- `session/recorder-debug-session-coordinator.service.ts`
- `session/recorder-debug-session-store.service.ts`
- `loop/recorder-loop.service.ts`
- `loop/recorder-conditional-branch.service.ts`
- `export/recorder-export.service.ts`
- `export/recorder-template-export.service.ts`
- `intent/browser-command.service.ts`
- `intent/browser-command-semantic-runtime.service.ts`
- `api/browser-command.controller.ts`
- `api/recorder-debug.controller.ts`

### 2.3 当前核心问题

当前问题主要体现在三层混居：

#### A. `ai-orchestrator` 的通用规划职责

包括：

- `planner`
- `recognizer`
- `model`
- `react-engine`
- `chat`

#### B. 浏览器能力域职责

包括：

- 浏览器录制
- 页面观察
- 导出
- 会话管理
- 恢复与调试
- 浏览器语义命令解析

#### C. 高变更率的浏览器自然语言循环

包括：

- 浏览器动作语义理解
- 页面观察与推断
- 多轮动作决策

这些本来就不应长期与主 Planner 共住同一个服务核心路径。

---

## 3. 本批次范围

### 3.1 纳入范围

本方案纳入：

1. `modules/browser/*` 的逻辑层重新分区
2. `planner` 与 `browser/*` 的依赖方向收口
3. 哪些子层未来迁到 `browser-domain`
4. 哪些高频自然语言决策未来外移到 `browser-nl-agent`
5. 适合作为首轮 PR 的切口设计

### 3.2 不纳入范围

本方案不纳入：

1. 浏览器模板服务 `domain/browser-template` 的真实迁移
2. 浏览器语义服务 `domain/browser-semantics` 的真实迁移
3. `browser-worker` 的执行协议重写
4. 前端录制页面或网关协议的系统性改造

说明：

本方案只处理 `ai-orchestrator` 内部浏览器模块的第一轮结构性瘦身。

---

## 4. 目标职责边界

### 4.1 `planner/*` 保留职责

`planner` 只保留：

1. 技能匹配
2. 参数识别
3. 计划生成
4. Agent 委派

`planner` 不再继续吸收：

1. 浏览器录制会话维护
2. 页面观察与刷新
3. 浏览器导出
4. 浏览器命令语义实现细节

### 4.2 `browser-domain/recorder`

未来应承接：

1. 录制主流程
2. 调试会话
3. 观察刷新
4. 条件分支与 loop
5. 导出前的录制上下文装配

当前在 `ai-orchestrator` 中的对应来源包括：

- `execute/*`
- `observe/*`
- `session/*`
- `loop/*`
- `recovery/*`

### 4.3 `browser-domain/observation`

未来应承接：

1. 页面快照获取
2. DOM / 页面结构观察
3. 执行后 observation 刷新
4. 录制链路中的观察聚合

当前在 `ai-orchestrator` 中的对应来源包括：

- `observe/*`
- `execute/observation/*`
- `execute/recorder-debug-observation.facade.ts`

### 4.4 `browser-domain/session`

未来应承接：

1. 录制会话协调
2. 录制 session store
3. 录制上下文生命周期

当前在 `ai-orchestrator` 中的对应来源包括：

- `session/*`
- `execute/session/*`
- `execute/recorder-debug-session.facade.ts`

### 4.5 `browser-domain/export`

未来应承接：

1. 模板导出
2. 脚本导出
3. 录制执行计划导出

当前在 `ai-orchestrator` 中的对应来源包括：

- `export/*`

### 4.6 `browser-domain/runtime-facade`

未来应承接：

1. 面向 `control-plane` 的域桥接
2. 面向 `browser-worker` 的域桥接
3. 浏览器域内统一的运行时入口

当前在 `ai-orchestrator` 中的对应来源包括：

- `runtime-facade/*`
- 部分 `execute/` 中的桥接性 service

### 4.7 `browser-nl-agent`

未来适合承接：

1. 高变更率的自然语言浏览器动作决策
2. 多轮感知-动作循环
3. 页面观察结果的高频推断

不适合直接迁给 `browser-nl-agent` 的内容：

1. 模板导出
2. 录制会话持久化
3. 控制器入口
4. 通用浏览器域桥接

---

## 5. 目标结构

本批次完成后，建议先形成如下逻辑视图：

```text
apps/backend/intelligence/ai-orchestrator/src/modules/browser/
├── api/
├── gateway/
├── recorder/
│   ├── execute/
│   ├── loop/
│   ├── recovery/
│   └── index.ts
├── observation/
│   ├── observe/
│   └── index.ts
├── session/
│   └── index.ts
├── export/
│   └── index.ts
├── intent/
│   └── index.ts
├── runtime-facade/
│   └── index.ts
└── index.ts
```

说明：

- 这里的关键不是马上搬文件，而是先让目录语义真实反映未来 `browser-domain` 的子层。
- `intent/` 在第一阶段可以继续留在 `browser/` 下，但要明确它属于浏览器能力域，而不是 `planner` 的天然组成部分。

---

## 6. 关键子模块拆分建议

### 6.1 `execute/recorder-debug.service.ts`

这是第一优先级热点。

当前问题：

1. 仍承担过厚的 façade 角色
2. 同时牵扯 session、observation、chat-flow、execution、response
3. 是浏览器录制链路最容易继续膨胀的入口

建议：

1. 继续沿已有 `recorder-debug-session.facade.ts`
2. 继续沿已有 `recorder-debug-observation.facade.ts`
3. 逐步把主 service 收敛成录制入口 façade

### 6.2 `intent/*`

当前问题：

1. 浏览器命令语义解析与主 Planner 认知容易混淆
2. 这里既有语义 runtime，又有 profile 和 atomic parser

建议：

1. 明确其归属为“浏览器域语义层”，而不是“主 Planner 通用 skill 匹配层”
2. 后续高变更率的自然语言动作推断可逐步外移到 `browser-nl-agent`
3. 当前先通过目录和导出规则稳定边界，不立即全搬

### 6.3 `observe/*`、`session/*`、`loop/*`

当前问题：

1. 这几层是真正的录制上下文基础设施
2. 但目前散落在多个目录，并被 `execute/*` 深度依赖

建议：

1. 先在命名上把它们视为 recorder 的协作子层
2. 优先收敛外部 import，不再允许绕过 façade 深链路访问
3. 后续整体迁入 `browser-domain/recorder`

### 6.4 `export/*`

当前问题：

1. 导出链路本身边界相对稳定
2. 但当前与录制链路实现仍耦合较深

建议：

1. 保持独立出口
2. 让录制主流程只依赖 `export` façade
3. 为后续物理迁移到 `browser-domain` 提供最容易落地的一块

---

## 7. 建议实施步骤

### Step 1：先冻结依赖方向

目标：

让 `planner/*` 不再新增对 `browser/*` 内部实现的深层依赖。

具体动作：

1. 统一通过 `browser/index.ts` 或稳定子目录出口引用
2. 禁止从 `planner/*` 直接深层导入 `execute/*`、`observe/*`、`session/*` 内部实现

### Step 2：优先收敛 `recorder-debug` 主链路

目标：

让录制主链路的最厚入口先变薄。

具体动作：

1. 继续下沉 session 聚合
2. 继续下沉 observation 聚合
3. 继续把 chat-flow、execution、response 维持为协作者
4. `recorder-debug.service.ts` 只保留总入口与业务路由

### Step 3：让 `observe / session / loop` 形成 recorder 协作层

目标：

让这些目录不再被外部随意直连。

具体动作：

1. 为 recorder 主入口补统一 façade
2. 让 `execute/*` 改经 façade 协调，而不是直接管理全部上下文细节

### Step 4：让 `intent/*` 独立成浏览器域语义层

目标：

避免团队继续把浏览器命令语义实现误判为主 Planner 逻辑。

具体动作：

1. 在文档和目录出口上明确其归属
2. 保持其对外通过 `browser/intent/index.ts` 暴露
3. 高变更率部分未来再迁往 `browser-nl-agent`

### Step 5：为后续物理迁移建立最小稳定包边界

目标：

让未来迁到 `capabilities/browser-domain` 时，尽量按子层整体迁而不是按零散文件迁。

具体动作：

1. `recorder` 形成相对稳定的协作层
2. `observation` 形成稳定出口
3. `export` 形成稳定出口
4. `runtime-facade` 形成稳定出口

---

## 8. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 收紧 `planner` 对 `browser/*` 的导入边界
2. 继续瘦身 `recorder-debug.service.ts`
3. 明确 `observe / session / loop` 的 recorder 协作关系
4. 保持 controller、gateway、路由和 API 契约稳定

首轮 PR 不建议同时包含：

1. 把 `browser/*` 真正迁到 `capabilities/browser-domain`
2. 同步迁移 `domain/browser-template`
3. 同步迁移 `domain/browser-semantics`
4. `browser-worker` 协议重写

---

## 9. 验收标准

### 9.1 结构验收

1. `planner` 不再新增对浏览器内部实现的深层依赖
2. `recorder-debug.service.ts` 职责继续下降
3. `browser/*` 的子层开始反映 `recorder / observation / session / export / runtime-facade` 逻辑

### 9.2 编译验收

至少保证：

1. `apps/backend/intelligence/ai-orchestrator` 可正常 typecheck
2. 模块注入关系和对外入口保持稳定

### 9.3 测试验收

优先回归以下范围：

1. `recorder-debug.core.spec.ts`
2. `recorder-debug.chat.spec.ts`
3. `recorder-debug-session-coordinator.service.spec.ts`
4. `recorder-observation.service.spec.ts`
5. `recorder-export.service.spec.ts`
6. `browser-command.service.spec.ts`

### 9.4 架构验收

1. 浏览器新增需求可以明确判断进入 `recorder / observation / session / export / runtime-facade / intent` 哪一层
2. `ai-orchestrator` 更接近“主 Planner + 委派中枢”，而不是浏览器域实现容器

---

## 10. 风险点

### 10.1 最大风险

1. 名字改了，但 `recorder-debug.service.ts` 仍继续膨胀
2. 只是把浏览器实现换目录，并没有切断对 `planner` 的耦合
3. 把 `intent/*` 过早整体迁给 `browser-nl-agent`，导致现有行为回归

### 10.2 控制策略

1. 先收紧依赖方向，再迁目录
2. 先拆 recorder 主链路，再碰高变更率自然语言层
3. `browser-nl-agent` 只逐步承接高频决策，不直接吞掉整个浏览器域

---

## 11. 回滚策略

若某一刀引入回归，按以下顺序回滚：

1. 回滚 façade 接线与目录出口调整
2. 保留目标子层目录骨架，不继续推进下一刀
3. 恢复 `recorder-debug.service.ts` 的原有委托关系

推荐提交粒度：

1. 依赖方向冻结一个 commit
2. `recorder-debug` 瘦身一个 commit
3. recorder 协作层收敛一个 commit
4. `intent` 归属澄清一个 commit

---

## 12. 与后续迁移的关系

本方案完成后，后续三条线会更顺畅：

1. `capabilities/browser-domain` 可以按子层承接真实代码
2. `browser-nl-agent` 可以只承接高变更率自然语言决策
3. `ai-orchestrator` 可以逐步恢复成通用 Planner 与委派入口

---

## 13. 结论

`ai-orchestrator/modules/browser/*` 当前最大的问题不是“目录太多”，而是“浏览器能力域仍混在主 Planner 服务里”。正确顺序应是：

1. 先冻结 `planner` 与 `browser/*` 的依赖方向
2. 先把 recorder 主链路继续瘦身
3. 让 `browser/*` 按 `recorder / observation / session / export / runtime-facade / intent` 形成稳定子层
4. 再逐步迁入 `capabilities/browser-domain`，并把高频自然语言动作决策外移到 `browser-nl-agent`

只有这样，浏览器域迁移才会真正降低耦合，而不是把一个巨型模块从 `ai-orchestrator` 原样搬到新目录。
