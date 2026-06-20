# 企业级 Skill 平台 Playwright CLI + AI 执行重构方案

**Playwright CLI + AI Execution Refactor v4.0**  
日期：2026-05-07

> 本文定义 `ai-orchestrator`、`browser-worker` 与 `playwright-cli` 的新协作方式。  
> 目标不是“把自然语言直接翻译成几条 CLI 命令”，而是将 AI 升级为基于页面快照的动作规划器、参数提取器和有限自修复执行器，并最终沉淀出可执行、可参数化、可维护的标准 Playwright 脚本。

---

## 1. 文档目标

本文回答以下问题：

- 为什么当前 `AI -> click/fill` 直通式调用不够稳定
- `snapshot ref`、稳定 locator、导出脚本之间应如何分工
- AI 在浏览器执行链路中的职责边界是什么
- 如何在失败时做有限自动修正，而不是失控 agent loop
- 如何从执行结果生成可维护的 Playwright 脚本与平台模板
- 参数化规则应放在哪一层统一建模

---

## 2. 背景与问题定义

当前 `CLI` 模式已经证明可用于真实浏览器会话执行，但存在一个关键错位：

- AI 输出的是自然语言目标，如“点击登录”
- `browser-worker` 当前更接近将目标原样透传给 `playwright-cli`
- `playwright-cli click` 实际更适合接收“页面快照里的元素引用”或“唯一选择器”

这会带来三个直接问题：

### 2.1 自然语言目标不等于可执行定位器

- “登录”“提交”“保存”这类目标是语义描述，不是唯一定位器
- 相同文案可能出现多次，也可能存在空白字符、图标按钮、ARIA 名称与视觉文案不一致的情况
- 直接将文本透传到 CLI，容易出现 `does not match any elements`

### 2.2 `snapshot ref` 只适合运行时，不适合持久化

- `snapshot` 产生的 `e53`、`e21` 等引用只在当前快照上下文内稳定
- 它非常适合“本轮执行立即点击/填写”
- 但它不应成为最终脚本的一部分，否则脚本不可复用、不可维护

### 2.3 当前链路还缺少“执行层”和“产物层”的分离

现在的动作执行结果虽然会返回截图、HTML、文本等信息，但还没有清晰区分：

- 运行时执行用的临时目标
- 导出脚本时要保存的稳定 locator
- 参数化时要替换的业务变量
- 失败后重试和自修复所依赖的上下文

结果是：

- 执行能跑，但脚本不稳定
- 脚本可导出，但不便参数化
- 参数能收集，但缺少统一规则
- 失败能观察，但不便自动修正

---

## 3. 重构目标

本次重构的目标分为四层：

### 3.1 执行目标

- AI 不再直接生成“裸 CLI 参数”
- 每次动作前先读取页面结构，再基于结构规划动作
- 运行时优先使用 `snapshot ref` 提升命中率

### 3.2 产物目标

- 每次成功动作都沉淀为统一 `BrowserActionStep`
- 每步都记录“运行时 ref”和“持久化 locator”
- 最终可导出标准 Playwright 脚本、参数化脚本、平台模板 DSL

### 3.3 参数目标

- 参数不再由前端临时猜测
- 参数由后端统一抽取、标注、校验和导出
- 凭证类参数默认标记为 secret

### 3.4 修复目标

- 失败时允许有限自动修正
- 自动修正只修“定位与等待策略”，不改业务意图
- 整个修复过程可审计、可导出、可回放

---

## 4. 设计原则

### 4.1 先观察，再动作

任何点击、填写、滚动、选择动作前，默认先获取以下至少一种结构化上下文：

- `snapshot`
- `read_page`
- `get_text`
- 必要时 `evaluate`

### 4.2 运行时 ref 与持久化 locator 分离

- 运行时允许使用 `snapshot ref`
- 导出时必须转换为稳定 locator
- 持久化层禁止只保存 `ref`

### 4.3 locator 优先级固定

持久化 locator 的推荐优先级：

1. `role`
2. `label`
3. `placeholder`
4. `testid`
5. `text`
6. `css`

### 4.4 动作与断言并重

- 生成脚本不能只有动作，没有验证
- 每个关键步骤应至少生成一个断言建议
- 对动态页面优先生成部分结构断言，而非整页硬编码文本

### 4.5 有限自修复，不做无限自治

- 自动修正最大重试次数固定
- 每次重试都必须重新观察页面
- 每次重试都必须产出原因说明与新 locator

---

## 5. 新执行模型

建议将现有浏览器执行重构为五阶段流水线：

### 5.1 Observe

获取当前页面上下文：

- 当前 URL
- 页面标题
- `snapshot` YAML
- 可交互元素清单
- 页面可见文本摘要

### 5.2 Plan

AI 基于页面结构输出结构化执行计划，而不是直接输出 CLI 参数。

