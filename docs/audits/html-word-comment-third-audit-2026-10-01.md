# HTML 批注回写 Word 第三次审计

日期：2026-10-01。范围：当前工作区源码，包括未提交改动。此次仅新增审计材料，没有修改业务代码、重启容器或操作真实协同任务。

结论：第二次审计中的多个具体复现已通过，但不能验收为通用可靠方案。新 run 重建算法会删除已有批注范围和段落结构；源哈希的生成与校验语义不一致，且校验可被元数据绕过；旧批注包追加会出现未声明命名空间。以下问题由独立 fixture 或处理器 mock 实际复现。

## 上次问题的复查结果

| 检查 | 本次实际观察 |
|---|---|
| 生成客户端脚本语法 | 通过 |
| 普通单 run 划词的嵌套结构 | 已修复：未发现 w:r 中嵌套批注边界或 run |
| 无效 DOCX | 注入器明确拒绝 |
| 完全相同的全局重复引用 | 已修复该案例：0 注入，1 ambiguous |
| 有准确条款标题的重复引用 | 正确定位到对应条款 |
| 不同作者/条款的同文本意见 | 已保留，新增 1 条 |
| 客户端数值 ID 与 Word ID 冲突 | 不再直接误删新意见 |
| 普通/含 XML 实体意见重复注入 | 本次案例都跳过新增 |
| 中文“第二条”编号 | 正确定位 |
| 找不到显式源附件 ID | 不再回退其他附件，未保存；但后续流程仍继续 |
| 全部未定位 | 不再保存清洁文件为批注版，hasAnnotatedDocx=false |
| 回复扩展 | 已生成 commentsExtended.xml 与 paraIdParent 关系；仍需保留范围和兼容性验证 |
| 页面提示 | 同步提交已读取注入统计和错误；异步提交有缺口 |
| Workbench TypeScript 类型检查 | 通过 |

这说明修复有实际进展；单个旧案例通过不等于新的重建算法覆盖了所有 DOCX 内容。

## 剩余问题，按优先级排序

### 1. P1：重建整个段落只复制 run，删除已有批注范围、超链接、书签和部分段落属性

位置：`apps/backend/governance/workbench/src/coordination/docx-xml.util.ts:157`、`:219`、`:261`；调用处 `docx-comment-injector.service.ts:429`。

写入器通过 runRegex 抽取所有 w:r，随后用 newInnerXml 替换整个段落内部。它没有保留原始节点的顺序和包裹结构。凡是不属于被复制 run 的节点都会被丢掉，包括 commentRangeStart/End、bookmarkStart/End、hyperlink 包裹、字段/内容控件等结构。选区相交的 run 还被转换成仅含 rPr + w:t 的新 run，其他原始内容也没有保留。

注入器对同段每条批注顺序调用该函数。第二次调用会删掉第一次刚写入的 commentRangeStart/End，虽可能保留 commentReference 的 run，却已经失去原选区，变为缺失范围的引用。

实际复现：

```text
同段两条独立批注：injectedCount=2
document.xml commentRangeStart IDs：仅 ["2"]
document.xml commentReference IDs：["2", "1"]
超链接保留：false
书签保留：false
run 颜色保留：true
pPr 前有换行空白时，段落属性保留：false
```

pPr 正则要求它紧跟在 w:p 起点后，合法格式化 XML 中的前导空白会导致 pPr 识别失败，然后在 run 重建时被丢弃。

修复要求：保持整个 XML 节点树和原顺序，只在确切选区拆分必要的 run。一次性处理同段所有批注，或让每次插入完整保留既有范围。对超链接、书签、字段、图片、内容控件及已有批注做保留断言。

### 2. P1：sourceDocumentHash 默认是正文文本哈希，回写却按 DOCX 文件字节哈希比较

位置：`contract-review-engine.service.ts:251`、`:271`；`contract-review.service.ts:225`；`coordination-action.processor.ts:232`。

