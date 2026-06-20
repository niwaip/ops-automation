# Office Add-in 模板化高级业务场景技术设计稿

## 1. 文档目标

本文针对 Office Add-in 模板化场景中的两个高级能力给出可落地的技术设计：

1. 在保留现有单语言模板能力的基础上，扩展多语言合同的自然语言生成与双语填充；当前优先支持中日双语，后续可扩展到中美等多语言场景。
2. Word 模板的真实文件导入与样本增强识别，用于替代 Excel 双 Sheet 对照能力。

本文不仅描述概念方案，还补齐以下内容：

- 总体架构与边界
- 数据模型与字段命名规范
- Prompt 与运行时编排策略
- Word 样本导入与结构化比对机制
- 风险控制、人工确认与分阶段实施路径

---

## 2. 背景与设计目标

### 2.1 业务背景

在涉外技术服务合同、采购合同、交付确认书等文档中，常见以下场景：

- 合同正文以中文和日文对照排版，或中文和英文对照排版
- 用户实际录入习惯是先用中文描述业务事实
- 文档中同时存在可翻译字段、不可翻译字段、需按规范格式化字段
- Excel 模板可以通过双 Sheet 对照识别参数和样本值，而 Word 缺乏天然的并排对照容器

以 `SJ6113_合同_日产通商贸易_无线设备更新_v2含服务规格书.docx` 为代表的合同可观察到：

- 文档以“中文段落 + 日文对应段落”方式交替排布
- 甲乙方名称、项目名称、服务地点、金额、付款方式、银行账号、验收条款均存在中日对应关系
- 某些字段应被视为固定映射或原样复制，而非自由翻译

这意味着系统应采用“中文主输入 + 按模板配置输出单语言结果或派生多语言结果”的架构，而不是把整份双语合同交给模型自由生成。

### 2.2 设计目标

本方案的目标如下：

- 用户只输入中文自然语言，即可生成合同所需结构化参数
- 保留并优化现有单语言模板生成链路，不要求所有模板都升级为双语或多语言模板
- 中文字段作为主字段，日文或英文字段作为派生字段自动生成
- Word 模板支持导入真实历史合同作为样本，提高参数识别与命名准确率
- 支持字段级风控，不同字段使用不同生成策略
- 支持人工确认，降低法律文档自动化风险
- 后续可平滑扩展到中美、中德、中韩等多语言模板

### 2.3 非目标

本期不追求以下能力：

- 让模型自由生成整篇法律条款正文
- 完全替代法务审阅
- 对任意格式混乱、结构差异极大的两份 Word 做无约束自动对齐
- 要求所有模板都必须采用双语或多语言渲染模式

---

## 3. 总体方案概述

总体思路分为两条主线：

1. 模板构建阶段：从空白 Word 模板中识别待填充位置，并结合真实样本推断字段名、字段类型与样本值。
2. 运行时生成阶段：从中文自然语言抽取主字段，再按模板配置决定输出单语言结果或派生日文、英文等多语言字段，最终渲染 Carbone 模板。

### 3.1 总体架构

```text
Word Add-in
  -> 提取当前文档结构化表示 DocumentIR
  -> 可选上传真实样本 docx
  -> 发送到 AI Orchestrator

AI Orchestrator
  -> 模板分析服务
     -> 空白模板解析
     -> 样本文档解析
     -> 结构化比对与锚点映射
     -> 字段命名/字段类型推断
  -> 运行时参数生成服务
     -> 中文自然语言理解
     -> 主字段抽取
     -> 术语库查找
     -> 按模板配置决定是否执行多语言派生
     -> 一致性校验
  -> 输出结构化 JSON

Carbone Engine
  -> 使用模板 + JSON 渲染单语言、双语或多语言文档
```

### 3.2 两阶段处理模型

#### 阶段 A：模板建模

- 识别模板中的待填充位置
- 建立字段与文档位置的映射关系
- 识别每个字段所属语言、类型、样本值、生成策略

#### 阶段 B：运行时生成

- 用户输入中文自然语言
- 系统抽取标准化主字段
- 根据模板配置生成 `sourceLanguage` 值，或进一步派生目标语言值
- 渲染并输出最终文档

### 3.2.1 Word Add-in 前端五步主流程

结合当前 Excel 端“先形成分析上下文，再做参数识别”的交互经验，Word 端不应再把“参数识别”作为第一屏，而应调整为以下五步主流程：

1. 第一步：上传真实样本文件  
   页面第一屏应优先展示真实文件上传区。用户先打开当前模板，再上传一份与模板结构接近的真实 `docx` 文件。该样本是后续文档对比、全局理解和参数识别的基础输入。
2. 第二步：模板对比与待定参数发现  
   系统先将“当前打开模板”和“上传真实样本”做结构化对比，输出待定参数候选及其位置、语段、章节归属、样本值和语言关系。此阶段不直接做最终字段命名，而是先形成一份待定参数候选池。
3. 第三步：AI 全局理解  
   系统基于“真实原文 + 待定参数候选池”执行 AI 全局理解，输出文档主题、章节结构、关键实体、实体关系、术语候选、版式特征以及章节级摘要，为后续按章节识别提供统一上下文。
4. 第四步：用户补充语言信息  
   在看到全局理解结果后，用户再补充语言配置信息，例如：
   - 默认单语言中文：`sourceLanguage=zh`，`targetLanguages=[]`
   - 中日双语：`sourceLanguage=zh`，`targetLanguages=["ja"]`
   - 中英双语（适用于中美业务场景）：`sourceLanguage=zh`，`targetLanguages=["en"]`
     该步骤的目标是让语言配置建立在文档整体理解结果之上，而不是先验写死在识别前。
5. 第五步：AI 参数识别  
   在完成文档对比、全局理解和语言补充后，再基于“当前打开模板 + 上传真实样本 + 待定参数候选池 + 整体理解摘要 + 语言配置”执行 AI 驱动的参数识别。此阶段应尽量对齐 Excel 当前的主链路：
   - 先有一份可缓存的全局理解结果，作为整次识别的统一上下文
   - 先按章节做文本全文宽松比较，形成一批待定参数候选；该候选阶段不依赖字段词典做预命中判断，而是保留更宽松的文本相似候选，供后续 AI 重新识别
   - 再按章节/段落块/表格块逐组调用 AI，结合全局理解、当前章节摘要和待定参数候选，循环生成块级字段建议
   - 每个块都保留结构化的 `contextAnalysis`，至少覆盖请求摘要、原始响应摘要、缓存命中、fallback 原因、重试信息和错误信息
   - 最终在服务端统一做字段去重、命名归一、风险标记、规则校验与失败回退
   - 结构锚点、字段词典、术语库与版式特征作为 AI 提示增强、后处理校验与 fallback，而不是主识别流程；字段词典当前仅作为兜底能力保留，若后续需要再单独配置

在第五步完成后，后续统一进入“应用参数 -> 生成 AI 指南 -> 保存模板/编译绑定计划 -> 预览与发布”的产出链路。

这意味着 Word 端的页面布局和状态流转要显式区分“模板对比与候选发现”“AI 全局理解”“语言补充”“AI 参数识别”几个阶段，而不是把上传样本、模板预览和字段识别全部堆在同一块区域中。

### 3.2.2 参考 Excel 的 AI 驱动主链路

参考 Excel 当前实现，Word 端第三步建议明确采用如下主链路：

1. 先基于模板数据与上传真实数据执行结构化对比，并按章节做文本全文宽松比较，发现一批“待定参数候选”；该阶段不依赖字段词典做主判断，而是尽量保留宽松候选，明确每个候选的锚点位置、样本值、所在语段、所在章节和语言关系。
2. 再对“真实原文 + 待定参数候选池”执行一次 AI 全局理解，得到 `understandingSummary`、章节摘要和实体关系信息，并允许缓存复用。
3. 用户基于全局理解结果补充 `sourceLanguage` / `targetLanguages` 等语言信息。
4. 然后将文档拆成可解释块，例如章节块、成对段落块、表格区域块、标题块或混排块。
5. 对每个块循环调用 AI，请求中显式带入：
   - `understandingSummary`
   - 当前章节摘要
   - 当前块内命中的待定参数候选列表
   - 当前块正文与样本文本摘录
   - 结构锚点提示
   - 字段词典 / 术语命中 / 枚举提示（仅作为增强与兜底，不参与候选主筛选）
   - 当前块所属章节、布局类型、语言关系
   - 用户补充后的语言配置
6. 服务端按块收集 `blockResults`，并记录每个块的成功/失败、重试次数、原始返回和 fallback 原因。
7. 仅在块级结果合并之后，才统一执行字段去重、命名归一、置信度合并、高风险拦截和规则补全。
8. 若某些块 AI 调用失败，可局部回退到规则识别；若整批块均失败，再整体退回规则结果。
9. 字段确认完成后，继续进入应用参数、生成 AI 指南、保存模板、编译绑定计划和预览发布链路。

该设计的核心是：**先结构化对比并发现待定参数候选，再做 AI 全局理解，然后由用户补充语言信息，最后按章节分块识别并进入产出链路**。也就是说，规则不再承担主识别职责，而是作为 AI 主流程的增强层、约束层和回退层。

### 3.3 通用化设计原则

为了兼容现有单语言模板，并支持中日、中英以及未来更多双语模板，系统设计应避免对某一语言对或某一合同样式做硬编码，统一遵循以下原则：

1. 语言对可配置，不在代码中写死 `zh-ja` 或 `zh-en`。
2. 单语言模板应继续可用，`targetLanguages` 允许为空。
3. 字段语义优先，不依赖某一固定段落顺序。
4. 排版模式可扩展，不假设双语文本一定是“上一段中文、下一段外文”。
5. 样本文档先规范化，再识别与对齐。
6. 识别逻辑分层，主流程由 AI 基于整体理解和分块上下文生成字段建议；候选发现阶段按章节执行文本全文宽松比较，不依赖字段词典；结构、锚点、字段特征、词典和术语资产作为提示增强、校验约束与失败兜底。

建议在模板元数据中引入语言配置，例如：

```json
{
  "languageProfile": {
    "sourceLanguage": "zh",
    "targetLanguages": [],
    "documentMode": "single_or_bilingual_or_multilingual"
  }
}
```

这里需要统一约定：

1. `sourceLanguage` 只表示源语言，不应重复出现在 `targetLanguages` 中。
2. `targetLanguages` 只表示需要派生或渲染的目标语言列表；单语言模板可为空数组。
3. 若模板需要同时输出源语言和目标语言变量，源语言变量由 `sourceLanguage` 决定，目标语言变量由 `targetLanguages` 决定，而不是把源语言再塞入目标语言列表。

### 3.3.1 工作流会话与缓存约定

为保证“五步式工作台”在前端重试、回退、重新上传、语言修改时仍可稳定续接，建议在模板建模阶段引入统一的工作流会话标识 `workflowId`。

建议约定如下：

1. `workflowId` 在用户进入本次模板分析工作台时生成，并贯穿 `compare -> understand -> recognize -> save` 全流程。
2. `compareId`、`understandingId`、`analysisId` 是各阶段结果 ID，用于调试、回放和缓存命中说明，但不替代全局 `workflowId`。
3. `templateDocumentIr`、`sampleDocument`、`candidateFields`、`understandingSummary` 在接口中可继续作为显式输入或快照传递，但服务端应以 `workflowId` 关联当前会话上下文与缓存结果。
4. 前端再次进入后续步骤时，应优先传递 `workflowId` + 当前步骤需要覆盖的显式输入，而不是默认全量重算。
5. 服务端应在返回体中显式标记缓存命中情况，如 `cacheStatus.compareHit`、`cacheStatus.understandingHit`、`cacheStatus.recognitionHit`。

建议的失效规则如下：

1. 重新上传真实样本：使 `compare`、`understand`、`recognize` 结果全部失效。
2. 当前模板 `templateDocumentIr` 发生变化：使 `compare`、`understand`、`recognize` 结果全部失效。
3. `candidateFields` 被人工改写或重新生成：使 `understand`、`recognize` 结果失效。
4. `languageProfile` 变化：至少使 `recognize` 结果失效；若语言识别本身影响整体理解，可按配置决定是否连带使 `understand` 失效。
5. 仅查看前一步结果或重复点击当前步骤：在输入未变化时应直接复用当前 `workflowId` 下的缓存结果。

---

## 4. 多语言合同自然语言生成方案

### 4.1 核心原则

多语言合同生成遵循以下原则：

1. 中文是唯一主输入源。
2. 单语言模板继续按 `sourceLanguage` 渲染，不强制派生目标语言。
3. 多语言字段是可选派生输出，不是并列原始输入。
4. 不同字段必须使用不同的生成策略，不能统一走“翻译”。
5. 所有生成结果在渲染前必须通过结构化校验。

### 4.2 数据模型设计

当前已有方案使用 `_zh`、`_ja`、`_en` 后缀命名，这一思路可以保留，但建议将其从“核心业务模型”降级为“渲染层变量命名规范”。

推荐采用两层数据模型：

#### 第一层：业务主字段

用于表达真实业务语义，例如：

- `partyAName`
- `partyBName`
- `projectName`
- `serviceLocation`
- `serviceFeeTotal`
- `paymentMode`
- `bankAccount`

#### 第二层：单语言/多语言视图字段

用于渲染模板。若当前模板是单语言模板，则只保留 `sourceLanguage` 对应字段；若模板声明了目标语言，再按需生成多语言字段。例如：

- `partyAName.zh`
- `partyAName.ja`
- `partyAName.en`

如果 Carbone 模板当前更适合扁平命名，也可以在输出阶段展开。单语言模板只展开实际需要的语言变量：

- `{d.partyAName_zh}`
- `{d.partyAName_ja}`
- `{d.partyAName_en}`

#### 推荐 JSON 结构

```json
{
  "partyAName": {
    "source": "广州日产通商贸易有限公司",
    "zh": "广州日产通商贸易有限公司",
    "ja": "広州日産通商貿易有限公司",
    "en": "Guangzhou Nissan Trading Co., Ltd.",
    "policy": "dictionary_first"
  },
  "projectName": {
    "source": "无线网络设备更新",
    "zh": "无线网络设备更新",
    "ja": "無線ネットワーク設備更新",
    "en": "Wireless Network Equipment Upgrade",
    "policy": "dictionary_then_llm"
  },
  "serviceFeeTotal": {
    "value": 137000,
    "currency": "CNY",
    "zh": "人民币137,000.00元",
    "ja": "人民元137,000.00元",
    "en": "CNY 137,000.00",
    "policy": "format_only"
  }
}
```

### 4.3 字段类型分层

为了避免误翻译，字段必须划分为以下类型：

#### A. 原样复制类

特点：不允许自由翻译，通常直接复制或标准格式化。

典型字段：

- 银行账号
- 税号
- 合同编号
- 金额数值
- 税率
- 日期中的数字部分
- 设备型号、序列号

#### B. 术语映射类

特点：优先查词典或术语库，禁止意译。

典型字段：

- 公司法定名称
- 产品正式名称
- 项目名称
- 组织名称
- 地点正式名称
- 法务固定术语

#### C. 枚举映射类

特点：从预定义枚举中选择目标语言表达。

典型字段：

- `一次` -> `一回払い` -> `one-time payment`
- `分期` -> `分割払い` -> `installment payment`
- `工作日` -> `営業日` -> `business days`

#### D. 自然语言翻译类

特点：允许模型根据上下文进行专业翻译，但需限制语气和领域。

典型字段：

- 服务描述
- 验收说明
- 付款说明
- 交付说明

### 4.4 多语言生成策略

针对不同字段类型，系统采取不同策略：

| 字段类型       | 生成方式                     | 说明                  |
| -------------- | ---------------------------- | --------------------- |
| 原样复制类     | 复制或格式化                 | 不走自由翻译          |
| 术语映射类     | 术语库优先，未命中再受控翻译 | 必须记录来源          |
| 枚举映射类     | 枚举表映射                   | 强约束，稳定可控      |
| 自然语言翻译类 | LLM 翻译                     | 需携带合同领域 Prompt |

### 4.5 渲染层变量命名规范

为兼容模板引擎，建议保留渲染层后缀命名：

- 中文：`_zh`
- 日文：`_ja`
- 英文：`_en`

示例：

```text
{d.partyAName_zh}
{d.partyAName_ja}
{d.projectName_zh}
{d.projectName_ja}
{d.serviceFeeTotal_zh}
{d.serviceFeeTotal_ja}
```

命名建议遵循：

- 业务语义优先，不使用纯位置名
- 同一业务字段在不同语言下共享同一 base name
- 避免 `field1`、`field2` 这类无语义名称

### 4.6 Prompt 设计原则

原方案中的 Prompt 已具备雏形，但应从“按语言后缀统一翻译”升级为“按字段规则定向生成”。

推荐 Prompt 结构如下：

```text
【系统角色】
你是专业的跨语言商务合同参数生成助手，负责根据中文业务描述输出结构化 JSON。

【任务目标】
1. 从中文输入中提取业务主字段。
2. 根据字段定义生成中文、日文、英文值。
3. 严格遵循每个字段的生成策略。

【字段规则】
1. policy=format_only: 只允许复制或格式化，禁止翻译。
2. policy=dictionary_first: 必须优先使用术语库命中的标准值。
3. policy=enum_mapping: 只能从给定枚举中选择。
4. policy=llm_translate: 使用专业商务合同语体翻译。

【输出要求】
1. 必须返回合法 JSON。
2. 每个字段必须包含 source、zh、ja/en。
3. 如果信息不足，返回 missingFields。
4. 不允许虚构银行账号、税号、日期、金额。
```

### 4.7 运行时工作流

#### 输入示例

用户输入：

```text
甲方是广州日产通商贸易有限公司，项目是无线网络设备更新，技术服务费总额为人民币137,000元，付款方式是一次支付。
```

#### 处理流程

1. 中文自然语言理解：抽取主字段。
2. 字段标准化：金额转换为数值与币种。
3. 术语查找：命中公司名、项目名等词典。
4. 枚举映射：`一次支付` 映射为日文和英文标准表达。
5. 自然语言翻译：对描述性字段生成目标语言。
6. 一致性校验：检查金额、支付比例、公司名是否一致。
7. 输出渲染 JSON。

#### 输出示例

```json
{
  "partyAName_zh": "广州日产通商贸易有限公司",
  "partyAName_ja": "広州日産通商貿易有限公司",
  "projectName_zh": "无线网络设备更新",
  "projectName_ja": "無線ネットワーク設備更新",
  "serviceFeeTotal_zh": "人民币137,000.00元",
  "serviceFeeTotal_ja": "人民元137,000.00元",
  "paymentMode_zh": "一次支付",
  "paymentMode_ja": "一回払い"
}
```

### 4.8 与现有合同样本的适配性分析

根据对 `SJ6113_合同_日产通商贸易_无线设备更新_v2含服务规格书.docx` 的观察，该类合同具有以下特点：

