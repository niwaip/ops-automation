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
    name: 'click_result',
    description: 'Click on the Nth search result (use when user says "点击第一个结果" or similar)',
    params: {
      index: { type: 'number', required: true, description: 'Result index (1 for first, 2 for second, etc.)' },
    },
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

    // Try to parse using pattern matching first
    const patternResult = this.parseWithPatterns(input);
    if (patternResult) {
      return patternResult;
    }

    // If no pattern match, try using AI model
    try {
      return await this.parseWithAI(input);
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

    // Pattern: Search on search engines
    const searchPatterns = [
      /^(?:在?\s*(百度|baidu)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(谷歌|google)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(必应|bing)\s*搜索)\s*(.+)$/i,
      /^(?:search\s+(?:on\s+)?(baidu|google|bing)\s*:?\s*)(.+)$/i,
      // Generic search pattern - default to Baidu
      /^(?:搜索|search)\s+(.+)$/i,
    ];

    for (const pattern of searchPatterns) {
      const match = input.match(pattern);
      if (match) {
        // For generic search pattern, use Baidu as default
        const engine = match[1] ? match[1].toLowerCase() : '百度';
        const query = match[2] ? match[2].trim() : match[1]?.trim();

        if (!query) continue;

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
        let indexStr = match[1].replace('第', '').replace('个', '').replace('条', '').toLowerCase();
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

  private async parseWithAI(input: string): Promise<ParseBrowserCommandResponse> {
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

    const prompt = `You are a browser automation command parser. Your ONLY job is to convert natural language to browser commands.

Available tools:
${toolsDescription}

Website URL mappings:
${urlMappings}

User command: "${input}"

CRITICAL: You MUST respond with ONLY a valid JSON object, NO other text.

Response format:
{
  "commands": [
    {"tool": "tool_name", "params": {...}, "description": "..."}
  ],
  "explanation": "brief explanation"
}

Examples:
- "打开微博" -> {"commands":[{"tool":"navigate","params":{"url":"https://weibo.com"},"description":"打开微博"}],"explanation":"导航到微博"}
- "打开百度" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com"},"description":"打开百度"}],"explanation":"导航到百度首页"}
- "在百度搜索天气" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com/s?wd=天气"},"description":"搜索天气"}],"explanation":"在百度搜索天气"}
- "点击登录按钮" -> {"commands":[{"tool":"click","params":{"text":"登录"},"description":"点击登录"}],"explanation":"点击登录按钮"}
- "点击第一个搜索结果" -> {"commands":[{"tool":"click_result","params":{"index":1},"description":"点击第一个结果"}],"explanation":"点击第一个搜索结果"}
- "截图" -> {"commands":[{"tool":"screenshot","params":{},"description":"截图"}],"explanation":"截取当前页面"}

Respond with ONLY the JSON object:`;

    try {
      // Call the AI model
      const response = await this.modelService.callModel(chatModel.id, prompt);

      this.logger.debug(`AI raw response: ${response}`);

      // Parse the response - try to extract JSON
      let jsonStr = response;

      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
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