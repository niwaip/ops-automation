# 企业级技能平台 浏览器 Login 命令动态规则联动与 AI Fallback 设计方案

**Browser Command Login Dynamic Profile and AI Fallback Plan v4.0**  
日期：2026-06-21

> 本文定义如何将 `browser-command-login.service.ts` 从“固定正则解析器”演进为“规则管理可动态更新的 Login Profile 解析器”，并在规则未命中、规则不完整或页面上下文不足时，平滑进入 AI fallback。  
> 目标不是把登录解析整体改造成任意 DSL 解释器，而是在保持确定性命令编排可控的前提下，让登录识别词典、提交词、字段语义和回流闭环可治理、可灰度、可回退。

---

## 1. 文档目标

本文回答以下问题：

- 为什么 `parseLoginCommand()` / `BrowserCommandLoginService` 需要从硬编码正则升级为动态规则联动
- 当前 `browser-semantics` 规则管理与 `command-login` 的真实关系是什么
- 为什么不建议把登录解析一步改成“任意规则解释器”
- 目标态中 `LOGIN` 类规则应该如何建模为受控 `profile`
- 运行时如何动态更新规则而不重启 `ai-orchestrator`
- 当规则未命中或信息不足时，AI fallback 应如何接管
- 如何分阶段迁移，先验证、再切流、最后收敛旧实现

---

## 2. 设计目的

### 2.1 业务目的

登录命令是浏览器自动化链路中最常见、最敏感的一类意图：

- 它经常涉及用户名、密码、验证码、二次确认等字段
- 它通常是后续导航、搜索、录制导出的前置步骤
- 它在不同站点、不同语言、不同品牌 UI 下表达差异非常大

如果登录解析完全写死在代码里，会带来三个直接问题：

- 新站点或新文案变体出现时，必须修改编排代码并重新发版
- 管理页里虽然开始支持 `category=LOGIN`，但无法真正影响运行时登录解析
- 失败样本无法自然回流为“可治理规则资产”，只能继续堆硬编码

### 2.2 工程目的

本方案要达成的工程目标是：

- 将登录识别词典从代码字面量提升为可治理资产
- 保持登录命令编排的确定性，不把整段逻辑外包给任意配置
- 让规则变更通过 `browser-semantics` 的发布、灰度、回退机制立即生效
- 在规则不中时，明确地切到 AI fallback，而不是混在整条 parser 链里被动兜底
- 为后续把 `BrowserCommandService` 大类继续按能力拆分打基础

### 2.3 非目标

本文明确不追求以下目标：

- 不把整个 `BrowserCommandService` 一次性重写为规则引擎
- 不允许后台下发任意 JavaScript 或任意模板化执行逻辑
- 不让 AI 直接替代所有本地登录解析流程
- 不在首期引入新的独立 DSL 或复杂规则脚本运行时

---

## 3. 现状判断

### 3.1 当前 `command-login` 的真实状态

当前新增的 [browser-command-login.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/intent/browser-command-login.service.ts) 仍是“影子服务”：

- 它从旧的 `parseLoginCommand()` 中抽离出核心逻辑
- 它已接入影子比对，但主链结果仍以旧实现为准
- 它内部仍保留固定正则：
  - 登录意图词
  - 提交动作词
  - 用户名/密码/验证码字段提取
  - 登录后续点击动作

### 3.2 当前规则管理与登录解析的关系

当前 `browser-semantics` 已经接入 `BrowserCommandService.parseCommand()` 的前置语义归一化层：

1. `ai-orchestrator` 调用 `browser-semantics` runtime resolve
2. 根据 `domain + status + targeting` 取到当前 `ACTIVE/CANARY` 规则集
3. `applySemanticRulesToInput()` 对用户输入做 rewrite / alias / prepend / append
4. 登录解析、候选解析、上下文解析、AI fallback 都消费这个归一化后的输入

这意味着：

- 规则管理已经能影响“输入表达”
- 但还不能直接影响 `command-login` 内部字段正则与按钮词典

### 3.3 当前问题

当前存在四个结构性问题：