- 中文和日文通常按段落成对出现
- 项目名称、公司名称、金额、付款方式在双语段落中均可对应
- 合同包含大量法务敏感字段，不适合整段自由改写

因此更推荐：

- 固定条款正文保持模板化
- 仅对明确槽位进行参数生成
- 在单语言模板中直接复用现有渲染链路
- 在双语模板中由中文主字段驱动双语填充

另外，`技术服务合同(销售)(中英文).docx` 说明了另一个重要事实：系统不能把“中日合同的排版规律”误当成通用规律。该样本中同时存在以下情况：

- 中文一段、英文一段的顺序配对
- 标题行中中英文分行对应
- 同一语义内容在行内以中英混排方式出现
- 文档中夹杂 CAT/翻译记忆工具遗留标记，如 `{0>...<}`、`<0}` 等

这说明多语言方案必须建立在“语言无关 + 结构无关 + 样本规范化”的基础之上。

同时也要明确，企业现有模板并不都是双语或多语言模板。对于单语言模板，系统应直接复用现有单语言生成与渲染链路，仅在模板配置声明存在 `targetLanguages` 时才进入多语言派生逻辑。

### 4.9 多语言扩展设计

为了避免每增加一种语言就复制一套逻辑，建议将多语言处理抽象为“语言包配置”。

#### 语言包建议内容

- 语言代码，如 `zh`、`ja`、`en`
- 语言名称
- 金额格式化规则
- 日期格式化规则
- 标点和空格规范
- 常用法务术语映射
- 枚举映射表

#### 配置示例

```json
{
  "languages": {
    "zh": {
      "displayName": "中文",
      "dateFormat": "yyyy年MM月dd日",
      "amountFormat": "人民币{amount}",
      "enumMappings": {
        "paymentMode": {
          "一次支付": "一次支付",
          "分期支付": "分期支付"
        }
      }
    },
    "ja": {
      "displayName": "日文",
      "dateFormat": "yyyy年MM月dd日",
      "amountFormat": "人民元{amount}",
      "enumMappings": {
        "paymentMode": {
          "一次支付": "一回払い",
          "分期支付": "分割払い"
        }
      }
    },
    "en": {
      "displayName": "英文",
      "dateFormat": "dd MMM yyyy",
      "amountFormat": "CNY {amount}",
      "enumMappings": {
        "paymentMode": {
          "一次支付": "one-time payment",
          "分期支付": "installment payment"
        }
      }
    }
  }
}
```

#### 收益

- 新增语言时只需补语言包和术语表
- 运行时逻辑保持一致
- 避免在模板、Prompt、解析器中散落大量语言分支判断

---

## 5. Word 模板真实文件导入方案

### 5.1 业务问题

Excel 模板可通过双 Sheet 形成“空白模板 + 真实样本”的天然对照关系。而 Word 文档是流式结构，存在以下问题：

- 没有天然平行容器用于对照
- 同一业务字段可能分布在段落、表格、页眉页脚等不同区域
- 字段周围可能包含下划线、制表位、样式、软换行等格式信息
- 双语合同中还存在“中文块 + 日文块”的配对关系

因此，Word 不能简单照搬 Excel 的双 Sheet 方案，而应采用“空白模板 + 真实样本 + 结构化比对”的方式。

### 5.2 设计结论

最优方案是：

**在前端 Add-in 提供真实样本文件上传入口，在后端将空白模板和真实样本统一解析为 DocumentIR，再进行结构化对齐与字段推断。**

### 5.3 前端 Add-in 交互设计

建议将 Word 端交互从“单块参数识别页”调整为“五步式工作台”，并借鉴 Excel 当前的“先形成上下文，再做字段识别”的结构。

#### 第一步：真实样本上传

页面顶部首先展示样本导入区，而不是参数识别按钮。该区域应包含：

1. 当前模板说明区：显示当前打开的是空白模板，并提示后续识别会同时使用模板和样本。
2. 样本上传区：支持拖拽或选择 1 份已签署或已填写的历史 `docx` 合同。
3. 样本说明区：明确提示用户上传与当前模板结构接近的真实文件。
4. 上传状态区：显示文件名、大小、最近上传时间以及是否已准备好进入理解阶段。

#### 第二步：模板对比与待定参数发现

上传成功后，先进入“模板对比”区域。该区域建议独立于整体理解区，承担如下职责：

1. 基于“当前打开模板 + 上传真实样本”执行结构化对比，而不是立即进入最终字段命名。
2. 输出待定参数候选及其 `anchor`、位置、语段、样本值、章节归属和语言关系。
3. 展示对比结果摘要，例如发现了多少候选、哪些章节存在高置信度可变字段、哪些块仍需人工关注。
4. 对候选发现结果做缓存，避免模板和样本未变化时重复执行对比。

#### 第三步：AI 全局理解

在待定参数候选池形成后，再进入“整体理解”区域。该区域承担如下职责：

1. 基于“真实原文 + 待定参数候选池”执行 AI 全局理解。
2. 输出文档主题、主要章节、段落结构、关键业务实体、实体关系、术语候选和版式特征。
3. 输出章节级摘要和候选参数的章节聚类结果，为第四步和第五步提供上下文。
4. 对“模板 + 样本 + 候选池”的理解结果做缓存，避免重复请求。

#### 第四步：用户补充语言信息

在全局理解结果返回后，再让用户补充语言配置信息。该区域建议承担如下职责：

1. 允许设置
   - 默认中文单语言
   - 中文 -> 日文
   - 中文 -> 英文（适用于中美业务场景）
   - 后续扩展更多目标语言
2. 让用户基于整体理解结果确认源语言、目标语言和文档模式，而不是在理解前做先验设置。
3. 若用户修改语言配置，应提示后续参数识别需要重新执行。

#### 第五步：AI 参数识别

在完成模板对比、全局理解和语言补充后，再进入字段识别区。该区的职责应与 Excel 参数识别阶段尽量一致：

1. 基于“当前打开模板 + 上传真实样本 + 待定参数候选池 + 整体理解摘要 + 语言配置”执行 AI 驱动的字段识别，而不是仅依赖规则发现。
2. 先按章节执行文本全文宽松比较，整理当前章节的待定参数候选，再把文档按章节、成对段落、表格区域或其他可解释块拆分，逐块调用 AI 生成字段建议。
3. 每个块都应输出独立的 `blockResults`，包括 `blockId`、`blockType`、`title`、`aiCallSucceeded`、`suggestionCount`、`warnings`、`retryCount`、`fallback` 等信息。
4. 输出字段名、字段类型、样本值、语言关系、策略、风险与置信度，并保留对应块级上下文，便于人工核对。
5. 结构锚点、字段词典、术语库、样本命中结果应作为 AI 的提示输入、后处理校验和失败兜底，而不是最终主结果来源；字段词典当前默认仅承担兜底角色，暂不作为独立配置项进入主流程。
6. 支持人工确认、字段重命名、策略调整与风险标记。
7. 识别完成后，继续进入“应用参数 -> 生成 AI 指南 -> 保存模板 / 预览 / 发布”的后续产出流程。

建议将 `blockResults` 的最小结构进一步标准化，至少包含：

- `blockId`
- `blockType`
- `title`
- `sectionId`
- `sectionTitle`
- `aiCallSucceeded`
- `resultStatus`
- `suggestionCount`
- `retryCount`
- `durationMs`
- `errorCode`
- `fallback`
- `fallbackReason`
- `warnings`

其中：

1. `resultStatus` 建议与任务级语义保持一致，可取 `success`、`partial_success`、`fallback_success`、`failed`。
2. `errorCode` 用于表达块级失败原因，例如超时、解析失败、响应格式错误、低置信度拒收等。
3. `fallbackReason` 用于解释为什么当前块进入规则兜底或局部降级。
4. `durationMs` 用于支撑块级慢调用定位和性能观测。

#### 页面布局建议

Word 页面建议按以下顺序自上而下排列：

1. 样本上传区
2. 模板对比与待定参数发现区
3. AI 整体理解区
4. 语言补充区
5. 参数识别区
6. 参数应用与 AI 指南区
7. 预览与保存区
8. 调试日志与错误区

该布局的关键原则是：**先上传真实文件，再做模板对比和待定参数发现，接着执行 AI 全局理解，由用户补充语言信息，最后进入按章节的 AI 参数识别，并沿用统一的参数应用、AI 指南与模板产出流程。**

#### 5.3.1 页面文案建议

为降低用户理解成本，建议在三步式工作台中直接使用面向任务的文案，而不是技术实现导向的文案。

1. 第一步主标题：`上传真实文件`
2. 第一步副标题：`请上传一份与当前模板结构接近的历史 Word 文件，系统将结合模板与真实内容进行对比、理解和识别。`
3. 第一步主按钮：`上传真实文件`
4. 第一步完成态文案：`已上传 1 份真实文件，可继续进行模板对比`
5. 第二步主标题：`模板对比`
6. 第二步副标题：`系统将先对比当前模板与真实文件，生成待定参数、位置和语段信息。`
7. 第二步主按钮：`开始对比`
8. 第二步完成态文案：`已生成待定参数候选，可继续进行 AI 全局理解`
9. 第三步主标题：`AI 全局理解`
10. 第三步副标题：`系统将基于真实原文和待定参数候选，理解文档的章节、实体关系和整体语义。`
11. 第三步主按钮：`开始理解`
12. 第三步完成态文案：`整体理解完成，可继续补充语言信息`
13. 第四步主标题：`语言补充`
14. 第四步配置标题：`多语言设置`
15. 第四步配置选项：

- `默认中文`
- `中文 + 日文`
- `中文 + 英文`

16. 第四步完成态文案：`语言信息已确认，可继续识别参数`
17. 第五步主标题：`AI 参数识别`
18. 第五步副标题：`系统将根据当前模板、真实文件、待定参数候选和整体理解结果，按章节逐步生成可配置参数建议。`
19. 第五步主按钮：`开始识别参数`
20. 第五步完成态文案：`AI 参数识别完成，可进入参数应用、AI 指南、预览和保存流程`

#### 5.3.2 按钮与交互规则建议

建议在前端显式控制按钮可用状态，避免用户在上下文不完整时误触发后续步骤。

1. `上传真实文件`：始终可点击；上传成功后显示替换入口 `重新上传`
2. `开始对比`：仅当“当前模板已打开”且“真实文件已上传”时可点击
3. `开始理解`：仅当模板对比完成并已生成待定参数候选池时可点击
4. `多语言设置`：仅当整体理解完成后可编辑；若修改配置，应提示后续参数识别需要重新执行
5. `开始识别参数`：仅当整体理解完成且语言信息已确认后可点击；识别过程中应允许展示阶段性章节/块级进度
6. `应用参数`、`生成 AI 指南`、`保存模板`：仅当参数识别结果已生成且用户完成必要确认后可点击

#### 5.3.3 状态流转建议

建议 Word Add-in 前端至少维护以下页面级状态，确保流程与页面布局一致：

1. `template_ready`：用户已打开模板，但尚未上传真实文件
2. `sample_uploaded`：真实文件已上传，等待执行模板对比
3. `comparing`：正在执行模板与真实文件的结构化对比
4. `compare_ready`：待定参数候选已生成，允许进入 AI 全局理解
5. `understanding`：正在执行“真实原文 + 待定参数候选池”的 AI 全局理解
6. `understanding_ready`：整体理解完成，允许用户查看摘要、实体关系和章节信息
7. `language_ready`：用户已确认语言配置，允许进入 AI 参数识别
8. `recognizing`：正在执行按章节的 AI 参数识别
9. `recognition_ready`：AI 参数识别完成，允许用户确认字段并进入应用参数、AI 指南、预览、保存与发布流程
10. `error`：上传、对比、理解或识别失败，页面应保留已完成步骤并支持重试

建议状态流转如下：

1. `template_ready -> sample_uploaded`：用户上传真实文件成功
2. `sample_uploaded -> comparing`：用户点击 `开始对比`
3. `comparing -> compare_ready`：模板对比成功返回，形成待定参数候选池
4. `compare_ready -> understanding`：用户点击 `开始理解`
5. `understanding -> understanding_ready`：整体理解成功返回
6. `understanding_ready -> language_ready`：用户确认语言配置
7. `language_ready -> recognizing`：用户点击 `开始识别参数`
8. `recognizing -> recognition_ready`：AI 参数识别成功返回
9. 任一步骤失败均进入 `error` 子状态，但不应丢失已上传文件、已完成的对比结果、已完成的理解结果与已选语言配置

#### 5.3.4 页面区域联动建议

为了让页面看起来更像“分阶段工作台”而不是“一个很长的表单”，建议增加以下联动规则：

1. 第一步完成前，第二步和第三步默认折叠并置灰
2. 第二步运行中，页面应显示模板对比进度、候选统计和待定参数骨架屏
3. 第二步完成后，第三步自动展开，并把待定参数候选池作为整体理解输入摘要展示在顶部
4. 第三步完成后，第四步自动展开，要求用户基于整体理解结果补充语言信息
5. 第五步识别过程中，可附带展示当前正在分析的章节/块
6. 第五步完成后，识别区保留字段表格，同时在下方显式暴露 `应用参数`、`生成 AI 指南`、`预览`、`保存模板` 等后续入口
7. 如果用户重新上传真实文件，应提示“模板对比结果、整体理解结果和参数识别结果将失效，需要重新执行”

#### 5.3.5 异步执行与进度反馈建议

由于模板对比、AI 全局理解和按章节/块 AI 参数识别都可能持续数秒到数十秒，尤其第五步会循环执行多次块级 AI 调用，因此前后端协议建议默认采用“提交任务 + 查询进度”的异步模式，而不是假设所有接口都能在一次同步请求内稳定完成。

建议遵循以下原则：

1. `compare`、`understand`、`recognize` 三步都允许返回异步任务句柄 `jobId`。
2. 前端在拿到 `jobId` 后，通过轮询或流式事件持续获取当前步骤进度。
3. 第五步应重点返回块级进度，例如总块数、已完成块数、失败块数、当前块标题。
4. 用户在重新上传样本、修改语言配置或主动中止时，应允许取消当前任务，避免旧结果回写到新状态。
5. 任务失败时，不应只返回一个通用错误，而应保留阶段、块、重试和 fallback 维度的诊断信息。

建议最小进度模型至少包含：

- `jobId`
- `workflowId`
- `step`，如 `compare`、`understand`、`recognize`
- `status`，如 `queued`、`running`、`succeeded`、`failed`、`cancelled`
- `progressPercent`
- `currentStageText`
- `blockProgress`，用于识别阶段的块级进度
- `warnings`
- `error`

其中 `blockProgress` 建议至少包含：

```json
{
  "totalBlocks": 12,
  "completedBlocks": 5,
  "failedBlocks": 1,
  "runningBlockId": "block_006",
  "runningBlockTitle": "付款条款",
  "lastCompletedBlockId": "block_005"
}
```

前端状态与异步协议的映射建议如下：

1. `comparing`、`understanding`、`recognizing` 三个页面状态，均应对应一个处于 `queued/running` 的后端任务。
2. 若任务状态变为 `succeeded`，前端再切换到 `compare_ready`、`understanding_ready`、`recognition_ready`。
3. 若任务状态变为 `failed/cancelled`，前端进入当前步骤对应的 `error` 子状态，但保留此前成功阶段的缓存结果。
4. 若 `recognize` 过程中只存在部分块失败，前端仍可展示已完成字段结果，同时提示失败块、fallback 和是否允许局部重试。

### 5.4 DocumentIR 设计

为了支撑 Word 的可靠对比，空白模板和样本文档都应先转换为统一结构化中间表示 `DocumentIR`。

#### 5.4.1 样本文档规范化

在进入 `DocumentIR` 之前，建议先对 Word 样本文本做规范化处理，避免识别逻辑被文档噪音干扰。

需要处理的典型问题包括：

- CAT/翻译工具遗留标记，例如 `{0>...<}`、`<0}`、`{>...<0}`
- 多余的制表位、不可见空格、软换行
- 连续下划线、点线、空白占位符
- 中英文符号混用，例如全角冒号、半角冒号、不同括号形式
- OCR 或人工复制造成的断词、异常空格

建议规范化后保留两份内容：

- `rawText`：用于回溯和错误定位
- `normalizedText`：用于分析、对齐和推断

规范化步骤建议如下：

1. 清洗翻译标记和控制字符
2. 合并连续空白与制表符
3. 标准化标点与括号
4. 将下划线、空白线、内容控件统一抽象为 `blank token`
5. 保留原始位置信息，确保后续可准确回写模板

#### `DocumentIR` 建议字段

```json
{
  "blocks": [
    {
      "blockId": "p-0011",
      "type": "paragraph",
      "style": "Normal",
      "lang": "zh",
      "text": "委托方: ________________",
      "tokens": [
        { "type": "text", "value": "委托方:" },
        { "type": "blank", "value": "____________" }
      ],
      "anchors": {
        "prefix": "委托方:",
        "suffix": ""
      }
    }
  ]
}
```

#### 建议保留的信息

- 段落、表格、单元格、页眉页脚等块级结构
- run 级文本、下划线、空白区、内容控件等行内结构
- 样式名、段落序号、文档路径
- 语言识别结果
- 锚点文本：字段前缀、字段后缀、上下文窗口

#### 5.4.2 推荐的 `DocumentIR` 分层结构

为了兼容单语言合同、段落型合同、表格型合同和双语对照合同，建议将 `DocumentIR` 拆成以下四层：

##### 第一层：文档层

用于描述整份文档的全局信息：

- `documentId`
- `sourceFileName`
- `sourceFileType`
- `languageProfile`
- `layoutProfile`
- `sections`
- `blocks`
- `relations`

##### 第二层：区块层

用于表达段落、表格、单元格、页眉页脚等块结构：

- `paragraph`
- `table`
- `tableRow`
- `tableCell`
- `header`
- `footer`

##### 第三层：Token 层

用于表达可分析的最小单位：

- `text`
- `blank`
- `content_control`
- `tab`
- `line_break`
- `punctuation`

##### 第四层：关系层

用于表达跨块和跨语言关系：

- 源语言块与目标语言块的对应关系
- 表格表头与数据列的对应关系
- 字段候选与锚点的关联关系
- 章节、段落、单元格之间的父子关系

#### 5.4.3 推荐的 Schema 示例

