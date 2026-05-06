import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import * as fs from 'fs';
import * as path from 'path';

export interface BrowserCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export interface ParseBrowserCommandRequest {
  input: string;
  context?: Record<string, unknown>;
}

interface BrowserCommandContext {
  commandType?: string;
  currentPageUrl?: string;
  backend?: string;
}

type BrowserPlanAction =
  | 'navigate'
  | 'click'
  | 'list_search_results'
  | 'click_result'
  | 'switch_latest_tab'
  | 'fill'
  | 'screenshot'
  | 'snapshot'
  | 'read_page'
  | 'get_text'
  | 'scroll'
  | 'type_text'
  | 'wait'
  | 'hover'
  | 'press_key'
  | 'search'
  | 'smart_search';

interface BrowserPlanStep {
  action: BrowserPlanAction;
  params?: Record<string, unknown>;
  description?: string;
}

interface BrowserPlanResponse {
  steps: BrowserPlanStep[];
  explanation: string;
}

export interface ParseBrowserCommandResponse {
  success: boolean;
  commands: BrowserCommand[];
  explanation: string;
}

export interface WebsiteConfig {
  name: string;
  url: string;
  aliases?: string[];
}

// Data directory for persistence
const DATA_DIR = process.env.AI_MODELS_DATA_DIR || '/app/data';
const WEBSITES_FILE = path.join(DATA_DIR, 'custom-websites.json');

// MCP-style tool definitions
const BROWSER_TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    params: { url: { type: 'string', required: true, description: 'URL to navigate to' } },
  },
  {
    name: 'click',
    description: 'Click on an element',
    params: {
      selector: { type: 'string', required: true, description: 'CSS selector or text to find element' },
      text: { type: 'string', required: false, description: 'Text content to find element' },
    },
  },
  {
    name: 'list_search_results',
    description: 'List ranked search result candidates from the current page before clicking',
    params: {
      limit: { type: 'number', required: false, description: 'Maximum number of results to return' },
    },
  },
  {
    name: 'click_result',
    description: 'Click on the Nth search result (use when user says "点击第一个结果" or similar)',
    params: {
      index: { type: 'number', required: true, description: 'Result index (1 for first, 2 for second, etc.)' },
    },
  },
  {
    name: 'switch_latest_tab',
    description: 'Switch focus to the latest opened tab/page in the current browser session',
    params: {},
  },
  {
    name: 'fill',
    description: 'Fill text into an input field',
    params: {
      selector: { type: 'string', required: true, description: 'CSS selector for input field' },
      value: { type: 'string', required: true, description: 'Text to fill' },
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page',
    params: {},
  },
  {
    name: 'snapshot',
    description: 'Take accessibility snapshot of the page (get element UIDs for reliable clicking)',
    params: {},
  },
  {
    name: 'read_page',
    description: 'Read page content (text, headings, links)',
    params: {
      selector: { type: 'string', required: false, description: 'CSS selector to read specific element' },
      max_length: { type: 'number', required: false, description: 'Max text length to return' },
    },
  },
  {
    name: 'get_text',
    description: 'Get all visible text content from the page',
    params: {},
  },
  {
    name: 'scroll',
    description: 'Scroll the page (up, down, top, bottom)',
    params: {
      direction: { type: 'string', required: false, description: 'Direction: up, down, top, bottom' },
      amount: { type: 'number', required: false, description: 'Pixels to scroll' },
    },
  },
  {
    name: 'type_text',
    description: 'Type text using keyboard (use for typing into focused input)',
    params: {
      text: { type: 'string', required: true, description: 'Text to type' },
      submit_key: { type: 'string', required: false, description: 'Key to press after typing (e.g., Enter)' },
    },
  },
  {
    name: 'drag',
    description: 'Drag element from source to destination',
    params: {
      src: { type: 'string', required: true, description: 'Source element selector' },
      dst: { type: 'string', required: true, description: 'Destination element selector' },
    },
  },
  {
    name: 'wait',
    description: 'Wait for an element or time',
    params: {
      selector: { type: 'string', required: false, description: 'CSS selector to wait for' },
      duration: { type: 'number', required: false, description: 'Time to wait in ms' },
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element',
    params: {
      selector: { type: 'string', required: true, description: 'CSS selector for element' },
    },
  },
  {
    name: 'press_key',
    description: 'Press a key or key combination',
    params: {
      key: { type: 'string', required: true, description: 'Key to press (e.g., Enter, Tab, Escape)' },
    },
  },
  {
    name: 'search',
    description: 'Search using the current page search entry when the user explicitly chose search mode',
    params: {
      query: { type: 'string', required: true, description: 'Search query text' },
    },
  },
  {
    name: 'smart_search',
    description: 'Heuristic search on current page - auto-detects a likely search input and submits query',
    params: {
      query: { type: 'string', required: true, description: 'Search query text' },
    },
  },
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the browser',
    params: {
      script: { type: 'string', required: true, description: 'JavaScript code to execute' },
    },
  },
];

