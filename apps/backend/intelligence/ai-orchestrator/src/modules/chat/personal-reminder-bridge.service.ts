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

export interface SandboxReminderUpdateItem {
  id?: string;
  targetTitle?: string;
  target_title?: string;
  newTitle?: string;
  new_title?: string;
  title?: string;
  message?: string;
  runAt?: string;
  run_at?: string;
  cronExpression?: string;
  cron_expression?: string;
  timezone?: string;
  sendWechat?: boolean;
  send_wechat?: boolean;
  isActive?: boolean;
  is_active?: boolean;
}

export interface SandboxReminderDeleteItem {
  ids?: string[];
  titles?: string[];
}

export interface UpdatedReminderResult {
  id: string;
  title?: string;
  runAt?: string;
  cronExpression?: string;
  isActive?: boolean;
}

export interface DeletedReminderResult {
  id: string;
  title?: string;
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

        // 1. 直接以 UTF-16 代码单元长度切片匹配
        const payloadEndUtf16 = payloadStart + payloadLen;
        if (text.slice(payloadEndUtf16, payloadEndUtf16 + 3) === '>>>') {
          const payload = text.slice(payloadStart, payloadEndUtf16);
          const markerEnd = payloadEndUtf16 + 3;
          results.push({ payload, startIndex: idx, endIndex: markerEnd });
          currPos = markerEnd;
          matched = true;
        }

        // 2. 以 Unicode 代码点长度扫描匹配（兼顾 Python 早期按字符统计的长度帧）
        if (!matched) {
          let cpEnd = payloadStart;
          let cpCount = 0;
          while (cpEnd < text.length && cpCount < payloadLen) {
            const code = text.codePointAt(cpEnd);
            cpEnd += code !== undefined && code > 0xffff ? 2 : 1;
            cpCount++;
          }
          if (text.slice(cpEnd, cpEnd + 3) === '>>>') {
            const payload = text.slice(payloadStart, cpEnd);
            const markerEnd = cpEnd + 3;
            results.push({ payload, startIndex: idx, endIndex: markerEnd });
            currPos = markerEnd;
            matched = true;
          }
        }