```json
{
  "documentId": "doc_tpl_001",
  "sourceFileName": "技术服务合同(销售)(中英文).docx",
  "languageProfile": {
    "sourceLanguage": "zh",
    "targetLanguages": ["en"],
    "detectedLanguages": ["zh", "en"]
  },
  "layoutProfile": {
    "bilingualLayoutType": "mixed",
    "hasTables": true,
    "hasInlinePairs": true,
    "hasTmMarkup": true
  },
  "sections": [
    {
      "sectionId": "sec-001",
      "title": {
        "zh": "技术服务内容、方式",
        "en": "Scope and Form of Technical Service"
      },
      "blockIds": ["p-0020", "p-0021", "tbl-0003"]
    }
  ],
  "blocks": [
    {
      "blockId": "p-0011",
      "type": "paragraph",
      "parentSectionId": "sec-0001",
      "lang": "zh",
      "style": "Normal",
      "rawText": "委托方：                                      （下称“甲方”）",
      "normalizedText": "委托方：<blank>（下称甲方）",
      "tokens": [
        { "tokenId": "t-1", "type": "text", "value": "委托方：" },
        { "tokenId": "t-2", "type": "blank", "value": "<blank>", "span": [5, 43] },
        { "tokenId": "t-3", "type": "text", "value": "（下称甲方）" }
      ],
      "anchors": {
        "prefix": "委托方：",
        "suffix": "（下称甲方）",
        "contextWindow": "委托方：<blank>（下称甲方）"
      },
      "position": {
        "pageApprox": 1,
        "blockOrder": 11
      }
    },
    {
      "blockId": "cell-0102",
      "type": "tableCell",
      "parentBlockId": "tbl-0002",
      "rowIndex": 0,
      "colIndex": 1,
      "lang": "en",
      "rawText": "Product Description",
      "normalizedText": "Product Description",
      "semanticRole": "table_header"
    }
  ],
  "relations": [
    {
      "relationId": "rel-001",
      "type": "translation_pair",
      "fromBlockId": "p-0011",
      "toBlockId": "p-0012",
      "confidence": 0.97
    },
    {
      "relationId": "rel-002",
      "type": "table_header_pair",
      "fromBlockId": "cell-0101",
      "toBlockId": "cell-0102",
      "confidence": 0.99
    }
  ]
}
```

#### 5.4.4 表格型合同的特殊要求

从 `买卖合同(销售)(中英文).docx` 和 `买卖合同(销售)(中日文).docx` 可看到，买卖合同中大量字段存在于表格或表头结构中，例如：

- 产品名称 / Product Description
- 型号 / Model
- 数量 / Quantity
- 单价 / Unit Price
- 总价 / Total Price

因此 `DocumentIR` 必须原生支持表格语义，不能只把表格拍平成普通段落文本。建议额外保留：

- 表格索引、行列坐标
- 表头单元格与数据单元格的映射
- 合并单元格信息
- 双语表头配对关系
- 同列字段的重复模式

这样后续才能稳定识别列表型变量，例如 `items[]`、`products[]`。

#### 5.4.5 字段候选中间结构

在 `DocumentIR` 与最终字段定义之间，建议增加 `FieldCandidateIR`，用于承载识别过程中的候选结果。

```json
{
  "candidateId": "fc-001",
  "sourceBlockId": "p-0011",
  "fieldTypeHint": "legal_entity_name",
  "anchorText": "委托方：",
  "sampleValue": "广州日产通商贸易有限公司",
  "targetLanguageSamples": {
    "ja": "広州日産通商貿易有限公司",
    "en": "Guangzhou Nissan Trading Co., Ltd."
  },
  "generationPolicyHint": "section_text_compare_first",
  "confidence": 0.96
}
```

引入这一中间层的好处是：

- 便于将规则引擎和 LLM 推断解耦
- 便于前端确认页展示“候选结果”
- 便于后续人工修订和再次训练字段命名模型

在 AI 主驱动链路下，可进一步将 `FieldCandidateIR` 视为“待定参数候选池”。也就是说，在真正进入按章节的 AI 参数识别前，系统应先基于模板数据和上传真实数据，按章节做文本全文宽松比较，整理出一批待定参数候选。这里的“候选”强调的是宽松预筛，而不是基于字段词典的强约束命中，并至少为每个候选补齐以下信息：

- 候选参数 ID
- 锚点位置与原始 block / token 位置
- 对应样本值
- 所在语段摘录
- 所属章节
- 语言关系与布局关系
- 初步字段类型提示

后续块级 prompt 不应从零开始要求 AI 自由发现所有字段，而应让 AI 在“全局理解 + 当前章节上下文 + 待定参数候选池”的基础上完成识别、命名、归类和冲突消解。

### 5.5 后端处理流程

先明确本节的总原则：**后端主链路应采用“结构化对比与候选发现 -> AI 全局理解 -> 用户补充语言 -> AI 分块识别 -> 服务端合并校验 -> 参数应用与模板产出”的六段式流程**。候选发现阶段应优先按章节做文本全文宽松比较，而不是依赖字段词典预命中；文档结构特征、锚点规则、字段词典、术语库和枚举映射继续保留，但其角色从“主识别器”调整为“提示构造器、校验器和 fallback 生成器”。

#### 步骤 1：空白模板解析

- 从当前 Word 文档提取结构化内容
- 识别可能的空白区、下划线区、占位区和内容控件
- 标记每个候选字段位置的上下文锚点

#### 步骤 2：样本文档解析

- 接收用户上传的真实 docx
- 提取段落、表格、语言块等结构
- 记录真实文本值与周边上下文

#### 步骤 3：待定参数候选发现与分块准备

该步骤的目标不是直接产出最终字段，而是基于模板数据和上传真实数据，先按章节做文本全文宽松比较，发现待定参数候选，并为后续块级 AI 识别构造稳定上下文。此处候选发现应尽量放宽内容匹配条件，避免过早用字段词典收紧范围；对齐策略建议按以下顺序进行：

1. 文档大纲对齐：按标题、条款编号、区块顺序对齐
2. 语言块对齐：识别源语言块与目标语言块是否互为对应
3. 章节内全文宽松比较：在当前章节范围内比较样本值、上下文语义、相邻文本和布局特征，尽可能保留宽松候选
4. 段落级对齐：比较前缀文本、样式、位置、长度
5. 字段级对齐：在空白区或占位区附近寻找样本值

该步骤的输出不应只是若干零散规则命中，而应产出一份待定参数候选池，至少包含：

- `candidateId`
- `sourceBlockId`
- `anchorText`
- `sampleValue`
- `segmentText`
- `sectionId` / `sectionTitle`
- `fieldTypeHint`
- `generationPolicyHint`
- `confidence`

其中 `generationPolicyHint` 在该阶段仅表示候选生成方式，例如章节全文宽松比较、结构锚点匹配或样本邻域命中；不应等价理解为最终字段策略，也不应默认由字段词典决定。

#### 步骤 4：AI 全局理解

在待定参数候选池形成后，再基于“真实原文 + 待定参数候选池”执行 AI 全局理解。该步骤建议输出：

- `understandingSummary`
- `entityGraph` 或等价的实体关系摘要
- `sectionSummaries`
- `candidateGroupingBySection`
- `terminologyCandidates`
- `layoutProfile`

该步骤的目标不是直接做最终字段命名，而是建立章节级、实体级和候选字段级的统一上下文。

#### 步骤 5：用户补充语言信息

该步骤由前端触发、后端持久化，核心目标是让用户在看完整体理解结果后，再确认：

- `sourceLanguage`
- `targetLanguages`
- `documentMode`
- 是否需要重新执行后续识别

#### 5.5.1 常见双语排版模式抽象

结合 `SJ6113_合同_日产通商贸易_无线设备更新_v2含服务规格书.docx` 与 `技术服务合同(销售)(中英文).docx`，建议将双语 Word 的常见模式抽象为以下几类；单语言模板不必进入该分类分支：

##### 模式 A：分段顺序配对

示例特征：

- 第 N 段为中文
- 第 N+1 段为日文或英文
- 两段长度和语义相近

适用示例：

- `SJ6113` 中的大量中日条款对照
- 中英文合同中的标题和正文分行对照

##### 模式 B：行内双语配对

示例特征：

- 同一段落内同时出现中文标签和英文标签
- 如 `委托方:` 与 `Entrusting Party:` 出现在同一结构块中

##### 模式 C：一侧留空、一侧示意

示例特征：

- 中文为空白待填，英文为说明性提示
- 或源语言和目标语言都留有同类型空白

##### 模式 D：翻译工具污染模式

示例特征：

- 行内夹杂 `{0>...<}`、`<0}`、翻译记忆痕迹
- 文本语义正确，但结构被污染

系统不应针对某一模式写死流程，而应在解析阶段先识别 `bilingualLayoutType`，再选择合适的对齐策略。

#### 5.5.2 建议的布局分类标签

```json
{
  "bilingualLayoutType": "paired_paragraphs | inline_pairs | mixed | contaminated_tm_markup"
}
```

#### 步骤 6：块级 AI 字段推断

基于以下信息，对每个块单独调用 AI 推断字段名、字段类型和语言关系：

- `understandingSummary`
- `entityGraph` 或实体关系摘要
- 当前章节信息
- 当前块命中的待定参数候选列表
- 当前块正文与样本文本摘录
- 锚点文本，例如 `委托方:`、`乙方指定银行帐号为:`
- 样本值内容特征，例如像公司名、金额、日期还是账号
- 跨语言对应块之间的语义关系
- 历史字段命名先验
- 字段词典、术语库、枚举映射和布局特征提示
- 用户补充后的语言配置

#### 步骤 7：服务端结果合并与规则校验

在所有块完成 AI 推断后，再统一生成最终识别结果。该阶段建议完成：

- 字段去重与命名归一
- 跨块冲突消解
- 高风险字段标记
- 术语命中与枚举命中校验
- 金额、日期、银行账号等规则型二次校验
- 失败块的 fallback 补全

最终为每个字段输出如下信息：

- 建议字段名
- 字段类型
- 样本值
- 语言映射关系
- 生成策略
- 置信度
- `sourceBlockId`
- `termMatch` / `resolution`

同时建议对每个块保留标准化结果对象，最小结构示例如下：

```json
{
  "blockId": "block_001",
  "blockType": "paired_paragraphs",
  "title": "合同头部与主体信息",
  "sectionId": "sec-header-001",
  "sectionTitle": "合同头部",
  "aiCallSucceeded": true,
  "resultStatus": "success",
  "suggestionCount": 3,
  "retryCount": 1,
  "durationMs": 2840,
  "errorCode": null,
  "fallback": null,
  "fallbackReason": null,
  "warnings": []
}
```

建议约束：

1. `aiCallSucceeded=false` 不一定意味着整块 `failed`，若规则兜底成功，可使用 `resultStatus=fallback_success`。
2. `retryCount` 仅统计当前块内部 AI 重试次数，不包含整个任务级重试。
3. `errorCode` 为空表示当前块未发生阻断性错误。
4. `warnings` 用于保留块级非阻断告警，例如候选不足、术语未命中、置信度偏低。

除 `blockResults` 外，建议本次识别任务再保留一个结构化 `contextAnalysis` 对象，统一承载调试、缓存与回退信息，而不是把 `promptRequestText`、`rawAiResponse`、`fallback` 等字段零散平铺在返回体根节点。

推荐最小结构如下：

```json
{
  "usedAI": true,
  "globalUnderstandingUsedAI": true,
  "resultSource": "ai+rule_fallback",
  "requestTrace": {
    "executor": "studio",
    "promptTemplateVersion": "word-recognize-v2",
    "requestCount": 12,
    "lastRequestSummary": "当前块为付款条款，候选数 2"
  },
  "responseTrace": {
    "successBlockCount": 10,
    "failedBlockCount": 2,
    "lastResponseSummary": "最近一次返回 3 个字段建议"
  },
  "fallbackTrace": {
    "usedFallback": true,
    "fallbackLevel": "block",
    "fallbackReason": "block_timeout",
    "fallbackBlockIds": ["block_009"]
  },
  "cacheTrace": {
    "compareHit": false,
    "understandingHit": true,
    "recognitionHit": false
  },
  "debugArtifacts": {
    "promptRequestText": "最近一次有效块级请求原文",
    "rawAiResponse": "最近一次有效块级原始返回"
  }
}
```

建议约束：

1. `requestTrace` 用于记录请求侧观测信息，不承担结果语义。
2. `responseTrace` 用于记录块级成功/失败统计和最近一次有效返回摘要。
3. `fallbackTrace` 用于解释本次识别是否发生 block 级或 task 级 fallback，以及影响范围。
4. `cacheTrace` 用于统一表达缓存命中，后续可替代零散的 `cacheStatus` 展示。
5. `debugArtifacts` 用于保留最近一次有效请求原文和原始响应；若考虑返回体体积，也可只返回摘要并把完整内容写入日志系统。

#### 步骤 8：参数应用与模板产出

在字段确认完成后，后续应显式进入产出链路，而不是只停留在“识别完成”：

- 应用参数到当前模板预览态
- 生成 AI 指南
- 保存模板定义
- 编译 `CarboneBindingPlan`
- 预览、发布与后续渲染

#### 5.5.3 AI 参数识别 Prompt 设计

参考 Excel 当前“先全局理解，再带着候选上下文逐组识别”的模式，Word 第三步建议将 prompt 拆成两层：

1. 全局理解 prompt：负责基于“真实原文 + 待定参数候选池”输出 `understandingSummary`、章节摘要、实体关系、布局判断、术语候选。
2. 章节/块级识别 prompt：负责在指定章节内，根据待定参数候选列表完成字段识别。这里的候选列表应来自章节级文本全文宽松比较，而不是字典预筛结果。

其中块级识别 prompt 的输入应至少包含：

- `understandingSummary`
- 当前章节标题与章节摘要
- 当前块正文
- 当前块对应的样本文本摘录
- 当前块命中的待定参数候选列表
- 每个候选的锚点位置、所在语段、样本值和类型提示
- 当前章节全文宽松比较命中的相似片段或上下文摘录
- 字段词典、术语命中、枚举命中、布局特征（仅作为增强、校验与兜底）

块级识别 prompt 的任务目标建议明确为：

1. 不从整份文档自由发散识别字段，而是优先处理当前章节内的待定参数候选。
2. 候选判断优先依据当前章节中的完整文本比较与上下文语义，而不是依据字段词典是否命中。
3. 判断每个候选是否应成为正式字段，或应被判定为固定正文。
4. 为有效候选输出标准字段名、字段类型、语言关系、策略和风险等级。
5. 若当前块缺乏足够证据，允许返回 `needsReview`，而不是虚构字段。

全局理解 prompt 的任务目标建议明确为：

1. 不对整篇文档做无约束摘要，而是围绕待定参数候选池组织理解结果。
2. 输出章节级结构、关键实体、实体关系和候选字段所在章节的聚类信息。
3. 为后续语言补充和章节级 AI 参数识别提供稳定上下文。

#### 5.5.4 待定参数候选输入示例

为了避免块级识别 prompt 输入过于抽象，建议在服务端先把候选池压缩为当前章节或当前块相关的最小输入结构，再交给 AI。

示例：

```json
{
  "section": {
    "sectionId": "sec-payment-001",
    "sectionTitle": "付款条款",
    "sectionSummary": "本章节主要描述付款方式、付款期限、收款账户与金额表达。"
  },
  "block": {
    "blockId": "p-0032",
    "blockType": "paired_paragraphs",
    "layoutType": "paired_paragraphs",
    "templateText": "乙方指定银行帐号为：<blank>",
    "sampleText": "乙方指定银行帐号为：6222000000000000"
  },
  "candidateFields": [
    {
      "candidateId": "fc-bank-account-01",
      "anchorText": "乙方指定银行帐号为：",
      "sourceBlockId": "p-0032",
      "segmentText": "乙方指定银行帐号为：6222000000000000",
      "sampleValue": "6222000000000000",
      "fieldTypeHint": "bank_account",
      "generationPolicyHint": "format_only",
      "confidence": 0.95
    },
    {
      "candidateId": "fc-payment-deadline-01",
      "anchorText": "收到发票后",
      "sourceBlockId": "p-0033",
      "segmentText": "甲方应在收到发票后10个工作日内付款。",
      "sampleValue": "10个工作日",
      "fieldTypeHint": "duration_days",
      "generationPolicyHint": "enum_mapping",
      "confidence": 0.78
    }
  ]
}
```

该结构的关键点是：

- 每次只传当前章节或当前块真正相关的候选，避免无关字段干扰。
- 候选必须同时保留锚点、位置、语段和样本值，避免 AI 只看到孤立值。
- `fieldTypeHint` 与 `generationPolicyHint` 只作为提示，不直接替代 AI 判断。

#### 5.5.5 章节/块级识别 Prompt 示例

建议在实现中使用模板化 prompt，而不是在代码里零散拼字符串。以下是一个可直接指导实现的块级 prompt 示例：

```text
【系统角色】
你是合同模板参数识别助手。你的任务不是自由发明字段，而是基于当前章节、当前块文本和待定参数候选列表，识别哪些候选应成为正式模板字段。

【全局理解】
{understandingSummary}

【当前章节】
- 标题: {sectionTitle}
- 摘要: {sectionSummary}

【当前块信息】
- blockId: {blockId}
- blockType: {blockType}
- layoutType: {layoutType}
- 模板文本: {templateText}
- 样本文本: {sampleText}

【待定参数候选】
{candidateFieldsJson}

【字段词典与术语提示】
{fieldDictionaryHints}
{termHints}
{enumHints}

【识别要求】
1. 仅处理当前章节和当前块相关的候选参数。
2. 优先根据锚点、样本值、语段语义和章节上下文判断字段含义。
3. 若候选只是固定正文或说明性文本，不要输出为正式字段。
4. 若候选证据不足，请标记 `needsReview=true`，不要虚构字段名。
5. 对高风险字段如金额、银行账号、日期，必须保守处理。

【输出要求】
返回合法 JSON，字段包括：
- candidateId
- accepted
- fieldId
- fieldType
- policy
- sample
- riskLevel
- confidence
- needsReview
- reason
```

建议配套的块级返回示例：

```json
{
  "results": [
    {
      "candidateId": "fc-bank-account-01",
      "accepted": true,
      "fieldId": "bankAccount",
      "fieldType": "bank_account",
      "policy": "format_only",
      "sample": "6222000000000000",
      "riskLevel": "high",
      "confidence": 0.98,
      "needsReview": true,
      "reason": "锚点明确指向收款账号，样本值符合银行账号格式，但属于高风险字段。"
    },
    {
      "candidateId": "fc-payment-deadline-01",
      "accepted": true,
      "fieldId": "paymentDeadlineDays",
      "fieldType": "duration_days",
      "policy": "enum_mapping",
      "sample": "10个工作日",
      "riskLevel": "medium",
      "confidence": 0.87,
      "needsReview": false,
      "reason": "候选位于付款条款章节，语段语义明确指向付款期限。"
    }
  ]
}
```

### 5.6 字段识别结果示例

```json
{
  "fieldId": "partyAName",
  "anchors": {
    "zh": "委托方:",
    "ja": "委託者："
  },
  "sample": {
    "zh": "广州日产通商贸易有限公司",
    "ja": "広州日産通商貿易有限公司"
  },
  "type": "legal_entity_name",
  "policy": "dictionary_first",
  "confidence": 0.96
}
```

### 5.7 为什么不建议只做纯文本 Diff

