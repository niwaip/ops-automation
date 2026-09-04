import {
  BuiltinActivityRegistry,
  BUILTIN_ACTIVITY_REF_PREFIX,
  EMAIL_FETCH_UNREAD_ACTIVITY_KEY,
  INBOX_COLLECT_ACTIVITY_KEY,
  EMAIL_MARK_READ_ACTIVITY_KEY,
  TODO_SYNC_EXTERNAL_ACTIVITY_KEY,
  EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY,
} from '../src/modules/temporal-workflow/builtin-activity.registry';

describe('Workbench and Task Automation Activity Registration', () => {
  let registry: BuiltinActivityRegistry;

  beforeEach(() => {
    registry = new BuiltinActivityRegistry();
  });

  it('should register all 5 workbench activities in BuiltinActivityRegistry', () => {
    const list = registry.list();
    const keys = list.map((a) => a.key);

    expect(keys).toContain(EMAIL_FETCH_UNREAD_ACTIVITY_KEY);
    expect(keys).toContain(INBOX_COLLECT_ACTIVITY_KEY);
    expect(keys).toContain(EMAIL_MARK_READ_ACTIVITY_KEY);
    expect(keys).toContain(TODO_SYNC_EXTERNAL_ACTIVITY_KEY);
    expect(keys).toContain(EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY);
  });

  it('should retrieve activities by key', () => {
    const emailFetch = registry.getByKey(EMAIL_FETCH_UNREAD_ACTIVITY_KEY);
    expect(emailFetch).toBeDefined();
    expect(emailFetch?.name).toBe('拉取未读邮件');
    expect(emailFetch?.handler).toBe('api');
    expect(emailFetch?.timeout).toBe('60s');

    const inboxCollect = registry.getByKey(INBOX_COLLECT_ACTIVITY_KEY);
    expect(inboxCollect).toBeDefined();
    expect(inboxCollect?.name).toBe('沉淀入 GTD 收件箱');
    expect(inboxCollect?.config?.defaultStepConfig?.sourceType).toBe('EMAIL');

    const markRead = registry.getByKey(EMAIL_MARK_READ_ACTIVITY_KEY);
    expect(markRead).toBeDefined();
    expect(markRead?.name).toBe('标记邮件已读');

    const todoSync = registry.getByKey(TODO_SYNC_EXTERNAL_ACTIVITY_KEY);
    expect(todoSync).toBeDefined();
    expect(todoSync?.name).toBe('同步待办至外部插件');

    const gate = registry.getByKey(EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY);
    expect(gate).toBeDefined();
    expect(gate?.name).toBe('人工介入决策门禁');
  });

  it('should retrieve activities by ref with builtin prefix', () => {
    const inboxRef = `${BUILTIN_ACTIVITY_REF_PREFIX}${INBOX_COLLECT_ACTIVITY_KEY}`;
    const activity = registry.getByRef(inboxRef);
    expect(activity).toBeDefined();
    expect(activity?.key).toBe(INBOX_COLLECT_ACTIVITY_KEY);

    const emailFetchRef = `${BUILTIN_ACTIVITY_REF_PREFIX}${EMAIL_FETCH_UNREAD_ACTIVITY_KEY}`;
    expect(registry.getByRef(emailFetchRef)?.key).toBe(EMAIL_FETCH_UNREAD_ACTIVITY_KEY);

    const gateRef = `${BUILTIN_ACTIVITY_REF_PREFIX}${EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY}`;
    expect(registry.getByRef(gateRef)?.key).toBe(EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY);
  });

  it('should contain generated python activity code in each activity', () => {
    const activities = [
      registry.getByKey(EMAIL_FETCH_UNREAD_ACTIVITY_KEY),
      registry.getByKey(INBOX_COLLECT_ACTIVITY_KEY),
      registry.getByKey(EMAIL_MARK_READ_ACTIVITY_KEY),
      registry.getByKey(TODO_SYNC_EXTERNAL_ACTIVITY_KEY),
      registry.getByKey(EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY),
    ];

    for (const act of activities) {
      expect(act).toBeDefined();
      expect(act?.generatedCode).toBeDefined();
      expect(act?.generatedCode).toContain('@activity.defn');
      expect(act?.fn).toBeDefined();
      expect(act?.description).toBeDefined();
    }
  });
});
