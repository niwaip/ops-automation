# 文档生成参数分层方案 v1.0

## 1. 目标

在文档生成场景中，参数既要支持：

- 跨模板、跨项目复用的稳定字段定义
- 按模板、按业务场景配置的默认值与必填策略
- 聊天识别、补参、恢复执行、正式渲染时使用同一份最终输入

本方案明确：

- `skill.paramsSchema` 是唯一的基础参数定义层
- 模板生成的 workflow 只负责业务策略与运行时装配
- 最终执行时统一收敛为一份 execution 级输入快照

说明：

- 本方案不讨论 `preview with skills`
- 预览链路可独立存在，不参与参数真源定义

## 2. 设计原则

### 2.1 单一真源

业务字段名、字段类型、显示语义、格式语义只能有一个基础真源，即：

- `skill.paramsSchema`

### 2.2 策略与定义分离

以下内容不放在 `skill.paramsSchema`：

- 项目默认值
- 客户默认值
- 当前模板下是否必填
- 条件必填规则
- 运行时自动补全来源

这些都属于模板/业务策略，应在 workflow 层定义。

### 2.3 运行时单一输入

无论来源是：

- 用户聊天输入
- AI 参数识别
- workflow 默认值
- 外部系统自动注入

最终都必须收敛为一份 execution 级输入，再进入渲染。

## 3. 参数分层

建议采用四层模型。

### 3.1 L1: Skill 参数定义层

载体：

- `skill.paramsSchema`

职责：

- 定义标准参数名
- 定义字段类型
- 定义格式语义
- 定义展示名与分组
- 定义抽取提示与语义角色
- 定义渲染字段路径或映射锚点

典型字段：

- `type`
- `displayName`
- `description`
- `groupLabel`
- `semanticRole`
- `extractionPrompt`
- `extractionHints`
- `paramKind`
- `format`
- `renderPath`

约束：

- 不包含 `defaultValue`
- 不包含项目业务下的 `required`
- 不包含客户或组织专属值

结论：

- 这一层回答“这个技能有哪些标准参数”
- 不回答“这次生成哪些参数必须要有”

### 3.2 L2: Workflow 参数策略层

载体建议：

- 模板生成 workflow 时，为每个 skill 参数生成一份 `workflowParamPolicy`
- 可以挂在 workflow DSL 中，例如 `workflowDsl.inputPolicy`

职责：

- 声明本模板实际使用哪些 skill 参数
- 配置当前模板下的必填策略
- 配置默认值
- 配置自动求值来源
- 配置条件必填规则
- 配置渲染前校验规则

建议字段：

- `enabled`
- `requiredMode`: `always | conditional | optional | system_required`
- `defaultValue`
- `defaultValueResolver`
- `valueSourcePriority`
- `confirmMode`
- `validationRules`
- `transformRule`
- `templateBinding`

其中：

- `always`: 当前业务场景恒定必填
- `conditional`: 满足条件时必填
- `optional`: 可缺省
- `system_required`: 不是业务字段必填，但当前模板渲染必须有

默认值来源可包括：

- 固定值
- 项目配置
- 客户配置
- 组织级配置
- 用户上下文
- 外部主数据接口

结论：

- 这一层回答“在这个模板/业务场景下，参数应该怎么用”

### 3.3 L3: Execution 参数解析层

载体：

- `execution.normalizedInputJson`

职责：

- 合并用户输入、识别结果、默认值、外部注入值
- 标记每个字段的来源
- 标记是否缺失
- 标记是否需要确认
- 形成等待补参与恢复执行的唯一依据

建议结构：

```json
{
  "input": {
    "contract.projectName": "MES Upgrade Integration Project"
  },
  "requiredInputs": [
    {
      "name": "payment.bankAccount_cn",
      "missing": true,
      "source": "unresolved"
    }
  ],
  "semantic": {
    "mode": "complex_document"
  },
  "paramResolution": {
    "payment.bankAccount_cn": {
      "value": null,
      "source": "workflow_default",
      "requiredMode": "always",
      "confirmed": false
    }
  }
}
```

结论：

- 这一层回答“这次执行最终有哪些值，还缺什么，来源是什么”

### 3.4 L4: Runtime 渲染输入层

载体：

- 发送给 Carbone / workflow runtime / activity 的最终 payload

职责：

- 将 execution 输入转换为实际渲染 payload
- 应用最后的格式化与字段映射
- 保证 runtime 只消费确定态输入

建议：

