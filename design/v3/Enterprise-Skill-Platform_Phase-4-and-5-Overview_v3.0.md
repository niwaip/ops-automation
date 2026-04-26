# 企业级 Skill 平台 Agent OS Phase 4/5 概要与整合性判断

**Phase 4 and 5 Overview v3.0**  
日期：2026-04-26

> 本文不再把 `Phase 4` 和 `Phase 5` 展开到蓝图级，而是给出足够稳定的阶段概要，并重新从整条 `Phase 1 -> Phase 5` 链路判断整体整合性。由于后续阶段受实现结果、组织能力和安全要求影响较大，本文刻意保留一定弹性。

---

## 1. 文档目标

本文回答以下问题：

- `Phase 4` 和 `Phase 5` 当前最稳的边界是什么
- 哪些内容现在适合只做概要，不适合过早细化
- 当前整条 `v3` 路线在架构上是否整合得通
- 哪些地方已经顺，哪些地方后续仍可能返工

---

## 2. 为什么 `Phase 4/5` 先只做概要

原因主要有 4 个：

- `Phase 4` 强依赖 `Phase 3` 的 Memory 和 Evaluation 质量，前面没跑稳，后面过早细化意义不大
- `Phase 5` 涉及 Code Runtime、Benchmark、Promotion，强依赖未来的安全边界和组织能力
- 这两个阶段更容易受到真实执行数据、接管频率、审计要求变化影响
- 现在最重要的是保证它们与前 3 个阶段逻辑连续，而不是提前把实现细节写死

因此，当前最合适的方式是：

- `Phase 4/5` 保持稳定边界
- 保持核心对象清晰
- 保持前后依赖清晰
- 不把接口和表结构过早定死

---

## 3. `Phase 4` 概要

### 3.1 阶段定位

`Phase 4` 不是“让系统自动优化自己”，而是：

- 让前面已经沉淀的 `Evaluation + Memory + Artifact` 进入正式进化链
- 让“经验反哺 Skill”成为有验证、有审核、有发布约束的正式流程

一句话概括：

> `Phase 4` 解决的是“怎么受控地变好”，不是“怎么立刻自己修改自己”。

### 3.2 核心目标

- 把失败和接管经验转成正式候选对象
- 把轻量经验写入 `Memory`
- 把重量经验转成 `SkillVersion Draft`
- 把进化接入 validate / review / publish 主链

### 3.3 核心对象

- `CandidatePatch`
- `Promotion`
- `SkillVersion`
- `Evaluation`
- `MemoryItem`

### 3.4 稳定边界

`Phase 4` 当前最稳定的边界是：

- 输入来自 `Evaluation + Memory + Artifact`
- 输出不是直接改线上，而是：
  - `Memory Patch`
  - `SkillVersion Draft`
- 所有线上变更都必须经过：
  - validate
  - review
  - publish

### 3.5 当前不建议过早定死的内容

- Patch 生成算法的具体形式
- 是否完全自动生成 SkillVersion Draft
- Review 流程是否一步或多步
- 发布链是否走 canary / shadow / manual 三路

### 3.6 当前最合理的实施心智

- 先把 `Phase 4` 当成“从复盘到候选发布”的正式桥梁
- 不要把它理解成“自动 self-evolution 系统”

---

## 4. `Phase 5` 概要

### 4.1 阶段定位

`Phase 5` 不是简单补一个 Code Runtime，而是平台化能力阶段：

- 多 Runtime 真正统一
- 评测和回归真正进入主链
- 发布、灰度、回滚、运营能力成熟

一句话概括：

> `Phase 5` 解决的是“平台如何长期可扩展、可运营、可回归”，而不是“再多加几个功能模块”。

### 4.2 核心目标

- 补齐正式 Code Runtime
- 补齐 Replay / Benchmark / Regression
- 补齐 Shadow / Canary / Rollback
- 补齐 Org Knowledge 深化和运营视图

### 4.3 核心对象

- `RuntimeSession` 的 code 扩展
- `Artifact`
- `Promotion`
- `MemoryItem`
- Benchmark / Replay 相关对象

### 4.4 稳定边界

`Phase 5` 当前最稳定的边界是：

- Code Runtime 必须统一纳入 `Execution / RuntimeSession / Policy`
- Replay / Benchmark 必须依赖前面已经稳定的对象模型
- Promotion 必须建立在 `Phase 4` 发布闭环之上

### 4.5 当前不建议过早定死的内容

