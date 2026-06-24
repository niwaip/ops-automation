import { BrowserRecordingActionPolicyService } from '../src/release-manager/validator';

describe('BrowserRecordingActionPolicyService', () => {
  const service = new BrowserRecordingActionPolicyService();

  it('keeps explicit approval clicks as confirm risk', () => {
    expect(
      service.assessRuntimeStep({
        action: 'click',
        target: 'text=承认',
        description: '点击承认按钮',
      })
    ).toEqual({
      riskLevel: 'confirm',
      reason: '运行时动作包含审批/提交/删除/下载等高风险语义',
    });
  });

  it('does not escalate list filter clicks when only the description mentions pending approvals', () => {
    expect(
      service.assessRuntimeStep({
        action: 'click',
        target: 'role=button[name="保留中"]',
        description: '点击“保留中”筛选按钮，查看所有未批准的项目',
      })
    ).toEqual({
      riskLevel: 'caution',
      reason: '可能修改页面状态或触发表单提交',
    });
  });
});
