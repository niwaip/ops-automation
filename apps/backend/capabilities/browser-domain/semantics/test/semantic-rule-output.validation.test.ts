import { validateSemanticRuleOutputs } from '../rule-set/semantic-rule-output.validation';

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

  it('accepts valid READ profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'READ_INTENT',
      category: 'READ_VALUE',
      outputs: {
        profile_type: 'read_target',
        target_terms: ['毛利率', '粗利率'],
        field_terms: ['grossMargin'],
        region_terms: ['gross-margin-panel'],
        intent_terms: ['读取', '查看'],
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects read profile without target terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'READ_INTENT',
      category: 'READ_VALUE',
      outputs: {
        profile_type: 'read_target',
        field_terms: ['grossMargin'],
      },
    });

    expect(result).toContain('outputs.target_terms 必须是非空字符串数组');
  });

  it('rejects read profile without field or region terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'READ_INTENT',
      category: 'READ_VALUE',
      outputs: {
        profile_type: 'read_target',
        target_terms: ['毛利率'],
      },
    });

    expect(result).toContain('outputs.field_terms 或 outputs.region_terms 至少要提供一个');
  });

  it('accepts valid ACTION profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'ROW_ACTION',
      outputs: {
        profile_type: 'action_target',
        target_terms: ['承认按钮', '审批通过'],
        semantic_hint: 'approve',
        action_terms: ['approve'],
        region_terms: ['decision-actions'],
        role_hints: ['button'],
        category_hint: 'ROW_ACTION',
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects action profile without target terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'ROW_ACTION',
      outputs: {
        profile_type: 'action_target',
        semantic_hint: 'approve',
      },
    });

    expect(result).toContain('outputs.target_terms 必须是非空字符串数组');
  });

  it('rejects action profile without semantic or action terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'DETAIL_OPEN',
      outputs: {
        profile_type: 'action_target',
        target_terms: ['详情按钮'],
      },
    });

    expect(result).toContain('outputs.semantic_hint 或 outputs.action_terms 至少要提供一个');
  });

  it('accepts valid SEARCH profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'SEARCH',
      outputs: {
        profile_type: 'search_intent',
        search_terms: ['搜索'],
        smart_search_terms: ['智搜'],
        list_result_terms: ['列出搜索结果'],
        click_result_terms: ['点击'],
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects search profile without any search term arrays', () => {
    const result = validateSemanticRuleOutputs({
      type: 'INTENT_ALIAS',
      category: 'SEARCH',
      outputs: {
        profile_type: 'search_intent',
      },
    });

    expect(result).toContain(
      'outputs.search_terms / outputs.smart_search_terms / outputs.list_result_terms / outputs.click_result_terms 至少要提供一个'
    );
  });

  it('accepts valid FIELD_FILL profile outputs', () => {
    const result = validateSemanticRuleOutputs({
      type: 'FIELD_ALIAS',
      category: 'FIELD_FILL',
      outputs: {
        profile_type: 'field_fill_terms',
        field_terms: ['备注', '审批备注'],
        canonical_field: 'comment',
        region_terms: ['审批区域'],
        value_hints: ['通过'],
        intent_terms: ['填写'],
      },
    });

    expect(result).toEqual([]);
  });

  it('rejects field fill profile without field terms', () => {
    const result = validateSemanticRuleOutputs({
      type: 'FIELD_ALIAS',
      category: 'FIELD_FILL',
      outputs: {
        profile_type: 'field_fill_terms',
        canonical_field: 'comment',
      },
    });

    expect(result).toContain('outputs.field_terms 必须是非空字符串数组');
  });
});