纯文本 Diff 无法稳定处理以下问题：

- 同一行中多个变量并存
- 表格单元格内的字段
- 段落样式与位置关系
- 双语合同中一中一日的配对逻辑
- 样本文档相对空白模板存在小幅措辞变化

因此建议采用“结构化 IR 对齐 + 锚点匹配 + LLM 命名推断”的组合方案，而不是单纯字符串差异比对。

### 5.7.1 建议的识别优先级

为与 Excel 当前主链路保持一致，建议将第三步识别明确为 **AI 主驱动、规则强约束**。具体优先级如下：

1. AI 全局理解：先生成 `understandingSummary`，给后续所有块提供统一语义背景。
2. AI 块级识别：以章节/段落块/表格块为单位循环调用 AI，直接生成字段建议。
3. 规则增强提示：将显式结构特征、锚点规则、文本类型识别、语言块关系作为 prompt 输入和约束条件带给 AI。
4. 服务端规则校验：对 AI 返回结果执行术语命中、枚举命中、金额/日期/账号一致性等二次校验。
5. 失败回退：仅当单块或整批 AI 未成功返回可用结果时，才退回规则识别或启发式结果。

这样可以保证主流程与 Excel 一致，既让 AI 承担字段召回和语义判断的主要职责，又通过规则层控制结果稳定性和风险边界。

### 5.7.2 字段对齐算法设计

建议将字段对齐拆为“候选发现 -> 候选配对 -> 置信度打分 -> 冲突消解”四个步骤。

#### 步骤 A：候选发现

候选发现的输入是空白模板 `DocumentIR` 与样本文档 `DocumentIR`。

发现规则建议包括：

1. `blank token` 候选：下划线、连续空格、内容控件、明显占位区
2. 锚点候选：如 `委托方:`、`买方:`、`No.:`、`Dated:`、`Acceptance:`
3. 表格候选：表头下方的数据单元格、金额列、数量列、备注列
4. 枚举候选：复选框、单选项、括号选项，如 `一次或分期`
5. 重复模式候选：表格多行重复结构中的可变列

#### 步骤 B：候选配对

对空白模板候选位置，在样本文档中寻找最可能的真实值位置。建议综合以下信号：

- 前缀文本相似度
- 后缀文本相似度
- 所属章节相似度
- 所在块类型是否一致，例如 paragraph 对 paragraph、cell 对 cell
- 行列坐标是否相近
- 源语言与目标语言块的翻译关系

#### 步骤 C：置信度打分

建议采用加权评分模型而不是单一规则判断。

示例：

```text
score =
  0.30 * anchor_similarity +
  0.20 * section_similarity +
  0.20 * block_type_match +
  0.10 * position_similarity +
  0.10 * value_type_match +
  0.10 * bilingual_pair_confidence
```

其中：

- `anchor_similarity`：锚点文本相似度
- `section_similarity`：所在条款或标题匹配度
- `block_type_match`：是否同属段落、表格、单元格
- `position_similarity`：相对位置接近程度
- `value_type_match`：样本值是否符合公司名、金额、日期等预期类型
- `bilingual_pair_confidence`：跨语言块配对的可信度

#### 步骤 D：冲突消解

可能出现的问题包括：

- 一个空白位置匹配到多个样本值
- 一个样本值被多个字段候选引用
- 表格中同列内容重复导致误匹配

建议冲突消解规则：

1. 先选总分最高的候选
2. 若分差小于阈值，则标记为 `needs_review`
3. 高风险字段默认进入人工确认
4. 列表型字段允许多实例映射，不强制唯一

### 5.7.3 字段命名算法设计

字段命名不建议完全由 LLM 自由发挥，建议采用“规则候选 + 词典先验 + LLM 归一化”的方式。

#### 命名输入

- 锚点文本
- 样本值特征
- 所属条款标题
- 历史模板中相似字段
- 语言对照文本

#### 命名过程

1. 提取中文或源语言锚点关键词，如 `委托方`、`买方`、`交货地点`
2. 匹配字段命名词典，映射为标准 base name
3. 未命中时，再由 LLM 输出 1 到 3 个候选字段名
4. 使用命名规范器统一成 camelCase
5. 若字段名进入保留词或歧义集合，则进入人工确认

#### 命名词典示例

| 锚点关键词                | 标准字段名         |
| ------------------------- | ------------------ |
| 委托方 / 买方             | `partyAName`       |
| 受托方 / 卖方             | `partyBName`       |
| 合同编号 / No.            | `contractNo`       |
| 签订日期 / Dated          | `signingDate`      |
| 签订地点 / Executed at    | `signingPlace`     |
| 交货地点 / Delivery Place | `deliveryLocation` |

### 5.7.4 列表字段与表格字段识别

买卖合同样本说明，很多真实模板不是单值字段，而是列表字段。典型如：

- `items[].productName`
- `items[].model`
- `items[].quantity`
- `items[].unitPrice`
- `items[].totalPrice`

识别这类字段时应遵循：

1. 若表格存在双语表头配对，则优先把表头作为字段语义来源
2. 若同一列在多行重复出现，则该列应被建模为数组字段
3. 若表格中存在合计行、大写金额行，应识别为汇总字段，而不是普通列表项

建议输出示例：

```json
{
  "items": [
    {
      "productName_zh": "无线控制器",
      "productName_en": "Wireless Controller",
      "model": "WX2510X-PWR-LI",
      "quantity": 2,
      "unitPrice": 12000,
      "totalPrice": 24000
    }
  ],
  "totalAmount_zh": "人民币24,000.00元",
  "totalAmount_en": "CNY 24,000.00"
}
```

### 5.7.5 建议的失败回退策略

为了保证模板构建阶段可用，建议准备如下回退路径：

1. 若跨语言配对失败，则先只输出源语言字段候选
2. 若字段命名不稳定，则输出 `suggestedFieldNames`
3. 若表格结构过于复杂，则退化为单元格坐标 + 表头说明
4. 若文档污染严重，则要求用户重新上传更干净样本或进入手工标注模式

这样即使样本质量不理想，也不会导致整条链路完全不可用。

### 5.8 多样本增强模式

在单样本模式稳定后，可增强支持多样本导入：

- 上传 2 到 5 份结构相近的已签合同
- 对同一位置统计不同样本值
- 若某位置值随样本变化，则高概率为变量
- 若某位置值长期不变，则高概率为固定正文

该能力可显著提升变量发现与字段命名的准确率。

---

## 6. 人工确认与风控设计

### 6.1 为什么必须引入人工确认

合同属于高风险文档，以下字段不能完全依赖自动化结果直接落地：

- 公司法定名称
- 银行账号
- 金额与税率
- 付款比例与付款节点
- 争议解决与适用法律相关表述

因此系统应在模板保存前增加人工确认步骤。

### 6.2 确认页建议展示内容

- 字段名称建议
- 字段类型建议
- 中文样本值
- 日文或英文样本值
- 生成策略
- 置信度
- 是否命中术语库
- 是否允许运行时自动翻译

### 6.3 风控规则

建议增加以下规则：

1. 金额一致性校验：中文金额、日文金额、英文金额必须指向同一数值。
2. 名称一致性校验：公司名必须优先命中术语库。
3. 枚举合法性校验：付款方式、税率等必须属于预定义集合。
4. 缺失信息拦截：缺少关键信息时不得继续渲染。
5. 高风险字段二次确认：银行账号、金额、日期等要求用户确认。

---

## 7. 首批推荐字段清单

结合 `SJ6113_合同_日产通商贸易_无线设备更新_v2含服务规格书.docx` 与 `技术服务合同(销售)(中英文).docx`，建议优先识别并模板化以下字段：

### 7.1 主体信息

- `partyAName`
- `partyBName`
- `projectName`
- `serviceLocation`

### 7.2 金额与支付信息

- `serviceFeeTotal`
- `tax13Amount`
- `tax13NetAmount`
- `tax6Amount`
- `tax6NetAmount`
- `paymentMode`
- `paymentDeadlineDays`
- `bankAccount`

### 7.3 交付与验收信息

- `acceptanceDays`
- `deliveryLocation`
- `serviceScopeSummary`

### 7.4 语言派生字段

对于上述每个字段，按模板需要派生：

- `_zh`
- `_ja`
- `_en`

### 7.5 通用字段元数据建议

为了避免模板能力绑定到某个语言对，建议每个字段都补充通用元数据：

```json
{
  "fieldId": "partyAName",
  "type": "legal_entity_name",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja", "en"],
  "policy": "dictionary_first",
  "required": true,
  "riskLevel": "high",
  "layoutHints": {
    "bilingualLayoutType": "paired_paragraphs",
    "anchors": ["委托方:", "Entrusting Party:", "委託者："]
  }
}
```

这类元数据可用于：

- 运行时参数校验
- 模板编辑器展示
- 多语言渲染控制
- 高风险字段确认策略

---

## 8. DocumentIR -> Carbone 模板变量映射规则

### 8.1 映射目标

`DocumentIR` 解决的是“文档结构可分析”的问题，Carbone 模板变量解决的是“渲染时如何稳定取值”的问题。两者之间不能直接用一次性脚本硬拼，建议增加独立的“映射编译”层，目标如下：

1. 将文档结构变化与模板变量命名解耦。
2. 将字段识别结果沉淀为可复用的模板资产，而不是一次性推断结果。
3. 保证每个 Carbone 变量都可追溯到原始 `DocumentIR` 位置和字段定义。
4. 让单值字段、可选多语言字段、表格数组字段采用统一规则输出。

### 8.2 映射链路分层

建议将映射过程拆为四层：

1. `DocumentIR`：表达 Word 的结构、语言块、锚点和位置。
2. `FieldCandidateIR`：表达候选字段及其样本值、策略建议和置信度。
3. `TemplateFieldSpec`：表达经人工确认后的正式字段定义。
4. `CarboneBindingPlan`：表达最终模板变量路径、语言展开规则与格式化规则。

处理链路如下：

```text
DocumentIR
  -> 候选发现与对齐
FieldCandidateIR
  -> 命名归一化 / 人工确认 / 风险校验
TemplateFieldSpec
  -> 变量展开 / 路径编译 / 语言后缀生成
CarboneBindingPlan
  -> 运行时填充 JSON
Carbone Render Data
```

这意味着前端模板编辑器保存的，不应只是“字段名列表”，而应保存一份可编译的字段定义与绑定计划。

### 8.2.1 从识别结果到正式字段定义的转换

为了让“AI 参数识别 -> 字段确认 -> 保存模板”真正形成闭环，建议在 `FieldCandidateIR` 与正式 `TemplateFieldSpec` 之间增加一个前端可编辑中间层 `TemplateFieldSpecDraft`。

建议处理链路细化为：

```text
FieldCandidateIR / recognized fields
  -> 服务端合并与命名归一
RecognizedField
  -> 前端人工确认 / 风险处理 / 策略调整
TemplateFieldSpecDraft
  -> 保存前校验 / 编译
TemplateFieldSpec
```

其中：

1. `RecognizedField`：表示 `template/recognize` 返回给前端的最终识别结果，适合展示和确认，但还不是最终持久化对象。
2. `TemplateFieldSpecDraft`：表示前端确认页中可编辑、可保存前校验的草稿对象。
3. `TemplateFieldSpec`：表示通过确认和校验后的正式模板字段定义。

建议 `RecognizedField` 至少包含：

- `fieldId`
- `type`
- `policy`
- `required`
- `riskLevel`
- `sample`
- `confidence`
- `needsReview`
- `sourceBlockId`
- `sourceBindings` 或可转换出 `sourceBindings` 的锚点信息
- `termMatch`
- `warnings`

建议 `TemplateFieldSpecDraft` 至少包含：

```json
{
  "fieldId": "partyAName",
  "valueMode": "scalar",
  "type": "legal_entity_name",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja"],
  "policy": "dictionary_first",
  "required": true,
  "riskLevel": "high",
  "sourceBindings": [],
  "renderConfig": {
    "flattenForCarbone": true
  },
  "confirmation": {
    "confirmedByUser": true,
    "editedFromRecognizedField": false,
    "manualOverride": false
  }
}
```

保存前建议执行以下转换规则：

1. `template/recognize` 返回的 `fields` 先映射为 `TemplateFieldSpecDraft[]`，供前端确认页展示和编辑。
2. 用户修改 `fieldId`、`type`、`policy`、`required`、`targetLanguages`、`renderConfig` 后，只更新 draft，不直接改写识别原始结果。
3. 高风险字段若 `needsReview=true` 且未明确确认，不允许进入 `template/save`。
4. `sourceBindings` 若缺失但字段为人工新增，应在 draft 中显式标记 `manualOverride=true` 或等价来源标记。
5. 只有通过前端确认与保存前校验的 draft，才编译为正式 `TemplateFieldSpec` 并进入 `CarboneBindingPlan` 编译阶段。

### 8.3 `TemplateFieldSpec` 建议结构

建议在模板持久化时引入正式字段定义对象：

```json
{
  "fieldId": "partyAName",
  "valueMode": "scalar",
  "type": "legal_entity_name",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja", "en"],
  "policy": "dictionary_first",
  "required": true,
  "riskLevel": "high",
  "sourceBindings": [
    {
      "blockId": "p-0011",
      "tokenId": "t-2",
      "lang": "zh",
      "anchor": {
        "prefix": "委托方：",
        "suffix": "（下称甲方）"
      }
    }
  ],
  "renderConfig": {
    "flattenForCarbone": true,
    "includeCanonicalValue": false
  }
}
```

其中关键字段含义如下：

- `fieldId`：业务语义主键，整个模板内必须唯一。
- `valueMode`：标识该字段是 `scalar`、`object` 还是 `list`。
- `sourceBindings`：保留字段来源位置，便于后续回写、调试和人工复核。
- `renderConfig.flattenForCarbone`：指示是否要将嵌套对象展开成 Carbone 友好的扁平变量。

### 8.4 `CarboneBindingPlan` 建议结构

`CarboneBindingPlan` 是模板运行时真正使用的映射结果，建议编译后输出如下结构：

```json
{
  "templateId": "tpl_sj6113",
  "bindings": [
    {
      "fieldId": "partyAName",
      "variablePath": "partyAName_zh",
      "language": "zh",
      "valueSelector": "partyAName.zh",
      "transform": "identity",
      "required": true
    },
    {
      "fieldId": "partyAName",
      "variablePath": "partyAName_ja",
      "language": "ja",
      "valueSelector": "partyAName.ja",
      "transform": "identity",
      "required": true
    },
    {
      "fieldId": "serviceFeeTotal",
      "variablePath": "serviceFeeTotal_ja",
      "language": "ja",
      "valueSelector": "serviceFeeTotal.ja",
      "transform": "currency_format",
      "required": true
    }
  ]
}
```

建议把 `TemplateFieldSpec` 作为“可编辑真相源”，把 `CarboneBindingPlan` 作为“可执行产物”。这样后续若命名规则或语言包变化，只需重新编译绑定计划，无需重新解析 Word。

### 8.5 基础映射规则

#### 8.5.1 单值字段映射

对大多数合同基础字段，如主体名称、合同编号、签订日期、付款方式，建议采用“一个业务字段 + 多个语言变量”的映射方式：

```text
fieldId = partyAName
  -> partyAName_zh
  -> partyAName_ja
  -> partyAName_en
```

约束如下：

1. `fieldId` 只表达业务语义，不携带语言后缀。
2. Carbone 渲染变量统一在编译阶段追加语言后缀。
3. 如模板仅需要日文展示，也允许只输出 `partyAName_ja`，但 `TemplateFieldSpec` 仍保留完整语言信息。

#### 8.5.2 格式化字段映射

金额、日期、税率等字段不能仅保存字符串，建议保留“规范值 + 渲染值”双层结构。

示例：

```json
{
  "serviceFeeTotal": {
    "value": 137000,
    "currency": "CNY",
    "zh": "人民币137,000.00元",
    "ja": "人民元137,000.00元",
    "en": "CNY 137,000.00"
  }
}
```

编译规则如下：

1. 若字段 `policy=format_only`，则规范值必须先生成，再按语言包格式化。
2. Carbone 变量默认绑定展示值，如 `serviceFeeTotal_zh`。
3. 若模板中存在数值计算需求，可额外暴露 `serviceFeeTotal_value`、`serviceFeeTotal_currency`。

#### 8.5.3 枚举字段映射

付款方式、开票类型、交付方式等枚举字段建议始终使用“内部枚举码 + 多语言展示值”。

例如：

```json
{
  "paymentMode": {
    "code": "one_time",
    "zh": "一次支付",
    "ja": "一回払い",
    "en": "one-time payment"
  }
}
```

对应绑定：

- `paymentMode_code`
- `paymentMode_zh`
- `paymentMode_ja`
- `paymentMode_en`

这样既方便 Carbone 渲染，也便于运行时做规则判断和条件渲染。

### 8.6 列表与表格字段映射

对于买卖合同、报价单、服务清单等表格型模板，不能把所有单元格都映射为平铺变量，建议直接编译为数组结构。

#### 8.6.1 列表字段命名规则

建议规则：

1. 表格实体使用复数名，如 `items`、`products`、`deliverables`。
2. 列字段使用单数业务语义，如 `productName`、`quantity`、`unitPrice`。
3. 多语言列字段继续在列级追加语言后缀，如 `productName_zh`、`productName_en`。

示例：

```json
{
  "items": [
    {
      "productName_zh": "无线控制器",
      "productName_en": "Wireless Controller",
      "model": "WX2510X-PWR-LI",
      "quantity": 2,
      "unitPrice": 12000,
      "totalPrice": 24000
    }
  ]
}
```

#### 8.6.2 从 `DocumentIR` 到数组字段的识别条件

当满足以下条件时，建议编译为列表字段，而不是多个独立标量字段：

1. 相关块位于同一表格内。
2. 同一列在多行出现重复结构。
3. 表头或双语表头可稳定映射到列语义。
4. 行数据数量在样本中大于等于 2，或模板存在明显的重复行占位。

#### 8.6.3 Carbone 数组渲染约束

Carbone 模板在处理数组时，需要数据结构保持同构，因此编译时必须满足：

1. 同一数组中的每个对象字段集合一致。
2. 缺失值使用 `null` 或空字符串统一补齐。
3. 汇总行字段如 `totalAmount` 不应混入 `items[]`，而应拆到数组外。

### 8.7 语言对照块映射规则

在双语或多语言模板中，常见“中文块 + 日文块”或“中文块 + 英文块”的配对结构。建议映射层只保留一个业务字段，并将不同语言块绑定到同一个 `fieldId` 下。

示例：

```text
中文块 p-0011 -> fieldId=partyAName -> language=zh
日文块 p-0012 -> fieldId=partyAName -> language=ja
```

映射约束：

1. 同一 `fieldId` 下允许存在多个 `sourceBindings`，但语言不可重复。
2. 若目标语言块未在模板中出现，仍可由运行时派生对应变量。
3. 若源语言块和目标语言块内容不是简单翻译关系，而是法律表述重写，则应拆成两个字段，不能强制合并。

