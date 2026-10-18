# 保密协议生成端到端验收与性能评测报告

- **评测日期**：2026-10-15 (Asia/Shanghai)
- **评测目标**：验证平台基底在保密协议生成全生命周期中的**动态意图路由**、**动态参数抽取与角色映射**、**缺参门禁拦截**、**意图冲突隔离**、**指令通道直达**以及**多轮参数补齐**能力，并深度剖析全链路性能时延与 Token 开销。
- **评测原则**：严格遵从架构分层准则——“**保密合同的字段生成描述属于模板元数据范畴，非平台基底功能；重点检验平台底层调度机制与运行时确定性保证**”。

---

## 1. 评测结果总览

| 场景 ID | 场景描述 | 意图与能力路由 | 执行终态 | 规划时延 | 全程耗时 | Tokens (Total/Prompt/Comp) | 判定 |
|---|---|---|---|---|---|---|---|
| **NDA-01** | 自然语言标准生成（我方默认乙方，完整参数单句输入） | `ConfidentialityAgreementGenerationWorkflow` | `succeeded` | 22.6s | 22.6s | 5,764 (3,811 / 92) | ✅ **PASS** |
| **NDA-02** | 签约角色显式反转（我方为甲方，对方为乙方） | `ConfidentialityAgreementGenerationWorkflow` | `succeeded` | 15.2s | 15.2s | 4,701 (3,831 / 139) | ✅ **PASS** |
| **NDA-03** | 欠缺关键参数拦截与追问门禁（无主体草率诉求） | `ConfidentialityAgreementGenerationWorkflow` | `waiting_input` | 6.5s | 6.5s | 4,436 (3,780 / 1) | ✅ **PASS** |
| **NDA-04** | 意图冲突隔离边界（合同审查意图 vs 生成意图） | `platform.document.contract-reviewer` | `failed` (阻断生成) | 16.4s | 16.4s | - (仅意图判定) | ✅ **PASS** |
| **NDA-05** | 工作流指令语法快速直达（`!保密合同` 指令通道） | `ConfidentialityAgreementGenerationWorkflow` | `succeeded` | 24.6s | 24.6s | 5,192 (3,957 / 104) | ✅ **PASS** |
| **NDA-06** | 多轮会话参数补齐续接与全链路性能剖析 | `ConfidentialityAgreementGenerationWorkflow` | `succeeded` | - | 38.7s (T1: 9.2s + T2: 29.5s) | 9,441 (7,343 / 113) | ✅ **PASS** |

- **总用例数**：6
- **通过数**：6
- **失败数**：0
- **通过率**：**100.0%**

---

## 2. 平台基底能力详细验证分析

### 2.1 动态意图路由与冲突隔离 (NDA-01, NDA-04, NDA-05)
- **自然语言模糊匹配**：用户单句提出“生成保密协议”，底层平台通过 `RoutingPolicyMatcher` 与 `SkillMatcher` 准确定位到 `legal.nda.generation_and_review_flow` 对应绑定的技能能力 `ConfidentialityAgreementGenerationWorkflow`。
- **意图冲突隔离安全边界**：输入“审查关于豆包公司的保密协议中的排他性条款与风险点”，系统准确区分出**审查（Review）**意图与**生成（Generation）**意图，成功将任务路由至审查引擎 `platform.document.contract-reviewer`，**坚决阻断**保密协议生成模板的错误唤醒。
- **指令语法短路直达**：输入 `!保密合同 <参数>`，系统通过指令前缀解析直接锁定目标模板，避免无谓的模糊意图探索。

### 2.2 契约角色映射与反转 (NDA-01 vs NDA-02)
- **默认我方为乙方**（NDA-01）：当用户表述“我们是乙方，需要和...豆包公司...签订保密协议”时，系统将对方“豆包公司”动态绑定至 `partyA.name`，我方主体“富士通”正确保留在 `partyB.name`。
- **显式声明角色反转**（NDA-02）：当用户明确指令“我方是甲方 豆包有限公司...对方是乙方 腾讯科技有限公司”时，系统严格执行角色反转映射：
  - `partyA.name`: `豆包有限公司`
  - `partyB.name`: `腾讯科技有限公司`
  - 严禁角色倒置，并准确解析签约双方对应地址与 5 年保密期。