        // 3. 容错降级：在已识别 len= 前缀的情况下，从 payloadStart（严禁从 afterPrefix）寻找闭合 >>>
        if (!matched) {
          const arrowIdx = text.indexOf('>>>', payloadStart);
          if (arrowIdx !== -1) {
            const rawPayload = text.slice(payloadStart, arrowIdx);
            const payload = rawPayload.replace(/^len=\d+:\s*/, '').trim();
            const markerEnd = arrowIdx + 3;
            results.push({ payload, startIndex: idx, endIndex: markerEnd });
            currPos = markerEnd;
            matched = true;
          }
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
        const rawPayload = text.slice(afterPrefix, jsonEnd);
        const payload = rawPayload.replace(/^len=\d+:\s*/, '').trim();
        results.push({ payload, startIndex: idx, endIndex: markerEnd });
        currPos = markerEnd;
        continue;
      }
    }

    // 纯文本旧标记降级（严密剥离残留的 len=\d+: 前缀）
    const arrowIdx = text.indexOf('>>>', afterPrefix);
    if (arrowIdx !== -1) {
      const markerEnd = arrowIdx + 3;
      const rawPayload = text.slice(afterPrefix, arrowIdx);
      const payload = rawPayload.replace(/^len=\d+:\s*/, '').trim();
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

  let res = text;
  if (ranges.length) {
    ranges.sort((a, b) => a[0] - b[0]);
    const parts: string[] = [];
    let lastEnd = 0;
    for (const [s, e] of ranges) {
      if (s > lastEnd) parts.push(text.slice(lastEnd, s));
      lastEnd = Math.max(lastEnd, e);
    }
    if (lastEnd < text.length) parts.push(text.slice(lastEnd));
    res = parts.join('');
  }

  // 兜底防御：清除任何残余的指定标签未闭合或畸变片段
  for (const tag of tags) {
    const escapedTag = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    res = res.replace(new RegExp(`<<<DSH_${escapedTag}:[^>]*>>>`, 'g'), '');
    res = res.replace(new RegExp(`<<<DSH_${escapedTag}>>>`, 'g'), '');
  }

  return res;
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
   * 提取沙箱输出中的带外提醒修改协议标记
   */
  extractReminderUpdateMarkers(rawOutput: string): SandboxReminderUpdateItem[] {
    if (!rawOutput || (!rawOutput.includes('<<<DSH_REMINDER_UPDATE:') && !rawOutput.includes('<<<DSH_REMINDER_UPDATE'))) {
      return [];
    }

    const markers: SandboxReminderUpdateItem[] = [];
    const extracted = extractDshMarkers(rawOutput, 'REMINDER_UPDATE');

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
        this.logger.warn(`Failed to parse DSH_REMINDER_UPDATE JSON payload: ${err.message}`);
      }
    }

    return markers;
  }

  /**
   * 提取沙箱输出中的带外提醒删除协议标记
   */
  extractReminderDeleteMarkers(rawOutput: string): SandboxReminderDeleteItem[] {
    if (!rawOutput || (!rawOutput.includes('<<<DSH_REMINDER_DELETE:') && !rawOutput.includes('<<<DSH_REMINDER_DELETE'))) {
      return [];
    }

    const markers: SandboxReminderDeleteItem[] = [];
    const extracted = extractDshMarkers(rawOutput, 'REMINDER_DELETE');

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
        this.logger.warn(`Failed to parse DSH_REMINDER_DELETE JSON payload: ${err.message}`);
      }
    }

    return markers;
  }

  /**
   * 彻底剔除输出中的带外提醒标记，防止协议字符泄露给用户
   */
  stripReminderMarkers(text: string): string {
    if (!text) return '';
    return stripDshMarkers(text, ['REMINDER_CREATE', 'REMINDER_UPDATE', 'REMINDER_DELETE']).trim();
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
   * 将沙箱中声明的修改同步到控制面 ReminderService
   */
  async updateReminderInControlPlane(
    userId: string,
    item: SandboxReminderUpdateItem
  ): Promise<{ updated?: UpdatedReminderResult; error?: string }> {
    if (!userId) return { error: '未提供用户身份' };

    let targetId = item.id;
    const lookupTitle = (item.targetTitle || item.target_title || item.title || '').trim();

    if (!targetId && lookupTitle) {
      const list = await this.listReminders(userId);
      // 1. 优先完全精确匹配
      const exactMatches = list.filter((r: any) => r.title && r.title.trim() === lookupTitle);
      if (exactMatches.length === 1) {
        targetId = exactMatches[0].id;
      } else if (exactMatches.length > 1) {
        return {
          error: `存在多个同名提醒日程（标题: "${lookupTitle}"，共 ${exactMatches.length} 个），存在歧义，请指定确切的提醒 ID 进行修改。`,
        };
      } else {
        // 2. 模糊包含匹配
        const partialMatches = list.filter((r: any) => r.title && r.title.includes(lookupTitle));
        if (partialMatches.length === 1) {
          targetId = partialMatches[0].id;
        } else if (partialMatches.length > 1) {
          const titles = partialMatches.map((r: any) => `"${r.title}"`).join('、');
          return {
            error: `搜索 "${lookupTitle}" 命中了多个相似提醒日程（${titles}），存在歧义，请指定确切的完整标题进行修改。`,
          };
        }
      }
    }

    if (!targetId) {
      return { error: `未找到需要更新的提醒日程（${lookupTitle || item.id || '未指定目标'}）` };
    }

    const payload: Record<string, any> = {};
    // 标题更新：仅当明确指定 newTitle/new_title，或通过 id 定位且传入了 title 时才更新标题
    const explicitNewTitle = (item.newTitle || item.new_title || '').trim();
    if (explicitNewTitle) {
      payload.title = explicitNewTitle;
    } else if (item.id && item.title) {
      payload.title = item.title.trim();
    }

    if (item.message) payload.message = item.message;

    // 关键互转清理：若更新为一次性提醒，显式置空 cronExpression；若更新为周期提醒，显式置空 runAt
    const newRunAt = item.runAt || item.run_at;
    const newCron = item.cronExpression || item.cron_expression;
    if (newRunAt) {
      payload.runAt = newRunAt;
      payload.cronExpression = '';
    } else if (newCron) {
      payload.cronExpression = newCron;
      payload.runAt = null;
    }

    if (item.timezone) payload.timezone = item.timezone;
    if (item.sendWechat !== undefined || item.send_wechat !== undefined) {
      payload.sendWechat = item.sendWechat !== undefined ? item.sendWechat : item.send_wechat;
    }
    if (item.isActive !== undefined || item.is_active !== undefined) {
      payload.isActive = item.isActive !== undefined ? item.isActive : item.is_active;
    }

    const controlPlaneUrl = getControlPlaneApiUrl();
    const endpoint = `${controlPlaneUrl}/reminders/${targetId}`;

    try {
      this.logger.log(`Updating reminder [${targetId}] in control-plane for user [${userId}]`);
      const response = await fetch(endpoint, {
        method: 'PUT',
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
        return { error: errMsg || `HTTP ${response.status}` };
      }

      const result = await response.json();
      return {
        updated: {
          id: targetId,
          title: result.title || lookupTitle || '',
          runAt: result.runAt,
          cronExpression: result.cronExpression,
          isActive: result.isActive,
        },
      };
    } catch (err: any) {
      this.logger.error(`Network error updating reminder: ${err.message}`);
      return { error: `控制面网络连接异常: ${err.message}` };
    }
  }

  /**
   * 将沙箱中声明的删除操作同步到控制面 ReminderService
   */
  async deleteRemindersInControlPlane(
    userId: string,
    item: SandboxReminderDeleteItem
  ): Promise<{ deleted: DeletedReminderResult[]; error?: string; errors: Array<{ target?: string; error: string }> }> {
    if (!userId) return { deleted: [], error: '未提供用户身份', errors: [{ error: '未提供用户身份' }] };

    const idsToDelete: string[] = item.ids ? [...item.ids] : [];
    const errors: Array<{ target?: string; error: string }> = [];

    if (item.titles && item.titles.length > 0) {
      const list = await this.listReminders(userId);
      for (const t of item.titles) {
        const cleanT = t.trim();
        // 1. 优先完全精确匹配
        const exactMatches = list.filter((r: any) => r.title && r.title.trim() === cleanT);
        if (exactMatches.length === 1) {
          if (!idsToDelete.includes(exactMatches[0].id)) {
            idsToDelete.push(exactMatches[0].id);
          }
        } else if (exactMatches.length > 1) {
          errors.push({
            target: cleanT,
            error: `存在多个完全同名的提醒（标题: "${cleanT}"，共 ${exactMatches.length} 个），删除属于破坏性操作，请指定确切的提醒ID。`,
          });
        } else {
          // 2. 模糊包含匹配
          const partialMatches = list.filter((r: any) => r.title && r.title.includes(cleanT));
          if (partialMatches.length === 1) {
            if (!idsToDelete.includes(partialMatches[0].id)) {
              idsToDelete.push(partialMatches[0].id);
            }
          } else if (partialMatches.length > 1) {
            const titles = partialMatches.map((r: any) => `"${r.title}"`).join('、');
            errors.push({
              target: cleanT,
              error: `删除目标 "${cleanT}" 命中了多个相似提醒（${titles}），存在误删风险，已自动阻断，请指定确切完整标题或ID。`,
            });
          } else {
            errors.push({
              target: cleanT,
              error: `未找到名称包含 "${cleanT}" 的待删除提醒日程`,
            });
          }
        }
      }
    }

    if (!idsToDelete.length) {
      const mainError = errors.length > 0 ? errors.map(e => (e.target ? `【${e.target}】${e.error}` : e.error)).join('; ') : '未找到匹配的待删除提醒';
      return { deleted: [], error: mainError, errors };
    }

    const controlPlaneUrl = getControlPlaneApiUrl();
    const deleted: DeletedReminderResult[] = [];

    for (const id of idsToDelete) {
      try {
        this.logger.log(`Deleting reminder [${id}] in control-plane for user [${userId}]`);
        const response = await fetch(`${controlPlaneUrl}/reminders/${id}`, {
          method: 'DELETE',
          headers: {
            ...getInternalServiceHeaders(),
            'x-user-id': userId,
            'x-user-role': 'employee',
          },
        });

        if (response.ok) {
          deleted.push({ id });
        } else {
          const errorText = await response.text().catch(() => '');
          errors.push({ target: id, error: errorText || `HTTP ${response.status}` });
        }
      } catch (err: any) {
        errors.push({ target: id, error: err.message });
      }
    }

    const mainError = errors.length > 0 ? errors.map(e => (e.target ? `【${e.target}】${e.error}` : e.error)).join('; ') : undefined;
    return { deleted, error: mainError, errors };
  }

  /**
   * 综合处理沙箱返回的提醒标记（创建、修改、删除），返回控制面实际落库状态与错误详情
   */
  async processSandboxReminders(
    userId: string,
    rawOutput: string
  ): Promise<{
    created: CreatedReminderResult[];
    createdErrors?: Array<{ target?: string; error: string }>;
    updated?: UpdatedReminderResult[];
    updatedErrors?: Array<{ target?: string; error: string }>;
    deleted?: DeletedReminderResult[];
    deletedErrors?: Array<{ target?: string; error: string }>;
    error?: string;
    requestedCount: number;
    cleanOutput: string;
  }> {
    const rawItems = this.extractReminderMarkers(rawOutput);
    const updateItems = this.extractReminderUpdateMarkers(rawOutput);
    const deleteItems = this.extractReminderDeleteMarkers(rawOutput);
    const cleanOutput = this.stripReminderMarkers(rawOutput);

    const totalRequested = rawItems.length + updateItems.length + deleteItems.length;
    if (!totalRequested) {
      return { created: [], requestedCount: 0, cleanOutput };
    }

    let created: CreatedReminderResult[] = [];
    const createdErrors: Array<{ target?: string; error: string }> = [];
    const updated: UpdatedReminderResult[] = [];
    const updatedErrors: Array<{ target?: string; error: string }> = [];
    const deleted: DeletedReminderResult[] = [];
    const deletedErrors: Array<{ target?: string; error: string }> = [];

    if (rawItems.length) {
      const res = await this.createRemindersInControlPlane(userId, rawItems);
      created = res.created;
      if (res.error) {
        createdErrors.push({ error: res.error });
      }
    }

    if (updateItems.length) {
      for (const u of updateItems) {
        const uRes = await this.updateReminderInControlPlane(userId, u);
        if (uRes.updated) {
          updated.push(uRes.updated);
        }
        if (uRes.error) {
          updatedErrors.push({
            target: u.targetTitle || u.title || u.id,
            error: uRes.error,
          });
        }
      }
    }

    if (deleteItems.length) {
      for (const d of deleteItems) {
        const dRes = await this.deleteRemindersInControlPlane(userId, d);
        if (dRes.deleted.length) {
          deleted.push(...dRes.deleted);
        }
        if (dRes.errors && dRes.errors.length) {
          deletedErrors.push(...dRes.errors);
        }
      }
    }

    const allErrors = [
      ...createdErrors.map(e => e.error),
      ...updatedErrors.map(e => (e.target ? `【${e.target}】${e.error}` : e.error)),
      ...deletedErrors.map(e => (e.target ? `【${e.target}】${e.error}` : e.error)),
    ];
    const combinedError = allErrors.length > 0 ? allErrors.join('; ') : undefined;

    return {
      created,
      createdErrors: createdErrors.length ? createdErrors : undefined,
      updated: updated.length ? updated : undefined,
      updatedErrors: updatedErrors.length ? updatedErrors : undefined,
      deleted: deleted.length ? deleted : undefined,
      deletedErrors: deletedErrors.length ? deletedErrors : undefined,
      error: combinedError,
      requestedCount: totalRequested,
      cleanOutput,
    };
  }
}


