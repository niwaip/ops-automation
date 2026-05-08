# 企业级 Skill 平台 AI 浏览器执行指南

**AI Browser Execution Guide v4.0**  
日期：2026-05-07

> 本文是面向 `ai-orchestrator`、`browser-worker`、录制器前端以及后续 coding agent 的统一执行指南。  
> 目标是让 AI 在浏览器场景下生成稳定、可参数化、可导出的步骤，而不是输出脆弱的文本点击命令。

---

## 1. 适用范围

本文适用于以下场景：

- AI 模式下的浏览器操作执行
- 从页面快照生成结构化步骤
- 自动修正失败动作
- 导出 Playwright 脚本
- 导出平台模板 DSL
- 从自然语言任务中抽取参数

本文不覆盖：

- 人工录制 UI 交互细节
- Docker 部署和容器编排细节
- 非浏览器类工具调用

---

## 2. 总体目标

AI 浏览器执行应满足以下目标：

- 能基于页面结构理解用户意图
- 能生成可执行动作，而不是模糊描述
- 能输出稳定 locator，而不是脆弱文本
- 能识别哪些值应参数化
- 能在有限范围内自动修正失败
- 能沉淀为标准 Playwright 脚本与平台模板

---

## 3. 强制规则

以下规则为 MUST：

### 3.1 先观察，再操作

任何交互动作前，必须先具备至少一类页面结构化信息：

- `snapshot`
- `read_page`
- `get_text`
- 或 `evaluate` 返回的结构化页面摘要

禁止直接根据用户话术生成裸命令：

- `click("登录")`
- `fill("用户名", "admin")`
- `click("提交")`

### 3.2 运行时 ref 只用于执行，不用于持久化

- `snapshot ref` 可用于本轮执行
- 持久化步骤与导出脚本禁止只保存 `ref`
- 成功执行后应尽量转换为稳定 locator

### 3.3 优先使用语义定位器

定位器优先级固定为：

1. `role`
2. `label`
3. `placeholder`
4. `testid`
5. `text`
6. `css`

### 3.4 参数必须显式建模

- 所有业务输入值都要显式判断是否参数化
- 凭证类参数默认标记为 secret
- 不允许仅把参数藏在 prompt 文本里而不输出结构

### 3.5 自动修正有次数上限

- 单步自动修正最多 `2`
- 整轮任务修正次数最多 `5`
- 超限后必须返回失败或接管提示

---

## 4. AI 的职责边界

AI 在浏览器执行链路中的职责是：

- 基于页面结构理解当前页面
- 将用户意图转为结构化步骤
- 选择候选 locator
- 判断哪些字段应参数化
- 在失败后基于新快照做有限修正

AI 不负责：

- 直接调用终端执行 CLI
- 维护浏览器生命周期
- 保存浏览器 session
- 随意改变用户业务目标

---

## 5. 标准执行流程

推荐的标准流程如下：

### 5.1 Observe

收集当前页面上下文：

- URL
- 标题
- `snapshot`
- 页面文本摘要
- 最近成功步骤

### 5.2 Understand

识别用户任务中包含的内容：

- 目标页面
- 目标动作
- 目标元素
- 输入参数
- 成功判定条件

### 5.3 Plan

输出结构化步骤计划：

- `action`
- `intent`
- `runtimeTargetRef`
- `locator`
- `params`
- `replaceableParams`
- `expectedOutcome`

### 5.4 Execute

由 `browser-worker` 调用 CLI 执行。

### 5.5 Verify

执行后判断：

- URL 是否变化
- 目标元素是否出现/消失
- 是否需要补充断言

### 5.6 Commit

成功后保存：

- 统一步骤
- locator
- 参数绑定
- 脚本片段
- 证据与修正历史

---

## 6. 输入上下文规范

传给 AI 的上下文应尽量结构化，推荐包含以下内容：

```json
{
  "goal": "登录系统并打开执行管理",
  "currentUrl": "http://192.168.100.143:5173/login",
  "page": {
    "title": "Ops Portal",
    "snapshotId": "snap-001",
    "snapshotYaml": "....",
    "visibleText": "自动化平台登录 记住我 ...",
    "interactiveSummary": {
      "inputs": [
        { "ref": "e21", "placeholder": "请输入用户名" },
        { "ref": "e32", "placeholder": "请输入密码" }
      ],
      "buttons": [
        { "ref": "e53", "role": "button", "name": "登 录" }
      ]
    }
  },
  "history": [],
  "rules": {
    "preferStableLocators": true,
    "maxRepairAttempts": 2
  }
}
```

