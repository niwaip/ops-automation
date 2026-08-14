# Activity Plugin 规格生成、真实探测与确定性编译落地设计

状态：已落地核心链路  
日期：2026-08-12  
适用范围：Skill 匹配后的参数绑定、内置 Activity、Temporal Workflow 代码生成、真实访问校验

## 1. 结论

新的标准路径不再让 LLM 生成完整 Workflow，也不默认让 LLM 生成整段 Activity 代码：

```text
用户请求
  → LLM 基于 Skill 名称/描述做语义匹配
  → 低置信度或无对应 Skill：停止，不执行
  → 阶段一：只组装能力拓扑
  → 阶段二：按选中 Skill/Activity Plugin 的 Schema 绑定参数
  → LLM 只输出 implementation spec（JSON/JSONPath/模板）
  → Schema 默认值填充与严格类型校验
  → 使用发布时固定的 Activity 实现做真实探测
  → 校验真实输出契约和每条结果路径
  → 确定性编译 Workflow 骨架
  → Gate 1 AST 校验
  → 发布/执行
```

这是一种“编译器 + 插件 ABI + 受限程序合成”设计。LLM 负责语义判断和小型规格；接口、执行器、重试、信封、调度和代码骨架由平台控制。

## 2. 已解决的生产问题

### 2.1 `maxResults` 字符串导致输入 Schema 失败

根因不是默认值不存在，而是生成层和执行层之间缺少严格、可独立验证的插件规格。现在插件 manifest 明确保存 JSON Schema，默认值在规格校验阶段以正确类型注入；已有但类型错误的值不会被静默吞掉。

例如 `timeout`：

- 未提供：注入数字 `30`；
- 提供数字：范围校验；
- 提供字符串 `"30"`：返回 `SPEC_SCHEMA_VIOLATION`，不进入运行期。

同一机制可用于 Web Search 的 `maxResults`，其插件 Schema 应声明 `type: number/integer` 与数字默认值。

### 2.2 天气请求错误匹配 Web Search

能力选择继续由 LLM 完成，输入只包含候选 Skill 的名称、描述、正向用例和负向用例；不使用关键词 if/else 取代语义理解。LLM 输出候选及置信度后，由通用置信度门禁执行：

- 没有候选：提示“没有相应的 Skills”；
- 最高置信度低于阈值：提示“没有足够可信的 Skills”；
- 只有达到阈值才进入参数绑定；
- 参数补充只允许来自已选中 Skill 的输入 Schema，不能用另一个 Skill 的字段询问用户。

因此，天气能力未安装时不会把“天气”改写成 Web Search 的 `query` 再继续执行。

### 2.3 Markdown `artifact_ref` / `result` 契约错配

最终输出只能引用节点已发布的 output contract。插件 ABI 将 `runtimeOutputSchema` 作为单一事实来源；规划冻结前应以该契约解析输出引用。字段不存在时在创建阶段失败，并给出 producer、可用字段和引用路径，不允许猜测 `artifact_ref`。

本次实现先覆盖 HTTP 和固定 Transform；Markdown Artifact Plugin 应按同一 manifest 方式发布其准确输出字段，复用既有的确定性输出契约解析标准。

### 2.4 Workflow AI 生成 5 分钟后 500

根因是确定性路径将“固定 Transform 的 instruction 为空”错误当成不支持，且两步专用编译器返回 `null` 后没有继续尝试通用线性编译器，最终进入完整 Workflow AI 生成。

已修正：

- `builtin:structuredTransform` 只依赖 `fieldMappings` / `textTemplate`，不要求 instruction；
- 仅遗留 `aiStructuredTransform` 要求非空 instruction；
- 专用编译器未命中时继续落入通用线性编译器；
- 日志输出结构化 miss code，不再只有“未命中固定模板”。

## 3. Activity Plugin ABI

每个插件 manifest 包含：