parseContractDocument 的 sourceDocumentVersion 为 SHA256(fullText UTF-8)，sourceDocumentHash 在调用者没传时直接由该版本去掉 sha256: 前缀生成。这个哈希由报告和 HTML draft 透传。处理器却拿它与 SHA256(originalBuffer DOCX ZIP 字节) 或 MD5(originalBuffer) 比较。

正文和 ZIP 包是不同数据对象，哈希不能直接比较。没有外部传入文件哈希、且附件没有同值 metadata 时，正常报告生成的默认哈希会让后续回写失败。这是字段语义冲突，不能靠放宽比较解决。

fixture/mock 复现：源附件 ID 命中，报告 hash 按正文 UTF-8 生成；真实文件是该合同 DOCX，结果 saved=0、commentInjectionError=内容哈希校验失败，但仍进入 executeTransition。

修复要求：明确区分 sourceFileSha256（确切原 DOCX 字节）与 sourceTextDigest（解析文本）。从解析到报告、draft、processor 使用一致的文件哈希；若要校验文本摘要，必须按同一解析规范计算后再比较。

### 3. P1：实际文件哈希校验可被附件 metadata 绕过；仅版本匹配失败仍回退原稿

位置：`coordination-action.processor.ts:236`、`:160`。

matchesHash 是多个条件的 OR；其中包括 candidateDoc.hash / sha256 / md5 与期望一致。因此附件 metadata 只要声称一致，即使 computedSha256/computedMd5 都不同，也能通过所谓实际内容校验。

实际复现：report.sourceDocumentHash=deadbeef、candidate.sha256=deadbeef，DOCX 实际字节哈希不同，仍 saved=1 并继续流转。这里不需要篡改文件，只需原有 metadata 已过期就能绕过检验。

另仅提供 sourceDocumentVersion=sha256:missing-version，没有 ID/hash 时，版本找不到仍按文件名选择原稿。mock 实际 saved=1。这条回退仍与版本绑定的目标不符。

修复要求：附件 metadata 只用于查找候选，读取后必须以实际字节严格校验完整、带算法的摘要；ID/hash/version 显式绑定未满足时不要回退其他文件。前缀匹配应有明确格式和长度约束，禁止任意短前缀通过。

### 4. P1：向既有 comments.xml 追加新批注时可能生成未声明 w14 前缀

位置：`docx-comment-injector.service.ts:395`、`:446`。

新增批注段落总使用 w14:paraId 和 w14:textId。新建 comments.xml 时有声明 xmlns:w14；但追加既有 comments.xml 时只是插入字符串，不补齐命名空间。原包若是合法仅使用 xmlns:w 的旧式批注包，就会变成不合法 XML。

复现原包只声明 w 命名空间，原有一条传统批注；追加新意见后：

```text
使用 w14:paraId：true
声明 xmlns:w14：false
Python ElementTree 解析：FAIL unbound prefix
```

修复要求：修改 XML 文档时按 namespace URI 创建节点，并补齐根节点声明；同样核对既有 commentsExtended.xml 的前缀/根节点兼容性，禁止按固定前缀字符串猜测 XML 结构。

### 5. P2：普通长选区仍只写入前 20 个归一化字符；同条款内部歧义仍选首个

位置：`docx-clause-locator.service.ts:146`、`:155`、`:161`；`docx-xml.util.ts:209`。

定位器常把 cleanAnchor.slice(0,20) 当 matchedSnippet，后者直接作为实际写入范围。26 字完整选区 fixture 返回 targetTextSnippet.length=20，Word 选区不能与 HTML 用户选区一致。

全局重复引用已补 ambiguous，但条款内部匹配仍立即返回首段，也不检查同段重复引用的多个位置。已解析到目标条款但选区缺失时仍落到标题/编号，状态为 matched，没有表达“条款找到但选区丢失”。

写入器归一化偏移路径虽算出 origEnd，却仅保留 origStart，最终使用 matchStart + cleanSnippet.length 作为终点。去掉的标点/空白数量不同，会导致选区终点错误或过度包裹。