执行计划至少包含：

- 动作类型
- 目标意图
- 候选运行时目标 `runtimeTargetRef`
- 候选持久化 locator
- 参数绑定信息
- 期望结果

### 5.3 Execute

`browser-worker` 根据执行计划调用 `playwright-cli`：

- 优先使用 `runtimeTargetRef`
- 若无 `ref`，则回退到唯一 locator
- 动作完成后收集截图、HTML、URL 和 CLI 生成代码

### 5.4 Repair

若动作失败：

- 重新 `snapshot`
- 保持原业务意图
- 仅修复定位与等待策略
- 最多重试固定次数

### 5.5 Commit

若动作成功：

- 产出或更新 `BrowserActionStep`
- 补齐 `scriptFragment`
- 标记 `replaceableParams`
- 记录断言建议与可观测证据

---

## 6. 运行时 ref 与 locator 的职责划分

### 6.1 运行时 ref

运行时 ref 指：

- `snapshot` 输出中的元素引用
- 例如 `e21`、`e53`

适用场景：

- 当前快照下立即执行
- 短周期自修复重试
- 当前会话内快速定位

不适用场景：

- 长期持久化
- 模板导出
- 跨 session 回放

### 6.2 持久化 locator

持久化 locator 指最终要保存到 `BrowserActionStep` 和导出脚本中的稳定表达。

推荐形态：

- `page.getByRole('button', { name: '提交' })`
- `page.getByLabel('密码')`
- `page.getByPlaceholder('请输入用户名')`
- `page.getByTestId('submit')`

### 6.3 转换规则

建议执行成功后统一走一遍“ref -> locator”解析：

1. 执行动作时使用 `ref`
2. 成功后对 `ref` 调用 `generate-locator`
3. 若返回 locator 稳定且唯一，则写入 `scriptFragment`
4. 若 locator 质量较低，则保留风险标记并尝试补充过滤条件

---

## 7. 统一步骤模型建议

在现有 `BrowserActionStep` 基础上，建议扩展如下：

```ts
interface BrowserActionStep {
  id: string;
  source: 'ai' | 'manual' | 'imported';
  backend: 'legacy' | 'cli' | 'mcp';
  action:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'press_key'
    | 'wait'
    | 'assert_visible'
    | 'assert_text'
    | 'snapshot';
  status: 'pending' | 'success' | 'error';

  runtimeTargetRef?: string;

  locator?: {
    strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'text' | 'css';
    value: string;
    role?: string;
    name?: string;
    exact?: boolean;
    generatedBy?: 'cli' | 'ai' | 'manual';
    confidence?: number;
  };

  params?: Record<string, unknown>;
  paramBindings?: Array<{
    name: string;
    source: 'literal' | 'user_input' | 'secret' | 'derived' | 'context';
    required: boolean;
    secret?: boolean;
    value?: unknown;
  }>;

  snapshotId?: string | null;
  snapshotPath?: string | null;
  scriptFragment?: string | null;
  assertionFragment?: string | null;

  repairHistory?: Array<{
    reason: string;
    oldLocator?: string;
    newLocator?: string;
    snapshotId?: string;
  }>;

  replayable?: boolean;
  replaceableParams?: string[];
  timestamp: number;
}
```

说明：

- `runtimeTargetRef` 只用于本轮运行，不导出为最终脚本
- `locator` 是真正可持久化的目标表达
- `paramBindings` 用于参数来源建模和后续模板导出
- `repairHistory` 用于审计和调试

---

## 8. 参数化模型

参数化必须从“脚本后处理”前移到“步骤建模”阶段。

### 8.1 参数分类

建议将参数统一分为五类：

- `credential`：用户名、密码、验证码、token
- `business_input`：搜索词、单号、审批意见、日期
- `environment`：域名、租户、语言、工作区
- `control`：超时、重试次数、是否截图
- `expected`：断言文本、期望 URL、成功提示

### 8.2 参数规则

- `fill` 的输入值优先视为可参数化
- `goto` 的 URL 可按 host/path 拆分参数
- `assert_text` 的期望值可参数化
- 凭证类参数默认 `secret = true`
- 与页面结构强绑定的 locator 文案通常不作为参数

### 8.3 参数导出目标

同一套参数定义应同时服务于：

- Playwright 参数化脚本
- 平台模板 `paramsSchema`
- AI 交互时的补参提示
- 运行时校验

---

## 9. 自动修正策略

### 9.1 修正边界

自动修正只能修改以下内容：

- locator 策略
- 等待时机
- 页签切换
- 弹窗/分支判断

不得自动修改：

- 用户目标
- 输入参数含义
- 业务流程顺序

### 9.2 修正触发条件

以下错误可进入自动修正流程：

- `does not match any elements`
- strictness violation
- 元素不可见或不可点击
- 导航后目标元素消失
- 出现预期外弹窗或新页签