- `LOGIN` 规则在管理页可见，但与登录解析器不是同一套资产
- 登录解析器里的词典无法灰度、无法回退、无法按 domain 差异化
- 失败样本虽然能写 error log，但回流后不能直接补强 `command-login` 的字段词典
- 固定正则继续堆积会让 `BrowserCommandService` 拆分后的服务仍然保持高耦合

---

## 4. 结论

### 4.1 不建议的方案

不建议把登录解析一步做成以下任意一种形态：

- 纯数据库驱动的任意正则解释器
- 后台下发任意 `RegExp + replacement + command template`
- 完全依赖 AI 理解登录命令，不再保留确定性本地逻辑

原因是登录解析不仅仅是文本匹配，它还负责：

- 识别是否为登录场景
- 抽取字段值
- 决定 `fill` 的字段顺序
- 决定是否需要 `submit`
- 决定是否继续追加 trailing click

这些步骤如果完全配置化，会显著削弱可调试性、稳定性和安全边界。

### 4.2 推荐方案

推荐把登录解析演进为“两层联动”：

- 第 1 层：继续保留已有 `browser-semantics` 输入归一化
- 第 2 层：为 `command-login` 引入受控的 `Login Profile`

目标态下：

- 管理页中的 `category=LOGIN` 规则不再只是展示字段
- 这些规则会被编译成结构化 `Login Profile`
- `BrowserCommandLoginService` 会用：
  - 默认内置 profile
  - 运行时动态 profile
  - 两者合并后的结果
  来进行登录解析

### 4.3 最佳平衡点

该方案的核心平衡点是：

- “词典/术语/标签”动态化
- “命令编排/执行顺序/安全约束”仍留在代码里

这样既能治理规则资产，又不会把解析器演变为难以控制的脚本解释器。

---

## 5. 设计原则

### 5.1 受控动态化

动态部分必须限定在受控结构内：

- 允许维护词项、标签、字段别名、提交文案
- 不允许运行任意脚本
- 不允许后台传入未校验的复杂正则执行逻辑

### 5.2 默认可用

即使 `browser-semantics` 没有任何 `LOGIN` 类规则，登录解析也必须仍然可用：

- 内置默认 profile 是兜底基线
- runtime profile 是增量增强，而不是唯一依赖

### 5.3 发布即生效

登录动态规则必须复用现有 `browser-semantics` 的：

- `DRAFT`
- `CANARY`
- `ACTIVE`
- `ROLLBACK`

机制，避免为登录解析再单独发明一套发布体系。

### 5.4 失败可回流

规则未命中、规则不足、点击定位失败时，必须能：

- 记录结构化原因
- 写入 error log / hit log
- 在管理页按 `LOGIN` 类审查
- 通过 AI 生成新的 `LOGIN` 规则补强 profile

### 5.5 分阶段迁移

必须遵守：

- 先影子验证
- 再结构化对比
- 再委托切换
- 最后删除旧实现

避免一次切流导致登录解析出现大面积回归。

---

## 6. 目标态架构

### 6.1 总体流程

```text
用户输入
  -> browser-semantics runtime resolve
  -> applySemanticRulesToInput() 语义归一化
  -> BrowserCommandLoginService
       -> build default profile
       -> merge runtime LOGIN profile
       -> parse login command deterministically
       -> if profile miss / context miss / click resolve miss
            -> AI fallback
  -> 命中/失败日志回写 browser-semantics
  -> 管理页查看 LOGIN 类样本与规则
```

### 6.2 模块职责

- `browser-semantics`
  - 管理 `LOGIN` 类规则
  - 发布/回退/灰度
  - 输出运行时规则集
  - 接收命中/失败回流
- `BrowserCommandService`
  - 负责整条浏览器命令解析主链
  - 调用 runtime resolve
  - 把 `semanticRuntime` 传给 `command-login`
- `BrowserCommandLoginService`
  - 消费默认 profile 与 runtime profile
  - 执行确定性登录命令解析
  - 标注 miss reason
  - 决定何时进入 AI fallback
- AI fallback
  - 在规则不足时补理解，不替代受控编排

---

## 7. Login Profile 设计

### 7.1 为什么需要 Profile

