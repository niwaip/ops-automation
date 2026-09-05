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
});
