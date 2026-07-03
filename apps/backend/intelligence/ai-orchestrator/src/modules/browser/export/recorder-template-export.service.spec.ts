jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderLoopService } from '../loop';
import { RecorderTemplateExportService } from './recorder-template-export.service';

describe('RecorderTemplateExportService', () => {
  it('parameterizes role-based detail buttons into loop row locators', () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());

    const step = (service as any).buildParameterizedRowDetailStep(
      'step_3',
      {
        tool: 'click',
        params: { target: 'e197', text: '詳細' },
        locator: {
          strategy: 'role',
          value: 'button',
          role: 'button',
          name: '詳細',
          expression: "getByRole('button', { name: '詳細' })",
          generatedBy: 'system',
        },
        description: '条件满足后点击详情按钮进入案件审核',
      },
      '保留中'
    );

    expect(step).toEqual(
      expect.objectContaining({
        action: 'click',
        locator: {
          type: 'css',
          value: ':nth-match(button:has-text("詳細"), ${rowIndex})',
        },
      })
    );
  });

  it('inserts optional MFA takeover branch before subsequent recorded steps', async () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());
    const steps = await service.buildTemplateStepsForExport(
      {
        runtimeSessionId: 'runtime-mfa',
        currentPageUrl: 'https://example.com/login',
        lastObservation: {
          currentPageUrl: 'https://example.com/login',
          title: 'Login',
          text: 'login page',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
        },
        history: [],
        manualInterventions: [
          {
            id: 'manual-mfa-1',
            label: 'MFA认证',
            behavior: 'optional_takeover_if_present',
            createdAt: new Date().toISOString(),
            startCommandIndex: 3,
            endCommandIndex: 2,
            signal: {
              selector: 'body',
              method: 'attribute',
              attribute: 'data-auth-stage',
              expectedValue: 'mfa',
              fallbackPattern:
                'mfa|otp|two[- ]factor|multi[- ]factor|verification code|one[- ]time code|authenticator|验证码|二次验证|双重认证|双因素|多因素',
              precheckBeforeRecordedCommands: true,
            },
          },
        ],
        executedCommands: [
          {
            tool: 'navigate',
            params: { url: 'https://example.com/login' },
            description: '打开登录页',
          },
          {
            tool: 'fill',
            params: { selector: '#username', value: 'demo@example.com' },
            description: '填写用户名',
          },
          {
            tool: 'click',
            params: { selector: '#login-btn' },
            description: '点击登录',
          },
          {
            tool: 'click',
            params: { selector: '#dashboard-link' },
            description: '进入控制台',
          },
        ],
      } as any,
      '登录系统'
    );

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read_value',
          description: '读取MFA认证页面信号',
          output_var: 'manual_precheck_0_signal',
        }),
        expect.objectContaining({
          action: 'read_value',
          description: '检查是否出现MFA认证提示',
          output_var: 'manual_checkpoint_3_0_text',
        }),
        expect.objectContaining({
          action: 'branch',
          description: '如果页面出现MFA认证提示，则暂停自动执行并等待人工介入',
          branch: expect.objectContaining({
            on_match: 'continue',
            on_mismatch: 'takeover',
            takeover_reason: '检测到MFA认证提示，请人工介入后继续执行',
          }),
        }),
      ])
    );

    const stepActions = steps?.map((item) => item.action) || [];
    const loginClickIndex =
      steps?.findIndex(
        (item) => item.action === 'click' && item.description === '点击登录'
      ) ?? -1;
    const checkpointReadIndex =
      steps?.findIndex((item) => item.output_var === 'manual_checkpoint_3_0_text') ?? -1;
    const branchIndex =
      steps?.findIndex(
        (item, index) =>
          index > checkpointReadIndex &&
          item.action === 'branch' &&
          item.branch?.takeover_reason === '检测到MFA认证提示，请人工介入后继续执行'
      ) ?? -1;
    const dashboardClickIndex =
      stepActions.length -
      1 -
      [...stepActions]
        .reverse()
        .findIndex((action: string) => action === 'click');

    expect(loginClickIndex).toBeGreaterThanOrEqual(0);
    expect(checkpointReadIndex).toBeGreaterThan(loginClickIndex);
    expect(branchIndex).toBeGreaterThan(checkpointReadIndex);
    expect(dashboardClickIndex).toBeGreaterThan(branchIndex);
  });

  it('prefers stable gross margin field candidate for exported branch read_value step', async () => {
    const branchAnalysisService = {
      analyzeBranchCondition: jest.fn().mockResolvedValue({
        branchStepSpec: {
          readSelectors: ['[data-status]'],
          readMethod: 'innerText',
          outputVar: 'projectGrossRate',
          conditionFn:
            "(ctx) => Number(String(ctx.projectGrossRate || '').replace(/[^0-9.-]+/g, '')) > 20",
          takeoverReason: '案件粗利率未达到20%自动化基准，需要人工介入审核',
          onMismatch: 'takeover',
          onMatch: 'continue',
          description: '检查案件粗利率是否大于20%，满足条件则自动批准，否则人工接管',
        },
        nextAction: {
          action: 'click',
          text: '承認する (Approve)',
          description: '粗利率大于20%时点击批准按钮完成自动审批',
        },
      }),
    };
    const service = new RecorderTemplateExportService(
      branchAnalysisService as any,
      new RecorderLoopService()
    );

    const steps = await service.buildTemplateStepsForExport(
      {
        runtimeSessionId: 'runtime-branch-export',
        currentPageUrl: 'http://localhost/#approvals',
        lastObservation: {
          currentPageUrl: 'http://localhost/#approvals',
          title: 'Approval Detail',
          text: '案件粗利率（毛利率） 25.5%',
          inputs: [],
          buttons: [{ text: '承認する (Approve)' }],
          headings: ['案件承認管理 / 案件詳細'],
          links: [],
          candidates: [
            {
              candidateId: 'field_36',
              kind: 'field',
              label: '25.5%',
              summary:
                'candidateId=field_36 | kind=field | id=detail-gross-margin | testid=gross-margin-value | field=grossMargin | text=25.5%',
              source: 'region',
              field: 'grossMargin',
              elementId: 'detail-gross-margin',
              dataTestId: 'gross-margin-value',
              text: '25.5%',
              preferredLocator: { type: 'testid', value: 'gross-margin-value' },
            },
          ],
        },
        history: [
          {
            role: 'user',
            content:
              '[条件分歧] 根据 案件粗利率 生成条件执行，如果 案件粗利率 大于 20% 就直接承认，否则需要介入同意，才承认',
          },
        ],
        executedCommands: [
          {
            tool: 'navigate',
            params: { url: 'http://localhost/#approvals' },
            description: '打开审批页面',
          },
          {
            tool: 'click',
            params: { target: ':nth-match([data-ai-action="detail"], 1)' },
            description: '点击第一个记录，进入详细页面',
          },
          {
            tool: 'click',
            params: { target: 'e222', text: '承認する (Approve)' },
            description: '粗利率大于20%时点击批准按钮完成自动审批',
            locator: { strategy: 'ref', value: 'e222' },
          },
        ],
      } as any,
      '案件粗利率条件审批'
    );

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read_value',
          locator: { type: 'css', value: '[data-testid="gross-margin-value"]' },
          params: expect.objectContaining({ selector: '[data-testid="gross-margin-value"]' }),
        }),
      ])
    );
  });

  it('dedupes redundant recovery setup steps before exporting template steps', async () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());
    const steps = await service.buildTemplateStepsForExport(
      {
        runtimeSessionId: 'runtime-dedupe',
        currentPageUrl: 'http://localhost/#approvals',
        lastObservation: {
          currentPageUrl: 'http://localhost/#approvals',
          title: 'Login',
          text: 'login page',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
        },
        history: [],
        executedCommands: [
          {
            tool: 'navigate',
            params: { url: 'http://localhost/#approvals' },
            description: '打开审批页',
          },
          {
            tool: 'fill',
            params: { selector: '用户名', value: 'admin' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'ユーザー名 (Username)' },
            description: '填写用户名',
          },
          {
            tool: 'fill',
            params: { selector: '密码', value: 'admin' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'パスワード (Password)' },
            description: '填写密码',
          },
          {
            tool: 'navigate',
            params: { url: 'http://localhost/#approvals' },
            description: '打开登录页',
          },
          {
            tool: 'fill',
            params: { selector: 'input#login-username', value: 'admin' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'ユーザー名 (Username)' },
            description: '填写用户名 admin',
          },
          {
            tool: 'fill',
            params: { selector: 'input#login-password', value: 'admin' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'パスワード (Password)' },
            description: '填写密码 admin',
          },
          {
            tool: 'click',
            params: { target: 'e16' },
            description: "点击登录按钮(ref=e16,精确匹配,避免文本'登录'误匹配日语'ログイン')",
            locator: { strategy: 'ref', value: 'e16' },
          },
        ],
      } as any,
      '登录审批系统'
    );

    expect(steps?.map((item) => item.action)).toEqual(['navigate', 'fill', 'fill', 'click']);
    expect(steps?.[0]).toEqual(
      expect.objectContaining({
        action: 'navigate',
        params: expect.objectContaining({ url: 'http://localhost/#approvals' }),
      })
    );
  });

  it('resolves ref-based click into a role locator using recorded snapshot content', async () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());
    const steps = await service.buildTemplateStepsForExport(
      {
        runtimeSessionId: 'runtime-ref-login',
        currentPageUrl: 'http://localhost/#approvals',
        lastObservation: {
          currentPageUrl: 'http://localhost/#approvals',
          title: 'Approval List',
          text: 'approval list',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
        },
        history: [
          {
            role: 'assistant',
            content: '登录完成',
            execution: {
              results: [
                {
                  data: {
                    content:
                      '- textbox "ユーザー名 (Username)" [ref=e12]\n- textbox "パスワード (Password)" [ref=e15]\n- button "ログイン" [ref=e16] [cursor=pointer]',
                  },
                },
              ],
            },
          },
        ],
        executedCommands: [
          {
            tool: 'navigate',
            params: { url: 'http://localhost/#approvals' },
            description: '打开登录页',
          },
          {
            tool: 'fill',
            params: { selector: '用户名', value: 'admin', target: 'e12' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'ユーザー名 (Username)' },
            description: '填写用户名 admin',
          },
          {
            tool: 'fill',
            params: { selector: '密码', value: 'admin', target: 'e15' },
            locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'パスワード (Password)' },
            description: '填写密码 admin',
          },
          {
            tool: 'click',
            params: { target: 'e16' },
            locator: { strategy: 'ref', value: 'e16', generatedBy: 'system' },
            description: '通过 ref=e16 点击登录按钮(避免按中文文本匹配)',
          },
        ],
      } as any,
      '登录审批系统'
    );

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'click',
          locator: { type: 'role', value: 'button[name="ログイン"]' },
        }),
      ])
    );
    expect(steps?.some((item) => item.action === 'takeover_gate')).toBe(false);
  });

  it('sanitizes recovery setup commands to the last effective navigate sequence', () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());
    const commands = service.sanitizeRecordedCommandsForExport([
      {
        tool: 'navigate',
        params: { url: 'http://localhost/#approvals' },
        description: '打开审批页',
      },
      {
        tool: 'fill',
        params: { selector: '用户名', value: 'admin', target: 'e12' },
        locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'ユーザー名 (Username)' },
        description: '填写用户名',
      },
      {
        tool: 'fill',
        params: { selector: '密码', value: 'admin', target: 'e15' },
        locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'パスワード (Password)' },
        description: '填写密码',
      },
      {
        tool: 'navigate',
        params: { url: 'http://localhost/#approvals' },
        description: '打开登录页',
      },
      {
        tool: 'fill',
        params: { selector: 'input#login-username', value: 'admin', target: 'e12' },
        locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'ユーザー名 (Username)' },
        description: '填写用户名 admin',
      },
      {
        tool: 'fill',
        params: { selector: 'input#login-password', value: 'admin', target: 'e15' },
        locator: { strategy: 'role', value: 'textbox', role: 'textbox', name: 'パスワード (Password)' },
        description: '填写密码 admin',
      },
      {
        tool: 'click',
        params: { target: 'e16' },
        description: "点击登录按钮(ref=e16,精确匹配,避免文本'登录'误匹配日语'ログイン')",
        locator: { strategy: 'ref', value: 'e16' },
      },
    ] as any);

    expect(commands.map((item) => item.tool)).toEqual(['navigate', 'fill', 'fill', 'click']);
    expect(commands[0]).toEqual(
      expect.objectContaining({
        tool: 'navigate',
        params: expect.objectContaining({ url: 'http://localhost/#approvals' }),
      })
    );
  });

  it('preserves grounding metadata (ref/role/name/contextLabel/regionId) on template step locator', () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());

    const step = service.buildTemplateStepFromRecordedCommand(
      {
        tool: 'click',
        params: { target: 'e42' },
        description: '打开 gross-margin 详情',
        locator: {
          strategy: 'role',
          value: 'button',
          role: 'button',
          name: 'gross-margin',
          ref: 'e42',
          contextLabel: 'margin-row-3',
          regionId: 'gross-margin-panel',
          generatedBy: 'system',
        },
      } as any,
      'step_2'
    );

    expect(step?.locator).toEqual(
      expect.objectContaining({
        type: 'role',
        value: 'button[name="gross-margin"]',
        ref: 'e42',
        role: 'button',
        name: 'gross-margin',
        contextLabel: 'margin-row-3',
        regionId: 'gross-margin-panel',
      })
    );
  });

  it('preserves grounding metadata on template step locator when falling back to selector branch', () => {
    const service = new RecorderTemplateExportService({} as any, new RecorderLoopService());

    const step = service.buildTemplateStepFromRecordedCommand(
      {
        tool: 'click',
        params: { selector: 'button.action-btn' },
        description: '点击操作按钮',
        locator: {
          strategy: 'css',
          value: 'button.action-btn',
          ref: 'e99',
          role: 'button',
          name: 'action',
          contextLabel: 'action-bar',
          regionId: 'action-region',
        },
      } as any,
      'step_3'
    );

    expect(step?.locator).toEqual(
      expect.objectContaining({
        type: 'css',
        value: 'button.action-btn',
        ref: 'e99',
        role: 'button',
        name: 'action',
        contextLabel: 'action-bar',
        regionId: 'action-region',
      })
    );
  });
});