修复要求：区分 paragraph location 与 selection range；传原始完整选区和精确起止偏移。局部与全局都检查唯一性；恢复不了范围时报告范围降级，不要称精确划词成功。

### 6. P2：新增页面提示主要覆盖同步提交；异步批准/完成拿不到最终注入结果

位置：`workbench-coordination.service.ts:982`、`:1081`；`InboxTaskDetailModal.tsx:490`。

批准/完成且后面有自动化阶段时，会 setImmediate 后台调用 executeActionProcess，HTTP 先返回 asyncRunningPayload。此时批注尚未写入，返回 payload 中没有本次最终注入错误/统计。详情页只检查这次 submitRes，然后提示流转成功、关闭弹窗，没有在这一路等待或订阅最终批注结果。

处理器即使源附件/哈希不一致，catch 后仍只记错误并继续流转。本次 mock 均确认 transitioned=true。同步页面现在会提示“操作已流转，但 Word 批注回写提示…”，因此不能再说完全没有提示；是否允许失败继续流转属于需明确的产品策略。异步路径则仍无法依靠新增即时提示获知本次失败，也可能读到继承的旧统计。

修复要求：将注入列为独立可追踪步骤，绑定 actionId 和结果状态；同步执行需返回本次结果，异步执行需订阅最终完成/失败，清除上一轮统计，明确失败是否阻断流程。

## 其他仍待完善的边界

- preview 仍只检查 origin，未绑定 event.source；跨窗口渠道仍使用全局共享名称。
- 去重已改善为作者+段落+文本，但没有持久业务 commentId 映射，同作者在同段的两条同文本独立意见仍可能被合并；同批新意见也未加入 existingComments 去重集合。
- 回复扩展已创建，但 w:parentCommentId 自定义属性仍保留；需要规范校验和真实 Word/WPS 回归。现有无 w14:paraId 的父批注无法建立 paraIdParent，同段后续重写也可能删掉父批注范围。
- NDA 默认 ruleSetId 和 approvalOpinions 输出契约仍应统一；本轮未把这些较低优先级问题重复列为阻断项。

## 验证方法和边界

已运行：

1. 上次独立复现脚本：确认表中已改善的行为；不以旧诊断标签中的 SHOULD/FAIL 字样判断结果，而读取实际输出。
2. 新 fixture + 内存 processor mock：确认段落结构丢失、同段批注范围丢失、命名空间缺失、长选区截断、两类哈希错误和版本回退。
3. Python 标准 XML 解析器：确认追加旧包后的 comments.xml 出现 unbound prefix。
4. `pnpm --filter @ops/workbench typecheck`：通过。
5. 7 份合同样本旧 XML 保留检查：本轮均为 BODY_PRESERVED=false。run 拆分本身就会改变 XML，不能把这个结果直接等同于正文丢失；上述独立 fixture 才是超链接/书签/范围丢失的直接证据。

没有运行真实浏览器→API→数据库→Word/WPS 的完整流程，也没有全包 OpenXML schema 验证；没有创建任务、发送回执或修改实际附件。

新复现命令（仓库根目录）：

```sh
node docs/audits/html-word-comment-third-repro-2026-10-01.cjs
python3 -c "import xml.etree.ElementTree as E; E.parse('/private/tmp/third-audit-comments.xml')"
```

第二条命令预期复现 unbound prefix，说明当前追加实现有问题。诊断脚本打印观察结果，不表示所有用例通过。报告结论以本次源码及复现为准，保留旧报告作为历史记录。

建议优先修复：保持 XML 节点树的最小范围插入并保留同段所有批注；统一文本/文件哈希语义并严格校验真实字节；补齐既有包命名空间；再完善范围精度及异步结果反馈。完成后补真正的 HTML 新增/回复→详情页提交→下载 Word 和多批注/复杂段落回归。
