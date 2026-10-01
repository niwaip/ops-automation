# HTML 批注回写 Word 第二次审计

日期：2026-10-01。审计对象：当前未提交工作区源码。仅新增审计报告与复现脚本，未修改业务代码、重启服务或创建真实任务。

结论：本轮已修复多项上次发现的问题，模块划分也更清楚，但仍存在 P1 级文档结构、版本绑定、歧义定位和批注丢失问题。不能认定当前链路已通过通用方案验收。

## 已修复或改善

| 上次问题 | 本次结论 | 证据 |
|---|---|---|
| 生成脚本缺少闭合括号 | 已修复 | 实际 buildContractReviewClientScript 输出通过 vm.Script 解析 |
| 无效 DOCX 被替换为五条假合同 | 已修复注入器行为 | 无效 ZIP 明确抛错；createMinimalDocxFromText 已删除 |
| 没读取 reviewReport.clauses | 已修复读取路径 | processor:62；renderer:516 与 finish/stage 均加入 clauses |
| 只有 reject 注入 | 已扩展 | processor:76 对带批注的动作统一处理 |
| XML 实体定位失效 | 常见实体已改善 | R&D 精确找到第 2 段；输出结构仍有新问题 |
| 匹配不到就强制首段 | 注入器已修复 | 不存在标题和引用返回 injectedCount=0、unresolvedCount=1 |
| 跨条款重复引用 | 部分修复 | 有准确标题时定位到第二条；无作用域完全重复仍错选首个 |
| 幂等性 | 部分修复且引入丢批注风险 | 普通长文本重复跳过；实体文本重复追加；不同作者/条款同文本被错误跳过 |
| 回复关系丢失 | 前端/DTO 保留改善；Word 线程未完成 | 现在写入 parentCommentId，但未创建标准回复扩展 |
| 模块复杂度 | 有改善 | injector 475 行、locator 389 行、xml util 独立；processor 仍 861 行 |

## 必须解决的剩余问题

### 1. P1：新划词写入函数生成不合法的 WordprocessingML 节点层级

位置：`apps/backend/governance/workbench/src/coordination/docx-xml.util.ts:112`。

函数只替换 w:t 元素，外层 w:r 仍开着，却把 commentRangeStart / commentRangeEnd 和批注引用的另一个 w:r 插进当前 w:r 内。实际 fixture 的 XML 层级检查得到：

```text
w:commentRangeStart 的 parent = w:r
w:commentRangeEnd   的 parent = w:r
w:r                的 parent = w:r
```

这与 Run 的允许子元素结构不符；正常批注边界应放在目标 run 前后，批注引用放在一个独立 run。参见 [Microsoft Run 文档](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.run?view=openxml-3.0.1) 和 [Microsoft 插入批注示例](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-insert-a-comment-into-a-word-processing-document)。这是依据实际输出和文档结构作出的判断，本次没有运行完整 OpenXmlValidator 或 Word/WPS 打开验证。

此外，拆出来的新 run 没复制原 w:rPr，后半段及选区可能丢字体、颜色、加粗等属性；跨 run 文本仍退回整段。定位器传给写入器的是最多 20 字且去标点、去空格后的 snippet，而不是原始完整选区，真实划词含空格或标点时也可能退回整段。

修复：解析段落/run/文本节点，计算原始选区偏移；克隆 run 属性后拆分完整 run，把范围标记作为同级节点插入。匹配用的归一化文本不能直接当写入用的原始片段。

### 2. P1：源附件/哈希绑定失败时仍允许降级到其他原稿

位置：`coordination-action.processor.ts:130`、`:139`、`:148`。

新增 sourceAttachmentId / sourceDocumentHash 分支，但它们都没有匹配时，仍按文件名选任意清洁 DOCX。ID 命中时也不再核对 hash；hash 只比较附件 metadata，没有计算实际 originalBuffer 的哈希。来源还优先取请求里的字段，没有以服务端可信审阅报告强校验。

复现：draft 指定 sourceAttachmentId=att_missing、sourceDocumentHash=wrong-hash，只提供 att_old 的历史原稿，processor 仍调用 saveAttachment 并设置 hasAnnotatedDocx=true。

更根本的断点：HTML draft 仍只传 sourceDocumentVersion，没有 sourceAttachmentId/sourceDocumentHash；自动审阅报告也没有新增这两个字段。因此正常页面流程仍可能落入名称回退，读取分支的存在不等于绑定已完成。

修复：服务端从当前审阅报告取确切来源；如果显式绑定不能满足应阻断，不能回退。读取 buffer 后计算并比对其内容哈希；统一现有 sourceDocumentVersion 与 hash 的含义并贯穿报告、草稿及动作。

### 3. P1：完全重复引用的消歧仍返回第一个候选

位置：`docx-clause-locator.service.ts:186`。

多个候选命中 snippet 时，代码用完整 cleanAnchor 遍历，找到第一条即 return，没有统计完整引用是否仍重复。当两个条款都有完全相同的引用，没有可靠目标条款范围时，依然挂第一处并报告 matched。

复现：两条正文都含“提交材料并办理手续”，传该引用、不传标题，得到 injectedCount=1、unresolvedCount=0、targetParagraphIndex=2，而非 ambiguous。传准确“交付”标题时本例会正确定位到段落 4，说明作用域路径有效，但全局消歧仍未完成。

类型层面虽然 ExtractedCommentItem.status 有 ambiguous，定位结果 matchType 中没有 ambiguous，注入逻辑也没有这个分支。同一条款内重复短句也仍选首个。

修复：完整引用、标题和编号匹配都必须检查唯一性；多个候选返回 ambiguous。已绑定条款的引用找不到时不要自动跨条款搜索并称成功。

