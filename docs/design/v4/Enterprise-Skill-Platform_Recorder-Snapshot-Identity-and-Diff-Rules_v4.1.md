# 企业级 Skill 平台 Recorder Snapshot Identity 与 Diff Rules 草案

**Recorder Snapshot Identity & Diff Rules v4.1**  
日期：2026-07-03

> 本文是 [Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md) 与 [Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md) 的身份与变化规则续篇。  
> 目标是把 `snapshotId / snapshotContentHash / observationFingerprint / ref / diffKey / staleness` 的语义边界写清楚，避免在实现阶段出现“字段都有，但含义各不相同”的问题。

---

## 1. 文档目标

本文回答以下问题：

- `snapshotId`、`snapshotContentHash`、`snapshotVersion`、`observationFingerprint` 分别代表什么
- `ref` 的生命周期与失效边界是什么
- `diffKey` 应如何生成，哪些字段可以参与稳定匹配
- 什么情况下允许复用上一轮 observation，什么情况下必须重新 observe
- before / after diff 应如何避免因重渲染导致大面积误报

---

## 2. 设计原则

### 2.1 区分“采样实例”“内容去重”“语义相似”

- `snapshotId` 表示一次具体采样实例
- `snapshotContentHash` 表示规范化内容的去重标识
- `observationFingerprint` 表示当前页面是否仍可视为“同一语义观察上下文”

### 2.2 ref 是强锚点，但不是永久主键

- `ref` 适合在同一采样或相邻稳定采样间复用
- `ref` 不应被假设为跨重渲染、跨路由、跨页面刷新永久稳定
- 一旦 `ref` 失效，系统必须回退到结构匹配与区域定位

### 2.3 diff 必须围绕稳定键，而不是围绕临时节点对象

- before / after diff 的核心目标是回答“语义上同一个目标是否发生变化”
- 不能仅依赖内存对象地址或瞬时 DOM 路径
- `diffKey` 必须在 observation 生成阶段就明确产出

### 2.4 stale 检测优先于复用

- 复用 observation 的前提不是“最近一次存在”，而是“最近一次仍然有效”
- 只要 stale 风险足够高，就应强制重新 observe

---

## 3. 标识体系总览

建议将页面观察状态的身份拆成 4 层：

1. `snapshotId`
2. `snapshotVersion`
3. `snapshotContentHash`
4. `observationFingerprint`

其中：

- `snapshotId` 回答“这是第几次具体采样”
- `snapshotVersion` 回答“它和前后采样的顺序关系是什么”
- `snapshotContentHash` 回答“规范化后的结构内容是否相同”
- `observationFingerprint` 回答“当前是否仍属于可复用的同一语义页面上下文”

---

## 4. Snapshot Identity 规则

### 4.1 snapshotId

```ts
type SnapshotId = string;
```

建议语义：

- `snapshotId` 是单次采样实例标识
- 推荐由 `runtimeSessionId + snapshotVersion` 组合生成
- 它不承担去重语义，也不承担跨 session 稳定匹配语义

示例：

```ts
snapshotId = `${runtimeSessionId}:snapshot:${snapshotVersion}`;
```

### 4.2 snapshotVersion

```ts
type SnapshotVersion = number;
```

规则：

- 在同一 `runtimeSessionId` 内单调递增
- 每次成功采集新的 observation 都递增
- 主要用于表达前后顺序、判定 ref 是否仍在相邻稳定上下文内

不应承担：

- 不应作为内容去重 key
- 不应作为语义相似判断依据

### 4.3 snapshotContentHash

```ts
type SnapshotContentHash = string;
```

语义：

- `snapshotContentHash` 用于对规范化后的结构内容做去重
- 它回答的是“页面结构内容是否等价”，不是“是否同一个采样实例”

建议输入：

- snapshot 中可见且可交互节点的结构化摘要
- 区域级摘要
- 高价值文本摘要

建议排除：

- 动态时间戳
- 随机 token
- 一次性 request id
- 广告轮播计数
- 会导致无意义抖动的瞬时属性

### 4.4 observationFingerprint

```ts
type ObservationFingerprint = string;
```

语义：

- `observationFingerprint` 用于判断当前 observation 是否仍可被视为“同一语义观察上下文”
- 它允许比 `snapshotContentHash` 更宽松

