import { normalizeSkillSlug } from './personal-skill-slug.util';
import { parseSavePersonalSkillIntent } from './personal-skill-intent.util';

describe('PersonalSkillSlugUtil', () => {
  it('converts English text to clean kebab-case slug', () => {
    expect(normalizeSkillSlug('Department Expense Summary')).toBe('department-expense-summary');
  });

  it('translates common Chinese business terms into clean slugs', () => {
    const slug = normalizeSkillSlug('按部门无偿统计');
    expect(slug).toContain('dept');
    expect(slug).toContain('unpaid');
    expect(slug).toContain('summary');
  });

  it('respects explicitly provided preferred slug', () => {
    expect(normalizeSkillSlug('按部门无偿统计', 'dept-amount-v1')).toBe('dept-amount-v1');
  });

  it('guarantees filesystem-safe slug on unusual characters', () => {
    const slug = normalizeSkillSlug('### special ??? !!!');
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/);
  });
});

describe('PersonalSkillIntentUtil', () => {
  it('detects natural language save instruction and extracts name', () => {
    const result = parseSavePersonalSkillIntent(
      '结果正确，把刚才的处理逻辑保存为个人技能，名称是按部门无偿统计'
    );
    expect(result.isMatch).toBe(true);
    expect(result.displayName).toBe('按部门无偿统计');
  });

  it('detects slash command /save-skill', () => {
    const result = parseSavePersonalSkillIntent('/save-skill 合同审查汇总');
    expect(result.isMatch).toBe(true);
    expect(result.displayName).toBe('合同审查汇总');
  });

  it('detects quoted skill name in prompt', () => {
    const result = parseSavePersonalSkillIntent('把刚才的处理逻辑保存为个人技能「财务月度核算」');
    expect(result.isMatch).toBe(true);
    expect(result.displayName).toBe('财务月度核算');
  });

  it('returns false for unrelated query', () => {
    const result = parseSavePersonalSkillIntent('帮我分析这份Excel表格里的总金额');
    expect(result.isMatch).toBe(false);
  });
});
