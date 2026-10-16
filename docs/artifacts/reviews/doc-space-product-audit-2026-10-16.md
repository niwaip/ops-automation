# Doc 空间产品能力审计与商业平台差距

审计日期：2026-10-16，Asia/Shanghai。

**判断：当前是已形成业务闭环、适合受控内部试点的文档工作空间，尚不具备通用企业知识产品的完整交付条件。主要差距在权限可信度、资料覆盖与更新一致性、文档生命周期和运营能力。**

本审计明确不把向量、纯文本、多模型、模型规模和未来 embeddinggemma2 接入作为竞争评分项。所有建议都可以先在现有检索路线下实施。未来更换召回实现，不会自动解决权限、版本、证据和任务状态问题。

## 范围与证据等级

- 本轮：读取当前工作区源码、数据模型、管理端组件及官方产品文档；执行一个纯函数隔离探针。未改业务代码，未对真实账号实施越权访问，未进行新的负载测试。
- 历史实测：最近一轮五个工作模式场景和17项单元测试通过，见[复测报告](doc-retest-2026-10-16-1557.md)。这些结果仅证明当时样本和运行版本，不代表本轮之后修改的每条路径均已实测。
- 代码发现：以下确定性实现问题来自控制流与数据模型；在线利用情况、实际损失与发生频率未验证。
- 产品缺口：“尚未发现”限于已检查的doc模块/API/UI；不等于整个项目没有相关基础设施。例如工作流审计、平台备份与doc自身版本恢复不是同一能力。
- [源码指纹](doc-space-product-audit-2026-10-16/source-fingerprints.json)用于固定本次审计版本；结构索引存在滞后，结论以磁盘源码为准。

## 当前已经具备什么

| 维度 | 已实现或已验证的能力 | 证据边界 |
| --- | --- | --- |
| 空间与文件 | 个人、部门、公司、流程空间；目录、上传、下载、删除、配额；管理员跨用户维护 | 已读API、数据库模型及UI |
| AI治理 | 规则摘要、AI摘要、主题、结构化字段、精炼正文、自定义清洗指令、选择模型、批量清洗与覆盖率统计 | 上轮15份语料的指定关键事实检查通过，不能推出任意长文档完整保真 |
| 文档查证 | 工作模式/doc、精确编号、模糊候选、实体门禁、多字段原文扫描、来源打开 | 指定回归样本实测通过 |
| 来源类型 | 当前新增physical_line、metadata_topic、metadata_summary、structured_data；元数据line=0 | 源码确认，尚需全入口回归 |
| 业务接入 | 对话保存为笔记、沙箱资料同步、流程合同/审查报告/办结凭证归档 | 源码确认，既有部分界面实测 |
| 诊断 | 执行ID、聊天SSE、候选与放行数日志、测试脚本与证据文件 | 具备工程诊断基础，尚非业务人员可操作的质量运营台 |

最值得保留的是“任务执行—成果归档—资料查证—继续工作”的连接。产品定位应突出业务证据与成果复用，而不只描述为通用知识库。尚无同条件竞品实测，不能据此宣称整体体验优于商业产品。

## 需要优先处理的源码发现

### 1. 部门授权存在不可信输入路径——上线前处理

`WorkspaceController.extractAuth`在认证上下文没有部门字段时采用`x-department-id`；全局JwtAuthGuard设置的用户对象仅有身份、角色和activeOrgId，没有departmentId。`assertAccess`首先用传入departmentId与目标空间部门相等来判定归属，相等就不再查membership。

因此按当前控制流，已登录的非管理员如能指定其他部门ID，存在绕过成员归属核验的路径。`getMyWorkspaces`还允许非管理员传targetDeptId；无部门用户会兜底到全量部门/首个部门。searchContent根据这些派生空间选候选，没有逐空间重新做真实成员关系授权。

证据：[认证入口](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.controller.ts:34)、[全局认证对象](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/identity-access/src/guards/jwt-auth.guard.ts:108)、[部门校验](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:985)、[默认空间选择](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:136)。

建议：部门ID只作为用户选择条件，归属一律由服务端membership与组织上下文求交；列表、检索、预览、下载统一调用同一权限策略。无部门默认不授予部门空间。补普通成员A/B、无部门成员和管理员矩阵测试。此项为高置信代码风险，未在线验证真实泄露。

另：Workspace无orgId；公司/流程空间按type全局findFirst。若一个部署承载多企业组织，不能据此视作租户隔离已经成立；若明确单企业独立部署，应在产品边界中写清。不能把组织管理模块存在等同于文档租户隔离已完成。

### 2. 候选截断使“全空间检索”不完整——高优先级