适合纳入 fingerprint 的信息：

- URL pathname 模板
- 主区域结构
- 关键标题
- 列表/详情/表单等区域类型组合
- 页面事实摘要，例如“存在 selectable list”“当前位于 detail page”

适合排除的信息：

- 具体列表内容的轻微变化
- 输入框当前值
- 短时间刷新的非关键文本

---

## 5. snapshotContentHash 规范化规则

### 5.1 规范化目标

同一语义页面即使发生轻微动态变化，也不应每次都得到完全不同的 hash。

### 5.2 建议规范化步骤

1. 只保留可见或可交互节点
2. 对节点按稳定遍历顺序输出
3. 仅保留结构相关字段：
   - `role`
   - `name`
   - `contextLabel`
   - `regionId`
   - `selected`
   - `disabled`
   - `visible`
4. 对文本做裁剪与去噪
5. 对动态字段做 normalize 或直接删除
6. 对结果做稳定序列化后再 hash

### 5.3 动态字段 normalize 建议

| 字段类型 | 建议策略 |
| --- | --- |
| 时间戳 | 替换为 `<timestamp>` |
| UUID / token | 替换为 `<id>` |
| 计数器 | 仅在业务有意义时保留 |
| 随机 query 参数 | 删除或归一化 |

---

## 6. ref 生命周期规则

### 6.1 ref 的定位

`ref` 是 snapshot 内部对节点的强锚点，适合：

- 动作 target grounding
- 同一页面短距离回放
- 相邻采样间的精确节点追踪

### 6.2 ref 的有效期

首期建议把 `ref` 视为以下范围内可信：

- 同一 `snapshotVersion`
- 相邻采样且 `observationFingerprint` 未变化
- 无路由跳转、无主区域重构的轻量页面变化

### 6.3 ref 失效条件

出现以下任一情况，应视为 `ref` 不再可靠：

- URL pathname 变化
- 主标题变化且语义页面切换
- `observationFingerprint` 不匹配
- 页面主区域结构重排
- 节点所属 `regionId` 消失或重建

### 6.4 ref 失效后的降级顺序

1. `diffKey`
2. `role + name + contextLabel`
3. `regionId + ordinal`
4. 明确结构 locator
5. 视觉回退

---

## 7. diffKey 规则

### 7.1 目标

`diffKey` 用于表达“before / after 中语义上同一个节点”。

### 7.2 生成优先级

建议按以下优先级生成：

1. `role + name + contextLabel`
2. `regionId + ordinal`
3. 明确 locator 的结构表达

说明：

- `ref` 不直接等于 `diffKey`
- `ref` 可参与定位，但 `diffKey` 应尽量表达跨重渲染仍成立的语义身份

### 7.3 推荐输出结构

```ts
export interface ObservedNode {
  ref?: string;
  diffKey?: string;
  role?: string;
  name?: string;
  contextLabel?: string;
  regionId?: string;
  ordinal?: number;
}
```

### 7.4 不建议直接用作 diffKey 的内容

- 原始 DOM path
- CSS class 全量字符串
- 动态 index 且无区域约束
- 完整 innerText

这些字段太容易随渲染细节变化，不能稳定表达语义身份。

---

## 8. regionId 规则

### 8.1 目标

`regionId` 用于把页面切分为稳定区域，例如：

- 列表区
- 详情区
- 表单区
- 主操作区

### 8.2 生成原则

- 优先按结构职责命名，而不是视觉样式命名
- 同一语义区域在相邻 observation 中应尽量保持不变
- 如果区域被整体替换，应生成新 `regionId`

### 8.3 示例

```ts
regionId = 'main:list';
regionId = 'side:detail';
regionId = 'main:form';
```

---

## 9. Staleness 规则

### 9.1 目标

staleness 规则用于回答：“上一轮 observation 还能不能继续复用？”

### 9.2 reuseEligibility

```ts
type ReuseEligibility = 'fresh' | 'stale' | 'reobserve-required';
```

语义：

- `fresh`：可直接复用
- `stale`：存在风险，需谨慎复核
- `reobserve-required`：禁止直接复用，必须重新 observe

### 9.3 最小判定规则

建议按以下顺序判断：

