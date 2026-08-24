import { Injectable } from '@nestjs/common';
import type { ParseBrowserCommandResponse } from '../browser-command.types';

@Injectable()
export class BrowserCommandAtomicService {
  parseAtomicCommand(input: string): ParseBrowserCommandResponse | null {
    const normalizedInput = input.trim();
    if (!normalizedInput) {
      return null;
    }

    const switchLatestTabPatterns = [
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*(?:最新|最后)\s*(?:标签页|页签|tab|页面)$/i,
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*新(?:标签页|页签|tab|页面)$/i,
      /^(?:switch|focus)\s+(?:to\s+)?(?:the\s+)?(?:latest|last|newest)\s+(?:tab|page)$/i,
    ];
    for (const pattern of switchLatestTabPatterns) {
      if (pattern.test(normalizedInput)) {
        return {
          success: true,
          commands: [
            {
              tool: 'switch_latest_tab',
              params: {},
              description: '切换到最新标签页',
            },
          ],
          explanation: '将切换到当前浏览器会话中的最新标签页',
        };
      }
    }

    const closeTabPatterns = [
      /^(?:关闭|关掉)\s*(?:当前)?\s*(?:标签页|页签|tab|页面)$/i,
      /^(?:close|dismiss)\s*(?:the\s+)?(?:current|active)?\s*(?:tab|page)$/i,
    ];
    for (const pattern of closeTabPatterns) {
      if (pattern.test(normalizedInput)) {
        return {
          success: true,
          commands: [
            {
              tool: 'close_tab',
              params: {},
              description: '关闭当前标签页',
            },
          ],
          explanation: '将关闭当前激活的浏览器标签页',
        };
      }
    }

    const scrollPatterns = [
      /^(?:滚动|scroll)\s*(向下|下|up|down|向上|上|top|bottom|顶部|底部)?$/i,
      /^(?:向下|向下滚动|向下翻页)$/i,
      /^(?:向上|向上滚动|向上翻页)$/i,
      /^(?:滚动到|scroll\s*to)\s*(顶部|底部|top|bottom)$/i,
    ];
    for (const pattern of scrollPatterns) {
      const match = normalizedInput.match(pattern);
      if (!match) {
        continue;
      }

      let direction = 'down';
      const directionText = match[1]?.toLowerCase() || '';
      if (
        directionText.includes('向上') ||
        directionText.includes('上') ||
        directionText.includes('up') ||
        directionText.includes('top') ||
        directionText.includes('顶部')
      ) {
        direction = 'up';
      } else if (directionText.includes('底部') || directionText.includes('bottom')) {
        direction = 'bottom';
      }

      return {
        success: true,
        commands: [
          {
            tool: 'scroll',
            params: { direction },
            description: `滚动页面 ${direction}`,
          },
        ],
        explanation: `将向${direction === 'down' ? '下' : direction === 'up' ? '上' : direction}滚动页面`,
      };
    }

    const screenshotPatterns = [/^(?:截图|截屏|截图保存|capture|screenshot)$/i];
    for (const pattern of screenshotPatterns) {
      if (pattern.test(normalizedInput)) {
        return {
          success: true,
          commands: [
            {
              tool: 'screenshot',
              params: {},
              description: '截取当前页面',
            },
          ],
          explanation: '将截取当前页面截图',
        };
      }
    }

    const snapshotPatterns = [
      /^(?:快照|页面结构|获取页面|take\s*snapshot|snapshot)$/i,
      /^(?:查看|分析)\s*(?:页面|结构)$/i,
    ];
    for (const pattern of snapshotPatterns) {
      if (pattern.test(normalizedInput)) {
        return {
          success: true,
          commands: [
            {
              tool: 'snapshot',
              params: {},
              description: '获取页面结构快照',
            },
          ],
          explanation: '将获取页面可访问性结构快照',
        };
      }
    }

    const getTextPatterns = [/^(?:获取文本|读取文本|获取页面文本|get\s*text)$/i];
    for (const pattern of getTextPatterns) {
      if (pattern.test(normalizedInput)) {
        return {
          success: true,
          commands: [
            {
              tool: 'get_text',
              params: {},
              description: '获取页面文本',
            },
          ],
          explanation: '将获取页面所有可见文本',
        };
      }
    }

    const waitPatterns = [
      /^(?:等待|等)\s*(\d+)\s*(?:秒|毫秒|ms|s)?$/i,
      /^wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?$/i,
    ];
    for (const pattern of waitPatterns) {
      const match = normalizedInput.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      let duration = parseInt(match[1], 10);
      if (normalizedInput.includes('秒') || normalizedInput.toLowerCase().includes('second')) {
        duration *= 1000;
      }

      return {
        success: true,
        commands: [
          {
            tool: 'wait',
            params: { duration },
            description: `等待 ${duration}ms`,
          },
        ],
        explanation: `将等待 ${duration} 毫秒`,
      };
    }

    const keyPatterns = [/^(?:按下|按)\s*(.+?)\s*(?:键)?$/i, /^press\s+(.+?)(?:\s+key)?$/i];
    for (const pattern of keyPatterns) {
      const match = normalizedInput.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      let key = match[1].trim();
      const keyMap: Record<string, string> = {
        回车: 'Enter',
        确定: 'Enter',
        enter: 'Enter',
        tab: 'Tab',
        制表符: 'Tab',
        esc: 'Escape',
        escape: 'Escape',
        退出: 'Escape',
        空格: 'Space',
        space: 'Space',
      };
      key = keyMap[key.toLowerCase()] || key;

      return {
        success: true,
        commands: [
          {
            tool: 'press_key',
            params: { key },
            description: `按下 ${key} 键`,
          },
        ],
        explanation: `将按下 ${key} 键`,
      };
    }

    return null;
  }
}