### 8.8 变量命名规范与冲突消解

为了保证模板长期可维护，建议统一约束变量命名。

#### 8.8.1 命名规范

1. 业务字段使用 `camelCase`，如 `partyAName`、`signingDate`。
2. 语言变量使用 `{fieldId}_{lang}`，如 `partyAName_ja`。
3. 规范值变量使用 `{fieldId}_value`、`{fieldId}_code`、`{fieldId}_currency`。
4. 列表字段避免使用 `field1`、`col2` 之类位置化名称。

#### 8.8.2 冲突处理

若出现两个候选字段都想命名为 `partyAName`，建议按以下顺序处理：

1. 优先使用锚点词典中的标准命名。
2. 若属于同一语义但不同语言，合并到同一 `fieldId`。
3. 若属于不同位置且语义不同，追加业务限定词，如 `partyANameBilling`、`partyANameSignatory`。
4. 若仍无法区分，进入人工确认，不允许自动落地。

### 8.9 映射示例

#### 8.9.1 输入：模板字段定义

```json
{
  "fields": [
    {
      "fieldId": "partyAName",
      "valueMode": "scalar",
      "type": "legal_entity_name",
      "targetLanguages": ["zh", "ja"],
      "policy": "dictionary_first"
    },
    {
      "fieldId": "items",
      "valueMode": "list",
      "itemSchema": ["productName", "model", "quantity", "unitPrice", "totalPrice"]
    }
  ]
}
```

#### 8.9.2 输出：Carbone 渲染数据

```json
{
  "partyAName_zh": "广州日产通商贸易有限公司",
  "partyAName_ja": "広州日産通商貿易有限公司",
  "items": [
    {
      "productName_zh": "无线控制器",
      "productName_ja": "無線コントローラ",
      "model": "WX2510X-PWR-LI",
      "quantity": 2,
      "unitPrice": 12000,
      "totalPrice": 24000
    }
  ],
  "totalAmount_zh": "人民币24,000.00元",
  "totalAmount_ja": "人民元24,000.00元"
}
```

#### 8.9.3 Carbone 模板引用方式

```text
{d.partyAName_zh}
{d.partyAName_ja}
{d.items[i].productName_zh}
{d.items[i].quantity}
{d.totalAmount_zh}
```

### 8.10 编译校验规则

在 `TemplateFieldSpec` 编译为 `CarboneBindingPlan` 时，建议执行以下校验：

1. 唯一性校验：`variablePath` 不允许重复。
2. 语言完整性校验：必填语言字段不可缺失。
3. 策略一致性校验：`dictionary_first` 字段必须有术语来源或人工确认。
4. 数组同构校验：列表项的字段集合必须一致。
5. 可追溯性校验：每个正式字段都必须能回溯到 `sourceBindings` 或人工新增记录。

### 8.11 失败回退与人工介入

映射编译阶段建议准备以下回退路径：

1. 若语言对照关系不稳定，则仅输出源语言变量，目标语言变量标记 `pending_generation`。
2. 若字段命名冲突无法消解，则保留 `suggestedFieldIds` 并阻塞发布。
3. 若表格列语义不稳定，则先输出 `items[].col1` 等临时映射，但必须要求人工重命名后才能保存为正式模板。
4. 若高风险字段缺乏术语命中或样本支撑，则直接进入确认页，不允许自动发布。

---

## 9. 字段词典/术语库设计

### 9.1 设计目标

字段词典/术语库并不是单纯的“翻译词表”，而是模板系统中所有高确定性字段的标准化资产层，主要承担以下职责：

1. 为 `dictionary_first` 字段提供稳定命中来源。
2. 为字段命名、字段类型识别、语言派生提供统一先验。
3. 为高风险字段提供可审计的标准值来源。
4. 为不同模板之间复用同一业务语义提供基础设施。

换句话说，`DocumentIR` 负责“看懂文档结构”，映射规则负责“编译成变量”，字段词典/术语库负责“保证字段值和字段名尽量不用猜”。

### 9.2 资产分层

建议不要把所有词典需求堆到一张表里，而是拆成四类资产：

1. 字段命名词典：解决锚点文本到标准 `fieldId` 的归一化。
2. 术语库：解决公司名、项目名、地点名、法务术语等标准表达映射。
3. 枚举映射表：解决付款方式、税率类型、交付方式等有限集合映射。
4. 格式规则库：解决日期、金额、税率、编号等字段的格式化约束。

对应关系如下：

```text
锚点文本 / 样本值
  -> 字段命名词典
  -> 标准 fieldId

标准 fieldId + source value
  -> 术语库 / 枚举映射 / 格式规则
  -> 多语言标准值
```

### 9.3 字段命名词典设计

字段命名词典主要服务于模板建模阶段，核心目标是把文档中的自然语言锚点统一映射为稳定的业务字段名。

#### 9.3.1 建议结构

```json
{
  "termId": "fn_001",
  "termType": "field_name",
  "canonicalFieldId": "partyAName",
  "aliases": ["委托方", "甲方", "买方", "Entrusting Party", "Buyer", "委託者"],
  "fieldType": "legal_entity_name",
  "applicableTemplates": ["service_contract", "sales_contract"],
  "riskLevel": "high",
  "status": "active",
  "version": 3
}
```

#### 9.3.2 使用方式

在字段识别阶段，建议按以下顺序命中：

1. 先用锚点前缀、后缀、章节标题抽取关键词。
2. 命中字典后直接得到 `canonicalFieldId` 和 `fieldType`。
3. 未命中时再由 LLM 生成候选名，并进入人工确认。

这样可以避免每次都让模型重新发明 `partyAName`、`contractNo` 这类基础字段。

### 9.4 术语库设计

术语库主要服务于运行时参数生成和模板分析回填，其目标不是覆盖所有句子翻译，而是优先解决“不能翻错”的高价值术语。

#### 9.4.1 术语分类建议

建议优先支持以下术语分类：

- `legal_entity_name`：公司法定名称、分公司名称
- `project_name`：项目正式名称、产品正式名称
- `geo_name`：地点、地址、交货地、签约地
- `legal_phrase`：法务固定短语、合同术语
- `organization_role`：委托方、受托方、买方、卖方

#### 9.4.2 建议结构

```json
{
  "termId": "tb_1001",
  "termType": "business_term",
  "category": "legal_entity_name",
  "sourceLanguage": "zh",
  "sourceValue": "广州日产通商贸易有限公司",
  "normalizedSourceValue": "广州日产通商贸易有限公司",
  "translations": {
    "ja": "広州日産通商貿易有限公司",
    "en": "Guangzhou Nissan Trading Co., Ltd."
  },
  "applicableFieldIds": ["partyAName", "partyBName"],
  "tenantScope": "global_or_tenant",
  "status": "approved",
  "version": 5
}
```

#### 9.4.3 关键约束

1. 术语库必须区分 `sourceValue` 和 `normalizedSourceValue`，便于去掉括号、空格、大小写、全半角差异。
2. 术语库必须记录适用字段，如 `partyAName`、`signingPlace`，避免同一中文词在不同字段误复用。
3. 高风险术语必须有 `approved` 状态，禁止把模型即席翻译直接写回正式术语库。

### 9.5 枚举映射表设计

很多合同字段并不是开放文本，而是有限集合。对这类字段，建议使用枚举映射表，而不是术语库。

#### 9.5.1 适用字段

- `paymentMode`
- `invoiceType`
- `deliveryMethod`
- `acceptanceMode`
- `taxRateType`

#### 9.5.2 建议结构

```json
{
  "enumName": "paymentMode",
  "items": [
    {
      "code": "one_time",
      "labels": {
        "zh": "一次支付",
        "ja": "一回払い",
        "en": "one-time payment"
      },
      "aliases": ["一次", "一次付款", "一次性支付"],
      "status": "active"
    },
    {
      "code": "installment",
      "labels": {
        "zh": "分期支付",
        "ja": "分割払い",
        "en": "installment payment"
      },
      "aliases": ["分期", "分次支付"],
      "status": "active"
    }
  ]
}
```

#### 9.5.3 与术语库的边界

建议遵循以下原则：

1. 可枚举、值域有限的字段放入枚举表。
2. 需要按企业标准名称映射的开放词项放入术语库。
3. 枚举字段命中后输出 `code + labels`，术语库字段命中后输出 `source + translations`。

### 9.6 格式规则库设计

金额、日期、税率、编号等字段虽然不一定依赖术语命中，但同样需要标准资产支撑，建议统一沉淀到格式规则库。

#### 9.6.1 适用场景

- 金额显示格式，如 `人民币137,000.00元`
- 英文金额格式，如 `CNY 137,000.00`
- 日期格式，如 `yyyy年MM月dd日`、`dd MMM yyyy`
- 编号格式，如 `SJ6113-2026-001`

#### 9.6.2 建议结构

```json
{
  "ruleId": "fmt_amount_cny_v1",
  "fieldType": "currency_amount",
  "currency": "CNY",
  "languageFormats": {
    "zh": "人民币{amount}",
    "ja": "人民元{amount}",
    "en": "CNY {amount}"
  },
  "decimalScale": 2,
  "thousandSeparator": true,
  "status": "active",
  "version": 1
}
```

### 9.7 命中优先级与回退策略

为了避免同一字段在不同链路下输出不一致，建议明确标准命中顺序。

#### 9.7.1 运行时值生成优先级

对 `dictionary_first` 或 `enum_mapping` 字段，建议优先级如下：

1. 人工确认值
2. 模板级覆盖词典
3. 租户级术语库 / 枚举表
4. 全局术语库 / 枚举表
5. 受控 LLM 生成
6. 标记 `needs_review`

#### 9.7.2 模板建模阶段命名优先级

1. 模板级字段命名词典
2. 全局字段命名词典
3. 历史相似模板先验
4. LLM 候选命名
5. 人工确认

这个顺序的核心是：越接近当前模板上下文的资产优先级越高，模型推断永远放在最后。

### 9.8 多层作用域设计

字段词典/术语库建议至少支持三层作用域：

1. `global`：平台全局公共术语，如通用法务词、通用字段名。
2. `tenant`：企业私有术语，如客户公司名、内部项目名。
3. `template`：单模板局部覆盖，如该模板中特定字段的固定译法。

命中时建议遵循：

```text
template > tenant > global
```

这样既能保证公共复用，又允许企业和模板进行精细覆盖。

### 9.9 版本与发布策略

术语资产是运行时关键依赖，不建议“改完立即生效”，应采用可追溯版本策略。

#### 9.9.1 建议字段

- `version`
- `status`
- `effectiveAt`
- `updatedBy`
- `reviewedBy`
- `changeReason`

#### 9.9.2 状态机建议

```text
draft -> reviewed -> approved -> active -> deprecated
```

约束如下：

1. 高风险字段相关术语必须至少经过 `reviewed` 后才能参与测试环境运行。
2. 进入生产环境的术语建议要求 `approved`。
3. 已发布模板应记录所依赖的术语版本，避免同一模板渲染结果随时间漂移。

### 9.10 来源追踪与审计

字段词典/术语库一旦参与运行时生成，建议在返回结果中保留来源信息，便于风控和人工核验。

#### 9.10.1 建议返回结构

```json
{
  "partyAName": {
    "zh": "广州日产通商贸易有限公司",
    "ja": "広州日産通商貿易有限公司",
    "sourceTrace": {
      "resolution": "dictionary_hit",
      "termId": "tb_1001",
      "termVersion": 5,
      "scope": "tenant"
    }
  }
}
```

#### 9.10.2 审计收益

- 可解释为什么某个字段采用该译法
- 可快速定位术语错误来自哪一层资产
- 可支持模板回放和问题复盘

### 9.11 与接口和映射层的衔接

字段词典/术语库不应孤立设计，建议与前文两个核心对象直接打通：

1. `TemplateFieldSpec.policy` 决定字段是走术语、枚举还是格式规则。
2. `CarboneBindingPlan` 只消费最终标准值，不直接关心词典命中细节。
3. 运行时接口除返回 `data` 外，建议可选返回 `sourceTrace` 和 `warnings`。
4. 模板分析接口返回字段建议时，建议标记 `termMatchStatus`、`matchedTermId`、`matchedScope`。

建议在字段分析结果中增加如下信息：

```json
{
  "fieldId": "partyAName",
  "type": "legal_entity_name",
  "policy": "dictionary_first",
  "termMatch": {
    "status": "matched",
    "termId": "tb_1001",
    "scope": "tenant",
    "confidence": 1.0
  }
}
```

### 9.12 P0 落地边界建议

如果从 P0 控制实现复杂度，建议优先只做以下最小闭环：

1. 支持字段命名词典、术语库、枚举表三类资产。
2. 仅支持 `global + tenant` 两层作用域，先不做 `template` 局部覆盖。
3. 仅支持中日双语必需字段，如公司名、项目名、付款方式、签约地点。
4. 接口先返回 `matchedTermId` 和 `resolution`，暂不开放完整审计查询页。
5. 术语录入先走后台管理或配置文件导入，不要求前台自助运营。

这样可以先把 `dictionary_first` 真正落地，而不是停留在策略标签层面。

---

## 10. 接口时序图

### 10.1 设计说明

为避免接口定义和实现链路脱节，建议至少明确三条主时序：

1. 模板建模链路：用于从空白模板和真实样本生成字段定义。
2. 运行时生成链路：用于从中文输入生成 Carbone 渲染数据。
3. 异常回退链路：用于处理术语未命中、字段缺失、人工确认等场景。

以下时序图使用文本方式表达，便于直接放入设计稿和研发任务说明中。

### 10.2 模板建模链路时序图

适用场景：用户在 Add-in 中打开空白模板，并上传 1 份真实历史样本，希望系统产出字段建议结果并保存模板定义。

```text
参与方:
User
Word Add-in
AI Orchestrator
Template Analysis Service
Termbase Service
Template Metadata Store

1. User -> Word Add-in
   打开空白模板，触发“模板分析”

2. Word Add-in -> Word Add-in
   读取当前文档结构，生成 templateDocumentIr

3. User -> Word Add-in
   上传真实样本文档 sample.docx

4. User -> Word Add-in
   触发“模板对比”

5. Word Add-in -> Template Analysis Service
   POST /template/compare
   body = { templateDocumentIr, sampleDocument }

6. Template Analysis Service -> Template Analysis Service
   先执行模板与样本的结构化预处理
   解析 templateDocumentIr / sampleDocumentIr
   执行结构化对齐与差异比对
   生成待定参数候选池

7. Template Analysis Service -> Word Add-in
   返回 candidateFields / compareSummary / warnings

8. User -> Word Add-in
   基于真实原文与待定参数候选触发“AI 全局理解”

9. Word Add-in -> Template Analysis Service
   POST /template/understand
   body = { templateDocumentIr, sampleDocument, candidateFields }

10. Template Analysis Service -> AI Orchestrator
    基于“真实原文 + 待定参数候选池 + 结构线索”调用 AI 生成整体理解摘要、章节摘要与实体关系信息

11. AI Orchestrator -> Template Analysis Service
    返回 understandingSummary / sectionSummaries / entityGraph / warnings

12. Template Analysis Service -> Word Add-in
    返回整体理解结果

13. User -> Word Add-in
    基于整体理解结果补充 sourceLanguage / targetLanguages / documentMode

14. User -> Word Add-in
    触发“AI 参数识别”

15. Word Add-in -> Template Analysis Service
    POST /template/recognize
    body = { templateDocumentIr, sampleDocument, candidateFields, understandingSummary, languageProfile }

16. Template Analysis Service -> Template Analysis Service
    若“模板 + 样本 + candidateFields”存在可复用缓存，则直接加载 understandingSummary
    否则继续使用当前请求携带的整体理解结果
    按章节切分文档块
    为每个章节块组装候选、锚点、术语和布局提示

17. Template Analysis Service -> AI Orchestrator
    对每个章节块发送“整体理解摘要 + 当前章节摘要 + 候选池 + 当前块上下文 + 语言配置”
    循环生成字段建议

18. AI Orchestrator -> Template Analysis Service
    返回块级字段建议和块级调试信息

19. Template Analysis Service -> Termbase Service
    查询字段命名词典、术语库、枚举表

20. Termbase Service -> Template Analysis Service
    返回 matchedFieldId / termMatch / enumMatch

21. Template Analysis Service -> Template Analysis Service
    合并块级结果
    执行字段去重、命名归一、风险标记与规则校验
    记录 blockResults / retryCount / fallback / contextAnalysis
    必要时使用规则结果做兜底补全

22. Template Analysis Service -> Word Add-in
    返回字段建议:
    { fields, blockResults, contextAnalysis, confidence, termMatch, warnings }

23. User -> Word Add-in
    人工确认字段名、字段类型、策略、必填项

24. Word Add-in -> Word Add-in
    应用参数到当前模板预览态
    生成 AI 指南草稿

25. Word Add-in -> AI Orchestrator
    POST /template/save
    body = { templateId?, templateDocumentIr, templateFieldSpecs, languageProfile }

26. AI Orchestrator -> Template Metadata Store
    保存 TemplateFieldSpec 和模板元数据
    编译 CarboneBindingPlan

27. AI Orchestrator -> Word Add-in
    返回保存成功、模板 ID、AI 指南引用与可预览状态
```

#### 10.2.1 关键说明

1. `templateDocumentIr` 应以前端实时提取结果为准，避免后端再次猜测模板结构。
2. Word 端应先完成模板对比并形成待定参数候选池，再执行 AI 全局理解，避免理解阶段缺少候选上下文。
3. 语言配置应建立在整体理解结果之上，而不是在理解前先验写死。
4. 第五步返回结果应同时包含 `fields` 与 `blockResults`，便于前端展示 AI 主流程和块级失败回退。
5. `contextAnalysis` 至少应覆盖缓存命中、块级调用、重试次数、fallback 原因和原始响应片段。
6. 模板保存时应持久化 `TemplateFieldSpec`，而不是只保存平铺变量名列表。

### 10.3 运行时生成链路时序图

适用场景：用户基于已保存模板输入中文业务描述，系统按模板配置生成单语言或中日双语渲染数据，并调用 Carbone 输出文档。

