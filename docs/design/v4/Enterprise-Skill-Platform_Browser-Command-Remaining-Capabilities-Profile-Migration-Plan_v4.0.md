# 企业级技能平台 浏览器其余能力 Profile 化迁移设计书

**Browser Command Remaining Capabilities Profile Migration Plan v4.0**  
日期：2026-06-21

> 本文承接 `LOGIN` 与 `NAVIGATION` 已落地方案，定义如何把其余浏览器能力从“散落在 `BrowserCommandService` 中的硬编码解析/候选匹配/AI 提示词约束”演进为“可治理、可发布、可回流的受控 profile”体系。  
> 目标不是把整个浏览器命令解析器改造成任意 DSL 引擎，而是在保持确定性执行边界的前提下，逐步把可治理部分下沉为结构化 profile，把编排、定位、安全约束继续保留在代码中。

---

## 1. 文档目标

本文回答以下问题：

- `LOGIN / NAVIGATION` 之外，哪些能力适合继续做成受控 profile
- 当前这些能力分别分布在哪些解析链路中
- 为什么不能直接把剩余能力一次性改成任意规则解释器
- 每类能力应该采用什么 profile 结构
- 运行时如何沿用现有 `browser-semantics` 发布/灰度/回退体系
- 日志、错误样本、AI 草案生成与管理页治理如何统一扩展
- 应该按什么顺序迁移，避免一次性大改引发解析回归

---

## 2. 范围与结论

### 2.1 本次纳入迁移视野的能力

在现有规则分类中，除 `LOGIN` 与 `NAVIGATION` 外，其余重点类别为：

- `READ_VALUE`
- `DETAIL_OPEN`
- `ROW_ACTION`
- `MENU_SELECTION`
- `SEARCH`
- `FIELD_FILL`

### 2.2 推荐迁移优先级

按照当前仓库真实实现与确定性边界，推荐分三批迁移：

1. 第一批：`READ_VALUE`
2. 第二批：`DETAIL_OPEN / ROW_ACTION / MENU_SELECTION`
3. 第三批：`SEARCH / FIELD_FILL`

原因：

- `READ_VALUE` 已经存在较稳定的 `candidate-read` 链路，最容易抽象为受控 `Read Profile`
- `DETAIL_OPEN / ROW_ACTION / MENU_SELECTION` 本质上都在走候选动作解析，适合合并为 `Action Profile` 体系
- `SEARCH / FIELD_FILL` 当前仍与上下文、页面结构、planner prompt 强相关，适合在前两批稳定后再迁移

### 2.3 推荐总方案

继续沿用 `LOGIN / NAVIGATION` 的方法论：

- `SemanticRule` 负责治理、发布、灰度、回退
- `Ability Profile` 负责运行时消费
- `BrowserCommandService` 负责主链接线与日志回流
- 能力专属 service 负责确定性解析
- profile 未命中或页面上下文不足时，再进入 AI fallback

---

## 3. 当前实现现状

### 3.1 `READ_VALUE`

当前主要集中在 `BrowserCommandService.parseCandidateReadIntent()`：

- 通过 `读取/获取/查看/提取/read/get` 识别读取意图
- 依赖 `availableCandidates` 中的 `field / region` 候选
- 使用硬编码归一化与打分逻辑匹配目标
- 命中后输出 `get_text`

当前问题：

- 读取目标词项仍是代码内隐式规则，不能通过 runtime rule 动态补强
- 错误样本虽然能回流，但无法直接沉淀为结构化读取画像
- 管理页只能看到 `READ_VALUE` 类规则，不能直接影响 `candidate-read`

### 3.2 `DETAIL_OPEN / ROW_ACTION / MENU_SELECTION`

当前主要集中在 `BrowserCommandService.parseCandidateScopedAction()` 与 action resolver：

- 通过 `点击/选择/打开/进入` 识别动作意图
- 解析 `第一条/第二条/区域中` 等行级与区域级约束
- 将目标词映射到 `PendingClickIntent`
- 再由候选解析器解析为 `click`

当前问题：

- `详情 / 承认 / 拒绝 / 通过 / 打开菜单项` 等语义映射仍混在归一化与打分逻辑里
- 无法用 runtime rule 给某个站点补充“动作语义别名”
- `DETAIL_OPEN / ROW_ACTION / MENU_SELECTION` 三类规则在治理面存在，但运行时没有专属 profile 接口

### 3.3 `SEARCH`

当前主要分散在：

- planner prompt 中的搜索规则约束
- `pattern-parser / sequential-pattern`
- AI planner 对 `search / smart_search / list_search_results / click_result` 的选择

当前问题：

- 搜索入口词、智搜词、结果点击词主要还是 prompt 常识与少量硬编码
- runtime rule 只能做输入改写，无法形成“站点级搜索画像”
- 搜索命中/失败样本还没有类似 `LOGIN/NAVIGATION` 的结构化原因分层

