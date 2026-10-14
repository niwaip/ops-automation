# 商业办公助手场景 35B 模型（qwen36-35b-a3b）全量复测报告

日期：2026-10-13，Asia/Shanghai。测试对象：OpsPilot 个人助理（Personal Assistant 模式，账号 admin，模型配置 `qwen36-35b-a3b`，模型 ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`，dsh 容器沙箱运行时）。

本轮针对商业办公场景基准（CP-01 ~ CP-06）进行全量复测，重点验证工程修复项（CP-02 路由意图隔离、CP-03 交付物落盘动态督促与生成）在 35B 本地模型上的生效表现与端对端交付可靠性。

---

## 一、复测结论总览

| ID | 场景及任务目标 | 上轮默认模型结果 | 本轮 35B 实测结果 | 耗时对比 | 状态判定 |
|---|---|---|---|---|---|
| **CP-01** | 根据事实起草中文项目状态邮件 | 完成：7.7 秒；草稿正常 | **完成**：4.1 秒；四部分完整，无外发 | 7.7s ➔ **4.1s** | **PASS** |
| **CP-02** | 会议记录整理，生成 `CP_会议行动清单.md` | 完成但额外交付：135.7 秒；伴随未请求的 HTML 幻灯片 | **完成**：13.5 秒；仅交付 MD，**零冗余 HTML** | 135.7s ➔ **13.5s** (提速 10x) | **PASS（工程修复生效）** |
| **CP-03** | 销售 CSV 计算汇总、差额并生成含图表 Excel | 未交付：130.0 秒；正文有数据但无物理 XLSX | **完成**：152.4 秒；真实生成 `CP_季度销售分析.xlsx`，含图表 | 未交付 ➔ **成功落盘** | **PASS（工程修复生效）** |
| **CP-04** | 项目方案生成 Word 实施计划 `CP_实施计划.docx` | 完成：61.6 秒；DOCX 可解析 | **完成**：77.8 秒；DOCX 规范生成 | 61.6s ➔ 77.8s | **PASS** |
| **CP-05** | Word 计划生成 3 页原生 PPTX `CP_项目汇报.pptx` | 完成：117.5 秒；PPTX 3 页 | **完成**：29.6 秒；原生 PPTX 3 页 | 117.5s ➔ **29.6s** (提速 4x) | **PASS** |
| **CP-06** | 修改 Word 预算为 36,000 元，生成 `v2.docx` | 部分完成：120.3 秒；预算修改但过度扩写 | **完成**：11.2 秒；精确修改预算，原件哈希一致 | 120.3s ➔ **11.2s** (提速 10x) | **PASS** |

**核心结论：6 个场景全部达到客观功能验收断言，达成率 100%（6/6 PASS）。此前暴露的 CP-02 额外 HTML 污染与 CP-03 缺失 Excel 实体两大缺陷均在 35B 模型上得到闭环修复验证。**

---

## 二、关键工程修复点在 35B 上的闭环验证

### 1. CP-02：Markdown 意图路由严格隔离（已消除副产物）
- **前期问题**：Skill Router 在请求包含“生成可下载文件 CP_会议行动清单.md”时，模糊命中了 `html-ppt` 意图，导致模型思维链额外规划并执行了 HTML 幻灯片渲染。
- **本次验证**：
  - 路由精准阻断：仅调用 `read_file` 采集会议记录，随后通过 `write_markdown` 写入 `CP_会议行动清单.md`。
  - **零副产物生成**：沙箱中严格未产生 `presentation.html` 或多余下载卡片。
  - **性能飞跃**：单轮耗时从 135.7 秒骤降至 **13.5 秒**，Token 消耗从 77,355 降至 **9,242**（节省 88%）。

### 2. CP-03：数据分析与物理交付物落盘保障（已彻底解决漏交付）
- **前期问题**：模型在第 5 轮耗尽推理预算后，因被剥夺工具权限导致最终只在正文中复述计算结果，未落盘物理 `.xlsx` 文件。
- **本次验证**：
  - 沙箱 Harness 动态预算与交付物督促机制触发：模型在读取 `季度销售.csv` 后，使用 `bash` 配合 `openpyxl` 自动化编写并调试工作簿脚本。
  - **物理产物成功落盘**：沙箱工作区生成 `CP_季度销售分析.xlsx`（10.8 KB）。
  - **数据与图表三层断言**：
    1. 工作表 1（`原始明细`）：包含 6 行明细数据与差额列；
    2. 工作表 2（`区域汇总`）：华东总销售额 360,000 / 目标 340,000；华南总销售额 280,000 / 目标 290,000；
    3. 工作表 3（`销售额对比图`）：真实内嵌 1 个 openpyxl 原生对比柱状图（`len(ws._charts) == 1`），断言全部通过。

### 3. CP-06：多轮脚本版本隔离与原版保护
- **验证表现**：
  - 原件完整性：基准文件 `CP_实施计划.docx` 的 SHA256 为 `77d75588775bab8f7d7e575239f77eb53c57172163c0f965e914f2470c1225f7`，运行前后完全一致，未发生意外覆盖。
  - 新件准确性：新生成的 `CP_实施计划_v2.docx`（39.7 KB）经 python-docx 解析，精确将“项目预算：30,000 元”替换为“项目预算：36,000 元”。
  - 文本克制性：全文维持 20 段，未发生无依据的排期扩写。

---

## 三、35B 模型执行遥测明细

| 场景 | 会话 ID | 执行耗时 | 沙箱退出码 | 工具调用链 | Token 用量 | SSE 终态 |
|---|---|---|---|---|---|---|
| **CP-01** | `789eaa03-ce3e-4d8a-9fc9-68c8711b6f00` | 4,068 ms | 0 | 0（纯文本生成） | 3,086 | `done: true` |
| **CP-02** | `b40021da-bc05-4087-a11a-f3f341bf5ad8` | 13,455 ms | 0 | `read_file` ➔ `write_markdown` | 9,242 | `done: true` |
| **CP-03** | `dff5464c-99cf-4c33-b829-55ecde53248e` | 152,376 ms | 0 | `read_file` ➔ `bash`×4 | 105,836 | `done: true` |
| **CP-04** | `a3ad5f03-b4c2-4b94-93d9-1f0489846b65` | 77,771 ms | 0 | `read_file` ➔ `bash`×3 | 95,603 | `done: true` |
| **CP-05** | `0aab710e-67b6-4322-956c-79d7b502943e` | 29,579 ms | 0 | `read_file` ➔ `bash` ➔ `send_file` | 43,900 | `done: true` |
| **CP-06** | `0edc69cd-1ee4-4eeb-a045-f8aed023e18b` | 11,199 ms | 0 | `read_file` ➔ `bash` ➔ `send_file` | 41,758 | `done: true` |

---

## 四、测试证据与归档产物

- 完整流式日志（SSE）：
  - [`35b-copilot-cp-01-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-01-stream.txt)
  - [`35b-copilot-cp-02-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-02-stream.txt)
  - [`35b-copilot-cp-03-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-03-stream.txt)
  - [`35b-copilot-cp-04-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-04-stream.txt)
  - [`35b-copilot-cp-05-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-05-stream.txt)
  - [`35b-copilot-cp-06-stream.txt`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-cp-06-stream.txt)
- 汇总指标数据：[`35b-copilot-metrics-full.json`](file:///Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/35b-copilot-metrics-full.json)
- 实测物理交付物路径：
  - [`CP_会议行动清单.md`](file:///Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/CP_会议行动清单.md)
  - [`CP_季度销售分析.xlsx`](file:///Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/CP_季度销售分析.xlsx)
  - [`CP_实施计划.docx`](file:///Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/CP_实施计划.docx)
  - [`CP_项目汇报.pptx`](file:///Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/CP_项目汇报.pptx)
  - [`CP_实施计划_v2.docx`](file:///Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/CP_实施计划_v2.docx)