```text
参与方:
User
Word Add-in / Business UI
AI Orchestrator
Runtime Generation Service
Template Metadata Store
Termbase Service
Carbone Engine

1. User -> Word Add-in / Business UI
   输入中文业务描述并选择模板

2. Word Add-in / Business UI -> AI Orchestrator
   POST /template/render-data
   body = { templateId, userInput, targetLanguages }

3. AI Orchestrator -> Template Metadata Store
   加载 TemplateFieldSpec 和 CarboneBindingPlan

4. Template Metadata Store -> AI Orchestrator
   返回模板字段定义和绑定计划

5. AI Orchestrator -> Runtime Generation Service
   下发生成任务:
   { userInput, templateFieldSpecs, targetLanguages }

6. Runtime Generation Service -> Runtime Generation Service
   抽取中文主字段
   识别缺失字段
   生成 canonical values

7. Runtime Generation Service -> Termbase Service
   查询术语库、枚举表、格式规则

8. Termbase Service -> Runtime Generation Service
   返回 termMatch / enumMatch / formatRule

9. Runtime Generation Service -> Runtime Generation Service
   生成 zh/ja 字段值
   执行金额、日期、名称一致性校验
   产出 renderData + warnings + missingFields

10. Runtime Generation Service -> AI Orchestrator
    返回渲染数据和校验结果

11. AI Orchestrator -> Carbone Engine
    提交模板和 renderData

12. Carbone Engine -> AI Orchestrator
    返回渲染结果文档

13. AI Orchestrator -> Word Add-in / Business UI
    返回文档下载地址或二进制流，以及 warnings / missingFields
```

#### 10.3.1 关键说明

1. 运行时服务应优先基于 `TemplateFieldSpec` 限定输出字段范围，避免自由发挥。
2. `CarboneBindingPlan` 应在模板保存后预编译，运行时直接消费，减少临时拼装成本。
3. 若 `missingFields` 非空，应允许前端先阻断渲染或提示补充输入。

### 10.4 异常回退与人工确认时序图

适用场景：术语未命中、字段值冲突、关键字段缺失或高风险字段需要人工确认。

```text
参与方:
User
Word Add-in / Business UI
AI Orchestrator
Runtime Generation Service
Termbase Service
Review Queue / Manual Review

1. Runtime Generation Service -> Termbase Service
   查询高风险字段术语

2. Termbase Service -> Runtime Generation Service
   返回未命中或命中冲突

3. Runtime Generation Service -> Runtime Generation Service
   识别以下情况:
   - dictionary_first 未命中
   - 金额或日期冲突
   - 银行账号缺失
   - 多候选字段分差过小

4. Runtime Generation Service -> AI Orchestrator
   返回:
   { warnings, missingFields, needsReviewFields }

5. AI Orchestrator -> Word Add-in / Business UI
   展示待确认字段和风险说明

6. User -> Word Add-in / Business UI
   补充字段值或确认建议值

7. Word Add-in / Business UI -> AI Orchestrator
   提交人工确认后的字段值

8. AI Orchestrator -> Runtime Generation Service
   重新执行字段校验和渲染数据生成

9. 若仍失败:
   AI Orchestrator -> Review Queue / Manual Review
   记录异常模板或异常术语问题

10. 若成功:
    AI Orchestrator -> 后续渲染链路
```

#### 10.4.1 关键说明

1. `dictionary_first` 字段未命中时，不应静默降级为自由翻译。
2. 高风险字段应优先进入 `needsReviewFields`，而不是自动继续渲染。
3. 人工确认后的值建议保留 `sourceTrace=manual_override`，便于后续审计。

### 10.5 P0 建议落地图

若按 P0 范围落地，建议优先打通以下最短路径：

1. 模板建模链路中的“上传样本 -> 对比候选发现 -> AI 全局理解 -> 语言补充 -> AI 参数识别 -> 保存模板”主分支。
2. 运行时生成链路的步骤 1 到 13。
3. 异常回退链路中“未命中 -> 前端确认 -> 重新生成”的主分支。

P0 可暂缓内容：

- Review Queue 的独立后台工作台
- 多模板并行分析
- 多样本聚合对齐
- 复杂审批流

---

## 11. 系统接口建议

### 11.1 模板建模阶段接口概览

为了严格落地“上传真实 Word -> 对比 -> 全局理解 -> 用户补充语言 -> 按章节识别”的主流程，模板建模阶段建议至少拆成以下接口：

1. `POST /template/compare`
   - 输入：`workflowId + templateDocumentIr + sampleDocument`
   - 输出：`workflowId + compareId + candidateFields + compareSummary`
   - 用途：生成待定参数候选、位置、语段和章节归属
2. `POST /template/understand`
   - 输入：`workflowId + templateDocumentIr + sampleDocument + candidateFields`
   - 输出：`workflowId + understandingId + understandingSummary + sectionSummaries + entityGraph`
   - 用途：基于真实原文和候选池做 AI 全局理解
3. `POST /template/recognize`
   - 输入：`workflowId + templateDocumentIr + sampleDocument + candidateFields + understandingSummary + languageProfile`
   - 输出：`workflowId + analysisId + fields + blockResults + contextAnalysis`
   - 用途：按章节执行 AI 参数识别

### 11.1.1 异步任务协议建议

为匹配前文的分阶段进度展示与块级识别过程，建议 `compare`、`understand`、`recognize` 三个接口都支持异步提交模式。

建议最小接口集合如下：

1. `POST /template/compare`
   - 支持同步直返结果，或返回 `{ workflowId, jobId, accepted: true }`
2. `POST /template/understand`
   - 支持同步直返结果，或返回 `{ workflowId, jobId, accepted: true }`
3. `POST /template/recognize`
   - 支持同步直返结果，或返回 `{ workflowId, jobId, accepted: true }`
4. `GET /template/jobs/{jobId}`
   - 返回任务状态、阶段进度、块级进度、最近告警与结果摘要
5. `POST /template/jobs/{jobId}/cancel`
   - 取消仍在执行中的任务

P0 如需控制复杂度，建议至少实现：

1. `recognize` 采用异步任务模式
2. `compare`、`understand` 允许先保留同步模式，但接口层预留 `jobId` 扩展位
3. 前端统一按“若返回 `jobId` 则轮询，否则按同步结果处理”的方式实现

### 11.1.2 任务状态与进度字段建议

建议所有异步任务统一返回如下最小结构：

```json
{
  "jobId": "job_rec_001",
  "workflowId": "wf_001",
  "step": "recognize",
  "status": "running",
  "resultStatus": null,
  "progressPercent": 42,
  "currentStageText": "正在识别付款条款",
  "blockProgress": {
    "totalBlocks": 12,
    "completedBlocks": 5,
    "failedBlocks": 1,
    "runningBlockId": "block_006",
    "runningBlockTitle": "付款条款"
  },
  "warnings": [],
  "resultPreview": {
    "fieldCount": 8,
    "lastCompletedBlockId": "block_005"
  },
  "error": null
}
```

建议约束：

1. `status=queued/running` 时，`resultPreview` 可返回阶段性摘要，但不返回最终可保存的 `fields`。
2. `status=succeeded` 时，`GET /template/jobs/{jobId}` 可返回最终结果，或返回可获取最终结果的 `analysisId/compareId/understandingId`。
3. `status=failed` 时，`error` 应至少包含 `code`、`message`、`retryable`。
4. `status=cancelled` 时，不应再写入新的阶段结果，也不应覆盖前端现有成功缓存。

这里建议显式区分 `status` 与 `resultStatus`：

1. `status` 表示任务执行态，只描述任务是否还在跑、是否结束、是否失败或取消。
2. `resultStatus` 表示任务结果态，仅在 `status=succeeded` 时出现，用于表达结果质量。
3. 建议 `resultStatus` 取值为：
   - `success`：全部关键块成功，结果可直接进入下一步
   - `partial_success`：存在块失败、局部 fallback 或需人工关注，但仍产出了可用结果
   - `fallback_success`：AI 主流程整体失败或大面积失败，最终主要依赖规则/启发式结果产出

推荐语义边界如下：

1. 若任务本身执行完成，且已经返回可展示、可确认的 `fields`，则 `status` 应为 `succeeded`，即使其中包含失败块。
2. 若仅部分块失败，但系统已合并出可用识别结果，则使用 `status=succeeded + resultStatus=partial_success`，而不是 `status=failed`。
3. 若 AI 主流程不可用，但规则 fallback 成功产出结果，则使用 `status=succeeded + resultStatus=fallback_success`，并在 `contextAnalysis.fallback` 中说明来源。
4. 只有当任务没有产出可用阶段结果，且前端无法进入下一步时，才使用 `status=failed`。
5. 前端按钮是否允许继续，建议由 `status + resultStatus + warnings + needsReview` 共同决定，而不是只看 `status`。

### 11.2 运行时参数生成接口

```json
{
  "templateId": "tpl_sj6113",
  "userInput": "甲方是广州日产通商贸易有限公司，项目是无线网络设备更新，付款方式是一次支付。",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja"]
}
```

返回：

```json
{
  "data": {
    "partyAName_zh": "广州日产通商贸易有限公司",
    "partyAName_ja": "広州日産通商貿易有限公司",
    "projectName_zh": "无线网络设备更新",
    "projectName_ja": "無線ネットワーク設備更新",
    "paymentMode_zh": "一次支付",
    "paymentMode_ja": "一回払い"
  },
  "warnings": [],
  "missingFields": []
}
```

### 11.3 P0 接口 DTO 最小定义

为了避免 P0 开发阶段因接口字段反复变动导致联调成本上升，建议先冻结以下最小 DTO 集合。

#### 11.3.1 `POST /template/compare`

请求体建议：

```json
{
  "workflowId": "wf_001",
  "templateId": "optional_for_update",
  "templateDocumentIr": {},
  "sampleDocument": {
    "fileName": "合同_已签_2023.docx",
    "contentBase64": "..."
  },
  "options": {
    "includeAnchorPosition": true,
    "includeSegmentText": true,
    "groupBySection": true
  }
}
```

返回体建议：

```json
{
  "workflowId": "wf_001",
  "compareId": "cmp_001",
  "candidateFields": [
    {
      "candidateId": "fc_001",
      "sourceBlockId": "p-0032",
      "anchorText": "乙方指定银行帐号为：",
      "sampleValue": "6222000000000000",
      "segmentText": "乙方指定银行帐号为：6222000000000000",
      "sectionId": "sec-payment-001",
      "sectionTitle": "付款条款",
      "fieldTypeHint": "bank_account",
      "confidence": 0.95
    }
  ],
  "compareSummary": {
    "candidateCount": 12,
    "sectionCount": 5,
    "warnings": []
  },
  "cacheStatus": {
    "compareHit": false
  }
}
```

#### 11.3.2 `POST /template/understand`

请求体建议：

```json
{
  "workflowId": "wf_001",
  "templateId": "optional_for_update",
  "templateDocumentIr": {},
  "sampleDocument": {
    "fileName": "合同_已签_2023.docx",
    "contentBase64": "..."
  },
  "candidateFields": [],
  "options": {
    "enableEntityGraph": true,
    "enableSectionSummary": true,
    "enableTerminologyHints": true
  }
}
```

返回体建议：

```json
{
  "workflowId": "wf_001",
  "understandingId": "und_001",
  "understandingSummary": {
    "documentTitle": "技术服务合同",
    "understandingSummaryText": "这是一份以服务范围、付款和验收为核心的合同模板。",
    "sectionHints": ["合同头部", "付款条款", "验收"],
    "terminologyCandidates": ["项目名称", "付款方式"],
    "layoutFeatures": ["paired_paragraphs", "tables:2"]
  },
  "sectionSummaries": [
    {
      "sectionId": "sec-payment-001",
      "sectionTitle": "付款条款",
      "summary": "本章节主要涉及付款方式、付款期限和收款账户。"
    }
  ],
  "entityGraph": {
    "entities": ["甲方", "乙方", "项目名称", "付款方式", "银行账号"],
    "relations": ["甲方-付款给-乙方", "付款方式-约束-付款期限"]
  },
  "warnings": [],
  "cacheStatus": {
    "understandingHit": false
  }
}
```

#### 11.3.3 `POST /template/recognize`

请求体建议：

```json
{
  "workflowId": "wf_001",
  "templateId": "optional_for_update",
  "templateDocumentIr": {},
  "sampleDocument": {
    "fileName": "合同_已签_2023.docx",
    "contentBase64": "..."
  },
  "candidateFields": [],
  "understandingSummary": {
    "documentTitle": "技术服务合同",
    "understandingSummaryText": "这是一份中日双语技术服务合同，已识别出合同头部、服务内容、付款条款、验收等主要章节。",
    "sectionHints": ["技术服务合同", "验收"],
    "terminologyCandidates": ["项目名称", "付款方式"],
    "layoutFeatures": ["paired_paragraphs", "tables:2"]
  },
  "languageProfile": {
    "sourceLanguage": "zh",
    "targetLanguages": ["ja"],
    "documentMode": "single_or_bilingual"
  },
  "options": {
    "enableTermMatch": true,
    "enableLayoutDetection": true,
    "enableAiRecognition": true
  }
}
```

返回体建议：

```json
{
  "workflowId": "wf_001",
  "analysisId": "ana_001",
  "languageProfile": {
    "sourceLanguage": "zh",
    "targetLanguages": ["ja"],
    "documentMode": "single_or_bilingual"
  },
  "fields": [
    {
      "fieldId": "partyAName",
      "type": "legal_entity_name",
      "policy": "dictionary_first",
      "required": true,
      "sample": {
        "zh": "广州日产通商贸易有限公司",
        "ja": "広州日産通商貿易有限公司"
      },
      "termMatch": {
        "status": "matched",
        "termId": "tb_1001",
        "scope": "tenant"
      },
      "confidence": 0.96,
      "needsReview": false,
      "sourceBlockId": "block_001"
    }
  ],
  "blockResults": [
    {
      "blockId": "block_001",
      "blockType": "paired_paragraphs",
      "title": "合同头部与主体信息",
      "sectionId": "sec-header-001",
      "sectionTitle": "合同头部",
      "aiCallSucceeded": true,
      "resultStatus": "success",
      "suggestionCount": 3,
      "retryCount": 1,
      "durationMs": 2840,
      "errorCode": null,
      "fallback": null,
      "fallbackReason": null,
      "warnings": []
    }
  ],
  "contextAnalysis": {
    "usedAI": true,
    "globalUnderstandingUsedAI": true,
    "resultSource": "ai+rule_fallback",
    "requestTrace": {
      "executor": "studio",
      "promptTemplateVersion": "word-recognize-v2",
      "requestCount": 12,
      "lastRequestSummary": "当前块为合同头部与主体信息，候选数 3"
    },
    "responseTrace": {
      "successBlockCount": 11,
      "failedBlockCount": 1,
      "lastResponseSummary": "最近一次返回 3 个字段建议"
    },
    "fallbackTrace": {
      "usedFallback": false,
      "fallbackLevel": null,
      "fallbackReason": null,
      "fallbackBlockIds": []
    },
    "cacheTrace": {
      "compareHit": false,
      "understandingHit": true,
      "recognitionHit": false
    },
    "debugArtifacts": {
      "promptRequestText": "当前块的 AI 请求原文",
      "rawAiResponse": "当前块的 AI 原始返回"
    }
  },
  "warnings": [],
  "cacheStatus": {
    "recognitionHit": false
  }
}
```

P0 必填字段建议：

- `workflowId`
- `templateDocumentIr`
- `sampleDocument.contentBase64`
- `candidateFields`
- `understandingSummary`
- `languageProfile.sourceLanguage`

P0 可选字段建议：

- `templateId`
- `options`

返回体补充约束建议：

1. `fields` 为最终合并后的字段建议，供前端确认表格直接消费。
2. `blockResults` 用于展示块级进度、块级召回情况和失败定位，不直接作为最终保存结构。
3. `contextAnalysis` 应至少拆分为 `requestTrace`、`responseTrace`、`fallbackTrace`、`cacheTrace`、`debugArtifacts` 五个子结构。
4. `debugArtifacts.promptRequestText` 与 `debugArtifacts.rawAiResponse` 至少应保留最近一次有效块级调用内容，便于调试。
5. 若 AI 调用失败但规则兜底产出结果，应通过 `contextAnalysis.fallbackTrace` 明确说明。
6. `blockResults` 中应至少补齐 `resultStatus`、`retryCount`、`durationMs`、`errorCode`、`fallbackReason`，便于前端调试面板和后端观测统一消费。

#### 11.3.3.1 `GET /template/jobs/{jobId}`

返回体建议：

```json
{
  "jobId": "job_rec_001",
  "workflowId": "wf_001",
  "step": "recognize",
  "status": "running",
  "resultStatus": null,
  "progressPercent": 42,
  "currentStageText": "正在识别付款条款",
  "blockProgress": {
    "totalBlocks": 12,
    "completedBlocks": 5,
    "failedBlocks": 1,
    "runningBlockId": "block_006",
    "runningBlockTitle": "付款条款",
    "lastCompletedBlockId": "block_005"
  },
  "warnings": [],
  "error": null
}
```

P0 建议约束：

1. 至少支持查询 `recognize` 任务进度。
2. `progressPercent` 建议由块级完成比例和阶段内固定步骤共同计算，不要求绝对精确，但应单调递增。
3. 若任务已完成，允许在同一个查询接口中附带最终 `analysisId` 或最终 `fields` 摘要。
4. 若任务已完成且存在局部失败，应返回 `status=succeeded` 与 `resultStatus=partial_success`，并在 `blockProgress` 或 `warnings` 中说明失败块。

#### 11.3.3.2 `POST /template/jobs/{jobId}/cancel`

请求体建议：

```json
{
  "workflowId": "wf_001",
  "reason": "user_reupload_sample_or_change_language"
}
```

返回体建议：

```json
{
  "jobId": "job_rec_001",
  "workflowId": "wf_001",
  "status": "cancelled"
}
```

P0 建议约束：

1. 至少支持取消仍处于 `queued/running` 的 `recognize` 任务。
2. 取消成功后，不应再回写新的块级识别结果。
3. 若任务已结束，再调用取消接口应返回幂等结果，而不是报系统异常。

#### 11.3.4 `POST /template/save`

请求体建议：

```json
{
  "templateId": "tpl_sj6113",
  "templateMeta": {
    "templateName": "技术服务合同-日产通商",
    "sourceLanguage": "zh",
    "targetLanguages": ["ja"],
    "documentMode": "single_or_bilingual"
  },
  "templateDocumentIr": {},
  "templateFieldSpecs": [],
  "saveMode": "draft_or_publish"
}
```

返回体建议：

```json
{
  "templateId": "tpl_sj6113",
  "version": 3,
  "bindingPlanVersion": 3,
  "status": "draft",
  "updatedAt": "2026-05-21T10:00:00Z"
}
```

P0 约束建议：

1. `templateFieldSpecs` 不能为空。
2. `templateMeta.sourceLanguage` 必填。
3. 若 `targetLanguages` 为空，则按单语言模板处理。
4. `saveMode=publish` 时必须先通过基础校验。
5. `templateFieldSpecs` 应来自字段确认后的 `TemplateFieldSpecDraft[]`，而不是直接把 `template/recognize` 的原始 `fields` 不加转换地透传保存。

#### 11.3.5 `POST /template/render-data`

请求体建议：

```json
{
  "templateId": "tpl_sj6113",
  "userInput": "甲方是广州日产通商贸易有限公司，项目是无线网络设备更新，付款方式是一次支付。",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja"],
  "userOverrides": {
    "bankAccount": "6222000000000000"
  }
}
```

