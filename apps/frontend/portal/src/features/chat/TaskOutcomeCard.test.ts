import { describe, expect, it } from 'vitest';
import {
  getErrorPreview,
  normalizeChineseSpace,
  sanitizeWaitingInputSummary,
} from '@chat-web/components/TaskOutcomeCard';

describe('getErrorPreview', () => {
  it('shows the concrete reason instead of the generic failure heading', () => {
    expect(
      getErrorPreview(
        "❌ 任务执行失败\n\n原因：Node 'n2_列表摘要' failed: Output exceeds budget\n\n执行单 ID: example-id"
      )
    ).toBe("Node 'n2_列表摘要' failed: Output exceeds budget");
  });

  it('keeps a direct error message as the preview', () => {
    expect(getErrorPreview('模型服务不可用')).toBe('模型服务不可用');
  });

  it('keeps permission guidance error message as preview', () => {
    const msg = '您当前暂无「天气查询」技能的执行权限。如需使用，请前往「技能中心」申请授权，或联系系统管理员开通权限。';
    expect(getErrorPreview(msg)).toBe(msg);
  });

  it('extracts friendly message and hides [技术细节] in preview', () => {
    const raw =
      "❌ 任务执行失败\n\n原因：步骤「1. 页面打开与登录」输入参数校验未通过：缺少必填参数【登录密码 (loginCredential)】。\n\n[技术细节] Node 'n1_live-export-replay-1790872547' failed: INPUT_SCHEMA_VIOLATION for node 'n1_live-export-replay-1790872547': / (required): must have required property 'loginCredential'\n\n执行单 ID: 947f5a23-6592-4a9c-9753-01a55a906b8c";
    expect(getErrorPreview(raw)).toBe(
      '步骤「1. 页面打开与登录」输入参数校验未通过：缺少必填参数【登录密码 (loginCredential)】。'
    );
  });

  it('generically humanizes raw unformatted INPUT_SCHEMA_VIOLATION error strings', () => {
    const raw =
      "Node 'n1_live-export-replay-1790872547' failed: INPUT_SCHEMA_VIOLATION for node 'n1_live-export-replay-1790872547': / (required): must have required property 'loginCredential'";
    expect(getErrorPreview(raw)).toBe('输入参数校验未通过：缺少必填参数【loginCredential】。');
  });

  it('generically humanizes raw unformatted type violation error strings', () => {
    const raw =
      "INPUT_SCHEMA_VIOLATION for node 'n2': /threshold (type): must be number";
    expect(getErrorPreview(raw)).toBe('输入参数【threshold】类型错误，期望类型为 number。');
  });
});

describe('normalizeChineseSpace', () => {
  it('removes spaces between Chinese characters while keeping English word spaces', () => {
    expect(normalizeChineseSpace('保 密 协 议')).toBe('保密协议');
    expect(normalizeChineseSpace('甲 方 公 司 全 称')).toBe('甲方公司全称');
    expect(normalizeChineseSpace('Hello World')).toBe('Hello World');
    expect(normalizeChineseSpace('NDA 协议签署')).toBe('NDA 协议签署');
  });
});

describe('sanitizeWaitingInputSummary', () => {
  it('cleanly strips raw field enumeration lines to prevent duplicate rendering with input cards', () => {
    const rawSummary = `已创建等待补充信息的执行单。

还需要补充 6 类信息。

请补充以下信息：

保 密 协 议：甲方公司法定全称、甲方注册或经营地址、乙方注册或经营地址、双方合作的具体业务主题或项目内容

附件一：乙方（接收方）的公司全称

生效及其它事项：协议签订日（日号）、协议签订年份、协议签订月份

保密期限：保密期限的具体年数

补充后我就继续处理。

执行单 ID: 145f641c-3597-4684-b8ac-f820041aae51`;

    const groups = [
      { label: '保 密 协 议', items: [] },
      { label: '附件一', items: [] },
      { label: '生效及其它事项', items: [] },
      { label: '保密期限', items: [] },
    ];
    const items = [
      { key: '1', label: '甲方公司法定全称' },
      { key: '2', label: '乙方（接收方）的公司全称' },
    ];

    const cleaned = sanitizeWaitingInputSummary(rawSummary, groups, items);

    // Only general guidance lines remain, all mechanical field listings are cleanly stripped
    expect(cleaned).toContain('已创建等待补充信息的执行单。');
    expect(cleaned).toContain('还需要补充 6 类信息。');
    expect(cleaned).not.toContain('保 密 协 议：');
    expect(cleaned).not.toContain('附件一：');
    expect(cleaned).not.toContain('生效及其它事项：');
    expect(cleaned).not.toContain('保密期限：');
    expect(cleaned).not.toContain('甲方公司法定全称');
    expect(cleaned).not.toContain('补充后我就继续处理');
    expect(cleaned).not.toContain('执行单 ID:');
  });
});