| 区域 | 作用 |
|---|---|
| `discovery` | 提供给 LLM 的名称、描述、正向/负向用例 |
| `contracts.implementationSpecSchema` | LLM 允许输出的最小规格及默认值 |
| `contracts.runtimeInputSchema` | 固定 Activity 的运行时入参 ABI |
| `contracts.runtimeOutputSchema` | 固定 Activity 的运行时出参 ABI |
| `synthesis` | `none/spec/expression/code-hole` 及 token 上限 |
| `runtime` | 超时、重试、固定实现 SHA-256 |
| `validation` | 是否支持真实探测、允许的无副作用方法 |

当前已注册：

- `builtin:httpRequest@1.0.0`：LLM 只输出 HTTP 配置和响应投影路径；
- `builtin:structuredTransform@1.0.0`：LLM 只输出 JSONPath 字段映射或文本模板。

固定 Python Activity 仍来自 `BuiltinActivityRegistry.generatedCode`。探测时不复制、不改写实现，直接以 manifest 对应的同一份代码和函数名提交到 Temporal Sandbox。

## 4. 真实探测标准

### 4.1 必须验证的内容

真实探测不是只确认 HTTP 200，而是同时验证：

1. implementation spec 符合 Schema；
2. 渲染后的 runtime input 符合 ABI；
3. 使用发布固定代码实际访问；
4. runtime output 符合 ABI，HTTP 必须 `status=success` 且 `ok=true`；
5. `bodyPath` / `bodyMap` 的每条路径真实存在；
6.固定 Transform 的映射字段不得为 `null/undefined`；
7. `outputSchema` 声明字段存在且基础类型匹配；
8. 返回 `sampleHash`、执行时长、验证时间和结构化 diagnostics。

### 4.2 副作用安全

HTTP 真实探测默认只允许 `GET/HEAD/OPTIONS`。`POST/PUT/PATCH/DELETE` 必须由调用者显式传入 `allowUnsafeSideEffects=true`，上层 UI 还应进行用户确认。禁止为了验证自动写入或删除外部数据。

### 4.3 接口

```http
GET /activity-plugins
POST /activity-plugins/probe
```

示例：

```json
{
  "spec": {
    "pluginRef": "builtin:httpRequest",
    "pluginVersion": "1.0.0",
    "config": {
      "urlTemplate": "https://api.example.com/search",
      "queryTemplate": { "q": "{keyword}" },
      "responseMode": "bodyMap",
      "responseFieldMappings": {
        "title": "items.0.title",
        "url": "items.0.url"
      }
    }
  },
  "inputParams": { "keyword": "deepseek v4 flash" }
}
```

生产 `preview-http-config` 和 HTTP 优化链已接到该探测服务；AI 优化后的最终配置会再次真实探测，避免只验证优化前配置。固定 Transform 配置生成后也会用真实样本执行固定 Activity。

运行态联调同时修复了两个共享协议缺陷：

- Sandbox `AgentSessionWorkflow.get_result` 的返回类型由 `Dict[str, object]` 改为递归 JSON 兼容的 `Dict[str, Any]`，避免 Activity 成功后因嵌套结果反序列化失败而返回 HTTP 500；
- 文档结果归一化器不再把通用业务字段 `url` 推断为 `downloadUrl`，只有明确的 `downloadUrl/download_url` 才能被提升，避免运行时无意修改插件输出 ABI。

## 5. 两阶段规划和 Token 控制

### 阶段一：拓扑组装

LLM 输入仅包括用户目标、候选 Skill 卡片与精简输出 Schema；输出 `skillRef`、步骤依赖和置信度。不识别具体运行参数，不携带 Activity 代码。

### 阶段二：参数绑定

针对每个已选择节点，只提供该插件的 `implementationSpecSchema`、上游 output contract 和用户已知参数。LLM 输出严格 JSON。字段默认值由 Schema 层注入，缺失的用户字段按 Schema 生成补参问题。

### Token 预算

