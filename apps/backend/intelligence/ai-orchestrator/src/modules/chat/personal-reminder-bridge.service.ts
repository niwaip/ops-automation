import { Injectable, Logger } from '@nestjs/common';
import { getControlPlaneApiUrl } from '../../config/service-endpoints';
import { getInternalServiceHeaders } from '../../config/internal-service-auth';

export interface SandboxReminderItem {
  title: string;
  message: string;
  runAt?: string;
  run_at?: string;
  cronExpression?: string;
  cron_expression?: string;
  timezone?: string;
  sendWechat?: boolean;
  send_wechat?: boolean;
}

export interface CreatedReminderResult {
  id: string;
  title: string;
  message: string;
  nextRunAt: string;
  sendWechat: boolean;
}

export interface DshMarkerMatch {
  payload: string;
  startIndex: number;
  endIndex: number;
}

/**
 * 结构化解析 DSH 协议标记，支持长度前缀帧 <<<DSH_{TAG}:len={LEN}:{PAYLOAD}>>>
 * 与传统 <<<DSH_{TAG}:{PAYLOAD}>>>，杜绝正文中的 >>> 字符导致截断。
 */
export function extractDshMarkers(text: string, tag: string): DshMarkerMatch[] {
  if (!text) return [];
  const results: DshMarkerMatch[] = [];
  const prefix = `<<<DSH_${tag}:`;
  let currPos = 0;

  while (currPos < text.length) {
    const idx = text.indexOf(prefix, currPos);
    if (idx === -1) break;

    const afterPrefix = idx + prefix.length;
    const lenMatch = text.slice(afterPrefix).match(/^len=(\d+):/);
    let matched = false;

    if (lenMatch && lenMatch[1]) {
      try {
        const payloadLen = parseInt(lenMatch[1], 10);
        const payloadStart = afterPrefix + lenMatch[0].length;
        const payloadEnd = payloadStart + payloadLen;
        if (text.slice(payloadEnd, payloadEnd + 3) === '>>>') {
          const payload = text.slice(payloadStart, payloadEnd);
          const markerEnd = payloadEnd + 3;
          results.push({ payload, startIndex: idx, endIndex: markerEnd });
          currPos = markerEnd;
          matched = true;
        }
      } catch {
        // pass
      }
    }

    if (matched) continue;

    // JSON 边界感知解析（处理内部包含 >>> 的字符串）
    let inString = false;
    let escape = false;
    let depth = 0;
    let jsonEnd = -1;

    for (let i = afterPrefix; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{' || ch === '[') {
          depth++;
        } else if (ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd !== -1) {
      const rest = text.slice(jsonEnd);
      const arrowMatch = rest.match(/^\s*>>>/);
      if (arrowMatch) {
        const markerEnd = jsonEnd + arrowMatch[0].length;
        const payload = text.slice(afterPrefix, jsonEnd).trim();
        results.push({ payload, startIndex: idx, endIndex: markerEnd });
        currPos = markerEnd;
        continue;
      }
    }

    // 纯文本旧标记降级
    const arrowIdx = text.indexOf('>>>', afterPrefix);
    if (arrowIdx !== -1) {
      const markerEnd = arrowIdx + 3;
      const payload = text.slice(afterPrefix, arrowIdx).trim();
      results.push({ payload, startIndex: idx, endIndex: markerEnd });
      currPos = markerEnd;
    } else {
      currPos = afterPrefix;
    }
  }

  return results;
}

/**
 * 干净剔除指定协议标记，防止破坏性碎片泄露到最终正文中
 */
export function stripDshMarkers(text: string, tags: string[]): string {
  if (!text) return '';
  const ranges: Array<[number, number]> = [];

  for (const tag of tags) {
    for (const m of extractDshMarkers(text, tag)) {
      ranges.push([m.startIndex, m.endIndex]);
    }
    const emptyMarker = `<<<DSH_${tag}>>>`;
    let pos = 0;
    while ((pos = text.indexOf(emptyMarker, pos)) !== -1) {
      ranges.push([pos, pos + emptyMarker.length]);
      pos += emptyMarker.length;
    }
  }

  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);

  const parts: string[] = [];
  let lastEnd = 0;
  for (const [s, e] of ranges) {
    if (s > lastEnd) parts.push(text.slice(lastEnd, s));
    lastEnd = Math.max(lastEnd, e);
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));

  return parts.join('');
}

