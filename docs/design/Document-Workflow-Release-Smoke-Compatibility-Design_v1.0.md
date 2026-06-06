# 文档工作流发布与 Smoke Test 兼容设计 v1.0

**版本：** v1.0  
**日期：** 2026-06-02  
**状态：** 建议方案  
**适用范围：** Temporal 模板工作流发布、Capability Release、部署后 Smoke Test、共享 `documentRender` Activity

---

## 1. 目标

本文用于解决当前文档模板工作流在发布阶段出现的阻断问题，重点回答以下问题：

1. 已有完整 `workflowDsl.inputParams.renderPath` 的工作流，为什么在 `release smoke test` 阶段失败；
2. `TemplateFieldSpec` 在当前发布链路中是否必须；
3. 如何在不修改现有工作流语义的前提下，让 `release` 与真实运行时一致；
4. 如何让双语场景继续遵循“语义参数 -> 翻译 -> 多目标变量赋值”的真实流程。

本文只基于当前仓库内已经存在的 `workflow`、模板元数据、release snapshot 与运行日志进行设计，不新增额外模板情报。

---

## 2. 背景与现状

当前排查对象是模板 `1234.docx`，其生成的工作流已经表达出完整的双语参数语义，典型示例如下：

```json
"contract.partyA.name": {
  "renderPath": ["contract.partyA.name_cn", "contract.partyA.name_jp"],
  "localizedVariants": ["cn", "jp"]
}
```

这表示：

- AI 识别与工作流输入只关注 `contract.partyA.name` 这一语义参数；
- 中文和日文模板变量不是独立采集对象，而是该语义参数的两个渲染落点；
- 当 `targetLanguages=["ja"]` 时，运行时应先基于语义参数得到本地化结果，再分别写入 `*_cn` 与 `*_jp`。

同时，当前工作流还包含如下关键信息：

- `targetLanguages = ["ja"]`
- 多个参数具备 `renderPath: string[]`
- 双语字段并未在 workflow 源 DSL 中消失
- source snapshot 中仍保留大量 `*_cn` / `*_jp` 路径映射

因此，从工作流语义上看，当前问题并不是“工作流没有足够信息”，而是“发布态运行时与 smoke test 没有正确消费这些信息”。

---

## 3. 当前问题定义

## 3.1 真实现象

当前 `release` 可以创建，`build` 也能成功，但在 `deploy` 阶段的 `post_deploy_smoke` 失败。

失败日志稳定表现为：

```text
模板渲染数据生成失败: HTTP Error 400: Bad Request
TPL_002: 当前模板尚未保存 TemplateFieldSpec
```

## 3.2 本质原因

当前共享 `documentRender` Activity 的发布态实现存在如下行为：

1. 只要发现 `sourceLanguage` 或 `targetLanguages`；
2. 就先调用 `/studio/template/render-data`；
3. 而该接口要求模板中已经保存 `TemplateFieldSpec`；
4. 若不存在 `TemplateFieldSpec`，则直接返回 `TPL_002` 并中断。

这会导致一个不合理结果：

- `workflow` 已经明确表达了 `renderPath` 与双语映射；
- `preview with skill` 可以直接渲染成功；
- 但 `release smoke test` 却因为模板资产未补齐而失败。

也就是说，当前发布态 smoke test 比真实业务运行路径更苛刻。

---

## 4. 关键判断

## 4.1 `TemplateFieldSpec` 不是当前场景的唯一真源

对当前这类模板工作流来说，已有的真源信息是：

- `workflowDsl.inputParams`
- 每个参数上的 `renderPath`
- 每个参数上的 `localizedVariants`
- 工作流级别的 `targetLanguages`

这些信息已经足够表达：

- 输入参数的语义名称；
- 该参数需要落到哪些模板变量；
- 该参数是否属于双语/本地化字段；
- 哪个目标语言需要被自动补全。

因此，在当前兼容场景下，`TemplateFieldSpec` 不应成为发布链路的硬前置条件。

## 4.2 发布态真实运行时应以 workflow 为准

对于已经生成的模板工作流，发布态运行时应优先相信 workflow 自身的输入映射定义，而不是反向要求模板资产必须补全后才能执行。

