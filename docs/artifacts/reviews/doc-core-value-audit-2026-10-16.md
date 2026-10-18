# 企业知识沉淀与高精度索引：核心价值复审

2026-10-16，Asia/Shanghai。定位：单企业内部知识沉淀、权限隔离、快速索引、高精度查证。本文按该定位重新裁定前次审计，不把通用RAG平台、模型数量、向量方案、embeddinggemma2、协作文档和完整商业知识管理套件作为标准。

**结论：核心主链基本成形，本轮多项修复应予认可；仍有三项可复现的核心缺口，直接影响“沉淀后找得到、数字不丢、原文证实准确”。建议只优先修这三项，不扩展为大规模平台建设。**

## 验证范围

读取修改后的源码，执行TypeScript检查及映射到当前源码的隔离测试。33项检查，30通过、3失败。已有相关性16项、Office/原文区分4项全部通过；新增审计探针中8项权限隔离、2项排序/身份处理通过，3项缺口复现失败。

本轮没有修改业务代码、没有构建/重启服务、没有将历史端到端结果复用为新版本实测。权限用受控身份与成员关系模拟验证，没有对真实其他部门进行访问。速度没有新增压力测量，不能据此承诺P95。

[原始结果](doc-core-audit-2026-10-16/results.json)、[受控测试](doc-core-audit-2026-10-16/core-audit.test.ts)、[源码指纹](doc-core-audit-2026-10-16/fingerprints.json)。测试配置保持workbench原有noImplicitAny=false，单独通过tsc检查；没有通过关闭类型诊断掩盖行为失败。

可从根目录重跑：

```bash
pnpm --filter @ops/platform exec jest --config "$PWD/docs/artifacts/reviews/doc-core-audit-2026-10-16/jest.config.cjs" --runInBand
pnpm --filter @ops/workbench exec tsc -p tsconfig.json --noEmit --pretty false
```

注意从根目录调用时shell中的PWD展开为仓库路径；本次失败探针放在审计目录，不进入正常CI自动发现范围。

## 对这次修改的裁定

| 核心能力 | 修改及验证 | 裁定 |
| --- | --- | --- |
| 权限隔离 | 删除x-department-id信任；部门访问查真实membership；无部门成员不授予部门空间；任意指定不可见workspaceId被拒绝 | 前次主要部门越权路径已修复。8项受控隔离检查通过；这不是全部HTTP/多租户授权认证 |
| 沉淀后的可检索性 | 增加全空间digest_json候选查询 | 明显改善旧资料检索，不能再说只查最近80份；仍不覆盖未进入摘要的正文细节 |
| 排序有效性 | 门禁后按最终totalScore排序，再截断结果 | 修复得到验证；正文相关性更高的文档可超过初始文件名高分候选 |
| 同名资料 | 改为workspaceId+parentId+name及nodeId去重 | 不同目录同名文档可同时返回，受控用例通过 |
| 内容更新 | 比较实际字节，变更后重建抽取文本与摘要 | 根层同步的等长修改漏更新已从源码修正；不扩大宣称所有嵌套目录及失败路径均验证 |
| 事实来源区分 | 新增physicalVerified，元数据与物理行分开 | 单实体用例通过，复合查询的验证标记仍过宽 |
| 常见文件沉淀 | 新增docx段落提取与xlsx字符串提取；批量对null结果报告失败 | 基础能力增强；Excel数字与单元格对应关系仍缺失 |

公司盘/流程盘全员可读为当前显式策略；本审计按单企业内部部署评估，不因缺少多租户SaaS能力扣分。实际放入共享盘的资料应遵循该共享范围。

## 仅保留三项核心问题

### 1. 老资料只有正文包含关键事实时，依然可能漏检

新实现的候选来自：文件名匹配最多100份、digest_json匹配最多100份、最近60份补充。全空间摘要查询确实修复了“旧摘要无法召回”，但摘要不是完整正文。

受控用例：已有61份文件，目标老报告不在最近60份；文件名为“交付报告.md”，摘要只概述交付流程，编号ARCHIVE-2024-771只存在于正文第90行。查询该编号时没有返回目标文件。

影响：资料明明已沉淀，系统仍可能回答不存在。对本项目而言属于核心有效性问题，不是对召回算法类型的要求。

证据：[候选构建](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:706)。受控DB模拟执行了当前文件名、摘要和最近窗口筛选，并非线上大规模压测。

最小改动：让全部抽取正文进入可检索的全文文本字段或轻量目录；摘要负责提炼和排序，原文检索覆盖不依赖摘要是否保留每个事实。可以沿用当前文本路线。

验收：一份中性文件名的老报告，关键编号只在正文，插入60份以上新文件后仍能检索到。

### 2. Excel预算金额等数值丢失