- Code Runtime 的具体沙箱实现方式
- Benchmark 数据集组织方式
- Replay 的回放精度要求
- Canary 和 Shadow 的比例、策略与运营模型

### 4.6 当前最合理的实施心智

- 把 `Phase 5` 看成平台成熟度阶段
- 不是当前的“能力扩展清单”

---

## 5. 重新判断整条流程的整合性

我从整条 `Phase 1 -> Phase 5` 看，当前这套 `v3` 规划整体上是**整合得通的**，而且主线比之前清晰很多。

### 5.1 现在整合得最顺的地方

- 主对象已经统一
  - `Execution` 作为业务真相源
  - `RuntimeSession` 作为资源真相源
- 主责任已经统一
  - Planner 负责理解与建议
  - Execution 负责状态与审计
  - Runtime 负责执行
  - Policy 负责边界
  - Memory / Evaluation 负责经验沉淀
- 演进方向已经统一
  - 不是“Prompt 越写越大”
  - 而是“对象、状态、审计、发布链逐步成熟”

### 5.2 当前流程最合理的因果顺序

当前路线最合理的顺序是：

`Phase 1 执行主链 -> Phase 2 治理边界 -> Phase 3 记忆与复盘 -> Phase 4 受控进化 -> Phase 5 平台化扩展`

这条顺序的优点是：

- 每一阶段都建立在前一阶段稳定输出之上
- 不需要在前期就假设过多“未来会发生什么”
- 允许后 2 个阶段根据真实运行数据调整

### 5.3 当前整合性最强的主链

现在已经形成的最完整闭环是：

`Request -> Planner -> Execution -> Runtime -> Verification -> Policy -> Artifact -> Evaluation -> Memory -> Candidate Patch -> Release`

这条链在逻辑上已经闭合。

---

## 6. 当前仍有的整合风险

虽然整体方向已经通，但仍有 5 个地方要持续警惕。

### 6.1 `Phase 1` 和 `Phase 2` 之间的边界仍容易回滑

风险：

- 为了赶进度，把 Policy 判断重新写回执行器或工具层

后果：

- 后面 `PolicyDecision` 变成形式对象，失去价值

### 6.2 `Phase 3` 容易再次退回“上下文堆叠”

风险：

- Memory 最终变成聊天历史增强版

后果：

- 到 `Phase 4` 时无法稳定产出高质量 Patch 输入

### 6.3 `Phase 4` 容易被误解成“自动进化引擎”

风险：

- 跳过 validate / review / publish，试图直接在线更新

后果：

- 整个平台安全边界失效

### 6.4 `Phase 5` 容易被过早拉进来

风险：

- 在 `Phase 1/2/3` 未稳定前就开始正式做 Code Runtime 和 Benchmark 平台

后果：

- 平台复杂度暴涨，主链收口失败

### 6.5 Portal 视角和平台对象视角必须持续一致

风险：

- 后台对象已经统一，前端页面仍按旧 session / worker 习惯组织

后果：

- 用户认知和平台模型脱节

---

## 7. 我对当前整体方案的判断

### 7.1 方案是通的

当前 `v3` 最重要的好处是：

- 它不是按“技术组件”拼图
- 而是按“正式对象和正式边界”来组织平台

这意味着后续即使服务拆分方式变化，主线仍然能保住。

### 7.2 方案不是平均用力，而是有主次的

当前最合理的用力点顺序已经很明确：

- 先稳 Execution
- 再稳 Policy
- 再稳 Memory / Evaluation
- 最后再做 Evolution / Runtime advanced

这一点是整合性成立的关键。

### 7.3 方案留了足够弹性

尤其是 `Phase 4/5` 目前只做概要，是正确的。

原因：

- 真正会变化的恰恰就是进化策略、发布策略、Code Runtime 形态和 Benchmark 深度
- 这些都不适合在当前阶段被写得过死

---

## 8. 对后续细化的建议

当前建议是：

- 暂时不要继续细化 `Phase 5`
- `Phase 4` 也先保持在概要级
- 真正下一步需要进入代码实施准备时，应回到：
  - `Phase 1`
  - `Phase 2`

也就是说：

- 规划层已经足够
- 后续重点应该逐步转向实现层，而不是继续扩写后半段蓝图

---

## 9. 一句话总结

当前整条 `v3` 路线的整合性判断是：

> 主线已经成立，阶段顺序也合理；后续最重要的不是继续把 `Phase 4/5` 写得更细，而是守住当前对象边界，先把 `Phase 1/2` 真正做成代码里的正式主链。