如果直接把 `LOGIN` 规则当成“任意 regex 列表”传给 `command-login`，会遇到问题：

- 后台配置无法表达字段语义层次
- 运行时不知道哪些词属于用户名、密码、验证码、提交
- 无法对配置做结构化校验
- 规则审查也难以理解“这条规则到底影响了什么”

因此需要一个中间层：

- `SemanticRule` 负责治理
- `LoginProfile` 负责执行

### 7.2 推荐数据结构

```ts
type LoginProfile = {
  credentialIntentTerms: string[];
  submitIntentTerms: string[];
  usernameTerms: string[];
  passwordTerms: string[];
  otpTerms: string[];
  submitLabels: string[];
  trailingActionTerms: string[];
  loginSuccessHints: string[];
  takeoverSignals: string[];
  unsupportedAuthSignals: string[];
  interruptPolicy?: 'fallback' | 'takeover_required';
  localeHints?: string[];
};
```

### 7.3 字段说明

- `credentialIntentTerms`
  - 用于识别“看起来正在描述登录凭据”
  - 如：`用户名`、`账号`、`email`、`password`
- `submitIntentTerms`
  - 用于识别“看起来包含提交/继续动作”
  - 如：`登录`、`sign in`、`submit`、`next`
- `usernameTerms`
  - 用于抽取用户名字段
- `passwordTerms`
  - 用于抽取密码字段
- `otpTerms`
  - 用于抽取验证码/一次性密码字段
- `submitLabels`
  - 用于匹配按钮文案或提交目标
- `trailingActionTerms`
  - 用于识别“登录后点击/进入/打开”的尾随动作
- `loginSuccessHints`
  - 用于后续判断登录成功后的页面语义，可作为扩展项
- `takeoverSignals`
  - 用于识别必须进入人工接管的认证提示
  - 如：`请拖动滑块`、`安全校验`、`打开企业微信扫码`
- `unsupportedAuthSignals`
  - 用于识别当前引擎与 AI 都不应继续尝试的认证方式
  - 如：`Passkey`、`扫码登录`、`硬件盾`
- `interruptPolicy`
  - 用于声明命中接管信号后的默认中断策略
  - 首期推荐默认值为 `takeover_required`

### 7.4 与现有 `SemanticRule` 的映射

建议仍通过现有 `SemanticRule.outputs` 承载 profile 片段，而不是马上新增数据库专用列。

单条 `LOGIN` 类规则建议的 `outputs` 形态：

```json
{
  "profile_type": "login_terms",
  "credential_intent_terms": ["用户名", "账号", "账户", "email"],
  "submit_intent_terms": ["登录", "sign in", "submit"],
  "username_terms": ["用户名", "账号", "user", "email"],
  "password_terms": ["密码", "password", "pass"],
  "otp_terms": ["验证码", "otp", "code"],
  "submit_labels": ["登录", "Sign In", "Log In", "Next"],
  "trailing_action_terms": ["然后", "并", "接着", "之后"],
  "takeover_signals": ["请拖动滑块", "安全校验", "扫码登录"],
  "unsupported_auth_signals": ["Passkey", "企业微信扫码", "硬件盾"],
  "interrupt_policy": "takeover_required"
}
```

首期只允许白名单 key：

- `profile_type`
- `credential_intent_terms`
- `submit_intent_terms`
- `username_terms`
- `password_terms`
- `otp_terms`
- `submit_labels`
- `trailing_action_terms`
- `login_success_hints`
- `takeover_signals`
- `unsupported_auth_signals`
- `interrupt_policy`

### 7.5 登录解析结果建议结构

为了支持多步骤登录和显式接管，建议 `BrowserCommandLoginService` 的内部结果模型至少具备以下语义状态：

```ts
type LoginParseStatus =
  | 'success'
  | 'partial'
  | 'profile_miss'
  | 'takeover_required';

type LoginParserResult = {
  status: LoginParseStatus;
  commands: BrowserCommand[];
  reason?: string;
  missingFields?: Array<'username' | 'password' | 'otp' | 'submit'>;
  nextStepHint?: string;
};
```

其中：

- `success`
  - 当前页面信息足够，已生成可直接执行的完整登录命令
