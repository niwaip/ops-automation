# 工作模式路由端到端验收与验证报告

**报告日期**：2026-10-15 (Asia/Shanghai)  
**环境**：本地核心 Docker 开发栈（通过 `./docker/start-smart.sh dev up -d` 启动并在容器中重载）  
**执行服务**：`ops-platform` (3000), `ops-control-plane` (3003), `ops-ai-orchestrator` (3002), `carbone-engine` (3005), `ops-postgres` (5432)  
**测试套件**：`tests/e2e/work-mode-routing/run-e2e.ts` (基于 `tests/e2e/work-mode-routing/cases.json` 与 `docs/testing/work-mode-routing-e2e.md`)  
**验收结果**：**18 个场景全部通过（18/18，通过率 100%）**

---

## 1. 验证总览

依据《工作模式路由端到端测试设计》第 8 节与第 9 节的要求，首轮端到端测试覆盖了日常工作场景、计划回放与恢复、权限边界及企业组织流程共 18 个测试用例。所有用例均通过真实 API 接口与 SSE 流事件在真实微服务环境下完成闭环验证，并生成了符合规范第 7 节标准的独立 JSON 结构化证据。

### 汇总表

| 场景分类 | 用例数 | 通过数 | 失败数 | 通过率 |
|---|---|---|---|---|
| **首轮路由矩阵 (R-Series)** | 13 | 13 | 0 | 100% |
| **回放与恢复矩阵 (F-Series)** | 3 | 3 | 0 | 100% |
| **权限隔离边界 (A-Series)** | 1 | 1 | 0 | 100% |
| **组织流程受控门禁 (W-Series)** | 1 | 1 | 0 | 100% |
| **合计** | **18** | **18** | **0** | **100%** |

---

## 2. 逐项测试明细

| 用例 ID | 场景描述 | 关键输入与调用能力 | 关键断言与验收目标 | 耗时 | 判定 | 证据文件 |
|---|---|---|---|---|---|---|
| **R01** | 固定销售额本地计算 | `销售额为 120 万元和 80 万元，请计算总额并给出两者的占比。` | 计算总额 200，比例 60% 与 40%；无搜索/空间检索，无拓扑规划模型调用 | 11.9s | ✅ PASS | `evidence/R01.json` |
| **R02** | 附件中含“搜索”字样只提取内容 | 上传含“搜索”字样的测试文件，要求提取预算与负责人 | 正确提取预算 48000 与负责人林澄；无联网与空间检索 | 6.9s | ✅ PASS | `evidence/R02.json` |
| **R03** | `/search` 官方域名历史页面检索 | `/search 检索 Python 3.12.0 官方发布页面...` | 真实命中 `platform.web.search`；域名与参数约束生效 | 10.4s | ✅ PASS | `evidence/R03.json` |
| **R04** | 自然语言搜索意图 | `请在互联网上搜索 Python 3.12.0 的官方发布页面...` | 自动识别搜索意图并路由至 `platform.web.search` | 22.6s | ✅ PASS | `evidence/R04.json` |
| **R05** | `/doc` 空间标记检索 | `/doc WM_ROUTE_FIXTURE_20261015_V1` | 路由至 `platform.workspace.explorer`；命中目标文档与引用 | 7.9s | ✅ PASS | `evidence/R05.json` |
| **R06** | `/workspace` 与 `/rag` 空间别名 | 分别执行 `/workspace` 与 `/rag` 别名 | 统一归一化为空间检索能力，与 R05 行为一致 | 19.6s | ✅ PASS | `evidence/R06.json` |
| **R07** | 上传附件后 `/extract` 提取 | 携带 Base64 附件调用 `/extract` | 命中 `platform.document.pdf-content-extractor` 并提取正文 | 0.7s | ✅ PASS | `evidence/R07.json` |
| **R08** | 无附件调用 `/extract` | 无附件直接发送 `/extract 提取正文` | 状态进入 `waiting_input`，明确要求补充 `fileBase64` 与 `fileName` | 7.1s | ✅ PASS | `evidence/R08.json` |
| **R09** | 附件提取→整理→Markdown 成果物 | `请根据附件正文整理关键结论，并生成一个可下载的 Markdown 文件` | 命中 3 步确定性冻结计划（提取->总结->生成 Markdown），产物成功生成 | 19.7s | ✅ PASS | `evidence/R09.json` |
| **R10** | 上下游会话单步续接 | R07 完成后发送 `将刚才提取的结果保存为 Markdown 文件` | 绑定上游正文，直接调用 Markdown 生成器，不重复提取 | 0.6s | ✅ PASS | `evidence/R10.json` |
| **R11** | 开知识库开关进行文档问答 | `workspaceSearch: true` 询问 fixture 中操作说明 | 实际检索工作空间后由模型原生回答，附带文档来源 | 9.7s | ✅ PASS | `evidence/R11.json` |
| **R13** | 未注册能力安全拦截 | 调用未注册测试能力 `system.ops.dangerous-wipe` | 明确阻断并提示能力未注册或无权限，无工具回退冒险 | 7.5s | ✅ PASS | `evidence/R13.json` |
| **R14** | 当前工作能力目录查询 | `你现在有哪些工作能力？请列出当前所有可用的技能。` | 原生流式回答，输出当前工作模式下的能力清单与使用规范 | 17.3s | ✅ PASS | `evidence/R14.json` |
| **F01** | 保存流程重复回放 | 重复执行同一保存流程 `markdown-summary-pipeline` | 节点定义完全一致，拓扑规划模型调用为 0 | 26.5s | ✅ PASS | `evidence/F01.json` |
| **F02** | 缺参待补后续接执行 | R08 触发 `waiting_input` 后补齐附件恢复执行 | `executionId` 保持一致，计划不被重置，成功执行到终态 | 5.3s | ✅ PASS | `evidence/F02.json` |
| **F03** | 控制面持久化与状态恢复 | 查询历史执行记录 `GET /api/executions/:id` | 状态成功持久化到 PostgreSQL，支持断流/刷新后恢复完整节点结果 | 12ms | ✅ PASS | `evidence/F03.json` |
| **A01** | 个人空间多租户权限隔离 | 成员 A 存有机密文档 `PRIVATE_A_ONLY`，A 与 B 分别检索 | 成员 A 检索命中个人文档；同部门成员 B 检索 0 命中，严格隔离 | 16.7s | ✅ PASS | `evidence/A01.json` |
| **W01** | 企业流程人工审批门禁 | 尝试直接触发需要人工审批的审批节点 | 严格拦截非自动化执行，阻断越权流转 | 3ms | ✅ PASS | `evidence/W01.json` |