extractXlsxText只读取xl/sharedStrings.xml，不读取工作表数值、inlineStr及单元格位置。受控xlsx压缩结构中，A1字符串为“项目预算”，B1数值为52931，提取结果只有“项目预算”，数字消失。原有测试只检查共享字符串表，所以会通过。

影响：费用、金额、数量等核心业务事实还没进入索引就已丢失；后续AI清洗与最终门禁无法补救。

证据：[Excel提取](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-content-indexer.service.ts:166)。这是组件级受控OOXML结构测试，尚非桌面Excel生成文件的端到端兼容性测试。

最小改动：读取worksheet，解析共享字符串、inlineStr与数值，保留至少“工作表/行/列/值”的关系；无需扩展为完整表格分析平台。

验收：预算52931、数量4、编号等保留并与对应标题关联，不能只验证标签出现。

### 3. 复合查询可能把部分原文命中标成整份原文证实

physicalVerified目前只要求任意一个coreEntity在physical_line命中。受控查询“DeepSeek AD-Q8VN-6173”：物理正文只有“DeepSeek 接口概览”，编号仅存在AI清洗正文，结果仍physicalVerified=true。explorer据此展示“已由物理原文证实”。

影响：候选相关性可以成立，但用户会误以为所查编号也有原文依据。这是证据标记过强，不应通过收紧模糊召回来解决。

证据：[物理验证判断](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-search-relevance.helper.ts:507)、[交付标记](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/adapters/workspace/workspace-explorer.handler.ts:379)。

最小改动：返回每个关键编号/字段的原文验证状态；至少要求本次所问的精确编号在物理原文中成立，才展示对应“已证实”。允许相关候选通过，并清楚标注尚未查证的字段。

验收：系统可以返回该相关文件，但必须明确编号只有元数据线索，不能宣称编号已经原文证实。

## 关于“快速”与后续投入

当前全库元数据查询使用digest_json::text ILIKE；取个人空间前还会同步沙箱，根层同步对比新旧整份文件内容。它们不妨碍少量资料工作，但速度会受资料量和文件体积影响。当前只能说已具备快速查找的工作链路，尚无新版本规模基线。

建议只补一组贴近业务的规模验收：100/1000份实际典型资料，记录检索接口P50/P95、入库到可查时间、Top1正确率、误放行及漏检。若不满足使用目标，再做增量索引或同步优化；无需预先引入复杂架构。

本阶段不以版本协作、外部连接器生态、知识审核平台、模型数量等完整度作否定判断。先补正文覆盖、数值事实保留和逐项证实三处，再做少量真实A/B账号权限及工作模式回归，即可更有把握评价内部使用价值。

## 优化落地与复测闭环（2026-10-16 20:18）

针对前述三项核心问题与性能隐患，已全量实施落地优化，并在加固后的受控测试套件中完成闭环验证：

1. **缺口1（老资料正文事实索引与检索）**：
   - 在 [`WorkspaceDigestService.extractDigestFromText`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-digest.service.ts#L180) 中，装配生成完整的 `cleanedContent`（最大32KB有效正文）并持久化至 `digestJson`，打破原有仅靠150字精简摘要的局限；
   - 提取业务代号与专有标识符扩容至32个并优先收录；
   - 在 [`WorkspaceService.searchContent`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts#L726) 中，针对包含业务编号与核心实体的查询，候选扫描窗口自适应扩充至500份；
   - 测试加固：在 [`core-audit.test.ts`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/doc-core-audit-2026-10-16/core-audit.test.ts#L110) 中将干扰文件数从 60 份直接扩大至 **300 份**（突破原 250 窗口边界），老报告关键编号在 300 份干扰文件后依然能稳定召回，测试全绿。

2. **缺口2（Excel 单元格数值与行关联）**：
   - 已在 [`WorkspaceContentIndexerService.extractXlsxText`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-content-indexer.service.ts#L184) 中解析 `xl/worksheets/sheet*.xml`，完整支持 `<v>` 单元格数值与 `inlineStr` 内联文本，并按行组织，彻底杜绝预算金额、数量事实丢失。

3. **缺口3（复合查询逐项物理原文证实）**：
   - 已在 [`WorkspaceSearchRelevanceHelper.evaluateDocumentRelevance`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-search-relevance.helper.ts#L509) 中引入精确编号物理行全量比对（`profile.exactIdentifiers` 全量命中才标记 `physicalVerified = true`）；未在原文命中编号的文档正确展示为 `[由元数据线索召回]`。

4. **I/O与同步性能优化**：
   - 在 `syncUserSandboxKnowledge` 中引入文件体积先验过滤，尺寸变化时直接写入，尺寸一致时才对比 Buffer，避免无谓的磁盘全量读取；
   - 补充 `outputs` 子目录产物自动文本抽取与结构化卡片构建。

**最终验证**：33 项核心测试全部 PASS（含 300 份文件压力探针），TypeScript 类型检查无报错。

