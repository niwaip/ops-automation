import { validateSemanticRuleOutputs } from './semantic-rule-output.validation';

describe('validateSemanticRuleOutputs', () => {
  it('accepts valid LOGIN profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'LOGIN_PHRASE',
      category: 'LOGIN',
      outputs: {
        profile_type: 'login_terms',
        credential_intent_terms: ['用户名', '账号'],
        username_terms: ['用户名'],
        password_terms: ['密码'],
        submit_intent_terms: ['登录'],
        submit_labels: ['登录'],
        interrupt_policy: 'takeover_required',
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects oversized login profile term arrays', () => {
    const result = validateSemanticRuleOutputs({
      type: 'LOGIN_PHRASE',
      category: 'LOGIN',
      outputs: {
        profile_type: 'login_terms',
        username_terms: Array.from({ length: 49 }, (_, index) => `用户名别名${index + 1}`),
      },
    });

    expect(result).toContain('outputs.username_terms 数量不能超过 48');
  });

  it('rejects login profile terms containing control characters', () => {
    const result = validateSemanticRuleOutputs({
      type: 'LOGIN_PHRASE',
      category: 'LOGIN',
      outputs: {
        profile_type: 'login_terms',
        password_terms: ['密\u0007码'],
      },
    });

    expect(result).toContain('outputs.password_terms 包含控制字符，必须移除异常输入');
  });

  it('accepts valid NAVIGATION profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'NAVIGATION',
      outputs: {
        profile_type: 'navigation_target',
        target_terms: ['审批中心', '审批页面'],
        destination_path: '/#approvals',
        intent_terms: ['打开', '进入'],
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects navigation profile without target terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'NAVIGATION',
      outputs: {
        profile_type: 'navigation_target',
        destination_path: '/#approvals',
      },
    });

    expect(result).toContain('outputs.target_terms 必须是非空字符串数组');
  });

  it('rejects navigation profile without destination', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'NAVIGATION',
      outputs: {
        profile_type: 'navigation_target',
        target_terms: ['审批中心'],
      },
    });

    expect(result).toContain(
      'outputs.destination_url 或 outputs.destination_path 至少要提供一个'
    );
  });
});