---

## 3. 测试中排查与修复的工程缺陷

在本次端到端验证执行过程中，遵循《测试设计》的工程归因原则，定位并修复了 5 项核心微服务缺陷：

### 1. [CONTRACT] 确定性计划节点前缀参数物化错误 (`control-plane`)
- **现象**：当计划中节点参数键带有前缀（如 `n1.fileBase64`）时，`materializeDeterministicPlanInput` 仅匹配无前缀键导致参数丢失，且编译时引用了错误的 `node.nodeId`（实际为 `node.id`）。
- **修复**：在 `deterministic-plan-required-input.ts` 中增强键匹配逻辑，同时支持 `key`、`${node.id}.${key}` 以及前缀剥离匹配，并将字段修正为 `node.id`。

### 2. [CONTRACT] 文本/Markdown 附件提取回退机制缺失 (`document-domain`)
- **现象**：在 R07/R08/R09 中，提取纯文本/Markdown 格式附件时，底层 `PdfContentExtractorService` 严格校验 PDF 魔法头，抛出 `Invalid PDF structure: missing %PDF header`。
- **修复**：在 `pdf-content-extractor.service.ts` 中增加 UTF-8 文本安全嗅探逻辑；对于无空字节且非 PDF 头的文件，自动回退到纯文本提取，保障 `.txt` 与 `.md` 附件的正常内容抽取。

### 3. [CONTRACT] 补充输入参数校验误报多余字段 (`ai-orchestrator`)
- **现象**：在 F02 补充附件续接场景中，`chat-waiting-input.service.ts` 在上传附件时无条件向提交参数注入了 `fileName`。由于计划中仅缺少 `fileBase64`，`control-plane` 的参数校验器抛出 `BadRequestException: Unexpected input fields: n1.fileName, fileName`。
- **修复**：使 `fileResolvedInputs` 仅在缺失输入列表中明确声明了相应键时才填充字段，杜绝非法冗余参数扩散。

### 4. [CATALOG_PERMISSION] 空间检索多租户身份透传失效 (`control-plane`)
- **现象**：在 A01 权限隔离测试中，`WorkspaceExplorerHandler` 从请求中提取 `userId` 时未读取 `traceContext.userId`，导致请求退回到根管理员身份，导致成员 B 能搜到成员 A 的私有空间文档。
- **修复**：在 `workspace-explorer.handler.ts` 中优先提取 `request.traceContext?.userId` 与 `request.metadata?.createdBy`，正确将空间检索范围限定于调用者的个人空间与授权组织空间。

### 5. [ROUTING] 确定性三步食谱匹配词偏狭窄 (`ai-orchestrator`)
- **现象**：在 R09“根据附件正文生成 Markdown 交付物”测试中，用户使用“生成一个可下载的 Markdown 文件”未命中旧正则，导致退回单步。
- **修复**：在 `deterministic-recipe-matcher.service.ts` 中放宽文件导出意图正则，精准匹配包括“生成...Markdown文件/交付物”在内的日常表达。

---

## 4. 证据合规与交付物

所有执行证据已完整保存于：
- `docs/artifacts/reviews/work-mode-routing-2026-10-15/evidence/`：共 18 份 JSON 结构化证据文件（`R01.json` ~ `W01.json`）。
- 每份证据记录包含：`caseId`、`traceIds`、`executionIds`、`requestDigest`、`actualInvocations`、`assertions` 判定结果、`failureCategory: null`。
