import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';

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

  constructor(private readonly modelService: ModelService) {}

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
    // Pattern: Navigate to URL
    const navPatterns = [
      /^(?:打开|访问|前往|进入)\s*(.+)$/i,
      /^(?:open|go to|navigate to|visit)\s*(.+)$/i,
    ];

    for (const pattern of navPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const target = match[1].trim();
        const url = this.resolveUrl(target);
        return {
          success: true,
          commands: [{
            tool: 'navigate',
            params: { url },
            description: `导航到 ${url}`,
          }],
          explanation: `将打开网址: ${url}`,
        };
      }
    }

    // Pattern: Search
    const searchPatterns = [
      /^(?:在\s*)?(.+?)\s*(?:搜索|查找|搜)\s*(.+)$/i,
      /^search\s+(.+?)\s+(?:for\s+)?(.+)$/i,
      /^(?:搜索|搜)\s*(.+)$/i,  // "搜索天气" pattern
      /^(?:查找|找)\s*(.+)$/i,  // "查找天气" pattern
    ];

    for (const pattern of searchPatterns) {
      const match = input.match(pattern);
      if (match) {
        // For "搜索X" pattern, use default search engine (Baidu)
        let site = '百度';
        let query = '';

        if (match[1] && match[2]) {
          // "在百度搜索天气" pattern
          site = match[1].trim();
          query = match[2].trim();
        } else if (match[1]) {
          // "搜索天气" pattern - use Baidu as default
          query = match[1].trim();
        }

        if (query) {
          const baseUrl = this.resolveUrl(site);
          let searchUrl = baseUrl;

          // Construct search URL based on site
          if (baseUrl.includes('baidu')) {
            searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
          } else if (baseUrl.includes('google')) {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          } else if (baseUrl.includes('bing')) {
            searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
          }

          return {
            success: true,
            commands: [
              {
                tool: 'navigate',
                params: { url: searchUrl },
                description: `搜索: ${query}`,
              },
            ],
            explanation: `将在 ${site} 搜索: ${query}`,
          };
        }
      }
    }

    // Pattern: Click
    const clickPatterns = [
      /^(?:点击|单击|点)\s*(.+)$/i,
      /^click\s+(?:on\s+)?(.+)$/i,
    ];

    for (const pattern of clickPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const target = match[1].trim();
        return {
          success: true,
          commands: [{
            tool: 'click',
            params: { text: target },
            description: `点击: ${target}`,
          }],
          explanation: `将点击包含 "${target}" 的元素`,
        };
      }
    }

    // Pattern: Fill/Input
    const fillPatterns = [
      /^(?:输入|填写|填入)\s*["']?(.+?)["']?\s*(?:到|在)\s*(.+)$/i,
      /^(?:fill|type|enter)\s+["']?(.+?)["']?\s+(?:in|into|to)\s+(.+)$/i,
    ];

    for (const pattern of fillPatterns) {
      const match = input.match(pattern);
      if (match && match[1] && match[2]) {
        const value = match[1].trim();
        const field = match[2].trim();
        return {
          success: true,
          commands: [{
            tool: 'fill',
            params: { selector: field, value },
            description: `输入: ${value}`,
          }],
          explanation: `将在 "${field}" 中输入 "${value}"`,
        };
      }
    }

    // Pattern: Screenshot
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

    // Pattern: Wait
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

    // Pattern: Press key
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

    const prompt = `You are a browser automation command parser. Your ONLY job is to convert natural language to browser commands.

Available tools:
${toolsDescription}

Common URL mappings:
- 百度/百度首页 -> https://www.baidu.com
- 谷歌 -> https://www.google.com
- 必应 -> https://www.bing.com
- 淘宝 -> https://www.taobao.com
- 京东 -> https://www.jd.com

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
- "打开百度" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com"},"description":"打开百度"}],"explanation":"导航到百度首页"}
- "在百度搜索天气" -> {"commands":[{"tool":"navigate","params":{"url":"https://www.baidu.com/s?wd=天气"},"description":"搜索天气"}],"explanation":"在百度搜索天气"}
- "点击登录按钮" -> {"commands":[{"tool":"click","params":{"text":"登录"},"description":"点击登录"}],"explanation":"点击登录按钮"}
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