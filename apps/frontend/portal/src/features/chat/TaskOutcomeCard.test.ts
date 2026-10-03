import { describe, expect, it } from 'vitest';
import { getErrorPreview } from '@chat-web/components/TaskOutcomeCard';

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