### 3.4 `FIELD_FILL`

当前主要依赖：

- planner prompt 对 `fill` 的通用指引
- 局部上下文与候选输入框信息
- AI plan / AI parser 的泛化能力

当前问题：

- 字段语义别名无法通过 profile 治理
- 跨站点的字段词项只能继续写在 prompt 或输入改写里
- 错误样本难以直接生成结构化“字段填写画像”

---

## 4. 设计原则

### 4.1 受控动态化

允许动态治理的只能是：

- 目标词项
- 意图词项
- 字段/动作/结果语义别名
- 区域/语言提示
- 中断策略与 AI fallback 触发条件

不允许：

- 任意 JavaScript
- 任意命令模板执行
- 任意复杂 regex 解释器直接驱动工具调用

### 4.2 默认可用

每个能力都必须存在默认内置 profile：

- 没有 runtime 规则时仍然可用
- runtime profile 只做增强，不做唯一依赖

### 4.3 发布即生效

所有新增 profile 均复用 `browser-semantics` 现有：

- `DRAFT`
- `CANARY`
- `ACTIVE`
- `ROLLBACK`

### 4.4 失败可回流

每个能力迁移后都必须具备：

- 结构化 `parserMetadata.<ability>`
- 命中日志与失败日志可观测
- 样本可按类别过滤
- AI 可基于样本生成候选 profile 草案

### 4.5 分阶段切换

遵守以下顺序：

1. 先抽离专属 service
2. 再定义 outputs 契约
3. 再接 runtime profile
4. 再补日志/治理/生成
5. 最后删除旧硬编码分支

---

## 5. 目标态能力模型

### 5.1 `READ_VALUE` -> `Read Profile`

推荐 `profile_type = "read_target"`。

目标：

- 让读取目标词、字段语义、区域提示可治理
- 保持最终 selector 解析仍由候选上下文决定

推荐结构：

```ts
type ReadProfile = {
  intentTerms: string[];
  entries: Array<{
    ruleId?: string;
    targetTerms: string[];
    fieldTerms?: string[];
    regionTerms?: string[];
    localeHints?: string[];
  }>;
};
```

说明：

- `targetTerms` 表示用户可能说出的读取目标
- `fieldTerms` 表示候选里的 `field` 语义名
- `regionTerms` 用于帮助缩小区域匹配
- 最终仍通过现有候选系统产出 `get_text`

### 5.2 `DETAIL_OPEN / ROW_ACTION / MENU_SELECTION` -> `Action Profile`

推荐统一为 `profile_type = "action_target"`。

目标：

- 把“详情 / 承认 / 拒绝 / 更多 / 编辑 / 删除 / 菜单项”这类动作语义从硬编码词项中抽离
- 保持最终 click locator 解析仍由 action resolver 决定

推荐结构：

```ts
type ActionProfile = {
  intentTerms: string[];
  entries: Array<{
    ruleId?: string;
    targetTerms: string[];
    semanticHint: string;
    actionTerms?: string[];
    regionTerms?: string[];
    roleHints?: string[];
    categoryHint?: 'DETAIL_OPEN' | 'ROW_ACTION' | 'MENU_SELECTION';
    localeHints?: string[];
  }>;
};
```

说明：

- `semanticHint` 是受控枚举，例如 `detail / approve / reject / open / menu / edit / delete`
- `categoryHint` 用于治理面展示，不直接决定执行
- `row` 与 `region` 仍由上下文解析和候选解析器负责

### 5.3 `SEARCH` -> `Search Profile`

推荐 `profile_type = "search_intent"`。

目标：

- 让“普通搜索 / 智搜 / 列结果 / 点结果”的触发词与偏好策略可治理

推荐结构：

```ts
type SearchProfile = {
  searchTerms: string[];
  smartSearchTerms: string[];
  listResultTerms: string[];
  clickResultTerms: string[];
  localeHints?: string[];
};
```

说明：

- 该 profile 更偏向“意图判别”和“工具选择”
- 真正的 query 抽取与结果索引仍留在代码与 planner 中

### 5.4 `FIELD_FILL` -> `Field Fill Profile`

推荐 `profile_type = "field_fill_terms"`。

目标：

- 让字段别名、输入意图词、值槽位提示可治理

推荐结构：

```ts
type FieldFillProfile = {
  intentTerms: string[];
  entries: Array<{
    ruleId?: string;
    fieldTerms: string[];
    canonicalField?: string;
    regionTerms?: string[];
    valueHints?: string[];
    localeHints?: string[];
  }>;
};
```

说明：

- 首期不尝试做任意多字段 DSL
- 仅增强字段语义识别，最终 `fill` 顺序和页面定位仍由代码/候选决定

---

## 6. 运行时接线

目标态主链应逐步演进为：