候选由“文件名命中的最近50份”与“全部空间最近80份”合并。老文件只在正文/摘要命中、文件名不含查询词，且已掉出最近80份时，不进入候选，后续门禁和排序再准确也无法找回。不是模糊召回问题，而是检索覆盖问题。

证据：[候选构建](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:685)。

建议：建立覆盖全部可见资料的可更新检索目录；可用文本倒排或现有数据库文本索引实现，不要求向量。以“旧文档、新增200份噪声、标题中无关键词、正文仍可命中”作为验收。

### 3. 同名去重与排序契约不足——高优先级

返回前以小写文件名去重，会丢弃不同空间/目录中的不同同名文档，例如两个部门的《操作规程.md》。唯一性应基于文档ID，内容去重应按哈希/版本关系，不能按文件名。

候选按`scoreCandidateNode`预排；后续`evaluateDocumentRelevance.totalScore`用于门禁，却未据此重新排序，返回累计30份即停止；explorer再取前4份。当前不能声称交付的是最终正文相关性最高的全局Top K。

证据：[预排与同名去重](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:727)、[最终评价与截断](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:809)、[交付前4份](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/adapters/workspace/workspace-explorer.handler.ts:323)。

建议：候选、验证、最终排序、交付截断四步分开；产品公开“匹配依据、覆盖实体、证据类型”，内部保存排序理由。测试应区分原始业务文件、转述总结、旧版文档和同名文件。

### 4. 内容更新与缓存可能不一致——高优先级

沙箱同步仅当文件大小改变时覆盖已有文件。同字节长度的修改不会同步；大小改变后也未在该分支重建或失效`.extracted.txt`与digest。getExtractedText优先读已有缓存，可导致原件已更新但检索仍引用旧内容。

证据：[同步更新分支](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:1434)、[优先读取缓存](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-content-indexer.service.ts:314)。

建议：按内容哈希/文件版本识别变化；源文件、抽取文本、AI结果和检索目录绑定同一版本，更新时重建派生物。必须覆盖“等长改预算”和“改文件大小但缓存仍旧”两种回归。

### 5. 清洗成功状态不可靠，长文档会被截断——高优先级

generateAndSaveDigest遇不支持提取的文档会返回null；伴生文件写入、数据库更新失败仅记warn，仍可返回digest。batch调用没有检查返回是否为空或AI是否降级，只要未throw就计successful++。因此“任务成功”不一定表示可检索、已持久化或已AI清洗。

AI仅接收前24000字符，默认生成200–800字精炼正文。它属于摘要式提炼，不能等同于完整清洗原文，尾部条款和附件事实没有全量处理保障。

证据：[结果写入与失败处理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-digest.service.ts:242)、[输入截断](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-digest.service.ts:299)、[批量成功统计](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:1189)。

建议：持久化pending/running/succeeded/failed/partial/fallback状态，分开显示解析成功、AI成功、存储成功、检索就绪；支持重试、取消、进度、错误原因。长文档按段处理并汇总，显示解析页数和覆盖范围。

### 6. 多格式接入与证据可靠性仍不完整——高优先级

doc空间当前extractText直接支持文本与文字型PDF；PDF最多前100页，没有本模块内的扫描OCR分支。普通doc/docx/xlsx/pptx上传在该提取链路中返回null，不会因为其他服务具备Office处理能力就自动接通。已存在伴生文本的文件可能另行可用，应分别测试。

新的sourceKind与元数据line=0是正确改进，explorer已经区分来源；但native知识注入仍存在统一格式化“第${m.line}行”的代码，元数据片段可能显示第0行。还缺稳定页码/段落/表格单元格定位及引用绑定版本。

另外，一致性门禁可由AI摘要/清洗正文等元数据中的完整实体满足。隔离探针在不提供物理正文、仅提供AI正文含编号时得到`admitted=true, consistencyVerified=true`。这证明的是实体一致，不是原文真实性；不是对模糊候选的否定。严格“从原文查证”还应要求原文可定位，元数据只能作为线索。

证据：[格式提取](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-content-indexer.service.ts:109)、[元数据验证](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace-search-relevance.helper.ts:442)、[native注入行号](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-knowledge-retrieval.service.ts:145)。

建议：统一解析适配层与来源契约，支持文件版本+页/段/表格坐标；明确“相关资料”和“已由原文证实”两种交付状态。原始资料与模型转述资料分级，防止AI总结反复作为权威知识回流。

### 7. 文档生命周期与可恢复性缺口——企业交付前补齐