- HTTP spec：输入最多 2500、输出最多 1200 token；
- 固定 Transform expression：输入最多 3500、输出最多 1600 token；
- 固定插件 `synthesis.mode=none` 时不调用 LLM；
- Workflow 骨架不调用 LLM；仅复杂拓扑或缺失 Activity 实现时进入受约束 fallback。

## 6. 编译和降级策略

优先级为：

1. 专用确定性模板；
2. 通用线性骨架编译器；
3. Activity 实现缺失时，仅生成缺失 Activity；
4. 复杂拓扑才允许受约束 AI 骨架；
5. 任何 AI 产物都必须经过 AST Gate 1 和输出契约校验。

结构化日志示例：

```text
确定性骨架未命中 [ACTIVITY_IMPLEMENTATION_MISSING]: 缺少固定 Activity 实现: webSearch
确定性骨架未命中 [CONDITIONAL_TOPOLOGY]: 包含条件分支
确定性骨架未命中 [DETERMINISTIC_SHAPE_UNSUPPORTED]: Activity 均有固定实现，但 DSL 参数形状尚未被骨架编译器覆盖
```

`DETERMINISTIC_SHAPE_UNSUPPORTED` 是应继续扩充编译器覆盖率的产品信号，而不是静默进入一个长时间、低成功率的完整代码生成请求。

## 7. 代码落点

| 文件 | 职责 |
|---|---|
| `activity-plugin.types.ts` | ABI、manifest、diagnostic、probe 类型 |
| `activity-plugin-registry.service.ts` | 插件注册与实现哈希 |
| `activity-plugin-spec-validator.service.ts` | 默认值与严格 Schema 校验 |
| `activity-plugin-runtime-input.ts` | 模板渲染、运行入参、路径提取 |
| `activity-plugin-probe.service.ts` | Temporal Sandbox 真实执行与输出校验 |
| `activity-plugin.controller.ts` | manifest 查询与探测 API |
| `temporal-workflow-config.service.ts` | 生产预览/优化/Transform 配置接入探测 |
| `temporal-workflow-deterministic-builder.ts` | 专用编译失败后的通用骨架 fallback |
| `temporal-workflow-fixed-workflow-code.helpers.ts` | 固定 Transform 不再要求 instruction |

## 8. 验收标准

- [x] 插件 manifest 含版本、输入/输出 Schema、实现哈希和 token 预算；
- [x] 默认值保持数字类型，错误类型在执行前失败；
- [x] HTTP 探测使用与运行时相同的固定 Activity 代码；
- [x] 响应投影路径不存在时 fail closed；
- [x] 固定 Transform 映射为空值时 fail closed；
- [x] 副作用请求默认禁止；
- [x] 空 instruction 的固定 Transform 可确定性编译；
- [x] 专用编译器 miss 后可继续通用线性 fallback；
- [x] 确定性 miss 日志可诊断；
- [x] 单元测试和 TypeScript 类型检查通过；
- [ ] 为 Web Search、Markdown Artifact 等其余内置能力逐一发布 manifest；
- [ ] 将 probe attestation 固化到发布记录并在生产执行前校验实现哈希；
- [ ] 增加带凭据 API 的脱敏样本存储与失效策略。

## 9. 参考资料

- [Temporal Workflow Definition](https://docs.temporal.io/workflow-definition)
- [Temporal Activities](https://docs.temporal.io/activities)
- [WebAssembly Interface Types](https://component-model.bytecodealliance.org/design/wit.html)
- [JSON Schema Documentation](https://json-schema.org/docs)
- [PICARD: Constrained Decoding for Text-to-SQL](https://arxiv.org/abs/2109.05093)
- [CodeT: Code Generation with Generated Tests](https://arxiv.org/abs/2207.10397)
- [Teaching Large Language Models to Self-Debug](https://arxiv.org/abs/2304.05128)
- [SWE-agent](https://arxiv.org/abs/2405.15793)

这些资料共同支持本设计的四个原则：确定性编排、显式接口、约束生成、执行反馈验证。
