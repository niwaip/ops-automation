# [OPEN] browser-e2e

## 目标
- 直接访问浏览器，执行一次端对端验证，确认当前 profile 化迁移后的主链行为是否符合预期。

## 当前现象
- 用户要求进行真实浏览器访问与端对端验证。
- 需要确认环境是否可启动、目标入口是否可访问、关键解析链是否按预期命中。

## 假设
- H1: 本地端到端环境尚未正确启动，导致无法进入真实验证阶段。
- H2: 服务已启动，但浏览器入口或 API 入口地址不正确，导致页面不可访问或链路不通。
- H3: 页面能访问，但当前实际执行链没有命中 profile 化解析，而是落入 AI fallback 或其它残留解析路径。
- H4: 页面与后端都正常，但验证路径缺少明确复现步骤或测试账号，导致无法完成端到端闭环。
- H5: 服务运行正常，但容器/工作区未加载最新代码，导致浏览器里看到的仍是旧行为。

## 计划
1. 确认当前 worktree 根目录与服务启动方式。
2. 检查现有服务/容器状态与可访问入口。
3. 如未启动，按仓库规则启动最小必要环境。
4. 打开浏览器入口并执行一次真实验证。
5. 收集运行时证据，判断命中的是 profile 还是其它路径。

## 证据
- 环境状态：
  - `ops-portal` / `ops-ai-orchestrator` / `ops-browser-semantics` / `ops-browser-worker` / `ops-browser-chrome` 均处于运行状态。
- 真实浏览器访问：
  - 通过 `POST http://localhost:3007/ai/recorder-debug/chat` 发起 `打开 https://example.com`，浏览器成功访问 `https://example.com`。
  - 通过同一 session 发起 `访问 example.com`，执行成功，当前页面变为 `https://example.com/`。
  - 通过同一 session 发起 `在百度搜索 e2eprofilecheck987`，执行成功，当前页面变为 `https://www.baidu.com/s?wd=e2eprofilecheck987`。
- 命中日志证据：
  - `inputText = 访问 example.com`
    - `parserSource = navigation-profile`
    - `parserMetadata.navigation.reason = navigation-direct-url`
    - `effectiveProfileVersions.navigation = default`
  - `inputText = 在百度搜索 e2eprofilecheck987`
    - `parserSource = search-profile`
    - `parserMetadata.search.reason = search-default-engine`
    - `parserMetadata.search.intentType = engine_search`
    - `effectiveProfileVersions.search = default`
  - `inputText = 打开 https://example.com/?e2e=nav-profile-987`
    - 历史命中曾出现 `parserSource = ai-plan`
    - 说明此前“完整协议 URL + 打开”在 recorder-debug 真实链路里会被主链顺序提前送进 AI 规划，而不是 navigation-profile 的 direct-url 分支。
  - `inputText = 打开 https://example.com/?e2e=nav-profile-987`（当前修复后最新 hit log）
    - `parserSource = navigation-profile`
    - `parserMetadata.navigation.reason = navigation-direct-url`
    - `effectiveProfileVersions.navigation = default`
    - `usedAiFallback = false`
    - 同次 `recorder-debug/chat` 响应中：
      - `commands[0].tool = navigate`
      - `commands[0].params.url = https://example.com/?e2e=nav-profile-987`
      - `currentPageUrl = https://example.com/?e2e=nav-profile-987`
- 表单页真实 observation：
  - `https://httpbin.org/forms/post` 的 `inputs` 中可见 `Customer name:` / `Telephone:` / `E-mail address:` 等真实标签。
  - `candidateKindCounts = { input: 17, action: 10, region: 1, field: 7 }`。
  - 但 `field` 候选主要来自 `region_field`，实际内容是 `AliceCN999` / `small` / `medium` 等值文本，而不是 `Customer name:` 这类字段标签。
- `FIELD_FILL` 真实链路命中：
  - `inputText = 设置 Customer name: AliceCN987`
    - `parserSource = field-fill-profile`
    - `effectiveProfileVersions.fieldFill = default`
    - `parserMetadata.fieldFill.reason = field-fill-default-candidate`
    - 说明 `set/设置 + 精确标签(Customer name:)` 已可稳定走 field-fill profile。
  - `inputText = 填写 Customer name: AliceCN999`
    - `parserSource = field-fill-profile`
    - `effectiveProfileVersions.fieldFill = default`
    - `parserMetadata.fieldFill.reason = field-fill-default-candidate`
    - 说明 `填写` 动词本身没有问题，关键是字段名要命中现有 alias。
  - `inputText = 填写 Customer name AliceCN988`
    - `parserSource = ai-plan`
    - 说明去掉冒号后，当前默认 alias 没有稳定覆盖该表达。
