# Debug Session: render-bindings-empty

Status: [OPEN]
Started: 2026-06-02
Execution ID: `076de7b7-9d21-4a4c-adc5-75961e7b4737`

## Symptom

- 执行单已完成，但结果仍为空。
- 重点排查 `RENDER_BINDINGS = { "companyName": ["companyName_zh", "companyName_ja"] }` 的展示与回填结果。
- 需要判断是回填链路异常、翻译模块异常，还是渲染读取链路异常。

## Hypotheses

1. `RENDER_BINDINGS` 已生成，但渲染阶段未正确读取或匹配该绑定配置。
2. 翻译结果已生成，但没有被写回到渲染输入上下文中。
3. 回填逻辑已执行，但字段名映射方向错误，导致 `companyName_zh` / `companyName_ja` 未落到预期位置。
4. 执行单状态虽为完成，但中间某个子步骤被吞错或产出了空值，最终被正常结束状态掩盖。
5. 前端/查询展示层读取的是旧字段或错误字段，因此实际有值但展示为空。

## Plan

- 定位执行单查询、工作流比较候选、渲染绑定、翻译与回填的完整链路。
- 优先收集已有日志、代码路径与持久化数据证据，不先改业务逻辑。
- 若静态证据不足，再添加最小化埋点验证关键变量。

## Evidence

- 数据库 `execution` 记录显示，执行单 `076de7b7-9d21-4a4c-adc5-75961e7b4737` 的 `step 2 inputJson` 中确实存在源字段值，例如：
  - `contract.partyA = 上海云章科技有限公司`
  - `payment.method = 分期付款`
  - `payment.bankAccount = 开户名：北京星川数字科技有限公司...`
  - `payment.firstDays = 5`
  - `payment.firstRatio = 60`
  - `payment.firstAmount = 60`
  - `payment.finalDays = 10`
  - `payment.finalRatio = 40`
  - `acceptance.days = 7`
- 生成的 workflow 代码 `.tmp-template1febbc18.py` 中，`RENDER_BINDINGS` 明确包含这些映射：
  - `contract.partyA -> contract.partyA_cn / contract.partyA_jp`
  - `payment.method -> payment.method_cn / payment.method_jp`
  - `payment.bankAccount -> payment.bankAccount_cn / payment.bankAccount_jp`
  - `acceptance.days -> acceptance.days_cn / acceptance.days_jp`
- 模板原始 `docx` 正文中存在对应占位符，例如：
  - `委托方：{d.contract.partyA_cn}`
  - `技術サービス料は甲が{d.payment.method_jp}...`
  - `乙方指定银行帐号为：{d.payment.bankAccount_cn}。`
  - `...{d.payment.firstRatio_cn}%，即{d.payment.firstAmount_cn}。`
- 最终输出 `docx` 中，这些占位符都被替换掉了，但对应内容为空，例如：
  - `委托方：（下称甲方）`
  - `技术服务费由甲方：（一次或分期）支付乙方。`
  - `乙方指定银行帐号为：。`
  - `甲方于本合同签订之日起5日内向乙方支付总价款之%，即。`
- 当前本地 `carbone-engine` 服务对同模板调用 `/studio/template/render-data`，直接返回：
  - `TPL_002: 当前模板尚未保存 TemplateFieldSpec`
- 当前本地模板文件和数据库模板记录都缺少可供 `render-data` 使用的 `TemplateFieldSpec / templateAssetManifest`。

## Current Assessment

- 假设 1：`RENDER_BINDINGS` 未生成
  - 结论：已排除。workflow 代码里已生成。
- 假设 2：翻译结果未写回
  - 结论：不是主因。中文 `_cn` 字段同样为空，说明并非仅日文翻译失败。
- 假设 3：回填逻辑字段方向错误
  - 结论：高度可疑，但更上游的证据显示本地 `render-data` 所需元数据本身缺失。
- 假设 4：执行完成但中间产出空值
  - 结论：基本成立。最终文档表现为“占位符被清空”而非“变量名残留”。
- 假设 5：展示层读错字段
  - 结论：已基本排除。实际输出 `docx` 文件正文就是空白。