// Common URL patterns
const URL_PATTERNS: Record<string, string> = {
  '百度': 'https://www.baidu.com',
  '百度首页': 'https://www.baidu.com',
  'baidu': 'https://www.baidu.com',
  '谷歌': 'https://www.google.com',
  'google': 'https://www.google.com',
  '必应': 'https://www.bing.com',
  'bing': 'https://www.bing.com',
  'github': 'https://github.com',
  '淘宝': 'https://www.taobao.com',
  'taobao': 'https://www.taobao.com',
  '京东': 'https://www.jd.com',
  'jd': 'https://www.jd.com',
};

@Injectable()
export class BrowserCommandService {
  private readonly logger = new Logger(BrowserCommandService.name);
  private customWebsites: Map<string, WebsiteConfig> = new Map();

  constructor(private readonly modelService: ModelService) {
    this.loadCustomWebsites();
  }

  private loadCustomWebsites(): void {
    try {
      if (fs.existsSync(WEBSITES_FILE)) {
        const data = fs.readFileSync(WEBSITES_FILE, 'utf-8');
        const websites: WebsiteConfig[] = JSON.parse(data);
        for (const site of websites) {
          this.customWebsites.set(site.name.toLowerCase(), site);
          if (site.aliases) {
            for (const alias of site.aliases) {
              this.customWebsites.set(alias.toLowerCase(), site);
            }
          }
        }
        this.logger.log(`Loaded ${websites.length} custom websites`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load custom websites: ${errorMsg}`);
    }
  }

  private saveCustomWebsites(): void {
    try {
      const websites: WebsiteConfig[] = [];
      const seen = new Set<string>();
      for (const [_, config] of this.customWebsites) {
        if (!seen.has(config.name)) {
          websites.push(config);
          seen.add(config.name);
        }
      }
      fs.writeFileSync(WEBSITES_FILE, JSON.stringify(websites, null, 2));
      this.logger.log(`Saved ${websites.length} custom websites`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save custom websites: ${errorMsg}`);
    }
  }

  addWebsite(config: WebsiteConfig): void {
    this.customWebsites.set(config.name.toLowerCase(), config);
    if (config.aliases) {
      for (const alias of config.aliases) {
        this.customWebsites.set(alias.toLowerCase(), config);
      }
    }
    this.saveCustomWebsites();
  }

  removeWebsite(name: string): boolean {
    const config = this.customWebsites.get(name.toLowerCase());
    if (config) {
      this.customWebsites.delete(name.toLowerCase());
      if (config.aliases) {
        for (const alias of config.aliases) {
          this.customWebsites.delete(alias.toLowerCase());
        }
      }
      this.saveCustomWebsites();
      return true;
    }
    return false;
  }

  listWebsites(): WebsiteConfig[] {
    const seen = new Set<string>();
    const result: WebsiteConfig[] = [];
    for (const [_, config] of this.customWebsites) {
      if (!seen.has(config.name)) {
        result.push(config);
        seen.add(config.name);
      }
    }
    return result;
  }

  getUrlPatterns(): Record<string, string> {
    // Merge default and custom URL patterns
    const result: Record<string, string> = { ...URL_PATTERNS };
    for (const [_, config] of this.customWebsites) {
      result[config.name] = config.url;
    }
    return result;
  }

  async parseCommand(request: ParseBrowserCommandRequest): Promise<ParseBrowserCommandResponse> {
    const { input } = request;
    this.logger.log(`Parsing browser command: ${input}`);

    const commandContext = this.normalizeContext(request.context);

    const contextResult = this.parseWithCommandContext(input, commandContext);
    if (contextResult) {
      return contextResult;
    }

    const aiPlanResult = await this.parseWithAIPlan(input, commandContext);
    if (aiPlanResult) {
      return aiPlanResult;
    }

    const sequentialResult = this.parseSequentialCommands(input);
    if (sequentialResult) {
      return sequentialResult;
    }

    // Try to parse using pattern matching first
    const patternResult = this.parseWithPatterns(input);
    if (patternResult) {
      return patternResult;
    }

    // If no pattern match, try using AI model
    try {
      return await this.parseWithAI(input, commandContext);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse with AI: ${errorMsg}`);
      return {
        success: false,
        commands: [],
        explanation: `无法解析命令: ${input}`,
      };
    }
  }

  private normalizeContext(context?: Record<string, unknown>): BrowserCommandContext {
    if (!context) {
      return {};
    }

    return {
      commandType: typeof context.commandType === 'string' ? context.commandType : undefined,
      currentPageUrl: typeof context.currentPageUrl === 'string' ? context.currentPageUrl : undefined,
      backend: typeof context.backend === 'string' ? context.backend : undefined,
    };
  }

  private parseSequentialCommands(input: string): ParseBrowserCommandResponse | null {
    const normalizedInput = input
      .replace(/[，。；]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedInput) {
      return null;
    }

    const commands: BrowserCommand[] = [];
    const explanations: string[] = [];
    let remaining = normalizedInput;

    const navigateTarget = this.extractSequentialNavigateTarget(remaining);
    if (navigateTarget) {
      const { target, consumedLength } = navigateTarget;
      const url = this.resolveUrl(target);
      commands.push({
        tool: 'navigate',
        params: { url },
        description: `导航到 ${target}`,
      });
      explanations.push(`打开 ${url}`);
      remaining = this.stripLeadingConnector(remaining.slice(consumedLength));
    }

    const smartSearchMatch = remaining.match(
      /^(?:智搜|智能搜索)\s*(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:点击|选择|click)|$)/i,
    );
    if (smartSearchMatch?.[1]) {
      const query = smartSearchMatch[1].trim();
      commands.push({
        tool: 'smart_search',
        params: { query },
        description: `智搜 ${query}`,
      });
      explanations.push(`搜索 ${query}`);
      remaining = this.stripLeadingConnector(remaining.slice(smartSearchMatch[0].length));
    } else {
      const searchMatch = remaining.match(
        /^(?:搜索|search)\s*(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:点击|选择|click)|$)/i,
      );
      if (searchMatch?.[1]) {
        const query = searchMatch[1].trim();
        commands.push({
          tool: 'smart_search',
          params: { query },
          description: `智搜 ${query}`,
        });
        explanations.push(`搜索 ${query}`);
        remaining = this.stripLeadingConnector(remaining.slice(searchMatch[0].length));
      }
    }

    const clickResultMatch = remaining.match(
      /^(?:点击|选择|click)\s*(第?[一二三四五六七八九十\d]+|first|second|third|fourth|fifth)\s*(?:个?结果|条?结果|搜索结果|result)?$/i,
    );
    if (clickResultMatch?.[1]) {
      const index = this.resolveResultIndex(clickResultMatch[1]);
      if (index > 0) {
        commands.push({
          tool: 'click_result',
          params: { index },
          description: `点击第${index}个结果`,
        });
        explanations.push(`点击第${index}个结果`);
        remaining = this.stripLeadingConnector(remaining.slice(clickResultMatch[0].length));
      }
    }

    if (commands.length >= 2 && remaining.length === 0) {
      return {
        success: true,
        commands,
        explanation: `将依次${explanations.join('，')}`,
      };
    }

    return null;
  }

  private stripLeadingConnector(text: string): string {
    return text.replace(/^(?:\s|并且|并|然后|再|后|接着)+/i, '').trim();
  }

  private extractSequentialNavigateTarget(
    input: string,
  ): { target: string; consumedLength: number } | null {
    const prefixMatch = input.match(/^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s*/i);
    if (!prefixMatch) {
      return null;
    }

    const rest = input.slice(prefixMatch[0].length);
    const firstToken = rest.match(/^([^\s]+)/)?.[1];
    if (firstToken) {
      const resolved = this.resolveUrl(firstToken);
      const looksLikeExplicitTarget = resolved !== `https://${firstToken}`
        || /^https?:\/\//i.test(firstToken)
        || /^[\w.-]+\.[a-z]{2,}/i.test(firstToken);
      if (looksLikeExplicitTarget) {
        return {
          target: firstToken,
          consumedLength: prefixMatch[0].length + firstToken.length,
        };
      }
    }

    const fallbackMatch = rest.match(
      /^(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:智搜|智能搜索|搜索|search|点击|选择|click)|$)/i,
    );
    if (!fallbackMatch?.[1]) {
      return null;
    }

    return {
      target: fallbackMatch[1].trim(),
      consumedLength: prefixMatch[0].length + fallbackMatch[0].length,
    };
  }

