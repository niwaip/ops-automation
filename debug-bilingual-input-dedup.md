# Debug Session: bilingual-input-dedup [OPEN]

## Problem

端到端验证“创建一个技术服务合同”时，双语补参字段应按单一语义识别与展示：
- `验收期限天数（中文）` 与 `验收期限天数（日文）` 只识别为一个语义参数
- 日文字段应通过翻译自动生成，不要求用户重复输入
- 请求用户追加输入时，双语场景不应展示两个相同语义参数

## Hypotheses

1. 缺参聚合按原始显示标签处理，未做双语语义归一化，导致同义参数重复展示。
2. 双语字段的 canonical key 生成逻辑没有覆盖 `（中文）` / `（日文）` 标签后缀。
3. 翻译补全只在文档渲染阶段执行，补参阶段没有消费该能力。
4. 请求补参消息构造直接使用了原始缺失字段数组，绕过了去重后的语义层。
5. 模板工作流服务内部已做部分归一化，但执行单补参接口再次展开成双语字段。

## Plan

1. 定位创建技术服务合同的模板工作流、缺参识别、补参提示生成链路。
2. 直接运行端到端流程复现当前行为并记录证据。
3. 基于证据做最小修复。
4. 再次运行验证双语字段去重与自动翻译行为。

## Evidence

1. 读取现有执行单 `36d361fd-7186-4f23-8004-70bc1dc24d16` 的 `semantic.groupedMissing`，仍可见旧数据中同时存在：
   - `验收期限天数（中文）`
   - `验收期限天数（日文）`
   - `委托方名称（中文）`
   - `委托方名称（日文）`
2. 新建执行单 `c16ae9af-26e5-4f82-8e85-eeeefa427ea2` 后，等待补参文案已按业务组去重展示：
   - `验收：验收期限天数`
   - `技术服务合同 / 技術サービス契約：委托方名称`
   未再重复展示中文/日文两个同义参数。
3. 对新执行单仅提交中文补参：
   - `验收期限为30天，委托方名称为广州日产通商贸易有限公司`
   提交后 `acceptance.days` 与 `contract.partyA` 两个业务组从缺失列表中消失，且执行单输入中同时出现：
   - `acceptance.days_cn`
   - `acceptance.days_jp`
   - `contract.partyA_cn`
   - `contract.partyA_jp`
4. 初次复验发现等待输入恢复链路会把双语两侧都写成同样的中文值，说明展示层已修复，但主补参链路未复用双语翻译补全逻辑。
5. 修复 `ChatController.buildWaitingInputPayload()` 后再次新建执行单 `f89eed5b-6364-474a-8904-d7b6ac46eedf` 并提交同一句中文补参，执行单输入变为：
   - `acceptance.days_cn: 30`
   - `acceptance.days_jp: 30`
   - `contract.partyA_cn: 广州日产通商贸易有限公司`
   - `contract.partyA_jp: 広州日産通商貿易有限公司`
   证明单语输入已驱动双语字段自动生成，且名称字段已走日文翻译。

## Status

- Fix implemented and runtime-verified.
- Waiting for user confirmation before closing the session.
