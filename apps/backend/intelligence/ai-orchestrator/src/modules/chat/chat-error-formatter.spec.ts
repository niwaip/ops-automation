import { formatFriendlyExecutionError } from './chat-error-formatter';

describe('formatFriendlyExecutionError', () => {
  it('formats permission error with skill name', () => {
    const raw = 'You do not have permission to execute this skill';
    const result = formatFriendlyExecutionError(raw, {
      skillName: '天气查询',
      phase: 'waiting_input',
    });
    expect(result).toBe(
      '您当前暂无「天气查询」技能的执行权限。如需使用，请前往「技能中心」申请授权，或联系系统管理员开通权限。'
    );
  });

  it('formats permission error without skill name', () => {
    const raw = 'You do not have permission to execute this skill';
    const result = formatFriendlyExecutionError(raw);
    expect(result).toBe(
      '您当前暂无该技能的执行权限。如需使用，请前往「技能中心」申请授权，或联系系统管理员开通权限。'
    );
  });

  it('handles axios response error with Forbidden message', () => {
    const errorObj = {
      response: {
        data: {
          statusCode: 403,
          message: 'You do not have permission to access this skill',
          error: 'Forbidden',
        },
      },
    };
    const result = formatFriendlyExecutionError(errorObj, { skillName: '天气查询' });
    expect(result).toContain('您当前暂无「天气查询」技能的执行权限');
    expect(result).toContain('前往「技能中心」申请授权');
  });

  it('handles builtin skill access denied error', () => {
    const raw = "Builtin skill 'platform.weather' access denied: role not permitted";
    const result = formatFriendlyExecutionError(raw, { skillName: '内置天气' });
    expect(result).toContain('您当前暂无「内置天气」技能的执行权限');
  });

  it('handles Chinese permission error from upstream', () => {
    const raw = '您暂无该技能的执行权限，如需使用请前往技能中心申请授权或联系系统管理员';
    const result = formatFriendlyExecutionError(raw, { skillName: '天气查询' });
    expect(result).toContain('您当前暂无「天气查询」技能的执行权限');
    expect(result).toContain('前往「技能中心」申请授权');
  });

  it('handles generic error with waiting_input phase', () => {
    const raw = 'Invalid parameter schema';
    const result = formatFriendlyExecutionError(raw, { phase: 'waiting_input' });
    expect(result).toBe('创建等待输入执行单失败: Invalid parameter schema');
  });

  it('handles generic error with execution phase', () => {
    const raw = 'Database connection timeout';
    const result = formatFriendlyExecutionError(raw, { phase: 'execution' });
    expect(result).toContain('服务响应超时，请稍后重试。');
  });
});
