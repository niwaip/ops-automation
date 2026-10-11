import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanNotificationSummary,
  buildNotificationContent,
} from '../../../dist/domain/notifications/index.js';
import type { AppNotification } from '../../../dist/types/notification.types.js';

describe('cleanNotificationSummary', () => {
  it('strips markdown headers, code blocks, bold, and extra whitespace', () => {
    const raw = `### 1. 快速体验安装（推荐新手）\n无需全局安装，直接使用 \`npx\`。\n\n**重要提示**：请确保 Node.js 版本 >= 18。`;
    const cleaned = cleanNotificationSummary(raw);
    assert.equal(
      cleaned,
      '1. 快速体验安装（推荐新手） 无需全局安装，直接使用 npx。 重要提示：请确保 Node.js 版本 >= 18。'
    );
  });

  it('handles null, undefined, or empty strings gracefully', () => {
    assert.equal(cleanNotificationSummary(''), '');
    assert.equal(cleanNotificationSummary(undefined), '');
  });
});

describe('buildNotificationContent user-facing presentation', () => {
  it('does not leak raw execution uuid in completed notification description', () => {
    const item: AppNotification = {
      id: 'notif-1',
      dedupeKey: 'dedupe-1',
      source: 'execution',
      sourceId: '2c8fa89b-ecd2-421f-a3bd-618768b06ea9',
      severity: 'success',
      category: 'completed',
      status: 'completed',
      stateKey: 'state-1',
      timestamp: new Date().toISOString(),
      unread: true,
      requiresAction: false,
      actionUrl: '/executions/2c8fa89b-ecd2-421f-a3bd-618768b06ea9',
      metadata: {
        executionId: '2c8fa89b-ecd2-421f-a3bd-618768b06ea9',
        resultTitle: 'DeepSeek Harness 安装指南',
        resultSummary: '### 1. 快速体验安装\n使用 npx 命令即可完成。',
      },
    };

    const content = buildNotificationContent(item, 'zh-CN');
    // 优先采用具体业务标题
    assert.equal(content.title, 'DeepSeek Harness 安装指南');
    // 严禁泄露执行单 UUID
    assert.equal(content.description.includes('2c8fa89b-ecd2-421f-a3bd-618768b06ea9'), false);
    assert.equal(content.description.includes('执行单'), false);
    // 描述平滑自然，且不重复拼接标题
    assert.ok(content.description.includes('1. 快速体验安装 使用 npx 命令即可完成。'));
    // 保存完整 markdown 供详情快速预览
    assert.ok(content.fullMarkdown?.includes('### 1. 快速体验安装'));
  });
});