  private resolveResultIndex(value: string): number {
    const indexMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
    };
    const normalized = value.replace(/^第/, '').replace(/个|条/g, '').toLowerCase();
    return indexMap[normalized] || parseInt(normalized, 10) || 0;
  }

  private parseWithCommandContext(
    input: string,
    context: BrowserCommandContext,
  ): ParseBrowserCommandResponse | null {
    const commandType = context.commandType?.trim().toLowerCase();
    if (!commandType) {
      return null;
    }

    const strippedInput = this.stripCommandPrefix(input, commandType);
    if (!strippedInput) {
      return null;
    }

    switch (commandType) {
      case 'navigate': {
        const url = this.resolveUrl(strippedInput);
        return {
          success: true,
          commands: [{
            tool: 'navigate',
            params: { url },
            description: `导航到 ${strippedInput}`,
          }],
          explanation: `将打开 ${url}`,
        };
      }
      case 'click':
        return {
          success: true,
          commands: [{
            tool: 'click',
            params: { text: strippedInput },
            description: `点击 ${strippedInput}`,
          }],
          explanation: `将点击包含"${strippedInput}"的元素`,
        };
      case 'search':
        return {
          success: true,
          commands: [{
            tool: 'search',
            params: { query: strippedInput },
            description: `搜索 ${strippedInput}`,
          }],
          explanation: context.currentPageUrl
            ? `将使用当前页面的搜索入口搜索 ${strippedInput}`
            : `将搜索 ${strippedInput}`,
        };
      case 'smart_search':
        return {
          success: true,
          commands: [{
            tool: 'smart_search',
            params: { query: strippedInput },
            description: `智搜 ${strippedInput}`,
          }],
          explanation: `将智能查找当前页面的搜索入口并搜索 ${strippedInput}`,
        };
      default:
        return null;
    }
  }

  private stripCommandPrefix(input: string, commandType: string): string {
    const normalized = input.trim();
    const prefixMap: Record<string, RegExp[]> = {
      navigate: [/^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s+/i],
      click: [/^(?:点击|click)\s+/i],
      search: [/^(?:搜索|search)\s+/i],
      smart_search: [/^(?:智搜|智能搜索|smart\s*search)\s+/i],
    };

    const patterns = prefixMap[commandType] || [];
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return normalized.replace(pattern, '').trim();
      }
    }

    return normalized;
  }

  private parseWithPatterns(input: string): ParseBrowserCommandResponse | null {
    // Try pattern matching for all common commands first

    // Pattern: Navigate to known sites
    const navigatePatterns = [
      /^(?:打开|导航到|访问|前往|goto)\s*(.+)$/i,
      /^(?:open|navigate|go\s*to|visit)\s+(.+)$/i,
    ];

    for (const pattern of navigatePatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const target = match[1].trim();
        const url = this.resolveUrl(target);
        // Only use pattern if we resolved to a known URL
        if (url && url !== `https://${target}`) {
          return {
            success: true,
            commands: [{
              tool: 'navigate',
              params: { url },
              description: `导航到 ${target}`,
            }],
            explanation: `将打开 ${url}`,
          };
        }
        // If not a known URL, return null to let AI handle it
        // AI can handle more complex navigation like "打开微博搜索xxx"
        return null;
      }
    }

    // Pattern: Search on specific search engines (explicit engine specified)
    // Generic "搜索 xxx" will go through AI for page-aware search
    const searchPatterns = [
      /^(?:在?\s*(百度|baidu)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(谷歌|google)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(必应|bing)\s*搜索)\s*(.+)$/i,
      /^(?:search\s+(?:on\s+)?(baidu|google|bing)\s*:?\s*)(.+)$/i,
    ];

    for (const pattern of searchPatterns) {
      const match = input.match(pattern);
      if (match && match[1] && match[2]) {
        const engine = match[1].toLowerCase();
        const query = match[2].trim();

        const searchUrls: Record<string, string> = {
          '百度': 'https://www.baidu.com/s?wd=',
          'baidu': 'https://www.baidu.com/s?wd=',
          '谷歌': 'https://www.google.com/search?q=',
          'google': 'https://www.google.com/search?q=',
          '必应': 'https://www.bing.com/search?q=',
          'bing': 'https://www.bing.com/search?q=',
        };
        const baseUrl = searchUrls[engine] || searchUrls['百度'];
        return {
          success: true,
          commands: [{
            tool: 'navigate',
            params: { url: `${baseUrl}${encodeURIComponent(query)}` },
            description: `在${engine}搜索 ${query}`,
          }],
          explanation: `将在${engine}搜索 ${query}`,
        };
      }
    }

    // Pattern: Click by result index (点击第一个结果 etc.)
    const clickResultPatterns = [
      /^(?:点击|选择)\s*(第?[一二三四五六七八九十\d]+)\s*(?:个?结果|条?结果|搜索结果)$/i,
      /^click\s+(?:the\s+)?(?:first|second|third|fourth|fifth|\d+th)?\s*result$/i,
    ];

    const indexMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
    };

    for (const pattern of clickResultPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const indexStr = match[1].replace('第', '').replace('个', '').replace('条', '').toLowerCase();
        const index = indexMap[indexStr] || parseInt(indexStr, 10);
        if (index > 0) {
          return {
            success: true,
            commands: [{
              tool: 'click_result',
              params: { index },
              description: `点击第${index}个结果`,
            }],
            explanation: `将点击第${index}个搜索结果`,
          };
        }
      }
    }

    const listSearchResultsPatterns = [
      /^(?:列出|查看|显示)\s*(?:搜索)?(?:结果|候选结果|搜索结果)$/i,
      /^(?:show|list|inspect)\s+(?:search\s+)?results?$/i,
    ];

    for (const pattern of listSearchResultsPatterns) {
      if (pattern.test(input.trim())) {
        return {
          success: true,
          commands: [{
            tool: 'list_search_results',
            params: { limit: 8 },
            description: '列出当前页面搜索结果候选',
          }],
          explanation: '将列出当前页面可点击的搜索结果候选',
        };
      }
    }

    // Pattern: switch to latest tab/page
    const switchLatestTabPatterns = [
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*(?:最新|最后)\s*(?:标签页|页签|tab|页面)$/i,
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*新(?:标签页|页签|tab|页面)$/i,
      /^(?:switch|focus)\s+(?:to\s+)?(?:the\s+)?(?:latest|last|newest)\s+(?:tab|page)$/i,
    ];

    for (const pattern of switchLatestTabPatterns) {
      if (pattern.test(input.trim())) {
        return {
          success: true,
          commands: [{
            tool: 'switch_latest_tab',
            params: {},
            description: '切换到最新标签页',
          }],
          explanation: '将切换到当前浏览器会话中的最新标签页',
        };
      }
    }

    // Pattern: Click by text (点击登录按钮 etc.)
    const clickPatterns = [
      /^(?:点击|单击|按下)\s*(.+?)(?:按钮|链接|元素)?$/i,
      /^click\s+(?:on\s+)?(.+)$/i,
    ];

    for (const pattern of clickPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const text = match[1].trim();
        // Don't match if it looks like a result index (handled above)
        if (!text.match(/第?[一二三四五六七八九十\d]+\s*(?:个?结果|条?结果)/)) {
          return {
            success: true,
            commands: [{
              tool: 'click',
              params: { text },
              description: `点击 ${text}`,
            }],
            explanation: `将点击包含"${text}"的元素`,
          };
        }
      }
    }

    // Pattern: Scroll - fixed command
    const scrollPatterns = [
      /^(?:滚动|scroll)\s*(向下|下|up|down|向上|上|top|bottom|顶部|底部)?$/i,
      /^(?:向下|向下滚动|向下翻页)$/i,
      /^(?:向上|向上滚动|向上翻页)$/i,
      /^(?:滚动到|scroll\s*to)\s*(顶部|底部|top|bottom)$/i,
    ];

    for (const pattern of scrollPatterns) {
      const match = input.match(pattern);
      if (match) {
        let direction = 'down';
        const text = match[1]?.toLowerCase() || '';
        if (text.includes('向上') || text.includes('上') || text.includes('up') || text.includes('top') || text.includes('顶部')) {
          direction = 'up';
        } else if (text.includes('底部') || text.includes('bottom')) {
          direction = 'bottom';
        } else if (text.includes('顶部')) {
          direction = 'top';
        }
        return {
          success: true,
          commands: [{
            tool: 'scroll',
            params: { direction },
            description: `滚动页面 ${direction}`,
          }],
          explanation: `将向${direction === 'down' ? '下' : direction === 'up' ? '上' : direction}滚动页面`,
        };
      }
    }

    // Pattern: Screenshot - fixed command, no AI needed
    const screenshotPatterns = [
      /^(?:截图|截屏|截图保存|capture|screenshot)$/i,
    ];

    for (const pattern of screenshotPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [{
            tool: 'screenshot',
            params: {},
            description: '截取当前页面',
          }],
          explanation: '将截取当前页面截图',
        };
      }
    }

    // Pattern: Snapshot (accessibility tree) - fixed command, no AI needed
    const snapshotPatterns = [
      /^(?:快照|页面结构|获取页面|take\s*snapshot|snapshot)$/i,
      /^(?:查看|分析)\s*(?:页面|结构)$/i,
    ];

    for (const pattern of snapshotPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [{
            tool: 'snapshot',
            params: {},
            description: '获取页面结构快照',
          }],
          explanation: '将获取页面可访问性结构快照',
        };
      }
    }

    // Pattern: Get text - fixed command
    const getTextPatterns = [
      /^(?:获取文本|读取文本|获取页面文本|get\s*text)$/i,
    ];

    for (const pattern of getTextPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [{
            tool: 'get_text',
            params: {},
            description: '获取页面文本',
          }],
          explanation: '将获取页面所有可见文本',
        };
      }
    }

    // Pattern: Wait - fixed command, no AI needed
    const waitPatterns = [
      /^(?:等待|等)\s*(\d+)\s*(?:秒|毫秒|ms|s)?$/i,
      /^wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?$/i,
    ];

    for (const pattern of waitPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        let duration = parseInt(match[1], 10);
        // Convert to ms if seconds
        if (input.includes('秒') || input.toLowerCase().includes('second')) {
          duration *= 1000;
        }
        return {
          success: true,
          commands: [{
            tool: 'wait',
            params: { duration },
            description: `等待 ${duration}ms`,
          }],
          explanation: `将等待 ${duration} 毫秒`,
        };
      }
    }

    // Pattern: Press key - fixed command, no AI needed
    const keyPatterns = [
      /^(?:按下|按)\s*(.+?)\s*(?:键)?$/i,
      /^press\s+(.+?)(?:\s+key)?$/i,
    ];

    for (const pattern of keyPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        let key = match[1].trim();
        // Map common key names
        const keyMap: Record<string, string> = {
          '回车': 'Enter',
          '确定': 'Enter',
          'enter': 'Enter',
          'tab': 'Tab',
          '制表符': 'Tab',
          'esc': 'Escape',
          'escape': 'Escape',
          '退出': 'Escape',
          '空格': 'Space',
          'space': 'Space',
        };
        key = keyMap[key.toLowerCase()] || key;

        return {
          success: true,
          commands: [{
            tool: 'press_key',
            params: { key },
            description: `按下 ${key} 键`,
          }],
          explanation: `将按下 ${key} 键`,
        };
      }
    }

    // If no pattern matched, return null to let AI handle it
    // AI can handle more complex commands like:
    // - "打开微博并搜索xxx"
    // - "点击那个蓝色的按钮"
    // - "在输入框输入xxx然后点击搜索"
    return null;
  }

  private async parseWithAI(
    input: string,
    context: BrowserCommandContext,
  ): Promise<ParseBrowserCommandResponse> {
    // Try to get an active AI model
    const models = await this.modelService.listModels();
    // Find any active model (simplified check)
    const chatModel = models.find(m => m.status === 'active');

    if (!chatModel) {
      // Fall back to pattern matching with generic response
      return {
        success: false,
        commands: [],
        explanation: '未找到可用的 AI 模型，请先配置 AI 模型',
      };
    }

    // Build prompt for AI - strict JSON output only
    const toolsDescription = BROWSER_TOOLS.map(t =>
      `- ${t.name}: ${t.description}. Params: ${JSON.stringify(t.params)}`
    ).join('\n');

    // Build URL mappings from default and custom websites
    const urlPatterns = this.getUrlPatterns();
    const urlMappings = Object.entries(urlPatterns)
      .map(([name, url]) => `- ${name} -> ${url}`)
      .join('\n');

    const browserContextDescription = [
      context.commandType ? `- Preferred command type: ${context.commandType}` : null,
      context.currentPageUrl ? `- Current page URL: ${context.currentPageUrl}` : null,
      context.backend ? `- Execution backend: ${context.backend}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a browser automation command parser. Your ONLY job is to convert natural language to browser commands.

Available tools:
${toolsDescription}

Website URL mappings:
${urlMappings}

Current browser context:
${browserContextDescription || '- No browser context provided'}

User command: "${input}"

CRITICAL: You MUST respond with ONLY a valid JSON object, NO other text.

Response format:
{
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

Examples:
- "打开微博" -> {"commands":[{"tool":"navigate","params":{"url":"https://weibo.com"},"description":"打开微博"}],"explanation":"导航到微博"}
- "打开百度" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com"},"description":"打开百度"}],"explanation":"导航到百度首页"}
- "在百度搜索产品公告" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com/s?wd=产品公告"},"description":"搜索产品公告"}],"explanation":"在百度搜索产品公告"}
- "搜索 MCP 协议" -> {"commands":[{"tool":"search","params":{"query":"MCP 协议"},"description":"搜索MCP协议"}],"explanation":"在当前页面搜索MCP协议"}
- "智搜 MCP 协议" -> {"commands":[{"tool":"smart_search","params":{"query":"MCP 协议"},"description":"智搜MCP协议"}],"explanation":"将智能查找搜索入口并搜索MCP协议"}
- "点击登录按钮" -> {"commands":[{"tool":"click","params":{"text":"登录"},"description":"点击登录"}],"explanation":"点击登录按钮"}
- "列出搜索结果" -> {"commands":[{"tool":"list_search_results","params":{"limit":8},"description":"列出当前页面搜索结果候选"}],"explanation":"列出当前页面搜索结果候选"}
- "点击第一个搜索结果" -> {"commands":[{"tool":"click_result","params":{"index":1},"description":"点击第一个结果"}],"explanation":"点击第一个搜索结果"}
- "切到最新标签页" -> {"commands":[{"tool":"switch_latest_tab","params":{},"description":"切换到最新标签页"}],"explanation":"切换到最新标签页"}
- "截图" -> {"commands":[{"tool":"screenshot","params":{},"description":"截图"}],"explanation":"截取当前页面"}

Respond with ONLY the JSON object:`;

    try {
      // Call the AI model
      const response = await this.modelService.callModel(chatModel.id, prompt);

      this.logger.debug(`AI raw response: ${response.content}`);

      // Parse the response - try to extract JSON
      let jsonStr = response.content;

      // Try to find JSON in the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      // Clean up common issues
      jsonStr = jsonStr.trim();

      try {
        const parsed = JSON.parse(jsonStr);
        return {
          success: true,
          commands: parsed.commands || [],
          explanation: parsed.explanation || '',
        };
      } catch (parseError) {
        this.logger.error(`JSON parse error: ${parseError}, input: ${jsonStr}`);
        return {
          success: false,
          commands: [],
          explanation: `AI 返回格式错误，请重试`,
        };
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI parsing error: ${errorMsg}`);
      return {
        success: false,
        commands: [],
        explanation: `AI 解析失败: ${errorMsg}`,
      };
    }
  }

  private async parseWithAIPlan(
    input: string,
    context: BrowserCommandContext,
  ): Promise<ParseBrowserCommandResponse | null> {
    const plan = await this.buildAIPlan(input, context);
    if (!plan || plan.steps.length === 0) {
      return null;
    }

    const commands = this.mapPlanStepsToCommands(plan.steps);
    if (commands.length === 0) {
      return null;
    }

    return {
      success: true,
      commands,
      explanation: plan.explanation || `将执行 ${commands.length} 个步骤`,
    };
  }

  private async buildAIPlan(
    input: string,
    context: BrowserCommandContext,
  ): Promise<BrowserPlanResponse | null> {
    const models = await this.modelService.listModels();
    const chatModel = models.find(m => m.status === 'active');
    if (!chatModel) {
      return null;
    }

    const urlPatterns = this.getUrlPatterns();
    const urlMappings = Object.entries(urlPatterns)
      .map(([name, url]) => `- ${name} -> ${url}`)
      .join('\n');

    const browserContextDescription = [
      context.commandType ? `- Preferred command type: ${context.commandType}` : null,
      context.currentPageUrl ? `- Current page URL: ${context.currentPageUrl}` : null,
      context.backend ? `- Execution backend: ${context.backend}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a browser automation planner.

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
${browserContextDescription || '- No browser context provided'}

User command: "${input}"

Rules:
- Prefer multi-step planning when the user expresses multiple actions in one sentence.
- Use "navigate" for opening a site.
- Use "smart_search" when the user wants to search on the current page or after opening a search engine.
- Use "list_search_results" when the user asks to查看/列出当前搜索结果候选.
- Use "click_result" when the user says "点击第一个结果" or similar.
- Use "switch_latest_tab" when the user wants to切到最新标签页/最新页面.
- Do not invent unavailable actions.
- If a site name maps to a known URL, put the final URL in navigate.params.url.

Return JSON only:
{
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
JSON: {"steps":[{"action":"click","params":{"text":"登录"},"description":"点击登录"}],"explanation":"点击登录"}
`;

    try {
      const response = await this.modelService.callModel(chatModel.id, prompt);
      const parsed = this.parseJsonObject(response.content);
      if (!parsed) {
        return null;
      }

      if (Array.isArray(parsed.steps)) {
        return {
          steps: parsed.steps as BrowserPlanStep[],
          explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
        };
      }

      // Backward-compatible path: old models may still emit commands directly.
      if (Array.isArray(parsed.commands)) {
        return {
          steps: (parsed.commands as Array<Record<string, unknown>>).map((command) => ({
            action: String(command.tool || '') as BrowserPlanAction,
            params: (command.params as Record<string, unknown>) || {},
            description: typeof command.description === 'string' ? command.description : undefined,
          })),
          explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
        };
      }

      return null;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`AI planning failed, fallback to rules: ${errorMsg}`);
      return null;
    }
  }

  private mapPlanStepsToCommands(steps: BrowserPlanStep[]): BrowserCommand[] {
    return steps
      .map((step) => this.mapPlanStepToCommand(step))
      .filter((command): command is BrowserCommand => Boolean(command));
  }

  private mapPlanStepToCommand(step: BrowserPlanStep): BrowserCommand | null {
    const action = step.action;
    const params = step.params || {};
    const description = step.description || String(action);

    switch (action) {
      case 'navigate':
        if (typeof params.url !== 'string') {
          return null;
        }
        return {
          tool: 'navigate',
          params: { url: this.resolveUrl(String(params.url)) },
          description,
        };
      case 'search':
      case 'smart_search':
        if (typeof params.query !== 'string') {
          return null;
        }
        return {
          tool: action,
          params: { query: String(params.query) },
          description,
        };
      case 'click_result':
        if (typeof params.index !== 'number') {
          return null;
        }
        return {
          tool: 'click_result',
          params: { index: params.index },
          description,
        };
      case 'list_search_results':
        return {
          tool: 'list_search_results',
          params: {
            ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
          },
          description,
        };
      case 'switch_latest_tab':
        return {
          tool: 'switch_latest_tab',
          params: {},
          description,
        };
      case 'click':
        if (typeof params.text === 'string') {
          return { tool: 'click', params: { text: params.text }, description };
        }
        if (typeof params.selector === 'string') {
          return { tool: 'click', params: { selector: params.selector }, description };
        }
        return null;
      case 'fill':
        if (typeof params.selector === 'string' && typeof params.value === 'string') {
          return { tool: 'fill', params: { selector: params.selector, value: params.value }, description };
        }
        return null;
      case 'screenshot':
      case 'snapshot':
      case 'get_text':
        return { tool: action, params: {}, description };
      case 'read_page':
      case 'scroll':
      case 'type_text':
      case 'wait':
      case 'hover':
      case 'press_key':
        return { tool: action, params, description };
      default:
        return null;
    }
  }

  private parseJsonObject(content?: string): Record<string, any> | null {
    if (!content) {
      return null;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = (jsonMatch ? jsonMatch[0] : content).trim();
    try {
      return JSON.parse(jsonStr) as Record<string, any>;
    } catch (error) {
      this.logger.warn(`Failed to parse planner JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  private resolveUrl(input: string): string {
    // Check if it's a known site
    const normalizedInput = input.toLowerCase().trim();
    if (URL_PATTERNS[normalizedInput]) {
      return URL_PATTERNS[normalizedInput];
    }

    // Check for partial matches
    for (const [key, url] of Object.entries(URL_PATTERNS)) {
      if (normalizedInput.includes(key.toLowerCase())) {
        return url;
      }
    }

    // Check if it's already a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }

    // Add https://
    return `https://${input}`;
  }
}
