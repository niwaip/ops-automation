import { Injectable } from '@nestjs/common';
import type { BrowserCommandContext } from '../browser-command.types';
import { BrowserCandidateContextFormatter } from '../browser-candidate-context.formatter';
import { BROWSER_TOOLS } from './browser-planner.constants';

@Injectable()
export class BrowserPlannerPromptBuilder {
  constructor(
    private readonly browserCandidateContextFormatter: BrowserCandidateContextFormatter
  ) {}

  buildParserPrompt(input: string, context: BrowserCommandContext, urlMappings: string): string {
    const toolsDescription = BROWSER_TOOLS.map(
      (tool) => `- ${tool.name}: ${tool.description}. Params: ${JSON.stringify(tool.params)}`
    ).join('\n');
    const browserContextDescription =
      this.browserCandidateContextFormatter.formatBrowserContext(context);
    const failureContextSection = this.buildFailureContextSection(context);

    return `You are a browser automation command parser. Your ONLY job is to convert natural language to browser commands.

Available tools:
${toolsDescription}

Website URL mappings:
${urlMappings}

Current browser context:
${browserContextDescription}

${failureContextSection}

User command: "${input}"

CRITICAL: You MUST respond with ONLY a valid JSON object, NO other text.

Response format:
{
  "analysis": "optional short reasoning about how you used the current page context",
  "commands": [
    {"tool": "tool_name", "params": {...}, "description": "..."}
  ],
  "explanation": "brief explanation"
}

IMPORTANT for SEARCH operations ("搜索xxx"):
- Use "search" when the user explicitly chose normal search mode and intends to use the current page's search entry
- Use "smart_search" when the user explicitly chose smart search mode or asks you to find a search box automatically
- Only use navigate to search engine URL when user explicitly specifies engine (e.g., "在百度搜索")
- If current page URL is known and user says "搜索 xxx" without naming a search engine, prefer staying on the current page/site instead of navigating away

IMPORTANT for LOGIN / FORM operations:
- When the user provides username/password/account/credential values, you MUST emit fill steps before any login click
- Prefer "fill" for input fields such as 用户名 / 账号 / 密码 / 手机号 / 邮箱
- Do NOT collapse a full login request into only one click step
- For login submit, prefer a click intent such as {"tool":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"}} after all fill steps
- Keep literal credential values exactly as the user provided them

IMPORTANT for PAGE CONTEXT / LOCATOR STABILITY:
- Structured candidates may include action/input/field/row/region hierarchy
- If the current browser context contains structured candidates, prefer params.candidateId or click intent params.rawTarget/roleHint/semanticHint over params.text
- If a visible button or input contains ref=..., prefer using params.target with that ref value instead of broad text locators
- If the user refers to "第一条/第二条/当前行/某一行", use the row hints to choose the matching candidate instead of collapsing everything into the same button text
- When a unique ref is available, do NOT replace it with text="..." or role[name="..."]
- If multiple same-name elements exist, prefer the candidate with clearer row/region context
- For row-scoped detail actions like "点击第一条数据，进入详细页面", prefer params.candidateId if available; otherwise emit params.rawTarget="详情" with params.rowHint={"index":1} and params.semanticHint="detail"
- When the page contains repeated "详情/详细/明细" actions, NEVER respond with a broad text click such as {"tool":"click","params":{"text":"详情"}}

IMPORTANT for RETRY / FAILURE RECOVERY:
- If Failure Context is provided, analyze why the previous action failed before proposing new commands
- Do NOT repeat the exact same failing broad text click when the current page context does not support it
- Prefer adapting to the current page state and visible candidates over following the original wording literally
- When the current page clearly no longer matches the original target, propose a safer next step instead of blindly repeating the same action

Examples:
- "打开微博" -> {"commands":[{"tool":"navigate","params":{"url":"https://weibo.com"},"description":"打开微博"}],"explanation":"导航到微博"}
- "打开百度" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com"},"description":"打开百度"}],"explanation":"导航到百度首页"}
- "在百度搜索产品公告" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com/s?wd=产品公告"},"description":"搜索产品公告"}],"explanation":"在百度搜索产品公告"}
- "搜索 MCP 协议" -> {"commands":[{"tool":"search","params":{"query":"MCP 协议"},"description":"搜索MCP协议"}],"explanation":"在当前页面搜索MCP协议"}
- "智搜 MCP 协议" -> {"commands":[{"tool":"smart_search","params":{"query":"MCP 协议"},"description":"智搜MCP协议"}],"explanation":"将智能查找搜索入口并搜索MCP协议"}
- "点击登录按钮" -> {"commands":[{"tool":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"},"description":"点击登录"}],"explanation":"点击登录按钮"}
- "列出搜索结果" -> {"commands":[{"tool":"list_search_results","params":{"limit":8},"description":"列出当前页面搜索结果候选"}],"explanation":"列出当前页面搜索结果候选"}
- "点击第一个搜索结果" -> {"commands":[{"tool":"click_result","params":{"index":1},"description":"点击第一个结果"}],"explanation":"点击第一个搜索结果"}
- "切到最新标签页" -> {"commands":[{"tool":"switch_latest_tab","params":{},"description":"切换到最新标签页"}],"explanation":"切换到最新标签页"}
- "截图" -> {"commands":[{"tool":"screenshot","params":{},"description":"截图"}],"explanation":"截取当前页面"}
- "打开示例站点 用test 密码test123进行登录 然后点击执行管理" -> {"commands":[{"tool":"navigate","params":{"url":"https://example.com/login"},"description":"打开登录页"},{"tool":"fill","params":{"selector":"用户名","value":"test"},"description":"填写用户名"},{"tool":"fill","params":{"selector":"密码","value":"test123"},"description":"填写密码"},{"tool":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"},"description":"点击登录"},{"tool":"click","params":{"rawTarget":"执行管理","semanticHint":"open"},"description":"点击执行管理"}],"explanation":"依次打开站点、填写用户名和密码、提交登录并进入执行管理"}
- If visible buttons contain candidate [action_1] button "詳細" (ref=e88) inside Row 1 (PRJ-2026-001), and the user says "点击第一条记录的详情", prefer {"commands":[{"tool":"click","params":{"candidateId":"action_1"},"description":"点击第一条记录的详情"}],"explanation":"点击第一条记录的详情按钮"}
- If the user says "点击第一条数据，进入详细页面" and the page has repeated row detail actions, prefer {"commands":[{"tool":"click","params":{"candidateId":"action_1"},"description":"点击第一条数据的详情"}],"explanation":"点击第一条数据的详情按钮"} or {"commands":[{"tool":"click","params":{"rawTarget":"详情","rowHint":{"index":1},"semanticHint":"detail"},"description":"点击第一条数据的详情"}],"explanation":"点击第一条数据的详情按钮"}

Respond with ONLY the JSON object:`;
  }

