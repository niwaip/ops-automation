# Doc核心价值复审：修改后回归与边界

2026-10-16。范围保持为单企业内部知识沉淀、权限隔离、检索有效性和原文证据准确性。没有将向量、模型数量、完整知识库平台功能作为标准；未修改业务源码。

**结论：已有33项检查全部通过，Excel数字与原文证实标记已修复；老资料检索通过扩大窗口缓解，仍有覆盖上限。新增4项边界检查通过2项、失败2项：窗口外正文事实漏检，以及第二个已授权部门检索被误拒绝。**

## 本轮执行

- 现有相关性16项、格式与来源4项、此前核心审计13项：33/33通过。其中8项权限隔离、2项最终排序/跨目录同名保留继续通过。
- TypeScript：`pnpm --filter @ops/workbench exec tsc -p tsconfig.json --noEmit --pretty false`通过。
- 新增正文边界及授权部门场景：4项中2通过、2失败。
- 测试直接映射当前源码，避免测试到旧dist；本轮没有构建、重启服务或进行新的HTTP/浏览器端到端测试，不将其记为部署验收。权限检查使用隔离成员关系和空间数据，未读取真实其他部门资料。

[汇总](doc-core-reaudit-2026-10-16/summary.json)、[现有33项原始结果](doc-core-reaudit-2026-10-16/regression-results.json)、[新增边界结果](doc-core-reaudit-2026-10-16/boundary-results.json)、[源码指纹](doc-core-reaudit-2026-10-16/fingerprints.json)。

## 上轮问题逐项裁定

| 问题 | 当前实现与测试 | 裁定 |
| --- | --- | --- |
| Excel数值丢失 | 开始读取worksheet，解析共享字符串、inlineStr与数值，并按行组合；预算52931的原失败用例通过 | 本次指定缺口已修复，不扩大宣称全部Excel格式与公式语义均验证 |
| 原文证实标记过宽 | 存在精确编号时，要求全部所查编号在物理片段命中；严格普通实体查询要求全部实体物理命中 | 原失败复合查询通过，摘要中的编号不再仅因正文命中DeepSeek就被标记已原文证实 |
| 老文件正文漏检 | 实体/编号查询窗口扩大至500份，普通查询250份；仍有全库摘要候选补充 | 300份新文件之后的原样例通过；并未形成全量正文检索覆盖 |
| 部门请求头越权 | 继续忽略客户端部门头，真实membership决定归属 | 8项隔离回归通过，未观察到原漏洞回归 |
| 最终排序、同名文档 | 继续按最终分数排序、按空间目录区分同名文件 | 两项受控回归通过 |

## 剩余核心问题一：正文覆盖仍有明确窗口边界

受控数据：目标文件名为“交付报告.md”，摘要仅描述交付流程，编号ARCHIVE-2024-771只在正文第90行。其标题与摘要不含编号。

| 目标文件之前较新的文件数量 | 实际结果 |
| --- | --- |
| 300 | 找到，目标处于最近500份内 |
| 499 | 找到，目标正好为第500份 |
| 500 | 漏检，目标为第501份 |

原因：[recentTakeLimit仍为500/250](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:727)。文件名及摘要分支没有命中时，窗口外正文没有扫描入口。

这里的500是实体查询正文兜底扫描范围，不是系统只能存500份，也不是所有500份之外的文件都找不到。窗口外文件只要摘要或文件名命中，仍可进入另外两路候选。

最小建议：明确当前覆盖边界，或让全部抽取正文进入轻量文本目录/可检索文本列；无需引入RAG或向量架构。若产品要求“沉淀多久都能按正文事实查到”，扩大固定窗口不能算完全修复。

## 剩余核心问题二：第二个已授权部门会被检索误拒绝

getMyWorkspaces支持用户多个部门，将它们返回在departments列表中；但searchContent只将personal、company、单个department、process放入visibleWorkspaceIds，未包括其余已授权部门。

受控场景：服务端可见列表已包含部门A和部门B，默认department为A；非管理员指定部门B的workspaceId检索，实际抛403“您无权检索指定工作空间的内容”。未指定空间的默认查询也不会把部门B纳入扫描。

证据：[完整可见部门列表](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:194)、[检索可见空间构建](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/workbench/src/workspace/workspace.service.ts:672)。

这是已有授权被误拒绝，不是新的越权泄露。最小建议：将服务端已经核验的全部部门workspaceId纳入检索范围，或者指定workspaceId时调用相同的membership授权策略。不要为此恢复信任客户端departmentId。

## 当前可接受程度

指定样本上的数字保留、原文与元数据区分、权限隔离、结果排序均有可重复验证，核心能力相比上轮更完整。实际单部门、资料规模受控的使用可继续推进；若要求跨全部所属部门查找，以及长期积累后仍能查到正文细节，上述两处是下一步应优先收口的核心边界。

快速性本轮没有新增真实规模测量，不因隔离测试耗时短而承诺线上性能。本阶段不再扩展连接器、协作文档、完整治理平台等要求。

重跑新增边界（从根目录）：

```bash
pnpm --filter @ops/platform exec jest --config "$PWD/docs/artifacts/reviews/doc-core-reaudit-2026-10-16/jest.config.cjs" --runInBand
```

失败探针保存在审计目录，不进入常规CI默认发现范围；初始33项的配置及结果单独保留。
