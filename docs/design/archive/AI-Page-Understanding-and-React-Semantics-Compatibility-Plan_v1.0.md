# AI 页面识别增强与 React 语义兼容设计方案 v1.0

> 版本：v1.0  
> 日期：2026-06-16  
> 状态：设计中

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [问题定义](#2-问题定义)
3. [行业常见方法与可借鉴点](#3-行业常见方法与可借鉴点)
4. [本项目现状](#4-本项目现状)
5. [核心设计原则](#5-核心设计原则)
6. [总体方案](#6-总体方案)
7. [React 语义增强层设计](#7-react-语义增强层设计)
8. [识别与执行链路设计](#8-识别与执行链路设计)
9. [与后续自动执行的兼容性](#9-与后续自动执行的兼容性)
10. [分阶段落地计划](#10-分阶段落地计划)
11. [风险与边界](#11-风险与边界)
12. [验收标准](#12-验收标准)

---

## 1. 背景与目标

当前浏览器录制、测试、发布、Skill 调用链路已经逐步统一到同一份 `templateSteps` 语义上，但在“AI 如何理解当前页面并生成稳定动作”这一步，仍然存在明显短板。

典型问题包括：

- 同名按钮较多时，AI 只能生成模糊点击，例如 `詳細`。
- 页面存在列表、表格、卡片等结构时，AI 难以稳定理解“第一条记录”“当前行按钮”“详情区域”的归属关系。
- 当前识别结果更偏扁平元素集合，缺少业务结构和层级语义。
- 一旦生成模糊定位，后续录制导出、模板测试、发布后自动执行都会继承这类不稳定性。

本设计文档的目标是：

- 增强 AI 对页面的结构化理解能力。
- 引入 React 语义增强作为可选能力，提升录制与识别准确率。
- 保证增强方案不会破坏后续模板测试、发布和自动执行。
- 明确“识别增强层”和“运行时执行层”的边界，避免执行链过度依赖 React。
- 形成可适用于通用 Web 页面、业务系统页面和部分第三方页面的统一识别方案，而不是围绕某一个测试站点或某一个按钮场景做定制修补。
- 支持列表类业务中的重复处理场景，例如“逐条处理待办项，直到没有剩余符合条件的数据”。

---

## 2. 问题定义

### 2.1 当前问题不是“模型不够强”，而是“页面语义不够完整”

从当前链路看，页面观测已经包含：

- `snapshot`
- `evaluate` 结构探针
- `get_text`
- `inputs / buttons / headings / links`

这说明系统并非没有页面信息，而是还缺以下关键语义：

- 元素所属区域
- 列表或表格中的行关系
- 行内动作和主文本的绑定关系
- 业务字段和动作的域语义
- 同名元素的去歧义上下文

### 2.2 当前风险会传导到后续自动执行

如果录制阶段生成的是模糊动作，例如：

```json
{
  "tool": "click",
  "params": {
    "text": "詳細"
  }
}
```

那么它在后续可能演化成：

- 测试阶段点击失败
- 导出模板时只能生成模糊 locator
- 发布后 Skill 运行时出现 strict mode 命中多个元素
- AI 误点后进入错误页面，影响后续分支判断和接管流程

因此，本次设计必须把“页面识别增强”视为浏览器模板稳定性的一部分，而不是单独的 UI 优化。

---

## 3. 行业常见方法与可借鉴点

结合当前主流开源项目，AI 控制浏览器主要有四类路线：

### 3.1 无障碍树 / Snapshot 优先

代表方案：

- Playwright MCP
- 一类基于 Accessibility Tree 的 Agent 工具

共同特点：

- 不直接把完整 DOM 扔给模型。
- 优先使用结构化快照和元素引用 `ref`。
- 操作时尽量基于唯一引用，而不是文本、CSS、坐标。
- 必要时附加 screenshot 做结果校验。

适合借鉴的点：

- 元素操作尽可能使用稳定 `ref`。
- 模型的任务是“在候选中做选择”，不是自由生成 locator。
- 结构化快照应优先于视觉识别。

### 3.2 压缩页面状态 + Agent Loop

代表方案：

- browser-use

共同特点：

- 把页面转为精简、可读、适合 LLM 的中间状态。
- 只暴露可见、可交互、关键文本和状态。
- 持续记录步骤历史和页面变化。

适合借鉴的点：

- 减少输入噪音，突出“当前可以操作什么”。
- 页面状态表达要尽量语义化，而不是原始 DOM 化。
- 多步操作应保留上下文与中间记忆。

### 3.3 Observe / Act / Extract 分层

代表方案：

- Stagehand

共同特点：

- 不把所有任务塞进一个大 prompt。
- 把“观察页面”“执行动作”“提取结构化结果”拆成独立原语。
- 允许 AI 决策和传统 Playwright/规则执行混用。

适合借鉴的点：

- 识别链和执行链要分层。
- 对识别结果要做后验证，而不是直接信任模型。
- 当定位已稳定时，应优先走确定性执行，而不是继续自由推理。

### 3.4 视觉解析 / Screenshot Grounding

代表方案：

- OmniParser

共同特点：

- 通过截图识别可交互区域、图标、边界框、视觉语义。
- 适合 a11y/DOM 表达差、图标化严重、canvas 化页面。
- 成本高于结构化 snapshot，但可作为兜底策略。

适合借鉴的点：

- 视觉能力应作为 fallback，而不是默认主链。
- 视觉模型适合处理 icon-only、复杂布局、非标准组件。
- 视觉解析结果也应收敛成结构化候选，而不是直接做坐标点击。

### 3.5 可借鉴的统一结论

综合来看，开源方案里反复出现的共同原则是：

- 结构化表示优先于原始 DOM。
- `ref / index / candidate id` 优先于自由文本 locator。
- 识别、动作、提取应分层。
- 视觉能力只做兜底，不做默认主链。
- 所有 AI 决策都要有可复盘的 trace。

---

## 4. 本项目现状

### 4.1 当前已具备的能力

当前浏览器录制调试链已经具备：

- 页面观测
  - `snapshot`
  - `evaluate`
  - `get_text`
- 录制调试会话历史
- 模板导出
- 条件分支模板生成
- 模板测试链执行
- 发布后 Skill 运行时执行

### 4.1.1 当前录制观测链的真实实现

结合当前代码，录制前页面观测的实际入口在 `recorder-debug.service.ts` 的 `observePage()`，当前固定执行三步：

```text
snapshot -> evaluate(buildStructureProbeScript) -> get_text
```

这意味着当前识别链并不是空白，而是已经具备三类基础输入：

- `snapshot`
  - 提供可访问性树、语义节点和 `ref`
- `evaluate(buildStructureProbeScript)`
  - 提供按钮、输入框、标题、链接等结构化摘要
- `get_text`
  - 提供页面全文文本

该结论很重要，因为后续增强不需要推翻现有录制流程，只需要围绕这三类输入做增量改造。

### 4.1.2 当前 AI 决策上下文的真实缺口

当前 AI 决策虽然能拿到页面文本和元素摘要，但仍主要面对扁平上下文，例如：

- `currentPageUrl`
- `lastObservationText`
- `availableInputs`
- `availableButtons`

其问题不是“完全看不到页面”，而是：

- 只能看到按钮文案，缺少行归属
- 能看到数值文本，缺少业务字段名
- 能看到多个同名按钮，但不知道哪一个属于目标记录

因此，主问题不是模型能力本身，而是当前上下文在进入 `parseCommand` 前已经丢失了层级语义。

### 4.1.3 当前多模态能力已就绪，但录制链尚未使用

现有模型接口已经支持多模态消息内容：

- `ContentBlock.type = 'image_url'`
- `ChatMessage.content = string | ContentBlock[]`

这意味着视觉能力在基础设施层并不是阻塞项。

当前真正缺的是：

- 何时触发截图分析
- 截图结果如何回收为结构化候选
- 如何保证视觉结果只做 fallback，不破坏主链

因此，视觉能力应被视为“后续增强空间”，而不是主设计前提。

### 4.2 当前主要短板

当前识别链主要暴露的是：

- `buttons`
- `inputs`
- `headings`
- `links`
- `pageText`

该结构更接近“扁平可见元素摘要”，但并不天然表达：

- 区域归属
- 列表层级
- 行内动作
- 业务对象关系
- 列表剩余项与循环终止条件

### 4.3 当前最需要补的不是执行器，而是识别前语义

发布后自动执行链已经在逐步统一 `templateSteps` 语义，当前更大的瓶颈在于：

- 录制阶段产出的动作和定位是否足够稳定
- 导出模板时能否保留稳定定位
- AI 是否真的理解“当前行”和“目标字段”的关系

因此，本设计的重点是前置识别增强，而不是重写执行引擎。

### 4.5 当前循环类业务场景缺少显式表达

对于如下目标：

- 登录后进入一览页
- 找到所有“未承认 / 待审批 / 待处理”记录
- 逐条点击详情并执行承认
- 直到列表中不再存在符合条件的数据

当前链路存在两个空白：

- 识别层只能较好表达“某一条记录上的某个动作”，还不能稳定表达“还有多少条待处理记录”。
- 执行层当前只有线性步骤和条件分支，没有显式“循环直到条件满足”的标准节点。

因此，循环处理能力应被视为本方案的一部分，但其落点应优先放在模板 DSL / 执行编排层，而不是通过 prompt 隐式要求模型反复点击。

### 4.4 当前代码里最值得优先修复的两个缺口

结合现状分析，最值得优先修复的是两个具体缺口：

#### 缺口 1：结构探针仍是扁平摘要

当前 `buildStructureProbeScript()` 更偏向“采样页面上有哪些元素”，而不是“这些元素如何组成列表、行、区域和字段”。

这直接导致：

- `詳細` 不知道属于哪一行
- `25.5%` 不知道对应哪个字段
- 同名按钮缺乏结构上下文

#### 缺口 2：`ref` 在 AI 上下文传递中价值不足

当前 snapshot 层已经能产出 `ref`，但在后续描述和 prompt 输入中，这类稳定引用没有被充分保留或优先使用。

这会导致：

- AI 退回到文本点击
- 导致 strict mode 多元素歧义
- 即使页面有唯一候选，仍可能生成模糊 locator

因此，`ref` 优先与层级探针升级应被定义为 P0，而不是放到后续大重构里。

---

## 5. 核心设计原则

### 5.1 React 语义是增强层，不是运行时硬依赖

React 语义信息可以参与：

- 页面观察
- 录制消歧
- 条件生成
- 模板导出

但不应成为发布后自动执行的唯一依赖。

### 5.2 最终执行统一收敛到标准模板 DSL

无论识别过程中使用了：

- snapshot
- React 语义
- screenshot fallback

最终都必须收敛到统一 DSL，例如：

- `click`
- `fill`
- `read_value`
- `branch`
- `takeover_gate`
- `repeat_until` 或等价的显式循环编排能力

以及稳定 locator / 参数表达。

这里需要强调：

- “循环”必须是显式结构，不能依赖模型在会话中自行记忆“还要再做一次”。
- 单次页面识别负责回答“当前有哪些可执行候选、是否还有剩余项”。
- 是否继续下一轮执行，应由模板 DSL 或执行编排层决定。

### 5.3 有增强更好，没有增强也能跑

对于第三方页面、非 React 页面、遗留页面：

- 系统仍需支持纯 snapshot / 纯页面探针模式。
- React 语义应设计为可选能力。
- 不允许因为缺少 React 语义而直接导致运行链失效。

### 5.4 识别结果必须可验证、可降级、可复盘

每次识别和动作决策都应支持：

- 候选展示
- 消歧说明
- 动作后验证
- 失败时回退到更保守策略

---

## 6. 总体方案

### 6.1 总体架构

```text
页面真实结构
  -> Layer 1: Snapshot / A11y / DOM Probe
  -> Layer 2: React Semantics Export (可选)
  -> Layer 3: Candidate Builder
  -> Layer 4: Intent-aware Ranking / AI Analysis
  -> Layer 5: Stable Action / TemplateStep Generation
  -> Layer 6: Post-action Verification
  -> 统一收敛到 templateSteps
```

### 6.2 各层职责

#### Layer 1：基础页面观测层

来源：

- `snapshot`
- `evaluate`
- `get_text`

职责：

- 提供基础元素集合
- 提供当前页面文本与标题
- 提供 ref、可见文案、基础属性

#### Layer 2：React 语义增强层

来源：

- React 页面组件主动暴露语义

职责：

- 补充区域、列表、行、动作归属关系
- 提供业务领域语义
- 提供稳定业务标识

#### Layer 3：候选构建层

职责：

- 把扁平元素合成为更适合 AI 决策的候选对象
- 输出列表项、表格行、动作块、字段块
- 保留 `candidateId / ref / semanticPath`
- 统一服务于：
  - 同名动作按钮
  - 行级动作
  - 字段读取
  - 区域级动作
  - 非 React 页面的普通 DOM 识别

#### Layer 4：意图感知排序层

职责：

- 根据用户输入对候选排序
- 把“第一条记录”“当前案件”“承认按钮”“毛利率字段”映射为具体候选

#### Layer 5：模板步骤生成层

职责：

- 生成稳定动作
- 输出 locator、params、output_var、branch 配置
- 在需要时输出显式循环语义、循环变量与终止条件
- 避免产出模糊文本点击

#### Layer 6：动作后验证层

职责：

- 验证点击后页面是否符合预期
- 如果状态未变化，则触发重试、消歧或人工接管

---

## 7. React 语义增强层设计

### 7.1 设计目标

让页面在 React 场景下主动告诉录制器：

- 这个区域是什么
- 这是不是列表
- 每一行代表什么业务对象
- 这一行里有哪些动作
- 哪个字段是主要文本

### 7.2 不直接暴露 React 内部结构

不建议把 React Fiber、组件树、内部 state 直接暴露给录制器。

建议暴露的是一个稳定、简化、与业务语义相关的中间层。

### 7.3 推荐暴露方式

推荐两种并行方式：

#### 方式 A：`data-ai-*` 语义属性

例如：

```html
<div data-ai-region="approval-list">
  <div data-ai-row-key="approval-1001" data-ai-row-index="1">
    <span data-ai-field="caseName">案件 A</span>
    <span data-ai-field="grossMargin">25.5%</span>
    <button data-ai-action="detail">詳細</button>
    <button data-ai-action="approve">承認する</button>
  </div>
</div>
```

适用场景：

- 业务页面由本项目掌控
- 组件层较稳定
- 需要低成本增强

#### 方式 B：运行时语义树导出

例如在调试/录制模式下注入：

```ts
window.__AI_PAGE_SEMANTICS__ = {
  pageType: 'approval_list',
  regions: [
    {
      id: 'approval-list',
      type: 'list',
      items: [
        {
          key: 'approval-1001',
          index: 1,
          primaryText: '案件 A',
          fields: {
            grossMargin: '25.5%',
          },
          actions: [
            { id: 'detail', label: '詳細' },
            { id: 'approve', label: '承認する' },
          ],
        },
      ],
    },
  ],
};
```

适用场景：

- 需要更强结构表达
- 需要跨多个组件聚合数据
- 需要把 UI 语义和业务数据联合导出

### 7.4 推荐前端封装

建议逐步建设以下封装：

- `AiSemanticProvider`
- `useAiSemanticNode()`
- `useAiSemanticList()`
- `AiSemanticDebugOverlay`

目标不是全站强制改造，而是优先支持录制价值高、结构复杂、歧义频发的页面。

### 7.5 语义字段建议

建议统一定义最小语义字段：

- `region`
- `rowKey`
- `rowIndex`
- `field`
- `action`
- `entityType`
- `entityId`
- `priority`
- `stableName`

可选扩展字段：

- `domainState`
- `businessMeaning`
- `expectedNextView`
- `preferredLocator`

### 7.6 前端语义协议草案

建议定义一个最小可版本化的语义协议，用于调试模式、录制模式和后端候选构建。

```ts
type AiSemanticProtocolVersion = '1.0';

type AiSemanticLocator = {
  type: 'ref' | 'role' | 'css' | 'text';
  value: string;
};

type AiSemanticAction = {
  id: string;
  label: string;
  actionType?: 'click' | 'fill' | 'select' | 'navigate';
  preferredLocator?: AiSemanticLocator;
  visible?: boolean;
  disabled?: boolean;
  priority?: number;
};

type AiSemanticItem = {
  key: string;
  index?: number;
  entityType?: string;
  entityId?: string;
  primaryText?: string;
  secondaryText?: string;
  fields?: Record<string, string | number | boolean | null>;
  actions?: AiSemanticAction[];
  preferredLocator?: AiSemanticLocator;
};

type AiSemanticRegion = {
  id: string;
  type: 'list' | 'table' | 'detail' | 'form' | 'toolbar' | 'dialog' | 'unknown';
  label?: string;
  priority?: number;
  items?: AiSemanticItem[];
  fields?: Record<string, string | number | boolean | null>;
};

type AiPageSemantics = {
  version: AiSemanticProtocolVersion;
  pageType?: string;
  pageKey?: string;
  generatedAt: string;
  regions: AiSemanticRegion[];
};
```

协议约束建议如下：

- `version` 必填，用于后续协议升级。
- `regions` 必填，但允许为空数组。
- `item.key` 必须稳定，优先使用业务主键，而不是随机值。
- `action.id` 必须表达动作语义，例如 `detail`、`approve`、`edit`。
- `preferredLocator` 仅作为增强信息，不能代替通用运行时 locator。

### 7.7 `data-ai-*` 属性最小集合

为了先低成本落地，建议优先定义一个最小属性集合，而不是一开始就要求所有页面输出完整语义树。

推荐最小集合：

```text
data-ai-region
data-ai-row-key
data-ai-row-index
data-ai-field
data-ai-action
data-ai-entity-type
data-ai-entity-id
data-ai-stable-name
```

推荐约束：

- `data-ai-row-key` 在列表页中必须稳定。
- `data-ai-action` 只表达动作语义，不表达展示文案。
- `data-ai-stable-name` 用于解决展示文案频繁变化问题。
- 同一个组件可同时存在语义属性和普通 aria/role 属性，不冲突。

### 7.8 React 接入方式建议

建议分三种接入级别：

#### Level 1：纯属性标注

适合：

- 表格
- 列表
- 卡片区块

特点：

- 成本最低
- 几乎不影响现有组件结构
- 适合快速验证收益

#### Level 2：Provider + Hook 聚合

适合：

- 页面存在多个分散组件
- 需要跨组件汇总区域、字段和动作

建议封装：

```ts
type AiSemanticNodeRegistration = {
  region?: string;
  rowKey?: string;
  rowIndex?: number;
  field?: string;
  action?: string;
  stableName?: string;
  preferredLocator?: AiSemanticLocator;
};

declare function useAiSemanticNode(registration: AiSemanticNodeRegistration): void;
declare function useAiSemanticList(regionId: string, items: AiSemanticItem[]): void;
```

#### Level 3：页面级语义导出

适合：

- 录制高频页面
- 条件分支高价值页面
- 同名动作和复杂业务结构页面

特点：

- 表达最完整
- 适合复杂调试与可观测
- 需要更严格的数据一致性控制

### 7.9 前端调试能力建议

为了让语义协议可落地，建议增加调试能力：

- `AiSemanticDebugOverlay`
  - 展示 `region / rowKey / rowIndex / action / field`
- `window.__AI_PAGE_SEMANTICS__` 查看入口
- 调试面板展示当前语义树与 snapshot 对照
- 支持点击页面元素时高亮对应语义节点

目标是让前端开发、录制用户和后端调试看到同一份页面语义。

### 7.10 录制工作台显式控件建议

如果录制页面并非面向最终业务用户，而是面向懂流程编排的录制人员，则不应把“循环对象、单轮动作、开始与结束边界”完全依赖自然语言表达。

建议在录制工作台中增加一组面向流程的显式控件，用来帮助用户把线性录制提升为结构化流程录制。

核心原则：

- 这些控件属于录制器工作台，而不是业务页面本身。
- 它们用于定义录制结构，不参与发布后业务页面运行。
- 它们的目标是减少“靠 prompt 猜循环”的不确定性。
- 它们应与当前页面 observation、candidate builder、templateSteps 导出直接对齐。

建议最小控件集合：

- `开始循环录制`
- `结束循环录制`
- `将当前列表设为循环对象`
- `保存当前筛选条件为循环范围`
- `将当前样例行设为单轮对象`
- `开始记录单轮动作`
- `结束记录单轮动作`
- `设置终止条件`
- `设置无进展处理`
- `预览循环结构`

推荐语义如下：

- `开始循环录制`
  - 在当前录制会话中打开一个循环块。
- `将当前列表设为循环对象`
  - 明确后续循环处理的数据集合来自哪个列表、表格或卡片区。
- `保存当前筛选条件为循环范围`
  - 把当前页面中已经生效的筛选状态保存为循环匹配范围，而不是只保存为临时页面状态。
- `将当前样例行设为单轮对象`
  - 告诉系统“后续每轮都按这一类记录处理”，便于从样例行提取行结构、主键与动作模板。
- `开始记录单轮动作` / `结束记录单轮动作`
  - 用于录制一轮标准动作，例如“进入详情 -> 承认 -> 返回列表 -> 等待刷新”。
- `设置终止条件`
  - 例如“不再存在状态为未承认的数据”或“待处理计数为 0”。
- `设置无进展处理`
  - 例如“页面无变化时接管”“连续 2 轮无进展时停止”。
- `预览循环结构`
  - 在录制阶段直接展示将要导出的显式循环结构，而不是等到发布时才发现语义错误。

### 7.10.1 推荐交互流程

建议把循环类流程的录制流程设计为：

1. 进入目标页面并完成必要筛选。
2. 点击 `开始循环录制`。
3. 点击 `将当前列表设为循环对象`。
4. 如有筛选条件，点击 `保存当前筛选条件为循环范围`。
5. 选择一条代表性记录，点击 `将当前样例行设为单轮对象`。
6. 点击 `开始记录单轮动作`，完成一轮实际操作。
7. 点击 `结束记录单轮动作`。
8. 通过 `设置终止条件` 明确何时结束。
9. 通过 `设置无进展处理` 明确异常策略。
10. 点击 `预览循环结构` 确认导出结果。
11. 点击 `结束循环录制` 完成循环块定义。

这个流程的关键在于：

- 用户先录一轮真实动作，而不是先写抽象逻辑。
- 系统再把该轮动作提升为“可重复执行的单轮模板”。
- 循环对象与终止条件由显式 UI 确认，而不是完全依赖语言理解。

### 7.10.2 不建议的设计

以下设计虽然实现成本低，但不建议作为主方案：

- 只提供一个“处理全部”按钮，不让用户定义循环对象。
- 只依赖自然语言说明“直到全部完成”，但没有显式停止条件。
- 通过复制 N 份相同步骤来模拟循环。
- 把循环边界隐藏在录制脚本注释或对话提示里。

这些做法的问题是：

- 可观测性差。
- 难以审计停止条件。
- 难以在发布后执行链中复现。
- 出现页面无变化时容易死循环。

---

## 8. 识别与执行链路设计

### 8.1 识别输入

AI 识别阶段输入分为三类：

- 基础页面观测
  - snapshot
  - page text
  - headings / links / buttons / inputs
- React 语义增强
  - 区域
  - 行
  - 字段
  - 动作
- 运行历史
  - 当前步骤目标
  - 之前已读取变量
  - 已执行动作结果

### 8.1.1 基于当前代码的输入增强建议

在不改变整体链路的前提下，建议优先增强 `evaluate(buildStructureProbeScript)` 的输出，而不是立即引入复杂新模块。

建议优先补充两类结构：

#### 行结构

目标：

- 让系统知道某个按钮属于哪一行
- 让系统知道某个数值属于哪一行文本上下文

建议探测：

- `tr`
- `[role="row"]`
- 卡片式列表项容器

建议输出：

- `rowIndex`
- `rowText`
- `rowButtons`
- `rowLinks`
- `rowFields`

#### 区域结构

目标：

- 让系统知道当前页面有哪些主区域
- 为后续 React 语义和 Candidate Builder 做对齐

建议探测：

- `[data-ai-region]`
- `section`
- `main`
- `dialog`
- `form`

建议输出：

- `regionId`
- `regionLabel`
- `regionType`
- `regionFields`
- `regionActions`

### 8.2 候选对象标准化

建议在后端统一生成候选对象：

```ts
type ActionCandidate = {
  candidateId: string;
  source: 'snapshot' | 'react_semantics' | 'vision';
  kind: 'action' | 'field' | 'row' | 'region';
  label?: string;
  ref?: string;
  role?: string;
  rowKey?: string;
  rowIndex?: number;
  entityType?: string;
  entityId?: string;
  semanticPath?: string[];
  preferredLocator?: {
    type: 'ref' | 'role' | 'css' | 'text';
    value: string;
  };
};
```

目标是让模型不再直接面对原始元素集合，而是面对更高质量的候选。

### 8.2.1 Candidate Builder 处理流程

建议 Candidate Builder 分为五步：

```text
Step 1. 收集原始输入
  - snapshot nodes
  - evaluate structure
  - page text
  - react semantics

Step 2. 归一化元素
  - 统一 label / role / ref / visible / disabled
  - 清洗空文本、隐藏元素、重复节点

Step 3. 结构聚合
  - 把元素聚合为 region / row / field / action
  - 构建 semanticPath

Step 4. 生成候选
  - 输出 action candidates
  - 输出 field candidates
  - 输出 row candidates

Step 5. 候选排序前预处理
  - 计算唯一性
  - 计算歧义分数
  - 生成 preferredLocator
```

在当前项目中，Candidate Builder 不必一开始就成为复杂独立服务，可以先作为 `recorder-debug` 链路中的一个纯函数型处理模块落地，再逐步抽离成独立 service。

### 8.2.2 Candidate Builder DTO 草案

建议在后端内部引入统一 DTO：

```ts
type CandidateSource = 'snapshot' | 'react_semantics' | 'vision';
type CandidateKind = 'region' | 'row' | 'field' | 'action';

type CandidateUniqueness = 'unique' | 'ambiguous' | 'unknown';

type CandidateContext = {
  regionId?: string;
  regionType?: string;
  rowKey?: string;
  rowIndex?: number;
  entityType?: string;
  entityId?: string;
  semanticPath?: string[];
};

type CandidateSignals = {
  labelMatchScore?: number;
  roleMatchScore?: number;
  structuralScore?: number;
  semanticScore?: number;
  recencyScore?: number;
  ambiguityPenalty?: number;
};

type BrowserActionCandidate = {
  candidateId: string;
  source: CandidateSource;
  kind: CandidateKind;
  label?: string;
  description?: string;
  ref?: string;
  role?: string;
  preferredLocator?: {
    type: 'ref' | 'role' | 'css' | 'text';
    value: string;
  };
  uniqueness: CandidateUniqueness;
  context: CandidateContext;
  signals?: CandidateSignals;
};
```

### 8.2.3 去重与合并规则

同一个候选可能同时来自：

- snapshot
- React 语义
- vision fallback

建议合并规则如下：

1. 如果 `ref` 相同，则视为同一节点。
2. 如果 `rowKey + action.id` 相同，则优先合并为同一业务动作。
3. 如果 `label` 相同但上下文不同，则不能合并。
4. 如果 React 语义和 snapshot 冲突，优先保留 snapshot 可执行引用，同时保留 React 业务上下文。

### 8.3 定位优先级

生成动作时，建议遵循以下优先级：

1. `snapshot ref`
2. `react semantic preferredLocator`
3. `role + stable name`
4. `css`
5. `text`
6. `vision fallback result`

原则：

- 一旦有唯一 `ref`，不得再退化成模糊文本。
- 文本定位只能作为低优先级 fallback。

### 8.3.1 排序信号建议

为避免模型完全自由决定候选，建议在送给 AI 之前先做一次规则排序。

推荐排序信号：

- 文案匹配
  - 是否命中用户目标词
  - 是否命中动作词
- 结构匹配
  - 是否位于目标 region
  - 是否位于目标 row
- 业务匹配
  - entityType 是否符合
  - 字段是否与条件目标一致
- 执行稳定性
  - 是否有唯一 ref
  - preferredLocator 是否稳定
- 歧义惩罚
  - 同名元素数量
  - 缺少 row 上下文

### 8.3.2 排序结果输出建议

建议输出给 AI 的不是全量元素，而是压缩后的 Top N 候选：

```ts
type RankedCandidateSummary = {
  candidateId: string;
  label?: string;
  description?: string;
  uniqueness: 'unique' | 'ambiguous' | 'unknown';
  context?: {
    regionId?: string;
    rowIndex?: number;
    rowKey?: string;
    entityType?: string;
  };
  preferredLocator?: {
    type: 'ref' | 'role' | 'css' | 'text';
    value: string;
  };
};
```

这样可以降低 token、提高一致性，也更方便问题追踪。

### 8.3.3 Prompt 输入重构建议

在进入 AI 解析前，建议把 prompt 输入从“原始 observation 文本”调整为“候选摘要 + 页面摘要”的组合。

推荐结构：

```text
当前页面:
- url
- title
- page summary

候选动作:
- candidateId
- label
- row context
- preferredLocator
- uniqueness

要求:
- 优先选择唯一候选
- 优先输出 ref 或 preferredLocator
- 如果所有候选均歧义，则返回问题而不是自由生成模糊文本点击
```

这样做的目标不是完全替代模型推理，而是把模型从“自由生成 locator”收敛为“在可控候选中做选择”。

### 8.4 动作后验证

对于关键动作，建议自动附加验证规则：

- URL / hash 是否变化
- 标题是否变化
- 是否出现预期字段
- 是否进入预期区域
- 是否出现成功/失败状态文案

动作后验证失败时：

- 先重观测
- 再尝试候选重排
- 仍失败则进入接管或问题提问

### 8.4.1 列表循环与批量处理

对于“逐条处理直到列表清空”这类目标，建议把它定义为显式能力，而不是多次单步点击的偶然组合。

典型场景：

- 逐条承认所有未承认案件
- 逐条处理所有状态为 `pending` 的审批单
- 逐条打开列表中满足某条件的记录并执行同一动作

建议把这类任务拆成三个问题：

1. 当前页面上“待处理项集合”如何识别。
2. 单条记录的“进入详情 / 执行动作 / 返回列表”如何稳定表达。
3. “什么时候停止下一轮处理”如何显式判断。

识别层需要补充的通用能力：

- 能识别列表区域、行级状态字段、主键、行级动作。
- 能输出“剩余待处理项”的候选摘要，而不仅是单条按钮候选。
- 能为终止条件提供可读取的字段或计数信号，例如：
  - 待处理行数
  - 状态字段是否仍存在 `pending`
  - 空列表提示文案
  - 成功处理后列表是否减少

建议的通用表达方式有两层：

#### A. 录制与导出层

在录制阶段，AI 不应直接生成“点击十次承认按钮”。

应优先导出为：

- 循环目标
  - 目标集合：当前列表中所有满足条件的项
  - 条件示例：`status == pending`
- 单轮动作模板
  - 进入目标项
  - 执行详情页动作
  - 验证结果
  - 返回列表或等待列表刷新
- 终止条件
  - 不再存在满足条件的项
  - 或待处理计数为 `0`

#### B. 执行层

执行层不应依赖 LLM 在运行时“记住还有几条没做完”，而应有显式循环语义。

推荐两种实现路径：

1. 近端方案：
   - 保持浏览器模板步骤仍是单轮能力。
   - 在更上层执行编排中增加 `repeat_until` 包装节点。
   - 每轮执行后重新 observation / read_value，判断是否继续。
2. 目标方案：
   - 在标准浏览器模板 DSL 中加入显式循环节点，例如 `repeat_until`、`foreach_match` 或等价结构。
   - 循环节点内部仍只组合标准动作、读取和分支。

无论采用哪种路径，都必须满足：

- 循环终止条件显式可审计。
- 每轮处理结果可回放、可追踪。
- 支持最大轮次限制，避免死循环。
- 当列表状态异常、未变化或存在歧义时，进入接管而不是无限重试。

建议最小循环配置草案如下：

```ts
type RepeatUntilConfig = {
  mode: 'repeat_until';
  maxIterations: number;
  stopWhen: {
    read:
      | { type: 'count'; locator: Locator }
      | { type: 'text'; locator: Locator }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  eachIteration: TemplateStep[];
  onNoProgress?: 'takeover' | 'stop';
};
```

这里的关键点是：

- 循环节点本身不关心具体业务词汇，例如“承认”“审批”“归档”。
- 业务差异只体现在单轮动作模板和停止条件上。
- 这样才能支持“逐条承认”“逐条下载”“逐条归档”等同类页面任务。

### 8.4.2 录制工作台控件到 DSL 的映射

为了避免录制工作台中的循环控件只停留在 UI 层，建议从一开始就定义其与显式 DSL/编排结构的映射关系。

推荐映射如下：

- `开始循环录制`
  - 创建一个新的循环块草稿。
- `将当前列表设为循环对象`
  - 生成 `target.scope`，并记录目标区域、列表 locator 或 regionId。
- `保存当前筛选条件为循环范围`
  - 生成 `target.match` 或 `target.filters`。
- `将当前样例行设为单轮对象`
  - 生成 `sampleRow`、`rowKey`、`entityType`、`semanticPath` 等上下文。
- `开始记录单轮动作`
  - 开始采集 `eachIteration`。
- `结束记录单轮动作`
  - 完成 `eachIteration` 模板归纳。
- `设置终止条件`
  - 生成 `stopWhen`。
- `设置无进展处理`
  - 生成 `onNoProgress`、`maxIterations` 或 `takeoverPolicy`。
- `预览循环结构`
  - 实时展示导出结果。

示例结构：

```ts
type RecorderLoopDraft = {
  mode: 'repeat_until';
  target: {
    scope: 'current_list' | 'current_table' | 'current_cards';
    regionId?: string;
    locator?: Locator;
    match?: {
      field?: string;
      operator?: 'equals' | 'contains' | 'lt' | 'gt';
      value?: string | number | boolean;
    };
  };
  sampleRow?: {
    rowKey?: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
  };
  eachIteration: TemplateStep[];
  stopWhen?: {
    read:
      | { type: 'count'; locator: Locator }
      | { type: 'text'; locator: Locator }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
};
```

这样做的价值在于：

- 录制工作台的每一个按钮都能回落为稳定结构。
- 导出层可以直接从循环块草稿生成 DSL 或上层执行编排。
- 后续即使 UI 改版，核心数据结构仍能保持稳定。

### 8.4.3 终止条件配置建议

在录制工作台中，`设置终止条件` 不应只允许自由文本输入，建议提供半结构化选项：

- `无匹配数据时结束`
- `待处理计数为 0 时结束`
- `目标状态文案消失时结束`
- `列表为空时结束`
- `达到最大轮次时停止`
- `页面连续无变化时接管`

推荐默认策略：

- 默认启用 `maxIterations`。
- 默认启用“连续无进展时接管”。
- 默认要求用户确认一个显式结束条件。

### 8.4.4 第一版最小实现建议

为了避免一开始把录制工作台做成过重产品，建议第一版只实现以下最小能力：

1. `开始循环录制`
2. `将当前列表设为循环对象`
3. `开始记录单轮动作`
4. `结束记录单轮动作`
5. `设置终止条件`
6. `结束循环录制`
7. `预览循环结构`

第一版暂不强求：

- 可视化拖拽编排
- 多层嵌套循环
- 循环内再嵌套复杂条件块
- 通用图形化流程编辑器

先把“单层循环 + 单轮动作 + 显式终止条件”做稳，收益已经足够高。

### 8.5 视觉 fallback 触发条件

只有在以下场景启用视觉 fallback：

- snapshot 无法识别关键元素
- 页面元素为 icon-only
- canvas / 自绘 UI
- React 语义缺失且结构探针不可靠
- 多次 strict mode 消歧失败

视觉能力返回的仍然应是结构化候选，而不是直接坐标执行。

### 8.5.1 当前项目中的视觉接入边界

结合现有代码，视觉能力的接入应遵循以下边界：

- 只在 `observePage()` 的增强分支中触发，不替代原始观测链。
- 只补充候选，不直接产出最终点击动作。
- 只在以下情形考虑启用：
  - snapshot 候选为空
  - 多次 strict mode 歧义失败
  - icon-only 或 canvas 场景
  - 用户显式要求截图分析

换句话说，视觉能力在当前项目中更适合作为：

- `observePageWithVisionFallback()`

而不是新的默认主链。

### 8.6 Trace 与可观测设计

建议为每一步识别结果保留 trace，至少包括：

```ts
type BrowserRecognitionTrace = {
  sessionId: string;
  stepId?: string;
  userIntent: string;
  sourcesUsed: Array<'snapshot' | 'react_semantics' | 'vision'>;
  candidateCount: number;
  topCandidates: RankedCandidateSummary[];
  selectedCandidateId?: string;
  selectedReason?: string;
  fallbackTriggered?: boolean;
  validationResult?: 'passed' | 'failed' | 'skipped';
};
```

trace 主要用于：

- 解释为什么选中了某个动作
- 解释为什么触发 fallback
- 解释为什么最后进入人工接管
- 形成后续优化训练数据

---

## 9. 与后续自动执行的兼容性

### 9.1 兼容性结论

该方案会影响后续自动执行，但应当是正向影响，前提是严格遵守以下边界：

- React 语义只参与识别和录制增强。
- 发布前统一收敛到标准 `templateSteps`。
- 发布后运行时仍以标准 DSL 和稳定 locator 执行为主。

### 9.2 不推荐的做法

以下做法会让后续自动执行变脆弱：

- 运行时强依赖 `window.__AI_PAGE_SEMANTICS__`
- 已发布 Skill 只能在 React 页面上运行
- 模板步骤只记录业务语义，不记录稳定 locator
- 运行时每一步都重新依赖前端组件内部结构

### 9.3 推荐的兼容边界

推荐边界如下：

```text
识别增强层
  可使用 React 语义
  可使用 snapshot
  可使用 vision fallback

模板导出层
  必须收敛为标准 templateSteps
  循环场景需要收敛为显式循环 DSL 或上层执行编排节点

测试与发布后执行层
  只依赖 templateSteps、显式循环编排能力与通用运行时能力
```

补充约束：

- 不允许把“继续处理下一条”隐藏在自然语言描述里而不形成显式结构。
- 不允许通过复制 N 份相同步骤来伪造循环能力。
- 如果当前运行时暂不支持原生循环节点，则应由上层执行编排显式包裹，而不是把循环责任推给录制 prompt。

### 9.4 对现有链路的影响

#### 录制阶段

正向影响：

- 减少歧义点击
- 提高分支条件生成准确率
- 提高后续步骤补全质量

#### 测试阶段

正向影响：

- 模板测试更稳定
- 更容易重现录制时的业务语义

#### 发布阶段

中性偏正向：

- 只要发布产物仍是标准 DSL 或显式循环编排结构，不会引入额外运行时依赖

#### 已发布 Skill 运行时

应尽量保持中性：

- 不要求运行时重新读取 React 语义
- 仍走统一 runtime plan 和模板执行 DSL

---

## 10. 分阶段落地计划

### Phase 1：修复当前识别稳定性

目标：

- 修复 snapshot 已命中唯一节点却退化成模糊文本的问题
- 强化候选引用保留
- 提升同名元素消歧稳定性

产出：

- `ref` 优先执行
- 候选 trace
- 消歧提示优化

### Phase 2：建设候选对象层

目标：

- 把当前扁平元素集合升级为结构化候选
- 引入列表、行、区域、动作归属关系

产出：

- candidate builder
- ranking context
- 更稳定的动作生成

### Phase 3：接入 React 语义增强

目标：

- 在录制价值高的页面先接入 `data-ai-*` 或语义树导出
- 只在录制 / 调试模式下启用

产出：

- 最小前端协议
- 调试 overlay
- 后端语义消费接口

### Phase 4：接入视觉 fallback

目标：

- 在特殊页面和复杂组件场景中补足 screenshot grounding 能力

产出：

- fallback 触发条件
- 视觉候选转换层
- 结构化候选兼容接口

### Phase 5：全链路验证

目标：

- 验证录制、模板测试、发布、Skill 调用链路在增强后保持一致

产出：

- 回归用例
- 复杂列表页面验证
- 条件分支页面验证
- 循环批处理页面验证

### 10.1 实施任务拆单

建议按前后端和运行时拆成以下任务包。

#### Task Group A：识别稳定性修复

- 修复 snapshot 命中唯一节点后退化成模糊 role/text 的问题。
- 为点击、填写、读取动作保留原始 `ref`。
- 增加 strict mode 错误归因分类。

#### Task Group B：候选对象层

- 新增 candidate builder。
- 新增候选合并和去重规则。
- 新增排序前预处理和歧义分数。

#### Task Group C：前端语义协议

- 定义 `data-ai-*` 最小集合。
- 定义页面级语义树协议。
- 实现 `AiSemanticProvider` 与调试 overlay 原型。

#### Task Group D：AI 决策输入优化

- 调整 parse/plan prompt 输入结构。
- 让 AI 接收候选摘要，而不是原始元素列表。
- 明确输出必须带 `candidateId` 或唯一 locator。

#### Task Group E：模板导出增强

- 导出时优先使用 `ref` 或稳定 locator。
- 把业务上下文映射为模板描述与字段说明。
- 降低模糊 text locator 的产出比例。
- 为循环场景定义显式导出结构，而不是导出重复的线性点击步骤。

#### Task Group F：验证与观测

- 增加 recognition trace。
- 增加复杂列表页回归测试。
- 增加条件模板页录制与发布后一致性验证。
- 增加“逐条处理直到无剩余项”的循环场景回归与死循环保护验证。

### 10.2 推荐实施顺序

建议执行顺序如下：

1. 修复 `ref` 丢失与 strict mode 退化问题。
2. 建立 candidate builder 与排序上下文。
3. 在受控样本页面接入最小 `data-ai-*` 试点，用于验证协议与回归。
4. 打通录制导出与 trace。
5. 为循环批处理场景定义显式编排表达。
6. 再评估是否需要视觉 fallback。

### 10.2.1 P0 立即可做项

建议把第一批工作继续收缩成三个几乎无架构风险的动作：

1. 保留并优先使用 `ref`
   - 在 observation 描述与 AI 输入中保留稳定引用
   - prompt 中明确优先输出 `ref`
2. 升级结构探针
   - 增加行结构、区域结构和基础 `data-ai-*` 探测
   - 不改变现有录制 API 形态
3. 定义并验证最小语义协议
   - 先在通用 observation / candidate builder / trace 链路中接入可选语义输入
   - 再用受控样本页面或真实业务页面验证列表行、字段、动作语义
   - 不把样本页面当作能力承载前提

这三项完成后，就已经能显著降低“同名动作误点”、strict mode 失败率，并为更通用的 candidate builder 奠定输入基础。

但需要额外说明：

- 循环批处理不是 P0 录制探针问题，而是 P1 的模板导出与执行编排能力问题。
- P0 阶段先把“单轮识别稳定”和“终止条件可读”做好，后续才能安全接入循环。

### 10.3 页面试点选择建议

建议优先试点以下页面：

- 同名按钮较多的列表页
- 条件分支依赖字段读取的详情页
- 容易出现“第一条记录/当前行/最近一条”语义的表格页

优先级原则：

- 优先选择真实业务页面或受控业务页面中的高价值页面做验证。
- 受控样本页面可用于补回归，但不应成为核心能力设计的前提。

不建议第一批试点：

- 纯静态详情页
- 已经有稳定唯一 locator 的简单表单页
- 非本项目控制的第三方页面

### 10.3.1 受控样本页面的定位

`tests/mock-erp` 以及后续其他受控样本页面，应明确定位为“协议验证与回归样本”，而不是方案本身的边界，更不是核心能力的承载面。

定位原则如下：

- 核心能力必须先落在通用协议、通用探针、通用 candidate builder、通用 trace 与通用导出链上。
- 只有可以抽象为通用字段、通用结构、通用定位规则的能力，才能进入主链。
- 样本页中的业务词汇、字段名、流程分支，只能用于验证，不应直接固化进核心抽象。
- 任何围绕单一样本页定制的识别逻辑，都不能作为主链能力完成的标志。

选择受控样本页作为验证载体的原因如下：

- 已有列表页、详情页、接管提示等典型业务结构
- 已有 `data-testid` 等测试属性，便于低成本补充 `data-ai-*`
- 可同时覆盖：
  - 同名按钮消歧
  - 行级字段读取
  - 条件分支判断
  - 接管语义
  - 视觉 fallback 预演

建议首个验证目标：

- “找到毛利率低于 20% 的案件并触发接管”

这是一个同时覆盖：

- 列表理解
- 字段读取
- 行级动作
- 条件分支
- 接管链路

的高价值验证场景。

但需要强调：

- 该方案的目标不是“把 mock-erp 识别好”。
- 该方案的目标是形成一套对不同页面结构都成立的统一候选构建与动作解析机制。
- `mock-erp` 只负责帮助快速验证：
  - 协议是否合理
  - 识别链是否稳定
  - 回归是否可重复
- 如果某项能力只能在 `mock-erp` 上成立，而无法迁移到其他页面结构，则该能力视为未完成。

### 10.4 关键指标建议

实施后建议持续统计：

- 模糊 text locator 占比
- strict mode 失败率
- 录制动作一次成功率
- 模板测试通过率
- 发布后 browser_recording runtime 成功率
- 进入人工接管的比例
- 循环任务平均迭代次数
- 循环任务因无进展触发接管的比例

### 10.5 里程碑定义

建议设置三个里程碑：

- `M1`
  - 完成 `ref` 优先与候选 trace
  - strict mode 明显下降
- `M2`
  - 完成 candidate builder 与最小语义协议消费链
  - 至少在一个真实业务页面或受控验证页面完成验证，但核心实现不依赖该页面结构
  - 复杂列表页面、普通详情页、区域型页面的录制稳定性提升
- `M3`
  - 完成模板测试、发布后 Skill、一致性验证
  - 完成循环批处理场景的显式编排与验证
  - 再决定是否接入视觉 fallback

### 10.6 非目标重申

本次细化后仍不包含以下内容：

- 不把运行时执行改造成 React 专属协议。
- 不在第一阶段引入大型视觉推理基础设施。
- 不把所有页面统一改造成强语义页面。
- 不为了识别增强而重写现有模板 DSL。

---

## 11. 风险与边界

### 11.1 React 语义注入过多导致前端侵入性过强

缓解方案：

- 只在高价值页面试点
- 优先使用轻量 `data-ai-*`
- 统一封装 hook / provider，避免业务代码散落

### 11.2 语义与真实 DOM 脱节

缓解方案：

- 语义导出必须附带可落地 locator 或 ref
- 动作执行前仍需与 snapshot 做一致性校验

### 11.3 录制环境和发布环境不一致

缓解方案：

- React 语义只参与录制与识别
- 发布产物只保留标准模板 DSL
- 发布后执行不依赖语义注入

### 11.4 视觉 fallback 成本过高

缓解方案：

- 严格限制触发条件
- 默认关闭
- 仅作为歧义页面或复杂组件场景兜底

### 11.5 页面结构升级后语义协议失效

缓解方案：

- 对语义协议做最小字段约束
- 使用版本化协议
- 对高价值页面增加语义回归检查

### 11.6 方案被受控样本页牵引，演化成页面定制修补

缓解方案：

- 核心任务先以“通用输入、通用候选、通用 trace、通用导出”为交付单位。
- 样本页相关工作只放在验证层，不放在能力定义层。
- 评审时必须同时检查“在非样本结构下是否仍可退化工作”。
- 若新增逻辑引用了样本页特有业务字段或流程语义，需先证明其可抽象为通用能力。

---

## 12. 验收标准

### 12.1 识别能力

- 面对同名按钮列表，AI 能区分“第一条记录的详情”和“任意详情按钮”。
- 面对不同页面结构，AI 能把动作归一化为“候选选择”问题，而不是持续回退为自由文本点击。
- 面对字段读取场景，AI 能更稳定识别目标字段、所属区域和可能的业务对象，而不是只读整页文本。
- 面对列表页，AI 能正确识别行级字段与行级动作关系。
- 条件分支生成时，AI 能更稳定读取目标字段，而不是读整个页面文本。

### 12.2 模板稳定性

- 导出的模板步骤优先使用稳定 locator 或 `ref`。
- 导出结果中模糊 `text` 定位占比显著下降。
- 条件模板在测试链和发布后 Skill 运行时表现一致。
- 循环类任务使用显式循环结构或显式执行编排，而不是重复展开的线性点击步骤。

### 12.3 自动执行兼容性

- 不启用 React 语义的页面，原有执行链仍可正常运行。
- 已发布 Skill 不因 React 语义缺失而执行失败。
- 发布后 runtime 仍只消费标准 `templateSteps` 与通用 DSL。
- 循环批处理任务在发布后可稳定停止，不因页面无变化而进入无限执行。

### 12.4 可观测性

- 能在会话日志中看到候选构建、排序、最终动作选择理由。
- 能在失败时区分：
  - 候选歧义
  - locator 不稳定
  - 页面状态未变化
  - 需要人工接管
- 能看到循环任务的当前轮次、停止原因、最近一次页面进展信号。

### 12.5 工程验收

- 文档中定义的最小 `data-ai-*` / 页面语义协议，已在核心探测或候选链路中被通用消费。
- 至少一个真实业务页面、受控业务页面或受控样本页面用于协议验证与回归。
- 候选对象层已有可运行 DTO 和 trace 输出。
- 录制导出产物中，关键步骤优先保留 `ref` 或稳定 locator。
- 发布后 Skill 执行链不依赖 React 语义运行时注入。
- 新能力在非 `mock-erp` 结构下也能退化工作，不以样本页面结构为前提。
- 循环类任务已具备显式停止条件、最大轮次限制与无进展保护。

### 12.6 阶段性验收建议

为了避免大而全改造，建议按阶段验收：

#### Phase 1 验收

- `ref` 优先链路已打通。
- 结构探针已输出行级或区域级上下文。
- 同名按钮页面的 strict mode 失败率下降。

#### Phase 2 验收

- Candidate Builder 已产出结构化候选。
- AI 输入已从原始扁平元素迁移到候选摘要。
- 最小语义协议已被主链消费，且至少一个验证页面已用于回归。
- 非样本结构下也可退化工作，不以验证页面结构为前提。

#### Phase 3 验收

- 视觉 fallback 可在特定条件下触发。
- 视觉结果仅补充候选，不破坏主链。
- 发布后 Skill 执行行为与录制导出 DSL 保持一致。
- 至少一个“逐条处理直到无剩余项”的场景可通过显式编排完成验证。

---

## 附录：一句话设计结论

本方案的核心不是“让运行时依赖 React”，而是“让 React 页面在录制和识别阶段主动提供更强语义，再把结果收敛成通用模板 DSL”，从而在不破坏后续自动执行统一性的前提下，显著提高页面理解、录制稳定性与条件模板生成质量。
