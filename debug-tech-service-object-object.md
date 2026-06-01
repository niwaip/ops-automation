# Debug Session: tech-service-object-object

- **Status**: [OPEN]
- **Issue**: AI 聊天模式端对端生成技术服务合同时，文档中仍出现 `[object Object]`，且多处参数为空白，需要定位问题发生在 submit-input 合并、runtime payload 装配，还是模板绑定层。
- **Goal**: 通过最小运行时插桩确认对象值是在哪一层进入最终渲染 payload，并验证空白字段与 `[object Object]` 是否属于同一根因。

## Reproduction
1. 使用 `admin/admin123` 登录。
2. 通过 `POST /ai/chat` 以任务模式创建技术服务合同执行单。
3. 对 `waiting_input` 执行单调用 `POST /api/executions/:id/submit-input`，补交包含 `{cn,jp}` 结构和数组双语项的缺失字段。
4. 下载最终 docx，检查付款条款与关键字段替换结果。

## Hypotheses
1. `waiting_input` 补交的 `{cn,jp}` 对象被直接保存在 `paramResolution.value`，后续某一层未做 locale 解析，直接渲染成 `[object Object]`。
2. runtime 对 `render_path` 分支做了 locale 解析，但某些字段走了 `template_binding` 或其他路径，绕过了解析逻辑。
3. 双语数字字段如 `payment.firstDays`、`payment.firstRatio`、`payment.firstAmount` 在 runtime payload 装配时没有展开到 `_cn/_jp`，因此文档出现空白或对象串化。
4. `submitInputAndResume()` 合并后的 `normalizedInput.input` 正确，但发给 document render activity 的 payload 已丢失或畸形，根因在 runtime payload builder。
5. 模板实际绑定路径使用了基础键而非 `_cn/_jp` 具体字段，导致对象值原样进入模板。

## Constraints
- Steps 1-4 不修改业务逻辑。
- 第一处对现有代码的逻辑改动只能是插桩。
- 先用运行时证据确定对象值出现的具体层级，再决定修复点。

## Evidence
- 待补充

## Conclusion
- 待补充