特别是在如下场景：

- `renderPath` 已经存在；
- `targetLanguages` 已经存在；
- source snapshot 已经保留这些信息；

此时发布态继续强依赖 `TemplateFieldSpec`，会把“兼容工作流”误判为“不可执行工作流”。

## 4.3 Smoke Test 应模拟真实语义流程

对于双语场景，smoke test 的正确模拟方式应为：

```text
smoke input
-> 只提供语义参数（如 contract.partyA.name）
-> 运行时根据 renderPath 展开目标变量
-> 根据 targetLanguages 生成本地化结果
-> 将源语值写入 *_cn
-> 将翻译结果写入 *_jp
-> 调用统一渲染入口完成文档输出
```

而不应是：

```text
发现 targetLanguages
-> 强制调用 /studio/template/render-data
-> 要求 TemplateFieldSpec
-> 缺失则失败
```

---

## 5. 设计目标

本次修复需要满足以下目标：

1. 不修改当前已有 workflow 的业务语义；
2. 不要求当前模板必须先补齐完整模板资产才能发布；
3. 保留 `TemplateFieldSpec` 作为完整模板资产路径，但不再作为当前兼容发布链路的唯一前提；
4. 让 `release smoke test` 与真实运行时使用同一套输入展开与本地化赋值逻辑；
5. 保证 `contract.partyA.name -> ["contract.partyA.name_cn", "contract.partyA.name_jp"]` 这类关键双语映射在发布态可执行。

---

## 6. 设计方案

## 6.1 总体原则：Workflow Mapping First

发布态运行时与 smoke test 采用如下优先级：

1. 优先使用 workflow/source snapshot 中已有的 `renderPath` 与 `targetLanguages`；
2. 若 workflow 不具备足够的显式映射信息，再回退到模板资产路径；
3. 只有在两条路径都不可用时，才阻断发布。

这意味着：

- 显式 workflow 映射优先于模板资产回推；
- 发布链路优先相信“已生成并可审计的 workflow”；
- `TemplateFieldSpec` 从“硬阻断条件”降为“优先可选增强路径”。

## 6.2 运行时输入展开策略

对每一个语义参数，运行时按如下方式处理：

### A. 单路径字段

例如：

```json
"payment.method": {
  "renderPath": "payment.method"
}
```

处理方式：

- 直接将语义参数值写入目标路径。

### B. 双语数组路径字段

例如：

```json
"contract.partyA.name": {
  "renderPath": ["contract.partyA.name_cn", "contract.partyA.name_jp"]
}
```

处理方式：

1. 输入只采集 `contract.partyA.name`；
2. 运行时识别该字段有多个目标路径；
3. 结合 `targetLanguages=["ja"]` 判断需要生成日文本地化值；
4. 将原始语义值写入 `contract.partyA.name_cn`；
5. 将翻译后的值写入 `contract.partyA.name_jp`；
6. 最终形成可直接渲染的 resolved data。

### C. 只有 `templateBinding` 的旧兼容字段

若某些字段仅存在单值 `templateBinding`，则保持现状兼容，不作为本次主修复对象。

## 6.3 本地化赋值规则

在当前场景中，仅基于现有情报，冻结如下规则：

- `targetLanguages=["ja"]` 表示需要生成日文目标值；
- 输入语义参数仍是单一业务语义字段，例如 `contract.partyA.name`；
- 源语值默认作为中文落点；
- 目标语值由运行时翻译后写入日文落点；
- 若字段 `renderPath` 为双元素数组，运行时按中文/日文落点处理；
- 若某字段只具备单路径，则按单路径直接赋值。

本文不重新定义多语言排序规范，仅要求当前发布态至少完整保留并消费已有 `renderPath` 数组信息。

---

## 7. Smoke Test 设计

## 7.1 Smoke Test 输入原则

smoke test 应仅构造业务语义参数，不直接构造模板最终落点参数。

例如：

```json
{
  "contract.partyA.name": "测试甲方",
  "contract.partyA.representative": "测试签字人",
  "payment.totalAmount": 1,
  "contract.signingDate": "2026-06-02"
}
```

而不是：