@Injectable()
export class PersonalReminderBridgeService {
  private readonly logger = new Logger(PersonalReminderBridgeService.name);

  /**
   * 提取沙箱输出中的带外提醒协议标记
   */
  extractReminderMarkers(rawOutput: string): SandboxReminderItem[] {
    if (!rawOutput || (!rawOutput.includes('<<<DSH_REMINDER_CREATE:') && !rawOutput.includes('<<<DSH_REMINDER_CREATE'))) {
      return [];
    }

    const markers: SandboxReminderItem[] = [];
    const extracted = extractDshMarkers(rawOutput, 'REMINDER_CREATE');

    for (const item of extracted) {
      const content = item.payload?.trim();
      if (!content) continue;
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const sub of parsed) {
            if (sub && typeof sub === 'object') {
              markers.push(sub);
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          markers.push(parsed);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to parse DSH_REMINDER_CREATE JSON payload: ${err.message}`);
      }
    }

    return markers;
  }

  /**
   * 彻底剔除输出中的带外提醒标记，防止协议字符泄露给用户
   */
  stripReminderMarkers(text: string): string {
    if (!text) return '';
    return stripDshMarkers(text, ['REMINDER_CREATE']).trim();
  }

  /**
   * 将沙箱中声明的提醒落盘到控制面 ReminderService
   */
  async createRemindersInControlPlane(
    userId: string,
    items: SandboxReminderItem[]
  ): Promise<{ created: CreatedReminderResult[]; error?: string }> {
    if (!userId || !items.length) {
      return { created: [] };
    }

    // 格式化为控制面 DTO 数组（最多支持 20 条单批次创建，防止 Prompt 滥用）
    const payload = items.slice(0, 20).map((item) => ({
      title: item.title,
      message: item.message,
      runAt: item.runAt || item.run_at,
      cronExpression: item.cronExpression || item.cron_expression,
      timezone: item.timezone || 'Asia/Shanghai',
      sendWechat: item.sendWechat !== undefined ? item.sendWechat : item.send_wechat,
    }));

    const controlPlaneUrl = getControlPlaneApiUrl();
    const endpoint = `${controlPlaneUrl}/reminders/batch`;

    try {
      this.logger.log(`Submitting ${payload.length} personal reminders to control-plane for user [${userId}]`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...getInternalServiceHeaders(),
          'x-user-id': userId,
          'x-user-role': 'employee',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          errMsg = parsed.message || parsed.error || errorText;
        } catch {
          // ignore
        }
        this.logger.warn(
          `Failed to persist reminders in control-plane (status ${response.status}): ${errMsg}`
        );
        return { created: [], error: errMsg || `HTTP ${response.status}` };
      }

      const result = await response.json();
      const created = Array.isArray(result) ? result : [result];
      return { created, error: undefined };
    } catch (err: any) {
      this.logger.error(`Network error calling control-plane reminders batch: ${err.message}`);
      return { created: [], error: `控制面网络连接异常: ${err.message}` };
    }
  }

  /**
   * 查询用户当前的系统提醒列表
   */
  async listReminders(userId: string): Promise<any[]> {
    if (!userId) return [];
    const controlPlaneUrl = getControlPlaneApiUrl();
    const endpoint = `${controlPlaneUrl}/reminders`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...getInternalServiceHeaders(),
          'x-user-id': userId,
          'x-user-role': 'employee',
        },
      });

      if (!response.ok) {
        return [];
      }

      const result = await response.json();
      return Array.isArray(result) ? result : [];
    } catch (err: any) {
      this.logger.warn(`Failed to list reminders for user [${userId}]: ${err.message}`);
      return [];
    }
  }

  /**
   * 综合处理沙箱返回的提醒标记，返回控制面实际落库状态与错误详情
   */
  async processSandboxReminders(
    userId: string,
    rawOutput: string
  ): Promise<{
    created: CreatedReminderResult[];
    error?: string;
    requestedCount: number;
    cleanOutput: string;
  }> {
    const rawItems = this.extractReminderMarkers(rawOutput);
    const cleanOutput = this.stripReminderMarkers(rawOutput);

    if (!rawItems.length) {
      return { created: [], requestedCount: 0, cleanOutput };
    }

    const res = await this.createRemindersInControlPlane(userId, rawItems);
    return {
      created: res.created,
      error: res.error,
      requestedCount: rawItems.length,
      cleanOutput,
    };
  }
}