WorkspaceNode只有当前文件与digest，没有在该模型中发现文档版本、软删除、发布/审核、生效/失效、内容责任人、保留期等字段。删除直接删原件与节点，失败可被吞掉；未见对伴生抽取缓存与digest的同事务清理。存储与数据库分步写入、配额按旧值赋值，也存在并发配额统计和孤儿文件风险。

证据：[数据模型](/Users/chain/Documents/MyProject/ops-automation/apps/backend/platform/prisma/schema.prisma:1823)、[上传](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:427)、[删除](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:526)。

建议：先做版本、回收站、失效/撤回与操作审计，再按客户需求加审批、保留策略；用任务补偿和周期对账管理对象存储与数据库一致性。平台备份不能替代用户可用的单文档恢复。

## 对照商业产品：比较用户可获得的能力

以下是公开文档功能对照，不是同一数据集的性能竞赛；不同套餐/部署版本需另行确认。Dify/RAGFlow作为知识库平台参照，SharePoint与Guru分别作为文档管理和知识治理的商业参照，不混合成一个“完美竞品”。

| 能力 | 本项目现状 | 商业/成熟平台参照 | 差距判断 |
| --- | --- | --- | --- |
| 数据接入与加工 | 手动上传、沙箱同步、流程成果、摘要与自定义清洗 | Dify提供数据源→提取→处理→存储的可配置管线 | 加工任务与接入连接器尚未产品化 |
| 解析检查 | 原文预览、AI卡片与字段可看 | RAGFlow可查看、修改解析片段，测试召回及排名 | 缺逐页解析质量检查、纠正后重建与结果对照 |
| 检索质量运营 | 工程脚本、SSE与日志 | Dify提供检索测试及生产检索记录；RAGFlow提供候选内容与排名检查 | 缺管理员可用的试验台、查询分析与反馈回归 |
| 文档生命周期 | 当前文件、硬删除 | SharePoint具有版本历史、恢复、权限与保留/审计相关功能 | 缺版本追溯、恢复和文档级治理 |
| 知识可信度 | cleanedByAi、提炼时间 | Guru支持验证状态、责任人、验证周期并影响知识使用 | “已清洗”不能代替“内容有效且已审核” |
| 工作流融合 | 对话、任务、成果归档、/doc查证已贯通 | 商业平台也有工作流/应用集成 | 本项目值得加强的差异化方向，尚无证据证明全面领先 |

官方依据：

- [Dify知识管线](https://docs.dify.ai/en/cloud/use-dify/knowledge/knowledge-pipeline/readme)描述可配置的数据源、提取、处理和存储流程；[Dify检索测试](https://docs.dify.ai/en/cloud/use-dify/knowledge/test-retrieval)包括测试与关联应用的检索记录。
- [RAGFlow解析与片段检查](https://ragflow.io/docs/v1.0.0-rc1/)、[检索测试](https://ragflow.io/docs/v1.0.0-rc1/retrieval_testing)提供解析结果干预、来源及候选排序检查。此处不比较其召回算法。
- [SharePoint版本历史与保留/审计](https://learn.microsoft.com/sharepoint/document-library-version-history-limits)、[权限层级](https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels)作为文档生命周期与访问管理参照。
- [Guru知识验证](https://help.getguru.com/docs/what-is-verifcation)作为内容责任与时效治理参照；不采纳其营销性能数字作为比较证据。

## 建议实施顺序与验收

| 顺序 | 目标 | 可验收结果 |
| --- | --- | --- |
| 第一批：守住可信边界 | 修部门/组织授权；源版本与派生缓存一致；全空间覆盖；清洗状态真实 | A/B部门隔离、无部门默认拒绝；等长更新生效；旧文件经过200份噪声后仍能召回；失败不显示成功 |
| 第二批：让业务人员能维护 | 版本/回收站、文档责任人/有效期、持久化任务、格式解析、统一证据定位 | 能恢复误删、撤回过期制度；批量失败可重试；Office/PDF解析范围可见；点击引用定位到对应版本原件 |
| 第三批：稳定规模化使用 | 同名/内容去重、最终排序、连接器增量同步、质量运营与监控 | 代表性语料固定评测；Top1/Recall@K/错误放行率/引用正确率及P95耗时有基线；反馈进入回归集 |

建议下一轮数据集覆盖200/2000/10000份资料，加入旧文件、重名文件、修订版、不同部门权限、长PDF、扫描件、Office表格、事实在文末、跨文档冲突和AI转述污染。具体性能SLA应根据部署资源与业务要求设定；本轮不凭五个小样本给出商业性能承诺。

未来若接embeddinggemma2，只需作为候选来源的一个适配器；本报告不评价其模型效果。无论候选来自哪种实现，都应复用相同权限、版本、证据来源、最终门禁和评测契约。