- `partial`
  - 当前页面只具备部分登录步骤，例如只有邮箱框和 `Next`
- `profile_miss`
  - 看起来是登录语义，但动态 profile 与默认 profile 都无法稳定生成命令
- `takeover_required`
  - 命中了扫码、滑块、企业认证等当前不应继续自动化尝试的挑战

---

## 8. 规则管理与运行时联动方案

### 8.1 管理面

规则管理页中 `category=LOGIN` 的规则继续通过：

- 查看
- AI 草案
- 单类替换
- 验证
- 发布/回退

来治理。

但在文案和详情里，需要明确区分两类 `LOGIN` 规则：

- `input rewrite` 类规则
- `login profile` 类规则

避免用户误以为所有 `LOGIN` 规则都只是文本 rewrite。

### 8.2 运行时组装

`BrowserCommandService` 在拿到 `semanticRuntime.ruleSet.rules` 后，除继续执行 `applySemanticRulesToInput()` 外，还应把：

- `category === 'LOGIN'`
- 且 `outputs.profile_type === 'login_terms'`

的规则筛出，传入 `BrowserCommandLoginService.buildProfileFromRuntimeRules(...)`。

### 8.3 Profile 合并策略

推荐合并顺序：

```text
default profile
  + domain-level runtime profile
  + targeting-specific runtime profile
  = effective login profile
```

合并规则：

- 词项数组做去重合并
- 空数组不覆盖默认值
- 无效 key 直接忽略并记录 validation warning
- 规则优先级仍以当前 rule priority 为准，但最终 profile 输出只保留合并结果

### 8.4 为什么不直接把正则存库

不建议首期直接存库 regex，原因：

- 管理难理解
- 校验难度高
- 性能和 ReDoS 风险更高
- 多语言、大小写、词边界处理容易失控

更稳的做法是：

- 后台维护词项
- 运行时按模板安全生成受控 regex

例如：

```ts
buildTermPattern(["用户名", "账号", "email"])
```

运行时生成：

```ts
/(?:用户名|账号|email)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i
```

### 8.5 `buildTermPattern` 安全编译器

`buildTermPattern` 不应只是一个简单拼接函数，而应作为受控小编译器存在。推荐职责如下：

- `normalize`
  - 对词项做 `trim`、空白归一化、大小写标准化
- `validate`
  - 过滤空值、超长词项、危险控制字符和异常输入
- `escape`
  - 对词项进行严格正则转义，避免配置中的元字符污染 regex
- `dedupe`
  - 去重，避免同义词重复导致模式膨胀
- `sort by specificity`
  - 按长度或特异性降序排序，避免短词遮蔽长词
- `compile`
  - 使用固定模板生成受控 `RegExp`
- `cache`
  - 按 profile hash 缓存编译结果，避免每次请求重复构造
- `fail-safe`
  - 编译失败时回退到默认 profile，而不是直接中断主链

建议的实现范式：

```ts
function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|]/g, '\\$&');
}

function normalizeTerm(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function buildTermPattern(terms: string[]): RegExp | null {
  const safeTerms = Array.from(
    new Set(
      terms
        .map(normalizeTerm)
        .filter((term) => term.length > 0 && term.length <= 64)
        .map((term) => escapeRegExp(term))
    )
  ).sort((a, b) => b.length - a.length);

  if (!safeTerms.length) {
    return null;
  }

  const patternStr = `(?:${safeTerms.join('|')})\\s*(?:是|为|:)?\\s*([^\\s，。,；;]+)`;
  return new RegExp(patternStr, 'i');
}
```

补充约束：

- 不依赖英文 `\b` 作为中文词项的主要边界判断
- 对多词短语如 `sign in`、`log on` 先做空白归一化再转义
- 单个 profile 的词项数量与总字符数需要硬性限制
- 编译 warning 应进入 validation 结果和运行时日志，便于治理

---

## 9. 动态更新机制

### 9.1 更新路径

动态更新不新增新链路，直接复用现有：