### 4. P1：当前去重既误删合法批注，又不能可靠保证幂等

位置：`docx-comment-injector.service.ts:267`、`:300`。

两条独立意见只要文本相同且长度大于 5，就被认定重复：不比较作者、条款、锚点或稳定业务 commentId。另把客户端 id 直接和已有 Word 数字 id 相比，混用了两个 ID 空间。

复现：

- 第一条已有“两个条款均需要明确付款期限”；第二条由另一作者提交相同文本的新 commentId，实际 injectedCount=0，合法批注被丢弃。
- Word 已有 id=1 的旧意见，新输入业务 id=1 但不同文本的新意见，实际 injectedCount=0。
- 重复注入稳定 id=client-entity、文本“请确认R&D成果属于谁”，第二次仍 injectedCount=1。既有 XML 文本是 R&amp;D，去重读取没有解码，稳定客户端 ID 又没有持久映射到 Word ID。

普通不含实体的长文本重复注入，第二次确实为 0；这个通过案例不足以证明正确幂等。

修复：持久化 sourceDocumentHash + businessCommentId 与 Word ID 的映射；相同文本的不同意见保留。不要依赖 Word ID 巧合相等或全局文本相等去重。

### 5. P1：未定位/生成失败没有成为页面可感知的交付失败

位置：`coordination-action.processor.ts:262`、`:279`；`InboxTaskDetailModal.tsx:454`。

记录 unresolved 明细是改善，但全部未定位也会保存一份没有新增批注的文件，命名“法务批注版”，设置 hasAnnotatedDocx=true，然后继续执行阶段流转。原稿损坏的异常被 catch，写入 commentInjectionError 后仍继续流转。

详情页 await submitAction 后只显示动作成功，没有检查返回的 commentInjectionStats/commentInjectionError。检索当前业务源码也未发现对这两个字段的消费展示。

处理器 mock 复现（阶段引擎用哨兵异常中止，没有真实数据库或外部写入）：

```text
全部未定位：saved=1, hasAnnotatedDocx=true,
             injectedCount=0, unresolvedCount=1
无效原稿： saved=0, hasAnnotatedDocx=false, commentInjectionError 存在，
             仍进入后续 executeTransition
```

修复：明确部分完成和失败策略，至少不能把零注入文件标为成功批注版。需要完整交付时阻断流转；允许部分成功时页面必须展示未定位数量、意见和补救入口，而非只显示成功。

### 6. P2：回复元数据仍不是 Word 原生回复线程

位置：`docx-comment-injector.service.ts:355`。

目前仅向 w:comment 添加 w:parentCommentId。这并不是建立 Word 回复线程所需的标准扩展；Office 2013 回复关系使用 commentsExtended.xml 中 w15:commentEx 的 paraIdParent，关联父批注末段的 paraId。[Microsoft CommentEx 文档](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2013.word.commentex?view=openxml-3.0.1)

复现生成的包只含 word/comments.xml，无 commentsExtended.xml；w:parentCommentId 存在，但不能据此认定 Word 原生线程已实现。父意见未定位时仍先建立客户端 ID 映射，后续 ID 复用还可能让子意见关联错误父意见。

修复：使用正确的 paraId/扩展关系，保留既有线程元数据，并在父意见成功定位/映射后再建立关系。实际 Word/WPS 展示需单独验证。

### 7. P2：中文编号和消息/版本校验仍不完整

位置：`docx-clause-locator.service.ts:335`、`:368`；`HtmlReportPreviewModal.tsx:85`、`:107`；`InboxTaskDetailModal.tsx:129`。

“第二条”经 replace(/\D/g, '') 变成空字符串，无法按中文 clauseNumber 定位。本次 fixture 仅传 clauseNumber=第二条，返回 unresolved。context 中有准确 title 时可绕过这个缺口，但不能称编号路径已通用。

preview 消息仍没有 event.source 绑定；BroadcastChannel/storage 仍使用全局共享名字。详情页版本校验仍在双方字段都存在时才生效，并未读取 payload.reviewReport.sourceDocumentVersion。后端没有补齐草稿版本绑定的强校验。NDA 默认 ruleSetId 与前端 approvalOpinions 契约缺口也仍在。

## 验证记录与限制

- `pnpm --filter @ops/workbench typecheck`：通过。
- 实际生成的 HTML script 解析：通过。
- 新独立 fixture 复现上述 XML 层级、歧义、去重、实体重试和中文编号问题。
- processor mock 验证源绑定失败回退、零注入仍标成功、无效源仍继续后续执行；依赖均为内存 mock，没有真实任务/数据库/附件写入。
- 7 份不同合同样本复跑原正文 XML 保留检查：通过。但该测试选长锚点，写入器常退回整段路径，不能覆盖新单 run 划词路径或证明所有选区结构合法。
- 上次复现脚本依赖已删除的 createMinimalDocxFromText，已不适配当前 API；其执行中断属于旧测试工具失配，不作为业务失败证据。本次新增独立 fixture 的复现脚本，不恢复已删除兜底方法。
- 未运行真实浏览器→详情页→数据库→Word/WPS 的完整回归，也未运行全包 OpenXML schema 验证。当前源代码存在可复现 P1，不能据类型检查或 ZIP/XML 包存在宣称端到端验收通过。

复现命令（仓库根目录）：

```sh
node docs/audits/html-word-comment-reaudit-repro-2026-10-01.cjs
```

该脚本为审计诊断工具，输出实际观察结果，不代表所有检查都通过。

建议修复顺序：先修完整 run 的 XML 写入与格式保留；再把源版本不一致、歧义及零注入设为可感知失败；用业务 ID 映射实现可靠幂等；最后完成标准回复线程和真实页面/Word 回归。
