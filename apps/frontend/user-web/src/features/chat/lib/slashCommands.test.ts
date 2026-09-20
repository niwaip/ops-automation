import { describe, it, expect } from 'vitest';
import {
  WORK_SLASH_COMMANDS,
  PERSONAL_SLASH_COMMANDS,
  matchSlashCommands,
  isWorkSlashCommand,
  isPersonalSlashCommand,
} from './slashCommands';

describe('Decoupled Slash Commands Toolchain', () => {
  it('should maintain work mode slash commands independently', () => {
    expect(WORK_SLASH_COMMANDS.length).toBeGreaterThan(0);
    const workCommands = matchSlashCommands('/', 'task');
    const cmdNames = workCommands.map((c) => c.command);

    // 工作模式专属与通用指令
    expect(cmdNames).toContain('/doc');
    expect(cmdNames).toContain('/extract');
    expect(cmdNames).toContain('/email');
    expect(cmdNames).toContain('/search');
    expect(cmdNames).toContain('/clear');
    expect(cmdNames).toContain('/help');

    // 绝对不应混入个人沙箱专属指令
    expect(cmdNames).not.toContain('/ppt');
    expect(cmdNames).not.toContain('/research');
    expect(cmdNames).not.toContain('/excel');
    expect(cmdNames).not.toContain('/word');
    expect(cmdNames).not.toContain('/image');

    // 工作模式下所有命令均未被禁用
    workCommands.forEach((cmd) => {
      expect(cmd.disabled).toBeFalsy();
    });
  });

  it('should maintain personal sandbox slash commands independently with /ppt and /research', () => {
    expect(PERSONAL_SLASH_COMMANDS.length).toBeGreaterThan(0);
    const personalCommands = matchSlashCommands('/', 'chat');
    const cmdNames = personalCommands.map((c) => c.command);

    // 个人模式独立沙箱指令
    expect(cmdNames).toContain('/ppt');
    expect(cmdNames).toContain('/research');
    expect(cmdNames).toContain('/excel');
    expect(cmdNames).toContain('/word');
    expect(cmdNames).toContain('/pdf');
    expect(cmdNames).toContain('/image');
    expect(cmdNames).toContain('/design');
    expect(cmdNames).toContain('/search');
    expect(cmdNames).toContain('/clear');
    expect(cmdNames).toContain('/help');

    // 绝对不应包含工作模式专属指令
    expect(cmdNames).not.toContain('/doc');
    expect(cmdNames).not.toContain('/extract');
    expect(cmdNames).not.toContain('/email');

    // 个人模式下所有命令均为一等公民，无禁用态混杂
    personalCommands.forEach((cmd) => {
      expect(cmd.disabled).toBeFalsy();
    });
  });

  it('should filter commands precisely based on active mode', () => {
    // 个人模式下搜索 /pp 和 /re
    const pptMatch = matchSlashCommands('/pp', 'chat');
    expect(pptMatch.some((c) => c.command === '/ppt')).toBe(true);

    const researchMatch = matchSlashCommands('/re', 'chat');
    expect(researchMatch.some((c) => c.command === '/research')).toBe(true);

    // 工作模式下搜索 /pp 应为空
    const workPptMatch = matchSlashCommands('/pp', 'task');
    expect(workPptMatch).toHaveLength(0);

    // 个人模式下搜索工作专属指令 /email 与 /extract 应为空
    expect(matchSlashCommands('/email', 'chat')).toHaveLength(0);
    expect(matchSlashCommands('/extract', 'chat')).toHaveLength(0);

    // 工作模式下搜索 /doc 应命中
    const workDocMatch = matchSlashCommands('/doc', 'task');
    expect(workDocMatch.some((c) => c.command === '/doc')).toBe(true);
  });

  it('should correctly distinguish work-only and personal-only slash commands by regex', () => {
    // 工作模式指令识别
    expect(isWorkSlashCommand('/doc 架构设计')).toBe(true);
    expect(isWorkSlashCommand('/email 查看最新邮件')).toBe(true);
    expect(isWorkSlashCommand('/extract 文档结构')).toBe(true);
    expect(isWorkSlashCommand('/ppt 演示文稿')).toBe(false);
    expect(isWorkSlashCommand('/research 前沿动态')).toBe(false);

    // 个人模式指令识别
    expect(isPersonalSlashCommand('/ppt 制作产品汇报')).toBe(true);
    expect(isPersonalSlashCommand('/research Qwen模型评测')).toBe(true);
    expect(isPersonalSlashCommand('/excel 财务计算')).toBe(true);
    expect(isPersonalSlashCommand('/word 合同审阅')).toBe(true);
    expect(isPersonalSlashCommand('/doc 架构设计')).toBe(false);
    expect(isPersonalSlashCommand('/email 查邮件')).toBe(false);
  });
});