1. 管理页修改 `LOGIN` 类规则
2. 提交 `DRAFT`
3. 验证通过后发布 `CANARY/ACTIVE`
4. `browser-semantics runtime resolve` 返回新规则集
5. `ai-orchestrator` 下一次请求立即拿到新规则
6. `command-login` 基于新 runtime rules 重新构造有效 profile

### 9.2 生效特点

- 不需要重启 `ai-orchestrator`
- 不需要额外缓存失效协议
- 发布粒度仍然是规则集版本
- 灰度能力仍由当前 targeting 决定

### 9.3 校验要求

在 `browser-semantics` 的规则验证中，需要新增对 `LOGIN profile` 规则的专项校验：

- `outputs.profile_type` 必须合法
- 允许字段必须为字符串数组
- 单个词项长度、数量需要受限
- 总体 profile 大小需要受限
- 禁止危险控制字符或明显异常 pattern 片段
- `takeover_signals` 与 `unsupported_auth_signals` 必须为短字符串数组
- `interrupt_policy` 只能取白名单值
- 同一规则内禁止同时声明互相冲突的中断策略

---

## 10. AI Fallback 设计

### 10.1 为什么需要明确的 Login Fallback

当前链路里，AI fallback 是整条 parser 链最后的兜底：

- 语义规则
- login parser
- candidate parser
- context parser
- pattern parser
- AI parser

这会导致一个问题：

- 对于“明显是登录场景，但本地 profile 信息不足”的请求，AI 介入太晚

因此建议增加 `LOGIN` 专属 fallback 判定。

### 10.2 推荐触发条件

在以下情况触发 `login-profile-miss`：

- 检测到登录语义，但未抽到任何有效凭据字段
- 抽到了字段，但没有确定提交动作
- 找到提交词，但 `resolvePendingClickIntent()` 无法落到候选元素
- 登录后 trailing action 存在，但目标无法解析

在以下情况不进入 AI fallback，而是直接触发 `takeover_required`：

- 命中 `takeoverSignals`
- 命中 `unsupportedAuthSignals`
- 页面观察明确出现扫码登录、滑块、Passkey、企业认证挑战等不可自动完成步骤

### 10.3 Fallback 行为

触发后：

1. 保留当前归一化后的输入与上下文
2. 给 AI 一个更聚焦的任务：
   - 当前是否在表达登录动作
   - 当前页面哪些候选可能是用户名、密码、验证码、提交按钮
   - 需要输出怎样的 `fill/click/navigate` 组合
3. AI 输出结构化命令计划
4. 若成功，则作为本次请求结果返回
5. 同时写回 error log / fallback log

### 10.4 Login 专属 Prompt 设计

`login-profile-miss` 触发后，不建议复用全局 planner prompt，而应使用专门的 login fallback prompt，例如 `buildLoginFallbackPrompt()`。

建议约束：

- 明确告诉模型：这是登录场景，只允许关注：
  - 用户名输入框
  - 密码输入框
  - 验证码输入框
  - 提交按钮
  - 必要时的 `Next`
- 只传入裁剪后的页面候选：
  - `INPUT`
  - `BUTTON`
  - `A`
  - 且优先保留视窗内、可见、可交互元素
- 输出协议只允许：
  - `fill`
  - `click`
  - `navigate`
  - `takeover_required`
- 如果模型不确定，应返回 `uncertain` 或空计划，不能自由脑补不存在的元素
- prompt 中需要显式强调：不要尝试破解验证码、滑块、扫码或企业认证挑战

### 10.5 Fallback 不是替代本地规则

AI fallback 的职责是：

- 补足本地 profile 暂时没有覆盖的变体
- 缓解首期规则不足导致的解析缺口

AI fallback 不应承担：

- 常态化的全部登录解析
- 取代规则管理和发布流程

### 10.6 多步骤登录支持

很多真实系统的登录并不是单页完成，而是多步骤流程，例如：

- 第一步输入邮箱，点击 `Next`
- 第二步页面刷新后再输入密码
- 第三步可能出现一次性验证码或确认按钮

因此 `command-login` 不应默认假设“只要输入里同时提到用户名和密码，就必须一次输出全部命令”。更合理的策略是基于当前页面候选元素做 step-aware 判断：

