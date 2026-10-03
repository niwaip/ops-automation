import { BrowserRecordingActionPolicyService } from '../../registry-release/release-manager/src/validator/browser-recording-action-policy.service';

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

  it('allows high-risk approval clicks when allowHighRiskActions is true', () => {
    expect(
      service.assessRuntimeStep(
        {
          action: 'click',
          target: 'role=button[name="承認する (Approve)"]',
          description: '点击承认按钮',
        },
        {
          allowHighRiskActions: true,
        }
      )
    ).toEqual({
      riskLevel: 'caution',
      reason: '已授权的高风险运行时动作',
    });
  });

  it('allows high-risk actions when authorizedRiskLevel is confirm', () => {
    expect(
      service.assessRuntimeStep(
        {
          action: 'click',
          target: 'text=确认提交',
          description: '提交表单',
        },
        {
          authorizedRiskLevel: 'confirm',
        }
      )
    ).toEqual({
      riskLevel: 'caution',
      reason: '已授权的高风险运行时动作',
    });
  });
});

