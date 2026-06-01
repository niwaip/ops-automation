# Debug Session: blank-output-instability

- **Status**: [OPEN]
- **Issue**: 新发布技能执行单 `7ed5e567-23b4-4f9e-99a4-620bb2dd8b93` 状态已完成，但生成文档内容全部空白；此前同链路还出现过 `[object Object]`，需要确认不稳定发生在发布绑定、执行期参数装配、还是渲染请求阶段。
- **Goal**: 通过运行时证据确认本次“整份空白”的直接原因，并判断其与此前 `[object Object]` 是否属于同一根因或相邻链路缺陷。

## Reproduction
1. 使用刚发布的新技能发起执行。
2. 执行单 `7ed5e567-23b4-4f9e-99a4-620bb2dd8b93` 运行至完成。
3. 下载生成文档，发现正文替换结果全部为空白。

## Hypotheses
1. 新发布技能绑定的并不是刚修复后的工作流快照，导致运行时仍使用旧的或不完整的 `renderPath/templateBinding`。
2. 执行期 `paramResolution` 中存在值，但在 runtime request builder / temporal workflow code 中被过滤、裁剪或映射失败，最终 `render_data` 为空对象或大面积空字符串。
3. 文档渲染 activity 收到的 `templateId` 或 `data` 不正确，导致 Carbone 用对了模板但没有有效数据。
4. 发布成功后的技能快照与执行期解析到的 capability/release 版本不一致，出现“发布物正确但执行单引用旧版本”的漂移。
5. 本次“整份空白”与此前 `[object Object]` 不是同一根因：前者来自渲染数据整体缺失，后者来自局部双语对象未拆值。

## Constraints
- Steps 1-4 不修改业务逻辑。
- 第一处对现有代码的改动只能是插桩。
- 先确认本次执行单实际命中的 skill/release/workflow 快照，再判断是否需要继续插桩。

## Evidence
- 待补充

## Conclusion
- 待补充