1. 若 URL pathname 变化，直接 `reobserve-required`
2. 若主标题与主区域结构同时变化，直接 `reobserve-required`
3. 若 `observationFingerprint` 不匹配，直接 `reobserve-required`
4. 若仅列表内容轻微变化，但主区域与页面事实稳定，可判 `fresh` 或 `stale`
5. 若 `capturedAt` 超过 TTL，且用户使用相对指代，至少判 `stale`

### 9.4 staleReason 建议

```ts
type StaleReason =
  | 'url_changed'
  | 'title_changed'
  | 'fingerprint_mismatch'
  | 'region_rebuilt'
  | 'ttl_expired'
  | 'insufficient_context';
```

---

## 10. Diff 生成规则

### 10.1 Node diff

节点 diff 应按以下顺序处理：

1. 优先尝试 `ref` 精确命中
2. 若 `ref` 不可用，则按 `diffKey` 匹配
3. 若 `diffKey` 不存在，则退化到 `regionId + ordinal`
4. 若仍无法确认同一节点，则不进入严格 diff，只记录 `unknown change`

### 10.2 Region diff

区域 diff 以 `regionId` 为基础锚点，重点关注：

- `content`
- `visibility`
- `entry-count`

### 10.3 避免误报的原则

- 不因为单次重渲染而把整页节点都视为“新节点”
- 不因为轻微文本波动就判定为页面目标已完成
- 不因为 `ref` 失效就放弃 diff，而应退化到 `diffKey`

---

## 11. 典型场景

### 11.1 点击第二条记录

before:

- `regionId = main:list`
- 第二条记录 `diffKey = row:main:list:2`
- `selected = false`

after:

- 同一 `diffKey`
- `selected = true`
- `side:detail` 区域文本变化

判定：

- 目标命中成功
- 节点状态变化成立
- 详情区切换成立

### 11.2 列表刷新但仍在同一页

before 与 after：

- `snapshotVersion` 不同
- `snapshotContentHash` 不同
- `observationFingerprint` 相同
- 主标题与区域结构不变

判定：

- 说明发生了内容刷新，但仍属于同一语义页面
- 可继续复用区域与部分目标候选
- 不应直接把旧 `ref` 当作永久有效

### 11.3 路由跳转后继续说“刚才那个按钮”

若：

- URL pathname 变化
- `observationFingerprint` 不匹配

则：

- `reuseEligibility = reobserve-required`
- 禁止直接复用上一轮 `ref`
- 应重新 observe 后再做 grounding

---

## 12. 与现有类型的映射

建议映射到：

- [Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md) 中的：
  - `ObservationPageState`
  - `ObservedNode`
  - `ObservedRegion`
  - `ObservationDiff`
  - `NodeStateChange`
  - `RegionStateChange`

后端优先承接点：

- [recorder-snapshot.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-snapshot.service.ts)
- [recorder-debug-execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts)

---

## 13. 首批实现建议

### 13.1 第一批必须落地

- `snapshotId`
- `snapshotVersion`
- `snapshotContentHash`
- `observationFingerprint`
- `reuseEligibility`
- `staleReason`
- `diffKey`
- `regionId`

### 13.2 第一批可先简化

- `snapshotContentHash` 可先基于结构节点做稳定序列化，不必一步做到完美 normalize
- `observationFingerprint` 可先采用“pathname + title + region labels + page facts”组合
- `diffKey` 可先覆盖高价值节点，不要求一开始全页面都生成

### 13.3 不建议首期就做

- 纯视觉页面的复杂 identity
- 跨 iframe 的统一 diff
- 完全自动的历史压缩与长期 memory 合并

---

## 14. 最终结论

对 recorder 而言，快照相关字段如果不拆清语义，后续所有“复用、验证、diff、回放”都会变得模糊。

因此首期最重要的不是“把字段都加上”，而是先明确：

- `snapshotId` 是实例标识
- `snapshotVersion` 是顺序标识
- `snapshotContentHash` 是去重标识
- `observationFingerprint` 是语义复用标识
- `ref` 是短期强锚点
- `diffKey` 是跨重渲染稳定键
- `reuseEligibility / staleReason` 是复用闸门

把这几层区分开，Recorder 的 outcome、verification、history 压缩与回放能力才会建立在同一套可解释规则之上。
