import { CodegenScriptParserService } from './codegen-script-parser.service';

describe('CodegenScriptParserService', () => {
  const service = new CodegenScriptParserService();

  it('parses goto, role click, text click and keyboard press into browser action steps', () => {
    const steps = service.parse(`
      await page.goto('https://example.com/login');
      await page.getByRole('button', { name: '平台登录' }).click();
      await page.getByText('继续执行').click();
      await page.keyboard.press('Enter');
    `, {
      backend: 'cli',
      source: 'manual_takeover',
      runtimeSessionId: 'runtime-1',
    });

    expect(steps).toEqual([
      expect.objectContaining({
        action: 'navigate',
        params: { url: 'https://example.com/login' },
        source: 'manual_takeover',
      }),
      expect.objectContaining({
        action: 'click',
        source: 'manual_takeover',
        params: expect.objectContaining({
          role: 'button',
          name: '平台登录',
        }),
        locator: expect.objectContaining({
          strategy: 'role',
          type: 'role',
          role: 'button',
          name: '平台登录',
        }),
      }),
      expect.objectContaining({
        action: 'click',
        params: { text: '继续执行' },
        locator: expect.objectContaining({
          strategy: 'text',
          type: 'text',
          value: '继续执行',
        }),
      }),
      expect.objectContaining({
        action: 'press_key',
        params: { key: 'Enter' },
        source: 'manual_takeover',
      }),
    ]);
  });

  it('parses locator fill and page fill statements', () => {
    const steps = service.parse(`
      await page.fill('#username', 'demo');
      await page.locator('[name="password"]').fill('secret');
    `);

    expect(steps).toEqual([
      expect.objectContaining({
        action: 'fill',
        params: { selector: '#username', value: 'demo' },
      }),
      expect.objectContaining({
        action: 'fill',
        params: { selector: '[name="password"]', value: 'secret' },
      }),
    ]);
  });

  it('parses label, placeholder, testid and role-fill locator forms', () => {
    const steps = service.parse(`
      await page.getByLabel('用户名').fill('demo');
      await page.getByPlaceholder('请输入密码').fill('secret');
      await page.getByTestId('submit-login').click();
      await page.getByRole('textbox', { name: '企业编码' }).fill('acme');
    `, {
      backend: 'cli',
      source: 'manual_takeover',
    });

    expect(steps).toEqual([
      expect.objectContaining({
        action: 'fill',
        params: { label: '用户名', value: 'demo' },
        locator: expect.objectContaining({
          strategy: 'label',
          type: 'label',
          value: '用户名',
        }),
      }),
      expect.objectContaining({
        action: 'fill',
        params: { placeholder: '请输入密码', value: 'secret' },
        locator: expect.objectContaining({
          strategy: 'placeholder',
          type: 'placeholder',
          value: '请输入密码',
        }),
      }),
      expect.objectContaining({
        action: 'click',
        params: { testId: 'submit-login' },
        locator: expect.objectContaining({
          strategy: 'testid',
          type: 'testid',
          value: 'submit-login',
        }),
      }),
      expect.objectContaining({
        action: 'fill',
        params: expect.objectContaining({
          target: 'role=textbox[name="企业编码"]',
          role: 'textbox',
          name: '企业编码',
          value: 'acme',
        }),
        locator: expect.objectContaining({
          strategy: 'role',
          type: 'role',
          role: 'textbox',
          name: '企业编码',
        }),
      }),
    ]);
  });

  it('parses hover actions and popup-driven tab switching with page aliases', () => {
    const steps = service.parse(`
      const page1Promise = page.waitForEvent('popup');
      await page.getByRole('link', { name: '详情' }).click();
      const page1 = await page1Promise;
      await page1.locator('.row-actions').hover();
      await page1.getByText('继续处理').hover();
    `, {
      backend: 'cli',
      source: 'manual_takeover',
    });

    expect(steps).toEqual([
      expect.objectContaining({
        action: 'click',
        params: expect.objectContaining({
          role: 'link',
          name: '详情',
        }),
      }),
      expect.objectContaining({
        action: 'switch_latest_tab',
        params: {},
        source: 'manual_takeover',
      }),
      expect.objectContaining({
        action: 'hover',
        params: { selector: '.row-actions' },
        locator: expect.objectContaining({
          strategy: 'css',
          type: 'css',
          value: '.row-actions',
        }),
      }),
      expect.objectContaining({
        action: 'hover',
        params: { text: '继续处理' },
        locator: expect.objectContaining({
          strategy: 'text',
          type: 'text',
          value: '继续处理',
        }),
      }),
    ]);
  });
});
