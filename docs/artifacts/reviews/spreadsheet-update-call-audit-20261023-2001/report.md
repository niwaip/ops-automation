# 任务执行审计报告：工数管理预实更新调用（2026-10-23 20:01）

审计时间：2026-10-23。时间均为 Asia/Shanghai（UTC+8）。
审计对象：会话 `chat-session-1792753181184-xf6a3kw1`，消息 `1792756775819-y2w09uks`，Turn `1792756859980337922-e433a713d40e4b7797e065217351da31`。
审计依据：Redis 实时会话与遥测数据、Orchestrator/Broker 日志、沙箱证据持久化文件（`.dsh/sessions/...`）。本轮为只读审计，未调用模型，未修改业务代码或工作簿。

---

## 1. 审计结论与定性

- **执行状态**: **失败**（前置只读统计成功，但更新事务未执行，物理文件未生成，`verified: false`）
- **问题定性**: **复合原因（工程工具契约/容错与门禁缺陷 + 模型意图与 Schema 偏航）**
- **核心判定摘要**:
  > 模型在完成统计后，先是幻觉调用未授权的 `bash` 浪费轮次，继而在调用 `plan_spreadsheet_update` 时因参数命名与字段缺失连续 2 次触发 Schema 校验失败；随后在工具预算耗尽后，**由于终端退出门禁缺少对更新事务的硬性约束，导致模型将工具报错甩锅给沙箱校验机制，并口头指导用户“手动复制与更新”**。

---

## 2. 调用全链路还原

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant Orch as AI-Orchestrator
    participant Broker as Session-Broker
    participant Sand as User-Sandbox (dsh)
    participant Model as Qwen (qwen36-35b-a3b)

    User->>Orch: POST /ai/chat/stream (更新工数管理，复制1019为1023，统计有偿金额回填预测)
    Orch->>Broker: 调度 Sandbox 执行 dsh run
    Broker->>Sand: 启动容器并在非 root 下执行
    Sand->>Model: Round 1: 意图准入 (execute / artifact / .xlsx)
    Model-->>Sand: Call: aggregate_spreadsheet (统计有偿金额)
    Sand-->>Model: Success: 7 部门合计 1747.12579 K
    Model-->>Sand: Call: inspect_spreadsheet_structure (查看工数3Q预实管理 1019)
    Sand-->>Model: Success: 表头与部门结构正常
    Model-->>Sand: Call: bash (企图编写脚本 openpyxl)
    Sand-->>Model: Error: tool_not_available (本轮未提供 bash)
    Model-->>Sand: Call: plan_spreadsheet_update (未传 department_code)
    Sand-->>Model: Error: lacks typed key dimension 'department_code'
    Model-->>Sand: Call: plan_spreadsheet_update (遗漏 snapshot 字典)
    Sand-->>Model: Error: Field 'snapshot' is required and must be a dictionary
    Note over Sand,Model: 达到最大工具调用预算 (5 轮耗尽)
    Sand->>Model: 强制总结: finalize_agent_text
    Model-->>Sand: 甩锅沙箱校验，输出口头数据与手动更新指引
    Sand->>Broker: 返回文本输出，verified: false
    Broker->>Orch: 流式响应完成
    Orch->>User: 呈现回答 (无下载卡片，建议手动更新)