返回体建议：

```json
{
  "data": {
    "partyAName_zh": "广州日产通商贸易有限公司",
    "partyAName_ja": "広州日産通商貿易有限公司",
    "paymentMode_zh": "一次支付",
    "paymentMode_ja": "一回払い"
  },
  "sourceTrace": {
    "partyAName": {
      "resolution": "dictionary_hit",
      "termId": "tb_1001"
    },
    "paymentMode": {
      "resolution": "enum_hit",
      "enumName": "paymentMode"
    }
  },
  "warnings": [],
  "missingFields": [],
  "needsReviewFields": []
}
```

P0 约束建议：

1. `templateId`、`userInput` 必填。
2. `targetLanguages` 可为空，为空时只输出单语言渲染数据。
3. 高风险字段若被 `userOverrides` 覆盖，需在 `sourceTrace` 中标记 `manual_override`。

### 11.4 P0 持久化对象最小定义

P0 不建议一开始就设计过多表结构，建议只固化 4 类核心持久化对象。

#### 11.4.1 `TemplateMeta`

建议保存模板基础元数据：

```json
{
  "templateId": "tpl_sj6113",
  "templateName": "技术服务合同-日产通商",
  "status": "draft",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja"],
  "documentMode": "single_or_bilingual",
  "currentVersion": 3,
  "bindingPlanVersion": 3,
  "createdBy": "u_001",
  "updatedBy": "u_001",
  "createdAt": "2026-05-21T10:00:00Z",
  "updatedAt": "2026-05-21T10:00:00Z"
}
```

最小字段建议：

- `templateId`
- `templateName`
- `status`
- `sourceLanguage`
- `targetLanguages`
- `currentVersion`

#### 11.4.2 `TemplateDocumentSnapshot`

建议保存模板解析快照，便于后续重编译和问题回放：

```json
{
  "templateId": "tpl_sj6113",
  "version": 3,
  "templateDocumentIr": {},
  "rawFileRef": "oss://templates/tpl_sj6113/v3.docx"
}
```

P0 约束建议：

1. 至少保存当前有效版本的 `templateDocumentIr`。
2. `rawFileRef` 可为对象存储路径，也可为内部文件 ID。

#### 11.4.3 `TemplateFieldSpec`

该对象已在前文定义，P0 持久化时建议最少保存以下字段：

```json
{
  "templateId": "tpl_sj6113",
  "version": 3,
  "fieldId": "partyAName",
  "valueMode": "scalar",
  "type": "legal_entity_name",
  "sourceLanguage": "zh",
  "targetLanguages": ["ja"],
  "policy": "dictionary_first",
  "required": true,
  "riskLevel": "high",
  "sourceBindings": [],
  "renderConfig": {
    "flattenForCarbone": true
  }
}
```

P0 最小约束建议：

1. `(templateId, version, fieldId)` 必须唯一。
2. `sourceBindings` 可以为空，但为空时应标记来源是人工新增。
3. `policy`、`type`、`required` 必须可持久化，不能只存在前端内存中。

#### 11.4.4 `CarboneBindingPlan`

建议将编译产物也持久化，避免每次渲染临时重新编译：

```json
{
  "templateId": "tpl_sj6113",
  "version": 3,
  "bindings": [
    {
      "fieldId": "partyAName",
      "variablePath": "partyAName_zh",
      "valueSelector": "partyAName.zh",
      "language": "zh",
      "transform": "identity"
    }
  ]
}
```

P0 最小约束建议：

1. `CarboneBindingPlan` 与 `TemplateFieldSpec` 使用同一版本号。
2. 当字段定义变更时，必须重新编译并覆盖绑定计划。
3. 若模板保存失败，不应写入半成品绑定计划。

#### 11.4.5 版本关系建议

P0 可先采用简单版本关系：

```text
TemplateMeta.currentVersion
  -> TemplateDocumentSnapshot.version
  -> TemplateFieldSpec.version
  -> CarboneBindingPlan.version
```

即同一个模板版本下，文档快照、字段定义和绑定计划始终保持同版，避免 P0 阶段出现跨版本引用复杂度。

### 11.5 推荐模块职责划分

为降低后续多人并行开发时的耦合风险，建议按“前端交互层 -> 编排层 -> 领域服务层 -> 持久化与外部适配层”拆分代码职责。

#### 11.5.1 前端 Add-in / Business UI

建议职责：

1. 提取当前 Word 文档并生成 `templateDocumentIr`。
2. 负责样本上传、字段确认、风险提示和模板保存交互。
3. 调用后端接口并展示 `warnings`、`missingFields`、`needsReviewFields`、异步任务进度与块级状态。
4. 不在前端实现字段命名、术语命中和渲染编译逻辑。

建议不要放在前端的逻辑：

- 字段候选打分
- 术语命中规则
- `CarboneBindingPlan` 编译
- 高风险字段最终校验

#### 11.5.2 AI Orchestrator

建议职责：

1. 作为统一 AI 调用入口，承接整体理解与块级参数识别所需的 prompt 请求。
2. 编排模板分析服务、运行时生成服务、术语服务和渲染服务。
3. 负责组装统一响应结构和错误码。
4. 不承载复杂领域规则本体，只做编排和聚合。

建议避免：

- 在 Orchestrator 中直接写字段识别规则
- 在 Orchestrator 中写死语言特判逻辑
- 在 Orchestrator 中直接拼装 Carbone 变量映射

#### 11.5.3 Template Analysis Service

建议职责：

1. 样本文档规范化与 `DocumentIR` 解析。
2. 文档结构对齐、布局识别、块级切分与整体理解上下文生成。
3. 为整体理解和块级参数识别构造 AI prompt，并调用 AI Orchestrator。
4. 合并 AI 返回结果，完成字段命名建议、字段类型建议、置信度打分与规则兜底。
5. 输出 `FieldCandidateIR` 和字段分析结果。

核心输入：

- `templateDocumentIr`
- `sampleDocument`
- `sourceLanguage`
- `targetLanguages`

核心输出：

- `fields`
- `warnings`
- `analysisId`

#### 11.5.4 Runtime Generation Service

建议职责：

1. 基于 `TemplateFieldSpec` 抽取中文主字段。
2. 执行 `dictionary_first`、`enum_mapping`、`format_only`、`llm_translate`。
3. 执行一致性校验并生成 `warnings`、`missingFields`、`needsReviewFields`。
4. 输出标准化 `renderData` 与 `sourceTrace`。

建议避免：

- 运行时临时重新分析模板结构
- 直接读取 Word 原始文档内容
- 跳过 `TemplateFieldSpec` 自由生成字段

#### 11.5.5 Termbase Service

建议职责：

1. 提供字段命名词典、术语库、枚举表、格式规则查询。
2. 支持 `global / tenant / template` 作用域命中。
3. 返回命中结果与来源信息，不直接决定是否渲染。

#### 11.5.6 Template Repository / Metadata Store

建议职责：

1. 持久化 `TemplateMeta`、`TemplateDocumentSnapshot`、`TemplateFieldSpec`、`CarboneBindingPlan`。
2. 保障模板版本一致性。
3. 提供按 `templateId + version` 的读取能力。

### 11.6 模板状态流转建议

为避免模板保存、发布、重新分析时状态混乱，建议至少引入模板级状态机。

#### 11.6.1 状态定义

建议最小状态集：

- `draft`：草稿，允许继续编辑
- `analyzed`：已完成一次模板分析
- `reviewing`：已生成字段建议，等待人工确认
- `ready`：字段已确认，绑定计划已编译
- `published`：已可用于运行时渲染
- `archived`：已停用，不再接受新渲染请求

#### 11.6.2 状态流转

```text
draft
  -> analyzed
  -> reviewing
  -> ready
  -> published
  -> archived
```

建议补充规则：

1. `draft -> analyzed`：成功完成 `template/understand` 或 `template/recognize` 的首次分析。
2. `analyzed -> reviewing`：字段建议已返回，等待人工确认。
3. `reviewing -> ready`：`template/save` 成功且编译出合法 `CarboneBindingPlan`。
4. `ready -> published`：通过发布校验并执行发布动作。
5. 任一状态重新分析后，可回到 `reviewing`，但必须生成新版本。

#### 11.6.3 与代码落地的关系

后端至少应保证：

1. 运行时接口默认只读取 `published` 模板；若支持测试预览，可额外允许 `ready`。
2. `draft`、`reviewing` 状态不应直接进入正式渲染链路。
3. 状态变更和版本变更应在同一事务或同一原子操作内完成。

### 11.7 错误码与失败回退建议

若要直接指导代码落地，建议从 P0 起就统一错误码前缀和错误分类，避免前后端各自定义。

#### 11.7.1 错误码分类

建议按以下前缀分类：

- `TPL_`：模板分析与模板保存相关
- `DOC_`：文档解析与 `DocumentIR` 相关
- `JOB_`：异步任务提交、查询、取消与任务状态相关
- `TERM_`：术语、枚举、格式规则相关
- `GEN_`：运行时字段生成相关
- `RND_`：Carbone 渲染相关

#### 11.7.2 建议错误码

| 错误码     | 场景                      | 建议处理                                                           |
| ---------- | ------------------------- | ------------------------------------------------------------------ |
| `TPL_001`  | `templateFieldSpecs` 为空 | 阻止保存，提示至少确认一个字段                                     |
| `TPL_002`  | 模板状态不允许发布        | 阻止发布，引导先完成确认                                           |
| `DOC_001`  | 样本文档解析失败          | 返回错误并保留上传重试                                             |
| `DOC_002`  | `DocumentIR` 结构不合法   | 记录日志并阻止分析                                                 |
| `DOC_003`  | 布局识别失败              | 降级为基础识别，并返回 `warnings`                                  |
| `JOB_001`  | `jobId` 不存在或已过期    | 返回任务不存在，提示前端刷新当前工作流                             |
| `JOB_002`  | 任务状态不允许取消        | 返回幂等结果或提示任务已结束                                       |
| `JOB_003`  | 任务被新工作流输入淘汰    | 返回已失效，提示重新发起当前步骤                                   |
| `JOB_004`  | 任务执行超时              | 返回可重试错误，并保留已完成阶段摘要                               |
| `JOB_005`  | 块级部分失败但整体可用    | 不阻断流程，返回 `status=succeeded + resultStatus=partial_success` |
| `TERM_001` | 术语未命中                | 返回 `needsReviewFields`，不静默翻译                               |
| `TERM_002` | 枚举未命中                | 返回人工确认建议值                                                 |
| `TERM_003` | 格式规则缺失              | 降级为默认格式并返回告警                                           |
| `GEN_001`  | 关键信息缺失              | 返回 `missingFields`                                               |
| `GEN_002`  | 高风险字段冲突            | 阻止渲染，进入人工确认                                             |
| `GEN_003`  | 字段生成失败              | 记录字段级错误，保留其他字段结果                                   |
| `RND_001`  | 模板变量缺失              | 阻止渲染并返回缺失变量名                                           |
| `RND_002`  | Carbone 渲染失败          | 返回渲染失败并保留请求上下文                                       |

#### 11.7.3 失败回退原则

建议实现时统一遵循：

1. 能降级的场景尽量降级，但必须显式返回 `warnings`。
2. 高风险字段冲突不降级，直接进入 `needsReviewFields`。
3. 模板结构错误、绑定计划错误、渲染失败属于阻断型错误，不应静默继续。
4. 术语未命中可回退到人工确认，但不能直接替换为自由翻译结果。

针对异步任务补充约束：

1. 任务超时、网络中断、单块 AI 失败等可恢复场景，应尽量返回 `retryable=true`。
2. 已有阶段性结果且可继续人工确认的场景，应优先返回 `partial_success`，而不是简单标记整个任务失败。
3. 若任务被用户取消或被新输入淘汰，应明确区分 `cancelled` 与 `JOB_003`，避免前端误以为是系统异常。
4. `fallback_success` 不是静默降级，必须通过 `warnings`、`contextAnalysis.fallback` 或 `resultStatus` 对前端显式暴露。

### 11.8 推荐实现顺序

为了让这份文档可直接指导代码落地，建议开发顺序与模块依赖保持一致。

#### 11.8.1 后端优先顺序

1. 定义 `TemplateMeta`、`TemplateFieldSpec`、`CarboneBindingPlan` 持久化模型。
2. 实现 `template/save` 所需的最小保存与版本管理能力。
3. 实现 `template/compare` 的最小文档对比链路，稳定生成待定参数候选池。
4. 实现 `template/understand` 的最小 AI 全局理解链路。
5. 实现 `template/recognize` 的最小按章节 AI 识别链路。
6. 实现 `template/render-data` 的最小生成链路。
7. 接入 Carbone 渲染。
8. 最后补术语增强、复杂版式识别和多样本增强。

#### 11.8.2 前端优先顺序

1. 样本上传与模板对比触发
2. 待定参数候选结果展示
3. AI 全局理解结果展示
4. 语言补充与确认
5. 字段建议结果展示
6. 字段确认与保存
7. 渲染预览与错误展示
8. 风险字段确认增强

#### 11.8.3 联调检查清单

后端和前端联调前，建议至少确认以下事项：

1. 错误码是否统一。
2. `warnings`、`missingFields`、`needsReviewFields` 是否结构稳定。
3. `template/save` 是否保证字段保存与绑定计划编译的一致性。
4. 单语言模板与双语模板是否共享同一主链路。
5. 渲染失败时是否能返回足够的上下文定位信息。

---

## 12. 分阶段实施建议

### 12.1 P0：单模板、单样本，保留单语言并优先中日双语

目标：

- 支持单份 Word 模板
- 支持上传 1 份真实样本
- 保留并优化现有单语言模板链路
- 在此基础上优先支持中日双语
- 支持主体名称、项目名称、金额、付款方式、银行账号等关键字段
- 打通样本文档规范化和 `DocumentIR` 解析链路
- 支持最基础的 `paired_paragraphs` 布局识别
- 打通“对比候选发现 -> 全局理解 -> 语言补充 -> 按章节识别”的建模主链路

#### 12.1.1 P0 范围边界

为避免 P0 目标失控，建议本阶段明确限制如下：

1. 模板类型只覆盖“段落为主、夹少量简单表格”的合同模板，不覆盖复杂嵌套表格。
2. 单语言模板直接走现有渲染链路；若是双语模板，只保证 `paired_paragraphs`，不承诺 `inline_pairs` 和 `mixed`。
3. 样本数量固定为 1 份，不做多样本统计增强。
4. 术语资产只覆盖 P0 首批字段，不追求全量行业知识库。
5. 人工确认先以字段级结果表单形式落地，不要求可视化框选编辑器。

#### 12.1.2 工作流 A：前端 Add-in 能力

P0 前端建议拆成以下任务：

1. 调整 Word 页主布局，使第一步成为“真实样本上传”，支持选择 1 份 `docx` 样本。
2. 增加“模板对比”触发入口，对当前模板与样本执行结构化对比，生成待定参数候选池。
3. 增加“AI 全局理解”触发入口，基于真实原文和候选池执行全局内容理解。
4. 增加语言配置区，要求在整体理解完成后补充默认中文、中文 -> 日文、中文 -> 英文等配置。
5. 增加“参数识别”触发入口，在语言补充完成后再执行 AI 驱动的按章节字段识别。
6. 增加块级识别结果页，展示当前章节/段落块/表格块的 AI 建议、字段来源上下文、置信度与风险。
7. 增加字段识别结果页，汇总 `fieldId`、类型、样本值、策略、置信度与来源块。
8. 增加人工确认表单，允许修改字段名、字段类型、策略和必填属性。
9. 增加“应用参数”“生成 AI 指南”“保存模板”动作，串起识别后的产出闭环。

前端交付物建议包括：

- 五步式 Word 模板分析页
- 样本上传组件
- 模板对比与待定参数候选组件
- 整体理解摘要卡片
- 语言配置组件
- 块级识别进度与结果组件
- 字段确认表格
- 参数应用与 AI 指南组件
- 模板保存请求模型

#### 12.1.3 工作流 B：模板分析服务

P0 后端模板分析链路建议拆成以下任务：

1. 接收当前模板 `DocumentIR` 和 1 份样本文档。
2. 完成样本文档规范化，包括控制字符、翻译残留标记、空白占位清洗。
3. 将样本文档解析为统一 `DocumentIR`。
4. 实现模板与样本的结构化对比链路，先产出待定参数候选池以及位置、语段、章节归属。
5. 实现 AI 全局理解链路：基于真实原文、候选池、布局线索生成 `understandingSummary`、`sectionSummaries` 和 `entityGraph`。
6. 实现基础块级切分与对齐，仅支持标题、相邻段落和简单表格区域的可解释分块。
7. 为每个块生成结构锚点、字段候选、术语命中、版式特征等 AI 提示上下文。
8. 实现块级 AI 识别链路，对每个章节块循环调用 AI 生成字段建议。
9. 在服务端合并块级结果，完成字段去重、命名归一、风险标记、一致性校验与规则兜底。
10. 输出最终字段建议结果，供前端确认、应用参数、生成 AI 指南和模板保存。

P0 必须先稳定支持的字段类型：

- 公司名称
- 项目名称
- 金额
- 日期
- 付款方式
- 银行账号

#### 12.1.4 工作流 C：运行时参数生成服务

运行时链路建议拆成以下任务：

1. 接收 `templateId`、中文自然语言输入和可选目标语言列表。
2. 基于模板字段定义抽取主字段，不做开放式全字段生成。
3. 按字段策略分别执行 `format_only`、`dictionary_first`、`enum_mapping`、`llm_translate`。
4. 对高风险字段执行缺失检查和一致性校验。
5. 输出 Carbone 渲染所需 JSON，并附带 `warnings`、`missingFields`。

P0 建议优先支持的生成能力：

- 中文主字段抽取
- 单语言模板直接生成 `sourceLanguage` 渲染数据
- 公司名术语命中
- 付款方式枚举映射
- 金额/日期格式化
- 日文派生字段生成

#### 12.1.5 工作流 D：模板变量编译与 Carbone 渲染

P0 中模板变量层建议拆成以下任务：

1. 将人工确认后的字段定义保存为 `TemplateFieldSpec`。
2. 编译生成 `CarboneBindingPlan`。
3. 支持标量字段、可选多语言字段、简单数组字段的变量展开。
4. 生成运行时渲染 JSON。
5. 调用 Carbone 渲染并返回最终文档或渲染结果。

P0 最低能力要求：

- 单语言模板至少支持 `{d.partyAName_zh}` 这类标量变量，双语模板支持 `{d.partyAName_ja}` 等派生变量
- 支持金额、日期、枚举型变量输出
- 如模板含简单货物表格，支持 `items[]` 一层数组

#### 12.1.6 工作流 E：字段词典/术语资产

P0 资产侧建议拆成以下任务：