- 如果当前页面只存在用户名输入框和 `Next`
  - 输出 `fill(username) + click(next)`
  - 结果状态标记为 `partial`
- 如果当前页面已存在密码框和提交按钮
  - 再输出 `fill(password) + click(submit)`
- 如果当前页面出现验证码输入框但没有有效提交目标
  - 可返回 `partial` 或 `profile_miss`
- 如果当前页面出现扫码、滑块或企业认证
  - 直接返回 `takeover_required`

这意味着 `BrowserCommandLoginService` 必须显式读取当前 `Candidates` / 页面 observation，而不是只靠输入文本做全量登录推断。

---

## 11. 日志与回流闭环

### 11.1 命中日志

命中成功时建议补充：

- `parser_source = login-profile`
- `matched_rule_ids`
- `effective_login_profile_version`
- `filled_fields = username/password/otp`

### 11.2 失败日志

失败时建议补充结构化 reason：

- `login-profile-miss`
- `login-field-missing`
- `login-submit-target-missing`
- `login-click-resolve-miss`
- `login-trailing-action-miss`
- `login-takeover-required`
- `login-unsupported-auth-challenge`
- `login-partial-step`
- `login-ai-fallback-used`
- `login-ai-fallback-failed`

### 11.3 管理页回流

管理页应支持：

- 按 `category=LOGIN` 查看错误样本
- 查看 miss reason 分布
- 针对某类 miss 样本发起 AI 审查
- 生成新的 `LOGIN profile` 规则草案

这样就形成：

```text
运行时 miss
  -> error log
  -> LOGIN 类审查
  -> AI 生成 LOGIN 规则
  -> 验证
  -> 发布
  -> 下一次解析自动生效
```

---

## 12. 与现有实现的衔接

### 12.1 当前已具备的基础

当前仓库已具备以下条件：

- `browser-semantics` 服务、规则集、发布、回退、targeting
- `category=LOGIN` 的规则治理基础
- 错误日志与 AI 草案生成
- `BrowserCommandLoginService` 影子服务
- 新旧登录解析结果影子比对与结构化 drift 分类

### 12.2 还缺的关键能力

还缺以下能力才能真正打通：

- `LOGIN profile` 的 `outputs` 契约
- runtime rule -> login profile 的构造器
- `command-login` 对 runtime profile 的消费能力
- `login-profile-miss` 到 AI fallback 的专属接线
- `takeover_required` 的显式状态与控制面挂起协议
- 多步骤登录的 `partial` 结果模型
- login 专属 prompt builder 与候选裁剪能力
- `LOGIN` 类验证规则和回流指标

---

## 13. 分阶段迁移计划

### 13.1 Phase 0：设计落地

目标：

- 明确 `LOGIN profile` 契约
- 补文档、校验原则和字段白名单

产出：

- 本文档
- `outputs` 结构说明
- 管理页文案约定

### 13.2 Phase 1：只读动态化

目标：

- `BrowserCommandLoginService` 支持：
  - 默认 profile
  - runtime profile 构造
  - profile 合并
  - 安全 `buildTermPattern` 编译
- 但主链仍不正式接管，仅影子对比

验收：

- 新服务可输出 effective profile
- 与旧结果对比有日志和 drift 分类

### 13.3 Phase 2：显式 Login Fallback

目标：

- 当 `login-profile-miss` 出现时，优先进入登录专属 AI fallback
- 当命中接管信号时，直接返回 `takeover_required`
- 当页面只支持部分步骤时，允许返回 `partial`

验收：

- miss reason 可观测
- AI fallback 结果可回流

### 13.4 Phase 3：主链委托切换

目标：

- 旧 `parseLoginCommand()` 改为委托新服务
- 保留影子比对开关作为短期兜底

验收：

- 关键登录样本回归通过
- mismatch 率在可接受范围内

### 13.5 Phase 4：治理闭环完善

目标：

- 管理页可明确展示 `LOGIN profile` 规则
- 支持按 miss reason 过滤样本与 AI 审查
- 可区分 `profile_miss / partial / takeover_required` 三类样本

验收：

- 运营或开发可通过管理页独立补强登录规则

---