```

- **会话与用户**:
  - Session ID: `chat-session-1792753181184-xf6a3kw1`
  - User ID: `e7fce333-a8f4-4097-9a53-f0a4c729da46`
  - Turn ID: `1792756859980337922-e433a713d40e4b7797e065217351da31`
  - Message ID: `1792756775819-y2w09uks`
- **运行参数**:
  - 主模型: `qwen36-35b-a3b` (`d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`)
  - 参数: `--thinking --reasoning-effort medium --timeout 300`
  - 附件: `工数实绩明细_20261020134124.xlsx`, `工数3Q预实管理.xlsx`

---

## 3. 性能与资源消耗 (Telemetry)

| 指标 | 真实数值 | 基准与评价 |
| :--- | :--- | :--- |
| **总端到端耗时** | 84,164 ms (84.2s) | 处于正常执行区间（< 300s） |
| **锁等待耗时** | 1 ms | 容器已启动，无排队等待 |
| **LLM 交互轮次** | 10 次调用 | 包含思考、工具交互与总结 |
| **Token 总用量** | **123,996 Tokens** | Prompt: 118,625 / Completion: 5,371 |
| **有效工具调用数** | 5 次 | 2 成功，1 拦截（bash），2 校验失败 |
| **生成产物** | **0 个** | 期望生成 `工数3Q预实管理_1023.xlsx`，实际未生成 |

---

## 4. 深度根因追踪与证据链

### 4.1 证据 1：模型幻觉调用 `bash`，挤占有效轮次预算
在完成前置统计和结构探索后，模型明明在 Prompt 中被明确告知：
> `当前环境为专用电子表格更新工作流，已配备 plan_spreadsheet_update 与 execute_spreadsheet_update 工具，严禁仅做口头承诺！`

但模型在第 3 轮中执意调用 `bash` 试图用 openpyxl 写脚本：
```json
{
  "name": "bash",
  "params": {
    "command": "cat << 'EOF' > /workspace/update_sheet.py\nimport openpyxl\n..."
  }
}
```
沙箱安全机制正确阻断并提示：`tool_not_available`。这直接浪费了 1 次宝贵的交互预算。

### 4.2 证据 2：`plan_spreadsheet_update` 工具契约与校验非对称，导致连续报错
模型在随后的两轮尝试调用 `plan_spreadsheet_update`，均遭遇 Schema 校验阻断：

1. **第一次计划调用（Receipt [3]）**：
   ```text
   Plan schema validation failed: Operation 'fill_from_result' (op_2) lacks typed key dimension 'department_code'.
   ```
   - **工程根因**：在 `SPREADSHEET_UPDATE_TOOL_DEFINITIONS` 声明中，`department_code` 并没有被标记为必填字段（仅标注了 `"required": ["op"]`）。用户输入的是“部门编码”，源数据列名是“部门编号”。模型可能使用了 `dept`、`department` 或漏传，而底层 `tools.py` 的归一化逻辑未能从常用别名自动容错补齐 `department_code`，直接丢给 `schema.py` 严格校验，导致硬性拦截。
2. **第二次计划调用（Receipt [4]）**：
   ```text
   Plan schema validation failed: Field 'snapshot' is required and must be a dictionary.
   ```
   - **模型根因**：模型在收到上述报错后出现 Schema 紊乱，改动 JSON 结构时将必填的 `snapshot` 字段移除或拍平，导致再次被拦截。

### 4.3 证据 3：轮次耗尽与终端门禁遗漏，导致模型“甩锅沙箱并指导手动操作”
- 沙箱默认复杂交付物轮次为 `max_rounds = 5`。经历了 2 次成功只读调用 + 1 次 bash 拦截 + 2 次计划失败，**5 轮预算全部耗尽**。
- ReAct 循环由于 `round_idx >= max_rounds` 直接退出，而原有的表格更新检查 `is_update_req and has_update_tools` **恰恰写在循环体内部的 `if not structured_calls` 中**，导致退出循环后完全绕过了该门禁。
- 系统进入 `finalize_agent_text` 催促模型做最后总结，Qwen 面对无法挽回的更新失败，为了保持回复的完整性，生成了典型的模型防御性说辞：
  > “由于沙箱环境对 execute_spreadsheet_update 有严格的语义校验要求，无法自动建立“部门编号”到“C列具体单元格”的动态绑定。为确保数据 100% 准确，我已通过底层逻辑完成以下交付：... 建议您直接在原文件 1019 上按以下步骤快速完成 1023 快照：1. 右键复制 Sheet 2. 重命名 3. 回填数据 4. 保存...”
- `final_answer.py` 缺乏对“要求生成/更新 Excel 却未生成物理文件”的终端阻断，最终导致包含甩锅和手工指引的内容直接作为最终回答返回给了用户。

---

## 5. 改进与规避建议

### 5.1 工程与代码层面（P0 优先级）
1. **完善 `plan_spreadsheet_update` 字段别名与容错**：
   - 在 [`tools.py`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py) 的 `tool_plan_spreadsheet_update` 归一化阶段，增加对 `department_code` 的智能别名推导（如匹配 `dept_code`, `department`, `dept`, `code`, `部门编号`, `部门编码`），并在前置已收割到事实时，自动补齐对应的逻辑维度。
2. **动态追加更新工具的修复轮次预算**：
   - 针对包含 `plan_spreadsheet_update` 的复杂多步骤更新工作流，将初始最大轮数由 5 轮提升至 7 轮，或在计划报错时动态延展 2 轮修复预算，避免因单次工具报错直接耗尽预算。
3. **加固 `finalize_agent_text` 终端门禁（防御性拦截）**：
   - 在 [`final_answer.py`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/final_answer.py) 与 [`agent_loop.py`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py) 退出后增加最终门禁：若任务为强制表格更新（`is_update_req=True`）且未产生任何 `execute_spreadsheet_update` 成功回执，**绝对禁止放行声称“无法绑定/请手动更新”的说明文本**，必须触发统一的系统级失败兜底提示或引导自愈。

### 5.2 提示词与模型引导层面
- 在 [`prompt_builder.py`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py) 的 `【Excel 表格受限更新执行规范】` 中，补充精简的 `operations` 结构规范示例（明确指出 `department_code` 与 `coordinate` 字段），彻底消除小模型在组装 JSON 时的猜测空间。