- `FIELD_FILL` 修复后真实链路复验：
  - 后端修复点：
    - 默认 alias 匹配不再只使用原始 `label`
    - 对 `Customer name:` 这类尾部分隔符标签，自动补充去尾部 `: / ： / =` 的变体
  - 复验结果：
    - `inputText = 填写 Customer name AliceCN988`
      - `parserSource = field-fill-profile`
      - `effectiveProfileVersions.fieldFill = default`
      - `parserMetadata.fieldFill.reason = field-fill-default-candidate`
      - `parserMetadata.fieldFill.selector = role=textbox[name="Customer name:"]`
      - `parserMetadata.fieldFill.resolvedField = Customer name:`
      - `parserMetadata.fieldFill.resolvedCanonicalField = Customer name`
    - 同一条表达的旧日志仍可见：
      - 历史 `createdAt = 2026-06-22T00:00:09.674Z`
      - `parserSource = ai-plan`
    - 说明本次修复已经把“无冒号表达”从旧的 AI fallback 拉回 deterministic `field-fill-profile`
- `ACTION` 真实链路命中：
  - `inputText = click Medium`
    - `parserSource = action-profile`
    - `parserMetadata.action.reason = action-default-candidate`
    - `effectiveProfileVersions.action = default`
- `READ` 真实链路表现：
  - `inputText = read Customer name`
    - `parserSource = ai-plan`
  - `inputText = 读取 Customer name:`
    - `parserSource = ai-plan`
  - `inputText = 查看 Customer name:`
    - `parserSource = ai-plan`
  - `inputText = 读取 AliceCN999`
    - `parserSource = ai-plan`
  - 说明在该公开表单页中，READ 默认链路没有稳定命中 profile。
- `READ` 修复后真实链路复验：
  - 后端修复点：
    - `read service` 开始消费 `input` 候选，不再只依赖 `field | region`。
    - 对输入框候选生成 `role=textbox[name="..."]` selector，而不是依赖 recorder snapshot `ref`。
    - 对输入框读取补充 `method = value`，避免 `get_text/read_page` 默认读 `textContent` 返回空串。
  - 复验结果：
    - `inputText = 读取 Customer name:`
      - `parserSource = read-profile`
      - `effectiveProfileVersions.read = default`
      - `parserMetadata.read.reason = read-default-candidate`
      - `parserMetadata.read.selector = role=textbox[name="Customer name:"]`
    - 在同一 session 先执行 `填写 Customer name: AliceREAD321`，再执行 `读取 Customer name:`
      - `填写 ...` 命中 `field-fill-profile`
      - `读取 ...` 命中 `read-profile`
      - `read_page` 执行结果从先前空串修复为 `AliceREAD321`
      - 运行时脚本中已体现 `method = "value"`

## 结论
- H1 否定：环境已启动，可以进入真实浏览器验证。
- H2 否定：入口与 API 正常，浏览器可访问外部页面。
- H3 部分确认：
  - `访问 example.com` 已在真实链路中命中 `navigation-profile`
  - `在百度搜索 e2eprofilecheck987` 已在真实链路中命中 `search-profile`
  - `打开 https://example.com/?e2e=nav-profile-987` 的剩余缺口已收口：
    - 历史旧日志里存在 `ai-plan`
    - 当前修复后的最新真实链路已回到 `navigation-profile`
    - `reason = navigation-direct-url`
    - `usedAiFallback = false`
- 针对 `FIELD_FILL / READ / ACTION` 的进一步结论：
  - `ACTION` 已在真实链路中稳定命中 `action-profile`。
  - `FIELD_FILL` 的 `Customer name` / `Customer name:` 差异已收口：
    - `填写 Customer name: ...` 与 `填写 Customer name ...` 现在都能命中 `field-fill-profile`
  - `READ` 的 parser 问题已收口：
    - 现在可通过 `input` 候选稳定命中 `read-profile`
    - 并且读取输入框值时会显式走 `method=value`
  - 当前这轮真实验证里，`NAVIGATION / FIELD_FILL / READ / ACTION` 已都能命中各自 profile 路径。
- H4 暂未触发：当前基础验证不需要额外账号即可完成。
- H5 暂未发现证据：当前运行结果与本次代码收缩后的预期一致。