## 14. 风险与控制

### 14.1 规则污染风险

风险：

- 错误的 `LOGIN profile` 词项可能误伤其它命令

控制：

- 仅在 `command-login` 作用域内消费 profile
- 仍需先经过登录意图判定

### 14.2 词项膨胀风险

风险：

- 为追求覆盖率不断增加词项，导致误命中增大

控制：

- 对词项数量、长度、语言混杂度做限制
- 依赖 hit/miss 指标持续清理

### 14.3 AI 过度依赖风险

风险：

- 一旦 fallback 太容易触发，常态流量可能被 AI 吃掉

控制：

- 只在明确 miss 场景触发
- 记录 fallback 比例
- 将高频 fallback 样本优先沉淀回规则

### 14.4 迁移回归风险

风险：

- 新服务接管后与旧实现行为偏差

控制：

- 继续保留影子对比
- 建立核心登录样本集回归
- 分阶段切换

---

## 15. 验收标准

当以下条件满足时，可认为本方案首期完成：

- 管理页中的 `LOGIN` 类规则能明确区分 `login profile` 规则
- 发布新的 `LOGIN profile` 后，无需重启即可在下一次请求中生效
- `BrowserCommandLoginService` 能消费 runtime profile 并生成有效命令
- 出现 `login-profile-miss` 时可走 login 专属 AI fallback
- 命中滑块、扫码、Passkey 等场景时可显式返回 `takeover_required`
- 多步骤登录场景可返回 `partial`，而不是强行一次输出整套命令
- miss 样本能回流到 `browser-semantics` 并按 `LOGIN` 类治理
- 主链切换后关键登录样本回归稳定

---

## 16. 推荐实施顺序

建议按以下顺序推进：

1. 定义 `LOGIN profile` 的 `outputs` 白名单结构
2. 在 `browser-semantics` 规则验证中加入 profile 校验与中断策略校验
3. 在 `BrowserCommandLoginService` 中实现 `buildProfileFromRuntimeRules()` 与安全 `buildTermPattern`
4. 在影子模式下对比“默认 profile vs 动态 profile”
5. 增加 `login-profile-miss` 专属 AI fallback 与 login prompt builder
6. 为扫码、滑块、Passkey 等场景增加 `takeover_required`
7. 为 SSO/Next 场景增加 `partial` 多步骤登录支持
8. 主链改为委托新服务
9. 在管理页增加 `LOGIN profile` 规则的展示与样本过滤

---

## 17. 附录：参考来源

以下参考主要用于验证本方案的方向：

- Rasa：规则/lookup/synonym 作为可治理知识层，模型负责泛化  
  - [Rasa Intents and Entities](https://rasa.com/docs/reference/primitives/intents-and-entities/)
  - [Rasa RegexFeaturizer](https://rasa.com/docs/rasa/reference/rasa/nlu/featurizers/sparse_featurizer/_regex_featurizer/)
- Duckling：规则对象化、维度化、可测试的规则解析思路  
  - [Duckling GitHub](https://github.com/facebook/duckling)
- Stagehand：确定性动作优先，失败时再走 agent fallback  
  - [Stagehand Agent Fallbacks](https://docs.stagehand.dev/v3/best-practices/agent-fallbacks)
- 神经符号混合思路：LLM 负责泛化理解，符号层负责结构约束和可解释性  
  - [A Hybrid Neuro-Symbolic Pipeline for Coreference Resolution and AMR-Based Semantic Parsing](https://www.mdpi.com/2078-2489/16/7/529)
  - [Explainable Rule Application via Structured Prompting: A Neural-Symbolic Approach](https://arxiv.org/html/2506.16335v1)

---

## 18. 最终建议

最终建议可以概括为一句话：

> 不要把 `command-login` 直接改造成“任意动态正则解释器”，而应该把 `LOGIN` 类规则沉淀为受控 `Login Profile`，由 `browser-semantics` 负责治理与发布，由 `BrowserCommandLoginService` 负责确定性编排，由 AI 在 profile 未覆盖时负责聚焦式 fallback。

这是当前仓库演进路径下风险最低、治理收益最高、最容易分阶段落地的方案。