  buildPlanPrompt(input: string, context: BrowserCommandContext, urlMappings: string): string {
    const browserContextDescription =
      this.browserCandidateContextFormatter.formatBrowserContext(context);
    const failureContextSection = this.buildFailureContextSection(context);

    return `You are a browser automation planner.

Your task:
1. Understand the user's intent.
2. Convert it into a sequence of normalized browser steps.
3. Respond with JSON only.

Normalized actions allowed:
- navigate
- click
- list_search_results
- click_result
- switch_latest_tab
- fill
- screenshot
- snapshot
- read_page
- get_text
- scroll
- type_text
- wait
- hover
- press_key
- search
- smart_search

Website URL mappings:
${urlMappings}

Current browser context:
${browserContextDescription}

${failureContextSection}

User command: "${input}"

Rules:
- Prefer multi-step planning when the user expresses multiple actions in one sentence.
- Use "navigate" for opening a site.
- Use "smart_search" when the user wants to search on the current page or after opening a search engine.
- Use "list_search_results" when the user asks to查看/列出当前搜索结果候选.
- Use "click_result" when the user says "点击第一个结果" or similar.
- Use "switch_latest_tab" when the user wants to切到最新标签页/最新页面.
- When the user provides credentials such as 用户名/账号/密码, decompose the request into multiple steps and include "fill" steps before "click".
- For login pages, prefer selectors like "用户名", "账号", "密码" for fill params.selector.
- Do not output a single "click 登录" step for a full login request that includes credentials.
- Preserve the execution order exactly: navigate -> fill fields -> submit -> post-login navigation.
- Do not invent unavailable actions.
- If a site name maps to a known URL, put the final URL in navigate.params.url.
- For click actions, prefer params.candidateId or params.rawTarget with roleHint/semanticHint over params.text whenever current context already provides candidates.
- When a unique ref is available in the current browser context, prefer it in step params.target for click/fill/hover actions.
- If the user refers to list rows such as "第一条/第二条/当前行", use row hints from the context to choose the right candidate.
- Avoid broad text-based clicks when the context already contains a stronger ref-based candidate.
- For row-scoped detail actions like "点击第一条数据，进入详细页面", prefer params.candidateId if available; otherwise use params.rawTarget="详情" with params.rowHint={"index":1} and params.semanticHint="detail".
- If the page has repeated detail actions, do not emit a generic text click like {"action":"click","params":{"text":"详情"}}.
- If Failure Context is provided, the next plan MUST explain how it avoids the previous failure.
- Do not repeat the exact same failing action unless the current page state now clearly supports it.

Return JSON only:
{
  "analysis": "optional short reasoning about the plan and current state",
  "steps": [
    { "action": "navigate", "params": { "url": "https://www.bing.com" }, "description": "打开 Bing" }
  ],
  "explanation": "brief explanation in Chinese"
}

Examples:
User: 打开bing 搜索mcp 点击第一个结果
JSON: {"steps":[{"action":"navigate","params":{"url":"https://www.bing.com"},"description":"打开Bing"},{"action":"smart_search","params":{"query":"mcp"},"description":"搜索mcp"},{"action":"click_result","params":{"index":1},"description":"点击第一个结果"}],"explanation":"将依次打开 Bing、搜索 mcp、点击第一个结果"}

User: 列出搜索结果
JSON: {"steps":[{"action":"list_search_results","params":{"limit":8},"description":"列出当前页面搜索结果候选"}],"explanation":"列出当前页面搜索结果候选"}

User: 切到最新标签页
JSON: {"steps":[{"action":"switch_latest_tab","params":{},"description":"切换到最新标签页"}],"explanation":"切换到当前浏览器会话中的最新标签页"}

User: 打开百度
JSON: {"steps":[{"action":"navigate","params":{"url":"https://www.baidu.com"},"description":"打开百度"}],"explanation":"打开百度"}

User: 点击登录
JSON: {"steps":[{"action":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"},"description":"点击登录"}],"explanation":"点击登录"}

User: 打开示例站点 用test 密码test123进行登录 然后点击执行管理
JSON: {"steps":[{"action":"navigate","params":{"url":"https://example.com/login"},"description":"打开登录页"},{"action":"fill","params":{"selector":"用户名","value":"test"},"description":"填写用户名"},{"action":"fill","params":{"selector":"密码","value":"test123"},"description":"填写密码"},{"action":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"},"description":"点击登录"},{"action":"click","params":{"rawTarget":"执行管理","semanticHint":"open"},"description":"点击执行管理"}],"explanation":"依次打开站点、填写用户名和密码、提交登录并进入执行管理"}

User: 点击第一条记录的详情
JSON: {"steps":[{"action":"click","params":{"candidateId":"action_1"},"description":"点击第一条记录的详情"}],"explanation":"点击第一条记录的详情按钮"}

User: 点击第一条数据，进入详细页面
JSON: {"steps":[{"action":"click","params":{"candidateId":"action_1"},"description":"点击第一条数据的详情"}],"explanation":"点击第一条数据的详情按钮"}`;
  }

