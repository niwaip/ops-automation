import { parseSavePersonalSkillIntent } from './personal-skill-intent.util';

describe('personal skill save intent', () => {
  it.each([
    '保存为 部门别有偿统计 的skill',
    '保存为部门别有偿统计的技能',
    '保存为「部门别有偿统计」的个人 SKILL',
    '另存为 部门别有偿统计 的 skill',
    '把这个逻辑保存为 skill，叫做部门别有偿统计',
    '结果正确，保存为个人技能，名称是部门别有偿统计',
    '保存为个人技能 部门别有偿统计',
    '/save-skill 部门别有偿统计',
  ])('extracts the intended name: %s', (message) => {
    expect(parseSavePersonalSkillIntent(message)).toEqual({ isMatch: true, displayName: '部门别有偿统计' });
  });

  it.each([
    '不要保存为 部门别有偿统计 的skill',
    '请勿把这个逻辑保存为 skill',
    '先别保存为skill',
    '不保存为技能',
    '保存为 部门别有偿统计.xlsx',
    '保存这个文件，然后介绍 skill 的使用方法',
    '用部门别有偿统计处理附件',
    '',
  ])('does not capture unrelated or negated work: %s', (message) => {
    expect(parseSavePersonalSkillIntent(message).isMatch).toBe(false);
  });
});