说明：

- `snapshotYaml` 是主要结构来源
- `visibleText` 只是辅助理解，不应替代结构选择
- `interactiveSummary` 用于减少 token 消耗

---

## 7. 输出协议规范

AI 的输出应是结构化步骤，而不是自由文本。

推荐结构：

```json
{
  "summary": "将填写用户名和密码，点击登录后打开执行管理。",
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
      "replaceableParams": ["username"],
      "expectedOutcome": "用户名输入框已填写"
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
      "replaceableParams": ["password"],
      "expectedOutcome": "密码输入框已填写"
    },
    {
      "action": "click",
      "intent": "提交登录表单",
      "runtimeTargetRef": "e53",
      "locator": {
        "strategy": "role",
        "value": "button",
        "name": "登 录"
      },
      "expectedOutcome": "页面跳转到登录后首页"
    }
  ]
}
```

要求：

- 必须包含 `action`
- 若存在 `ref`，必须同时尝试给出 locator proposal
- 输入类动作必须给出参数绑定

---

## 8. 定位器选择指南

### 8.1 `role`

适用：

- 按钮
- 链接
- checkbox
- radio
- 菜单项
- tab

推荐输出：

```ts
page.getByRole('button', { name: '提交' })
```

### 8.2 `label`

适用：

- 有明确标签的表单输入

推荐输出：

```ts
page.getByLabel('密码')
```

### 8.3 `placeholder`

适用：

- 无明确 label 但 placeholder 稳定的输入框

推荐输出：

```ts
page.getByPlaceholder('请输入用户名')
```

### 8.4 `testid`

适用：

- 页面已有稳定测试契约
- 业务文案经常变化

推荐输出：

```ts
page.getByTestId('submit')
```

### 8.5 `text`

适用：

- 非交互内容断言
- 没有更好语义定位时作为兜底

限制：

- 对交互元素谨慎使用
- 必须确认唯一性

### 8.6 `css`

适用：

- 没有任何稳定语义属性时的最后兜底

限制：

- 必须记录风险标记
- 禁止长链式结构选择器

---

## 9. 动作级规则

### 9.1 `navigate`

规则：

- 若用户已明确给出 URL，可直接导航
- 若页面已在目标地址附近，避免重复导航
- 导航后建议追加 `toHaveURL`

### 9.2 `fill`

规则：

- 优先选择 `label` 或 `placeholder`
- 输入值默认检查是否参数化
- 凭证类输入默认标记 secret

### 9.3 `click`

规则：

- 优先使用 `runtimeTargetRef`
- 成功后立即生成持久化 locator
- 若点击引发页面变化，应补充验证

禁止：

- 直接使用模糊文本作为最终命令参数

### 9.4 `press_key`

规则：

- 仅用于补充动作，不替代表单按钮语义
- 如用 `Enter` 提交表单，应明确记录原因

### 9.5 `wait`

规则：

- 优先等待具体元素或状态
- 避免大量裸 `waitForTimeout`

### 9.6 `assert_visible` / `assert_text`

规则：

- 关键流程必须至少生成一个断言建议
- 对可能变化的内容优先使用局部结构断言

---

## 10. 参数化指南

### 10.1 哪些内容应参数化

默认建议参数化：

- 用户名
- 密码
- 搜索关键字
- 订单号
- 业务表单输入
- 环境域名
- 预期文本

默认不参数化：

- 已确认稳定的 locator 文案
- 页面结构元信息
- 临时运行时 `ref`

### 10.2 参数元数据

每个参数至少包含：

```json
{
  "name": "username",
  "type": "string",
  "required": true,
  "secret": false,
  "category": "credential",
  "description": "登录用户名",
  "example": "test"
}
```

### 10.3 secret 参数规则

以下通常标记为 secret：

- password
- token
- cookie
- verification_code

导出脚本时：

- 不直接写死真实值
- 使用环境变量或运行时注入

---

## 11. 自动修正规则

### 11.1 允许修正的内容

- `ref` 失效后重选元素
- 定位器从 text 升级为 role/label
- 补充过滤条件
- 补充等待逻辑
- 处理新页签、弹窗、确认框

### 11.2 不允许修正的内容

- 改写用户目标
- 修改业务输入值语义
- 自动跳过关键步骤
- 未告知地切换到完全不同页面流程

### 11.3 标准修正流程

1. 捕获失败原因
2. 重新观察页面
3. 保留原动作意图
4. 重新生成 locator proposal
5. 再执行一次
6. 记录 `repairHistory`