  buildLoginFallbackPlanPrompt(
    input: string,
    context: BrowserCommandContext,
    urlMappings: string
  ): string {
    const browserContextDescription =
      this.browserCandidateContextFormatter.formatBrowserContext(context);
    const failureContextSection = this.buildFailureContextSection(context);

    return `You are a browser login fallback planner.

Your task:
1. Treat the request as a login-related action.
2. Focus ONLY on username/account/email inputs, password inputs, OTP inputs, submit buttons, and optional Next buttons.
3. Respond with JSON only.

Allowed actions:
- navigate
- fill
- click

Website URL mappings:
${urlMappings}

Current browser context:
${browserContextDescription}

${failureContextSection}

User command: "${input}"

Rules:
- Prefer deterministic login steps using the current page context.
- Only emit fields that are justified by the user input or the visible login context.
- Preserve literal credential values exactly as provided by the user.
- Prefer params.candidateId or params.rawTarget with roleHint/semanticHint over loose text clicks.
- If the page appears to be multi-step, you may output only the current step, such as fill username then click Next.
- Do NOT attempt to solve CAPTCHA, slider, QR scan, passkey, or enterprise auth challenges.
- If you are uncertain, return an empty steps array instead of inventing elements.

Return JSON only:
{
  "analysis": "optional short login-specific reasoning",
  "steps": [
    { "action": "fill", "params": { "selector": "用户名", "value": "demo@example.com" }, "description": "填写用户名" }
  ],
  "explanation": "brief explanation in Chinese"
}

Examples:
User: 用户名是 demo@example.com 密码是 pass123 登录
JSON: {"steps":[{"action":"fill","params":{"selector":"用户名","value":"demo@example.com"},"description":"填写用户名"},{"action":"fill","params":{"selector":"密码","value":"pass123"},"description":"填写密码"},{"action":"click","params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"},"description":"点击登录"}],"explanation":"依次填写用户名、密码并提交登录"}

User: 邮箱是 demo@example.com 然后 next
JSON: {"steps":[{"action":"fill","params":{"selector":"用户名","value":"demo@example.com"},"description":"填写用户名"},{"action":"click","params":{"rawTarget":"Next","roleHint":"button","semanticHint":"submit"},"description":"点击 Next"}],"explanation":"填写邮箱后继续下一步"}

User: 口令是 123456
JSON: {"steps":[{"action":"fill","params":{"selector":"密码","value":"123456"},"description":"填写密码"}],"explanation":"填写当前页面的密码字段"}`;
  }

  private buildFailureContextSection(context: BrowserCommandContext): string {
    if (!context.lastFailureContext) {
      return '';
    }

    return `### Failure Context
- Last action: ${JSON.stringify(context.lastFailureContext.lastAction)}
- Error message: ${context.lastFailureContext.errorMessage}
- Error type: ${context.lastFailureContext.errorType || 'unknown'}
- Retryable: ${context.lastFailureContext.retryable === false ? 'false' : 'true'}
- This is a recovery attempt. Base your next action on the CURRENT page state, not only on the original user wording.`;
  }
}