1. 建立字段命名词典的基础存储结构。
2. 建立单语言可复用的基础术语库，并补齐中日双语术语映射结构。
3. 建立 `paymentMode` 等关键枚举映射表。
4. 建立金额、日期的基础格式规则配置。
5. 为整体理解与块级识别补充提示模板，使字段词典、术语库、枚举映射可直接作为 AI prompt 上下文输入。
6. 在运行时返回结果中记录最小来源信息，如 `matchedTermId`、`sourceBlockId` 或 `resolution`。

P0 首批建议预置的资产范围：

- `partyAName`
- `partyBName`
- `projectName`
- `serviceLocation`
- `paymentMode`
- `bankAccount`
- `serviceFeeTotal`

#### 12.1.7 工作流 F：测试与验收

P0 不建议一开始追求大而全测试集，建议围绕关键闭环做小而准的验收：

1. 准备 1 份单语言样本和 1 到 2 份中日双语合同模板样本。
2. 准备对应的空白模板和真实样本文档。
3. 验证整体理解摘要是否能稳定输出章节结构、语言分布、术语候选与版式特征。
4. 验证 AI 参数识别结果是否能正确命中首批字段，并能保留块级来源上下文。
5. 验证中文输入后是否能生成正确的单语言或中日变量 JSON。
6. 验证 Carbone 渲染出的文档中关键字段是否落位正确。
7. 验证金额、公司名、银行账号等高风险字段在缺失或冲突时能被拦截。

建议至少准备三类测试样例：

- 正常样例：字段齐全、排版规整
- 缺失样例：缺少付款方式或金额
- 噪音样例：存在翻译残留标记或额外空格

#### 12.1.8 P0 里程碑建议

如果按串联依赖拆分，建议里程碑如下：

1. M1：打通模板 `DocumentIR` + 样本文档解析 + AI 整体理解摘要输出。
2. M2：打通块级切分 + 块级 AI 参数识别 + 结果合并与规则兜底。
3. M3：打通字段确认保存 + `TemplateFieldSpec` 持久化 + 映射编译。
4. M4：打通中文输入生成 + 术语/枚举/格式规则命中 + Carbone 渲染，并完成 P0 样例验收和高风险字段拦截。

#### 12.1.9 P0 完成判定

建议将“P0 完成”定义为以下条件同时满足：

1. 用户可在 Add-in 中上传 1 份真实样本，并成功进入整体理解阶段。
2. 用户可基于模板 + 样本获得一份全局理解摘要，并完成语言配置。
3. 用户可在整体理解之后触发 AI 参数识别，并得到带来源上下文的字段建议结果。
4. 用户可确认保存不少于 6 个关键字段定义。
5. 系统可基于中文输入生成单语言渲染 JSON，并在双语模板下生成中日或中英渲染 JSON。
6. Carbone 可成功渲染至少 1 份真实合同模板。
7. 金额、公司名、银行账号三类高风险字段具备基础校验和人工确认能力。

#### 12.1.10 目标设计与现有实现差距

为避免设计文档与当前代码实现脱节，建议明确记录当前主链路与目标设计之间的差距：

1. 当前 Word 三步式页面已经拆出“整体理解”和“参数识别”两个阶段，但第三步后端仍以规则识别为主，尚未切换为块级 AI 识别主流程。
2. 当前整体理解阶段已能调用 AI 生成 `understandingSummary`，但该摘要尚未作为第三步块级识别的强约束上下文传入完整 AI 识别链路。
3. 当前第三步尚缺少“先基于模板数据和上传真实数据发现待定参数候选，再按章节识别”的独立中间层，导致 AI prompt 仍偏向从零开始自由发现字段。
4. 当前 Word 工作流接口仍偏向返回合并后的 `fields`，缺少面向前端展示的 `blockResults`、块级调试信息和块级失败回退信息。
5. 当前前端虽然已有 `analysisExecutor`、`thinking`、`useMultiStage` 等配置，但 Word 工作流接口尚未完整消费这些配置，未真正接入类似 Excel 的“全局理解缓存 + executor 驱动分块调用 + 重试回退”识别方式。
6. 当前字段词典、术语库、枚举映射主要用于规则命中和运行时生成，尚未系统化地转化为整体理解与块级识别的 prompt 组成部分。
7. 当前调试信息主要覆盖整体理解阶段，参数识别阶段尚缺少“每个块发送给 AI 的请求原文、原始返回、失败原因、重试情况、fallback 原因”的统一记录结构。
8. 当前风险标记、`needsReview` 与字段置信度更多来自规则分析；切换到 AI 主流程后，需要重新定义 AI 置信度、规则校验结果与人工确认优先级之间的合并规则。

建议按以下顺序补齐差距：

1. 先在 `template/recognize` 中引入待定参数候选发现步骤，并把候选的位置、语段、章节信息纳入上下文结构。
2. 再补齐 `understandingSummary + blockResults + contextAnalysis` 的完整返回结构。
3. 然后实现按章节切分与块级 AI 调用闭环，保证第三步真正变为 AI 主驱动。
4. 再把字段词典、术语库、枚举映射纳入 prompt 组装逻辑，并保留规则兜底。
5. 最后补齐前端块级进度展示、调试日志、失败回退展示和人工确认体验。

#### 12.1.11 代码改造清单

为便于从设计直接落到代码，建议按现有仓库结构拆分如下改造清单。

前端 Add-in：

1. 调整 `apps/office-addin/src/components/WordIdentifyPanel.tsx`，使第三步从“直接请求合并后的字段结果”升级为“展示块级 AI 识别进度 + 汇总最终字段结果”。
2. 在 `WordIdentifyPanel.tsx` 中增加块级状态视图，包括 `blockResults`、当前识别中的块、块级错误与块级重试提示。
3. 调整 `apps/office-addin/src/api/carbone-api.ts` 的 `recognizeTemplateWorkflow()` 类型定义，补充 `blockResults`、`contextAnalysis`、`sourceBlockId` 等字段。
4. 在 `apps/office-addin/src/components/AIIdentifyPanel/useAIIdentifyPanel.ts` 中补充 Word 模式下的调试展示逻辑，使其能输出识别阶段的 prompt、原始返回、块级重试与回退信息。
5. 参考 `apps/office-addin/src/components/ExcelSheetPairsTab.tsx` 与 `apps/office-addin/src/services/suggestion-service.ts`，为 Word 模式补齐“全局理解缓存 + 分块识别进度 + 调试日志”的一致体验。

后端接口层：

1. 调整 `apps/backend/domain/carbone-engine/src/modules/studio/studio.controller.ts` 中 `POST /template/recognize` 的 DTO 与返回结构，显式支持 `understandingSummary` 输入。
2. 为 `template/recognize` 返回体补充 `blockResults`、结构化 `contextAnalysis`、`sourceBlockId` 等字段，保证前端能显示 AI 主流程与规则兜底的来源差异。
3. 保持 `POST /template/understand` 与 `POST /template/recognize` 的职责分离：前者负责全局理解，后者负责块级 AI 参数识别。

后端模板分析服务：

1. 重构 `apps/backend/domain/carbone-engine/src/modules/studio/template-workflow.service.ts`，将当前以 `discoverFields()` 为主的第三步识别链路拆成：
   - 待定参数候选发现
   - 块级切分
   - 块级 prompt 组装
   - 块级 AI 调用
   - 结果合并
   - 规则校验与兜底
2. 保留现有 `discoverFields()`、词典匹配、术语命中逻辑，但其职责从“主识别器”调整为“提示生成器、校验器和 fallback 生成器”。
3. 在 `template-workflow.service.ts` 中新增待定参数候选结构，至少包含 `candidateId`、`sourceBlockId`、`anchorText`、`sampleValue`、`segmentText`、`sectionId`、`fieldTypeHint`。
4. 在 `template-workflow.service.ts` 中新增块级识别结果结构，至少包含 `blockId`、`blockType`、`title`、`sectionId`、`sectionTitle`、`aiCallSucceeded`、`resultStatus`、`suggestionCount`、`retryCount`、`durationMs`、`errorCode`、`fallback`、`fallbackReason`、`warnings`。
5. 在结果合并阶段实现字段去重、命名归一、跨块冲突消解、风险标记和 `needsReview` 生成规则。

AI 调用与 Prompt：

1. 在 `template-workflow.service.ts` 中新增 Word 块级识别 prompt 构造器，输入应至少包含：
   - `understandingSummary`
   - 当前章节标题 / 章节摘要
   - 当前块命中的待定参数候选列表
   - 当前块正文
   - 结构锚点提示
   - 字段词典提示
   - 术语命中提示
   - 样本文本摘录
   - 候选参数的位置、语段、样本值和字段类型提示
2. 保持整体理解 prompt 与块级识别 prompt 分离，避免一个 prompt 同时承担“全局理解”和“字段生成”两种职责。
3. 统一 AI 响应解析策略，支持标准 JSON、轻度格式污染修复和失败重试，并把每次调用的请求摘要、响应摘要、fallback 信息与最近一次有效请求原文/原始返回写入结构化 `contextAnalysis`。
4. 如需复用 Excel 的 executor 经验，可参考 `apps/office-addin/src/services/analysis-executor.ts` 的 `ChatAnalysisExecutor` 行为，但 Word 工作流应优先在后端集中管理 prompt 和重试策略。

术语与规则资产：

1. 梳理字段词典、术语库、枚举映射在 `template-workflow.service.ts` 中的使用路径，将其拆分为“prompt 输入”和“后处理校验”两个阶段。
2. 对金额、日期、银行账号、公司名等高风险字段保留规则型二次校验，避免 AI 返回直接进入可保存状态。
3. 在字段结果中保留 `matchedTermId`、`resolution`、`sourceBlockId` 等来源信息，便于调试与人工确认。

调试与观测：

1. 扩展当前 Word 调试日志，使“整体理解”和“参数识别”都能记录结构化 `contextAnalysis`，至少覆盖 `requestTrace`、`responseTrace`、`fallbackTrace`、`cacheTrace`、`debugArtifacts`。
2. 为块级识别补充最小观测字段：块数量、成功块数、失败块数、重试次数、fallback 原因。
3. 在失败场景中区分：
   - 整体理解失败但可回退为规则摘要
   - 单个块 AI 失败但整体识别可继续
   - 全量块失败，只能回退为规则识别结果

测试与验收：

1. 为 `template-workflow.service.ts` 增加针对块级识别合并逻辑的单元测试。
2. 为 `studio.controller.ts` 增加 `template/recognize` 响应结构测试，确保 `blockResults` 与 `contextAnalysis` 不会被遗漏。
3. 增加至少一条从 Word Add-in 到 `template/understand -> template/recognize -> template/save` 的集成链路测试。
4. 准备带中日双语段落、简单表格、噪音样本的验收样例，验证 AI 主流程与规则兜底都能稳定工作。

### 12.2 P1：增强字段识别与人工确认

目标：

- 增加字段类型识别
- 增加术语库与枚举映射
- 增加确认页与风险提示
- 增加金额和名称一致性校验
- 支持 `inline_pairs` 和 `mixed` 布局
- 支持翻译工具污染标记清洗

#### 12.2.1 P1 范围边界

P1 的核心目标不是再扩大模板类型范围，而是在 P0 已跑通链路的基础上，把识别准确率、人工可控性和双语复杂版式兼容性做实。

建议本阶段聚焦以下边界：

1. 继续以单语言模板和中日双语模板为主，不在 P1 引入更多语言种类。
2. 重点增强字段识别质量和确认体验，而不是优先扩展更多业务字段。
3. 支持更复杂的双语排版，但暂不追求任意复杂版式的全自动识别。
4. 保持 P0 的单模板主链路稳定，不在 P1 同时引入大规模模板运营能力。

#### 12.2.2 识别能力增强

P1 建议重点补强以下识别能力：

1. 增加字段类型识别器，将 `legal_entity_name`、`currency_amount`、`bank_account`、`date`、`enum` 等类型显式化。
2. 增加字段候选排序与冲突消解，降低多个候选得分接近时的误判。
3. 增加 `inline_pairs`、`mixed`、`contaminated_tm_markup` 布局的识别和分流。
4. 增加翻译残留标记清洗、异常空格清洗、符号标准化等规范化规则。
5. 增加表格字段和列表字段的识别稳定性，尤其是双语表头和重复行判断。

P1 交付结果建议达到：

- 字段候选结果能稳定区分“自动通过”和“需人工确认”
- 双语复杂版式下的候选召回率明显优于 P0
- 污染样本不会直接导致整条识别链路失效

#### 12.2.3 人工确认与风控增强

P1 建议把人工确认从“简单字段表单”升级为“可解释的确认页”：

1. 展示字段锚点、样本值、字段类型、策略、风险等级和术语命中状态。
2. 支持按 `needsReview`、`riskLevel`、`confidence` 过滤待确认字段。
3. 支持人工修改 `fieldId`、`policy`、`required`、目标语言配置。
4. 对银行账号、金额、日期、公司名等高风险字段增加二次确认提示。
5. 对人工改写结果记录 `manual_override` 来源，便于审计和后续复盘。

#### 12.2.4 术语与校验能力补强

P1 需要把术语和规则从“可用”提升到“可控”：

1. 扩展字段命名词典、术语库、枚举表的覆盖范围。
2. 建立金额、名称、日期、税率等关键字段的一致性校验器。
3. 增加术语未命中、命中冲突、枚举越界时的明确回退逻辑。
4. 在运行时结果中稳定返回 `sourceTrace`、`warnings`、`needsReviewFields`。

建议 P1 后，以下场景应可稳定处理：

- 公司名命中术语库，但目标语言缺失时触发确认
- 金额数值存在，但文本展示格式不一致时触发校验告警
- 付款方式未命中枚举时进入人工确认而不是静默翻译

#### 12.2.5 P1 测试与验收重点

P1 的测试重点建议从“链路可用”转向“复杂样本可控”：

1. 新增 `inline_pairs`、`mixed`、污染样本三类回归样本。
2. 验证字段类型识别、术语命中、人工确认和重新保存链路。
3. 验证高风险字段在冲突和缺失场景下会被拦截。
4. 验证人工修改后再次编译 `TemplateFieldSpec` / `CarboneBindingPlan` 的结果一致性。

#### 12.2.6 P1 完成判定

建议将 P1 完成定义为以下条件同时满足：

1. 系统可识别 `inline_pairs` 和 `mixed` 两类复杂双语布局。
2. 确认页能展示术语命中、风险等级、锚点来源和置信度。
3. 高风险字段具备稳定的一致性校验和人工复核闭环。
4. 术语未命中、枚举未命中、污染样本三类问题都有明确回退路径。
5. 在 P0 样本之外，至少新增 2 类复杂样本并通过回归验收。

### 12.3 P2：支持中美双语与多样本

目标：

- 新增英文语言派生
- 支持 2 到 5 份样本增强识别
- 支持更复杂的双语或多语言模板
- 将语言对从固定能力升级为配置化能力

#### 12.3.1 P2 范围边界

P2 的重点是把能力从“中日双语 + 单样本”升级成“语言对可配置 + 多样本增强”，而不是一步做到全语言、全行业、全模板自动化。

建议本阶段边界如下：

1. 语言扩展优先支持英文，不在 P2 同时铺开太多新语言。
2. 多样本增强控制在 2 到 5 份结构相近样本，不做开放式大规模样本训练。
3. 仍然以模板化文档和字段级生成为中心，不扩展到整篇正文自由生成。
4. 多语言能力以配置化抽象为目标，不在业务代码中新增大量语言特判分支。

#### 12.3.2 语言能力配置化

P2 需要把语言支持从“中日特例”升级为“语言包驱动”：

1. 将 `sourceLanguage`、`targetLanguages`、`documentMode` 作为模板配置的正式输入。
2. 增加英文金额、日期、枚举、术语映射规则。
3. 将 Prompt、格式化规则、枚举映射和术语命中都切到语言包配置。
4. 保持单语言模板无需感知多语言复杂度，仍可直接走简化链路。

建议 P2 后至少支持以下组合：

- 单语言中文模板
- 中日双语模板
- 中英双语模板

#### 12.3.3 多样本增强识别

P2 建议将样本增强能力正式纳入模板分析流程：

1. 支持上传 2 到 5 份结构相近样本文档。
2. 对相同位置做跨样本值比较，识别“变化字段”和“固定正文”。
3. 对重复出现的字段名、字段类型和术语命中结果做投票或加权。
4. 对低一致性位置输出 `needsReview`，而不是强行自动命名。

P2 多样本能力的价值主要体现在：

- 提高变量发现准确率
- 降低把固定正文误识别为变量的概率
- 提高字段命名和字段类型判断稳定性

#### 12.3.4 模板与渲染能力扩展

P2 建议同步补强以下能力：

1. 支持中英模板中的标题分行、行内混排、表头双语映射等模式。
2. 增强列表字段和表格字段在多语言模板下的变量展开能力。
3. 支持不同模板根据语言配置编译不同的 `CarboneBindingPlan`。
4. 在运行时输出中保留语言来源和样本来源，便于多语言问题排查。

#### 12.3.5 P2 测试与验收重点

P2 的测试重点建议转向“配置泛化能力”：

1. 增加中英双语模板样本和 2 到 5 份多样本集合。
2. 验证不同语言包下的金额、日期、枚举、术语映射是否一致。
3. 验证多样本增强后，字段召回率和误识别率是否优于单样本模式。
4. 验证同一模板在单语言、中日双语、中英双语配置下的运行结果是否符合预期。

#### 12.3.6 P2 完成判定

建议将 P2 完成定义为以下条件同时满足：

1. 系统可配置支持中英双语模板，并保持中日双语链路兼容。
2. 多样本模式下可稳定处理 2 到 5 份结构相近样本。
3. 语言包驱动的日期、金额、枚举和术语规则已替代主要硬编码分支。
4. 多样本增强在字段发现或字段命名上相对 P1 有可验证提升。
5. 单语言模板链路在引入语言配置化后仍保持兼容，不出现明显回归。

### 12.4 P3：模板资产沉淀

目标：

- 沉淀行业术语库
- 沉淀字段命名知识库
- 沉淀历史模板识别经验
- 形成模板推荐与自动化复用能力

---

## 13. 方案总结

针对模板化文档场景，最稳妥的技术路线不是“让模型直接生成整篇双语合同”，而是：

1. 以中文自然语言作为唯一主输入。
2. 先抽取业务主字段，再根据模板配置决定走单语言输出还是派生多语言字段。
3. 通过字段类型驱动不同生成策略。
4. 对 Word 采用“空白模板 + 真实样本 + DocumentIR 对齐”的样本导入方案。
5. 在模板保存和运行时渲染前加入人工确认与结构化风控。

该方案兼顾以下能力：

- 保留用户现有 Word 使用习惯
- 保留并优化现有单语言模板能力
- 复用企业历史已签合同资产
- 满足中日双语的近期需求
- 为中美等多语言扩展预留统一架构
- 避免对单一合同版式或单一语言对做硬编码