- 运行时不要直接回读 skill schema 再做业务判断
- 运行时只消费 execution 已解析完成的输入

结论：

- 这一层回答“如何把最终值送入渲染引擎”

## 4. 三类“必填”要分开

当前最容易混乱的是“required”。

建议拆成三种语义：

### 4.1 Schema Required

定义：

- 参数结构上是否是基础核心字段

归属：

- `skill.paramsSchema`

用途：

- 给识别器提示优先级
- 给 UI 展示字段重要性

注意：

- 不等价于本次生成必须由用户提供

### 4.2 Business Required

定义：

- 在当前模板/项目/客户场景下是否必须具备

归属：

- workflow 参数策略层

用途：

- 决定是否进入 `waiting_input`
- 决定是否允许正式生成

### 4.3 System Required

定义：

- 为了成功渲染或执行，系统运行时必须拿到的字段

归属：

- workflow 参数策略层或 runtime binding 层

用途：

- 控制最终 render 前校验
- 区分业务必填与引擎必填

## 5. 最合理的执行链路

### 5.1 识别阶段

- 聊天层命中 `skill`
- planner 基于 `skill.paramsSchema` 做参数识别
- planner 不直接决定最终 `required`

### 5.2 装配阶段

- control-plane 或 workflow 装配器读取 workflow 参数策略
- 将：
  - 用户输入
  - AI 识别结果
  - workflow 默认值
  - 外部注入值
  合并为 execution 级输入

### 5.3 校验阶段

- 根据 workflow 参数策略计算本次：
  - `missing`
  - `requiredInputs`
  - `needs_confirmation`
  - `finalReady`

### 5.4 执行阶段

- runtime 统一读取 execution 的最终输入
- 文档渲染、workflow activity、恢复执行均使用同一份输入

## 6. 推荐数据模型

### 6.1 Skill 层

```ts
type SkillParamDefinition = {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  displayName?: string;
  description?: string;
  groupLabel?: string;
  semanticRole?: string;
  extractionPrompt?: string;
  extractionHints?: string[];
  format?: string;
  renderPath?: string;
  paramKind?: 'scalar' | 'array';
};
```

### 6.2 Workflow 策略层

```ts
type WorkflowParamPolicy = {
  enabled?: boolean;
  requiredMode?: 'always' | 'conditional' | 'optional' | 'system_required';
  defaultValue?: unknown;
  defaultValueResolver?: string;
  valueSourcePriority?: string[];
  confirmationThreshold?: number;
  previewBlocking?: boolean;
  validationRules?: Array<Record<string, unknown>>;
  transformRule?: string;
  templateBinding?: string;
};
```

### 6.3 Execution 解析层

```ts
type ExecutionResolvedParam = {
  value?: unknown;
  source?: 'user_input' | 'recognized' | 'workflow_default' | 'external' | 'unresolved';
  requiredMode?: 'always' | 'conditional' | 'optional' | 'system_required';
  missing?: boolean;
  needsConfirmation?: boolean;
  confirmed?: boolean;
};
```

## 7. 对现有系统的建议

### 7.1 保留 skill schema 为基础参数层

继续使用：

- `skill.paramsSchema`

但只保留基础字段定义，不再承载项目默认值和模板级必填策略。

### 7.2 将 flow/workflow 参数从“第二份 schema”改为“策略覆盖层”

当前 flow template 里的 `paramsSchema` 可以逐步迁移为：

- 字段策略覆盖
- 而不是另一份业务字段完整定义

即：

- skill 负责字段定义
- workflow 负责字段策略

### 7.3 execution 只保存最终解析结果

所有补参、恢复执行、正式渲染都应统一依赖：

- `normalizedInputJson.input`
- `normalizedInputJson.requiredInputs`
- `normalizedInputJson.paramResolution`

### 7.4 runtime 不再重复做业务级 required 判断

runtime 只做：

- 最终输入消费
- 系统必填校验
- 渲染结果返回

不要再从 runtime 层反推“用户是不是还缺业务字段”。

## 8. 最终建议

最合理的整体方案是：

1. `skill.paramsSchema` 作为唯一基础参数真源
2. workflow 基于 skill 参数生成参数策略层
3. execution 在运行前统一收敛成最终输入快照
4. runtime 只消费最终输入，不重复定义业务参数

简化表达：

```text
Skill 定义字段
Workflow 定义策略
Execution 冻结结果
Runtime 消费输入
```

这套方案最适合当前“聊天生成文档 + 模板生成 workflow + 支持 waiting_input 恢复执行”的系统模型。