### 9.3 修正流程

1. 记录失败动作和错误信息
2. 重新获取页面快照
3. 基于原意图重新选择目标元素
4. 优先保持原 locator 策略类别
5. 执行重试
6. 写入 `repairHistory`

### 9.4 最大重试次数

建议默认：

- 单步自动修正最多 `2`
- 单轮任务总修正次数最多 `5`

超出后返回：

- `takeover_required`
- 或 `failed`

---

## 10. 脚本生成策略

### 10.1 生成目标

最终至少导出三类产物：

- 标准 Playwright 脚本
- 参数化 Playwright 脚本
- 平台模板 DSL

### 10.2 脚本生成原则

- 所有脚本都从 `BrowserActionStep[]` 生成
- 导出脚本不得包含 `snapshot ref`
- 关键动作后追加断言建议
- 脚本中保留适度注释，方便工程师接手

### 10.3 断言生成原则

建议为以下动作生成断言：

- `navigate` 后：`toHaveURL`
- `fill` 后：`toHaveValue`
- `click` 后若触发页面变化：`toHaveURL` 或关键元素可见
- 列表/菜单/成功提示：`toBeVisible` 或 `toHaveText`

---

## 11. 模块职责调整建议

### 11.1 `ai-orchestrator`

新增职责：

- 解析 snapshot 并规划动作
- 输出 locator proposal 与参数 proposal
- 在失败后基于新快照进行有限修正

不负责：

- 直接执行 CLI
- 持有浏览器 session 状态

### 11.2 `browser-worker`

新增职责：

- 管理 Observe -> Execute -> Repair -> Commit 流程
- 维护 `runtimeTargetRef`
- 调用 `generate-locator` 生成持久化 locator
- 产出 `BrowserActionStep[]`
- 导出脚本片段与参数结构

### 11.3 `portal`

新增职责：

- 展示“运行时 ref”与“持久化 locator”
- 展示参数化结果、修正历史、脚本预览
- 提供导出脚本和保存模板入口

---

## 12. 推荐新增模块

建议在 `browser-worker` 内新增以下模块：

- `browser-step-commit.service.ts`
- `locator-resolution.service.ts`
- `browser-step-repair.service.ts`
- `browser-parameterization.service.ts`
- `browser-script-export.service.ts`

建议在 `ai-orchestrator` 内新增以下能力：

- `snapshot-intent-planner`
- `locator-proposal-normalizer`
- `browser-repair-policy`

---

## 13. 执行计划与输出协议建议

建议 AI 输出结构从“命令列表”升级为“带意图和参数的步骤计划”：

```json
{
  "goal": "登录系统并打开执行管理",
  "currentUrl": "http://192.168.100.143:5173/login",
  "steps": [
    {
      "action": "fill",
      "intent": "填写用户名",
      "runtimeTargetRef": "e21",
      "locator": {
        "strategy": "placeholder",
        "value": "请输入用户名"
      },
      "params": {
        "value": "{{username}}"
      },
      "replaceableParams": ["username"]
    },
    {
      "action": "fill",
      "intent": "填写密码",
      "runtimeTargetRef": "e32",
      "locator": {
        "strategy": "placeholder",
        "value": "请输入密码"
      },
      "params": {
        "value": "{{password}}"
      },
      "replaceableParams": ["password"]
    }
  ]
}
```

该结构可同时服务于：

- CLI 执行
- UI 展示
- 脚本导出
- 模板保存

---

## 14. 迁移建议

### Phase 1

- 让 `AI + CLI` 在执行成功后自动保存 `runtimeTargetRef`、`locator`、`scriptFragment`
- 保持现有前端交互不变

### Phase 2

- 加入参数抽取与 `replaceableParams`
- 脚本导出完全从 `BrowserActionStep[]` 生成

### Phase 3

- 加入有限自动修正
- UI 展示修正历史和 locator 质量

### Phase 4

- 与手动录制产物统一
- 引入 `MCP` 后端共享同一套步骤模型

---

## 15. 验收标准

- AI 不再直接输出裸文本 `click("登录")` 作为最终执行参数
- 每个点击/填写动作都可追溯到对应 snapshot 与 locator
- 导出 Playwright 脚本中不包含运行时 `ref`
- 参数化脚本可正确区分 secret 参数与普通参数
- 失败时可自动进行有限修正，并保留修正历史
- AI 执行结果、手动录制结果、模板导出共享同一套 `BrowserActionStep`

---

## 16. 一句话总结

> 本次重构的核心，不是让 AI 更自由地“猜页面”，而是让 AI 基于页面快照生成可验证的动作计划，让 `playwright-cli` 成为执行内核与 locator 生成器，让统一步骤模型成为脚本、模板、参数和自修复的共同产物层。