```json
{
  "contract.partyA.name_cn": "测试甲方",
  "contract.partyA.name_jp": "テスト甲"
}
```

原因是 smoke test 的职责是验证“发布态工作流是否能真实执行语义展开与渲染”，而不是绕过该流程直接塞最终变量。

## 7.2 Smoke Test 执行路径

发布后的 smoke test 应遵循如下路径：

```text
buildSmokeTestInput()
-> 生成语义参数
-> 发布态 documentRender 读取 renderPath
-> 执行本地化展开
-> 生成 resolved render data
-> 调用统一渲染入口
-> 验证文档成功输出
```

## 7.3 Smoke Test 通过标准

本次阶段的通过标准冻结如下：

- 工作流真实执行成功；
- 文档成功渲染并产生输出；
- 不再因为缺少 `TemplateFieldSpec` 而直接失败；
- 双语字段链路能够被正确展开与赋值。

本阶段不把“翻译质量正确性”作为发布阻断条件，只验证链路正确性与变量可落位性。

---

## 8. 对当前实现的调整方向

## 8.1 共享 `documentRender` Activity

当前实现需要调整为：

1. 当存在 `targetLanguages` 时，不再无条件调用 `/studio/template/render-data`；
2. 先检查当前 workflow/source snapshot 是否已经具备可执行的显式 `renderPath`；
3. 若显式映射充足，则直接基于 workflow 映射展开 resolved render data；
4. 只有显式映射不足时，才回退到模板资产接口。

这样可以保证：

- 当前兼容模板工作流可发布；
- 发布态运行时与 workflow DSL 保持一致；
- 与统一渲染入口的行为更接近。

## 8.2 Capability Release Smoke Service

当前 smoke service 需要从“仅验证模板资产是否可调用”调整为“验证发布态 workflow 是否可执行”。

也就是说：

- smoke test 不应把缺少 `TemplateFieldSpec` 视为当前场景下的首要失败原因；
- smoke test 应真正执行 workflow 的参数展开与本地化赋值逻辑；
- release 成败应由最终 workflow 渲染结果决定。

## 8.3 Temporal Schema / Release Snapshot

release snapshot 侧需要确保以下信息稳定保留：

- `inputParams.renderPath`
- `localizedVariants`
- `targetLanguages`
- 必要的 `inputPolicy`

不应再把双语数组路径退化为仅单值 `templateBinding` 的展示性信息。

---

## 9. 边界与非目标

本次方案明确不做以下事项：

- 不修改当前模板文件内容；
- 不重做当前 AI 识别策略；
- 不要求补录新的模板情报；
- 不要求立刻补齐 `TemplateFieldSpec/templateAssetManifest`；
- 不重构 Office Add-in 模板保存链路；
- 不重新设计多语言模板资产协议。

本次只解决一个核心问题：

**当 workflow 已明确表达双语映射时，发布态 release 与 smoke test 必须能够按该语义运行，而不是被模板资产缺失错误拦截。**

---

## 10. 预期收益

实施后，当前链路将获得以下收益：

- `1234.docx` 这类兼容型双语 workflow 可以进入正常发布流程；
- 发布态行为与工作流页展示语义保持一致；
- smoke test 更接近真实业务运行路径；
- `renderPath: ["*_cn", "*_jp"]` 这类关键映射不再在发布阶段失效；
- 完整模板资产路径仍可保留，后续再作为增强治理项推进。

---

## 11. 最终结论

对当前 `1234.docx` 工作流问题，结论冻结如下：

1. 问题不在于 workflow 缺少语义信息；
2. 关键双语映射仍然存在于 workflow/source snapshot 中；
3. 当前 release 失败的直接原因，是发布态 runtime/smoke test 在双语场景下无条件走了 `TemplateFieldSpec` 路径；
4. 正确修复方向是让发布态优先消费 workflow 已声明的 `renderPath + targetLanguages`；
5. smoke test 必须模拟真实流程：只提供语义参数，运行时完成翻译与双目标变量赋值，再进行渲染。

因此，本次推荐方案为：

```text
Workflow Mapping First
```

即：

**优先基于 workflow 显式映射执行发布态渲染；模板资产路径保留为增强能力，而不是当前兼容场景下的发布阻断条件。**