```text
用户输入
  -> browser-semantics runtime resolve
  -> applySemanticRulesToInput()
  -> BrowserCommandLoginService
  -> BrowserCommandNavigationService
  -> BrowserCommandReadService
  -> BrowserCommandActionService
  -> BrowserCommandSearchService
  -> BrowserCommandFieldFillService
  -> candidate/context/pattern parser 兜底
  -> AI planner / AI parser fallback
```

接线原则：

- profile service 应尽量前置在旧硬编码分支之前
- 命中 profile 时写入 `parserMetadata.<ability>`
- 没命中时保留旧 parser，避免一次切流
- 当新 service 稳定后，再删除旧分支

---

## 7. 日志与治理闭环

### 7.1 统一 parser metadata

除现有：

- `parserMetadata.login`
- `parserMetadata.navigation`

后续扩展为：

- `parserMetadata.read`
- `parserMetadata.action`
- `parserMetadata.search`
- `parserMetadata.fieldFill`

每个节点至少包含：

```ts
{
  status: string;
  reason: string;
  usedRuntimeProfile: boolean;
  matchedRuntimeRuleIds: string[];
}
```

### 7.2 统一命中日志字段

在 `normalized_semantic` 中保留：

- `parser_source`
- `parser_metadata`
- `effective_profile_versions`

并兼容已有：

- `effective_login_profile_version`
- `effective_navigation_profile_version`

后续新增能力可从 `effective_profile_versions` 中统一取值。

### 7.3 管理页治理

管理页需要继续扩展到：

- 识别新 profile 类型
- 展示 profile 摘要
- 支持命中/错误样本的状态与原因分布
- 支持 AI 草案预览与直接替换分类规则

---

## 8. AI 草案生成策略

沿用 `LOGIN/NAVIGATION` 的方法：

- 能结构化生成 profile，就优先生成 profile
- 不能可靠结构化时，退回通用 alias / read intent / intent rewrite

推荐落地顺序：

1. `READ_VALUE` 增加 `read_target` 草案生成
2. `DETAIL_OPEN / ROW_ACTION / MENU_SELECTION` 增加 `action_target` 草案生成
3. `SEARCH` 增加 `search_intent` 草案生成
4. `FIELD_FILL` 增加 `field_fill_terms` 草案生成

---

## 9. 分阶段实施计划

### Phase 0：基础设施

- 将 `BrowserCommandService` 中 profile 元数据提取改造成可扩展形态
- 统一 `effective_profile_versions` 结构
- 为后续能力保留 metadata key 与 matchedRuleIds 合并能力

### Phase 1：`READ_VALUE`

- 抽离 `BrowserCommandReadService`
- 定义 `read_target` outputs 契约
- 接 runtime `READ_VALUE` profile
- 补 hit/error log metadata
- 管理页支持 `READ profile`
- 增加 AI 草案生成与回归测试

### Phase 2：`DETAIL_OPEN / ROW_ACTION / MENU_SELECTION`

- 抽离 `BrowserCommandActionService`
- 定义 `action_target` outputs 契约
- 接 runtime `Action Profile`
- 细化 `action` reason taxonomy
- 管理页支持动作类 profile 治理

### Phase 3：`SEARCH / FIELD_FILL`

- 抽离专属 service
- 接 profile 化输入词典
- 收口 planner prompt 中的硬编码词项
- 增加专属 fallback 策略与治理闭环

---

## 10. 风险与约束

- `FIELD_FILL` 与 `SEARCH` 仍较依赖上下文结构，过早 profile 化容易误伤泛化能力
- `DETAIL_OPEN / ROW_ACTION` 需要与候选解析器协同，不能把 locator 解析权下放到规则层
- 新 profile 一旦配置过宽，可能跨站点误匹配，因此必须依赖 targeting 与 rule priority
- 迁移过程中要保留旧 parser 兜底，避免出现能力断层

---

## 11. 本轮建议落地点

本轮先做两件事：

1. 产出本设计书，明确剩余类别的迁移路径
2. 在 `BrowserCommandService` 内先完成 profile 元数据基础设施通用化

这样做的收益是：

- 不会一次性把所有能力硬切到新体系
- 能先把日志与治理底座做成可扩展
- 后续新增 `READ / ACTION / SEARCH / FIELD_FILL` service 时，无需再反复改 hit/error log 主干

---

## 12. 最终结论

`LOGIN / NAVIGATION` 的落地经验已经证明：

- 受控 profile 比任意规则解释器更稳
- `browser-semantics` 的版本治理体系可以直接复用
- 命中日志、错误样本、AI 草案生成可以形成闭环

因此其余能力的正确迁移方式不是继续往 `BrowserCommandService` 塞更多硬编码，而是：

- 先按能力拆 service
- 再定义受控 profile 契约
- 再接 runtime 发布与治理
- 最后收敛旧实现

这是在当前仓库结构下风险最低、复用度最高、也最符合现有 `LOGIN / NAVIGATION` 演进路径的方案。