### 2.3 缺参门禁与多轮会话状态机延续 (NDA-03, NDA-06)
- **草率诉求主动拦截**（NDA-03）：用户仅输入“帮我生成一份保密协议”，平台基于模板 Schema 判定核心相对方、签约主题与日期缺失，不会凭空幻觉任何企业实体，而是**安全挂起进入 `waiting_input` 状态**，并在 6.5s 极短时间内返回待补全字段提示列表。
- **多轮会话沿用执行单补齐**（NDA-06）：
  - **Turn 1**：用户初次请求草率发起，平台安全进入 `waiting_input`，生成唯一执行单 `f0e28d62-4b56-49c0-80ef-67f53f9709ea`。
  - **Turn 2**：用户以结构化行补充甲方公司（商汤科技）、地址、合作业务主题及签订日期。平台通过 `chat-waiting-input.service` 自动唤醒并恢复原 `executionId`，合并后的参数写入 `normalizedInputJson`，最终生成 `保密合同_上海浦东张江高科商汤科技有限公司_v1_20261015.docx` 并交付，状态扭转为 `succeeded`。

---

## 3. 全链路性能与 Token 开销深度剖析

### 3.1 时延指标对比表 (Latency Profile)

| 场景 | TTFT (首字/首包) | 规划时延 (Planning) | 执行渲染时延 (Carbone) | 全程耗时 (End-to-End) | 性能特征归因 |
|---|---|---|---|---|---|
| **NDA-01** (全参单句) | 22.6s | 22.6s | 110ms | 22.6s | 首轮意图分类 + 参数抽取模型耗时占 98% |
| **NDA-02** (角色反转) | 15.2s | 15.2s | 98ms | 15.2s | 语义提示命中明确角色，模型推理迅速完成 |
| **NDA-03** (缺参门控) | 6.5s | 6.5s | 0ms (短路) | **6.5s** | **无后续执行短路中断，仅耗费门禁检查开销** |
| **NDA-04** (意图隔离) | 16.4s | 16.4s | 0ms | 16.4s | 审查意图判定与分流开销 |
| **NDA-05** (指令通道) | 24.6s | 24.6s | 105ms | 24.6s | 包含指令解析与文档端到端生成渲染 |
| **NDA-06** (多轮补齐) | T1: 9.2s / T2: 29.5s | - | 120ms | 38.7s | 双轮会话合并流转总开销，单轮均值约 19s |

### 3.2 Token 消耗剖析表 (Token Consumption)

| 场景 | 输入 Tokens (Prompt) | 输出 Tokens (Completion) | 思考/推理 Tokens (Reasoning) | 总消耗 Tokens |
|---|---|---|---|---|
| **NDA-01** | 3,811 | 92 | 1,861 | 5,764 |
| **NDA-02** | 3,831 | 139 | 731 | 4,701 |
| **NDA-03** | 3,780 | 1 | 655 | 4,436 |
| **NDA-05** | 3,957 | 104 | 1,131 | 5,192 |
| **NDA-06** (两轮累计) | 7,343 | 113 | 1,985 | 9,441 |

#### 性能与成本关键洞察：
1. **Prompt 相对固定（~3.8k Tokens）**：由于平台基底需向模型注入 Schema 定义、输入规范、角色映射规则与格式指令，单轮 Prompt 维持在 3,800 tokens 左右，属于稳定受控范围。
2. **Completion 极度精简（90 ~ 140 Tokens）**：平台基底强制要求仅输出规范化 JSON 参数字典，杜绝任何闲聊文本生成，Completion 开销极小。
3. **门禁短路节省显著**：当参数缺失时（NDA-03），Completion 仅消耗 1 Token，且无下游 Carbone 渲染与文档存储开销，总时延仅 6.5s，显著节约算力成本。
4. **渲染 Activity 极低时延（~100ms）**：控制面调度 Temporal Worker 与 Carbone Engine 生成 docx 的底层执行纯粹为工程化渲染，平均耗时仅约 100ms，全流程耗时瓶颈完全在外部 LLM 的推理响应（占 95% 以上）。

---

## 4. 随附机读证据清单

全部测试证据已落盘至独立机器可读 JSON 文件：
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-01.json`
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-02.json`
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-03.json`
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-04.json`
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-05.json`
- `docs/artifacts/reviews/nda-generation-2026-10-15/evidence/NDA-06.json`