### 11.4 常见修正规则

#### 找不到元素

- 重新 snapshot
- 查看元素是否文案变化或进入新容器
- 保持原意图，重新选 `ref`

#### 多元素匹配

- 优先增加 `role + name`
- 再补 `filter(hasText)`
- 再考虑父级作用域

#### 点击后无变化

- 检查是否需要等待
- 检查是否出现弹窗
- 检查是否打开新页签

---

## 12. 脚本导出指南

### 12.1 导出原则

- 脚本必须可由工程师直接阅读和维护
- 脚本不得保留 `e53` 这类运行时 ref
- 脚本中应体现参数输入接口
- 关键路径应包含断言

### 12.2 推荐导出形态

推荐同时支持：

- 单文件标准脚本
- 函数式参数化脚本
- 平台模板 DSL

### 12.3 推荐脚本风格

```ts
await page.goto(`${params.baseUrl}/login`);
await page.getByPlaceholder('请输入用户名').fill(params.username);
await page.getByPlaceholder('请输入密码').fill(params.password);
await page.getByRole('button', { name: /登\s*录/i }).click();
await expect(page).toHaveURL(/dashboard|executions|home/);
```

要求：

- 优先使用 Playwright 推荐 locator
- 正则只用于处理空白、大小写或轻微波动
- 不生成脆弱的 DOM 长链

---

## 13. 断言生成指南

推荐最小断言集：

- 页面跳转：`toHaveURL`
- 文本提示：`toBeVisible` 或 `toHaveText`
- 表单输入：`toHaveValue`
- 复选框：`toBeChecked`
- 区域结构：`toMatchAriaSnapshot`

建议：

- 对关键成功状态至少保留一个断言
- 对高波动页面尽量使用局部结构断言

---

## 14. 示例

### 14.1 用户输入

```text
打开系统，用 test / test123 登录，然后点击执行管理
```

### 14.2 AI 观察

- 当前 URL 为 `/login`
- 有两个输入框和一个登录按钮
- 登录按钮 `ref` 为 `e53`
- 用户名和密码框存在稳定 placeholder

### 14.3 AI 输出步骤

```json
{
  "summary": "填写登录凭证并进入执行管理页面。",
  "steps": [
    {
      "action": "fill",
      "runtimeTargetRef": "e21",
      "locator": { "strategy": "placeholder", "value": "请输入用户名" },
      "params": { "value": "{{username}}" },
      "replaceableParams": ["username"]
    },
    {
      "action": "fill",
      "runtimeTargetRef": "e32",
      "locator": { "strategy": "placeholder", "value": "请输入密码" },
      "params": { "value": "{{password}}" },
      "replaceableParams": ["password"]
    },
    {
      "action": "click",
      "runtimeTargetRef": "e53",
      "locator": { "strategy": "role", "value": "button", "name": "登 录" }
    }
  ]
}
```

### 14.4 导出脚本

```ts
await page.goto(`${params.baseUrl}/login`);
await page.getByPlaceholder('请输入用户名').fill(params.username);
await page.getByPlaceholder('请输入密码').fill(params.password);
await page.getByRole('button', { name: /登\s*录/i }).click();
await expect(page).toHaveURL(/dashboard|executions|home/);
```

---

## 15. 给 AI 的简短系统提示模板

可在实现中为浏览器模型附加如下提示：

```text
你是浏览器步骤规划器，不是自由聊天助手。
在任何点击、填写、选择动作前，必须先阅读页面 snapshot 或结构化页面摘要。
优先使用 snapshot ref 进行当前轮执行，优先输出 role、label、placeholder、testid 等稳定 locator 作为持久化结果。
不得直接输出裸文本点击命令。
必须识别可参数化字段，并将凭证类参数标记为 secret。
失败时仅允许修正 locator、等待、弹窗处理和页签处理，禁止改变用户目标。
你的输出必须是结构化步骤，不得只返回自然语言说明。
```

---

## 16. 验收清单

- AI 输出包含结构化步骤而不是自由文本
- 点击类动作能区分 `runtimeTargetRef` 与持久化 locator
- 输入类动作能自动识别参数化字段
- secret 参数不会在导出脚本中写死
- 失败时能够基于新快照进行有限修正
- 导出脚本不包含临时 `ref`

---

## 17. 一句话总结

> AI 浏览器执行的正确姿势，不是“把自然语言翻译成几条 CLI 命令”，而是“先读页面结构，再产出结构化步骤，运行时用 ref，持久化用稳定 locator，参数显式建模，失败有限修正，最终导出标准脚本”。
