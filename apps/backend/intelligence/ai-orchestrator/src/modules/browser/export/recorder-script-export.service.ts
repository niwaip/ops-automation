import { Injectable } from '@nestjs/common';
import { BrowserCommand } from '../intent';

interface SkillParameterLike {
  name: string;
  description: string;
  required: boolean;
  exampleValue?: string;
  source?: string;
}

interface TemplateStepLike {
  action: string;
}

interface ExecutionPlanLike {
  backend: 'cli' | 'chrome-devtools' | 'mcp';
  runtimeSessionId: string;
  commands: BrowserCommand[];
}

@Injectable()
export class RecorderScriptExportService {
  buildStableExecutionScript(
    executionPlan: ExecutionPlanLike,
    parameters: SkillParameterLike[]
  ): string {
    const parameterConsts = parameters.map((param) => {
      const constName = this.toScriptConstName(param.name);
      const fallbackValue = this.coerceParameterExampleValue(param.name, param.exampleValue);
      if (typeof fallbackValue === 'number') {
        return `const ${constName} = Number(process.env.${constName} || ${fallbackValue});`;
      }
      return `const ${constName} = process.env.${constName} || ${this.toJavaScriptLiteral(fallbackValue)};`;
    });

    const lines = [
      '// Auto-generated Playwright script from Recorder Debug Chat',
      `// backend: ${executionPlan.backend}`,
      `// runtimeSessionId: ${executionPlan.runtimeSessionId}`,
      '',
      'const { chromium } = require("playwright");',
      '',
      'const DEFAULT_WAIT_MS = Number(process.env.DEFAULT_WAIT_MS || 2000);',
      ...parameterConsts,
      parameterConsts.length > 0 ? '' : '',
      'async function findSearchInput(page) {',
      '  const selectors = [',
      '    \'input[type="search"]\',',
      '    \'textarea[name="q"]\',',
      '    \'input[name="q"]\',',
      '    \'input[name="wd"]\',',
      '    \'textarea[name="wd"]\',',
      '    \'[role="searchbox"]\',',
      '    \'input[placeholder*="搜索"]\',',
      '    \'input[placeholder*="Search" i]\',',
      '    \'textarea[placeholder*="搜索"]\',',
      '    \'textarea[placeholder*="Search" i]\',',
      '  ];',
      '  for (const selector of selectors) {',
      '    const locator = page.locator(selector).first();',
      '    if (await locator.count()) {',
      '      return locator;',
      '    }',
      '  }',
      '  throw new Error("No search input found on current page");',
      '}',
      '',
      'async function clickSearchResult(page, context, index) {',
      '  const selectors = [',
      '    // Baidu organic results',
      '    "#content_left h3.t a[href], #content_left .c-container h3 a[href]",',
      '    // Google organic results',
      '    "#search .g a h3, #search .g h3 a[href]",',
      '    // Bing organic results',
      '    "#b_results li.b_algo h2 a[href]",',
      '    // Generic fallbacks',
      '    "main h3 a[href]",',
      '    "main h2 a[href]",',
      '    "#content_left a[href]",',
      '    "#b_results a[href]",',
      '    "main a[href]",',
      '    "a[href]"',
      '  ];',
      '  for (const selector of selectors) {',
      '    const links = page.locator(selector);',
      '    const count = await links.count();',
      '    if (count >= index) {',
      '      const popupPromise = page.waitForEvent("popup", { timeout: 3000 }).catch(() => null);',
      '      await links.nth(index - 1).click();',
      '      const popup = await popupPromise;',
      '      const nextPage = popup || context.pages().at(-1) || page;',
      '      await nextPage.waitForLoadState("domcontentloaded").catch(() => {});',
      '      return nextPage;',
      '    }',
      '  }',
      '  throw new Error(`Search result index out of range: ${index}`);',
      '}',
      '',
      'async function run() {',
      '  const browser = await chromium.launch({ headless: false });',
      '  const context = await browser.newContext();',
      '  let page = await context.newPage();',
      '',
    ];

    executionPlan.commands.forEach((command, index) => {
      lines.push(`  // Step ${index + 1}: ${command.description || command.tool}`);
      lines.push(...this.buildPlaywrightCommandLines(command, parameters, index + 1, index));
      if (command.tool !== 'wait') {
        lines.push('  await page.waitForTimeout(DEFAULT_WAIT_MS);');
      }
      lines.push('');
    });

    lines.push('  await page.waitForTimeout(5000);');
    lines.push('  await browser.close();');
    lines.push('}');
    lines.push('');
    lines.push('run().catch((error) => {');
    lines.push('  console.error(error);');
    lines.push('  process.exit(1);');
    lines.push('});');

    return lines.join('\n');
  }

  validateGeneratedScript(
    script: string,
    templateSteps?: TemplateStepLike[]
  ): { syntaxValid: boolean; warnings: string[] } {
    let syntaxValid = true;
    try {
      // eslint-disable-next-line no-new-func
      new Function(script);
    } catch {
      syntaxValid = false;
    }

    const warnings: string[] = [];
    const unsupportedMatches = [
      ...script.matchAll(/Unsupported command in exported script: ([^\n]+)/g),
    ].map((match) => String(match[1]).trim());
    if (unsupportedMatches.length > 0) {
      warnings.push(`导出的 Playwright 脚本不支持这些录制命令: ${unsupportedMatches.join(', ')}`);
    }
    if (templateSteps?.some((step) => step.action === 'branch')) {
      warnings.push(
        '条件分支与人工接管只在 templateSteps/模板执行链中生效，导出的 Playwright 脚本仍是线性录制脚本'
      );
    }

    return {
      syntaxValid,
      warnings,
    };
  }

  buildPlaywrightCommandLines(
    command: BrowserCommand,
    parameters: SkillParameterLike[],
    stepNumber: number,
    commandIndex: number
  ): string[] {
    switch (command.tool) {
      case 'navigate':
        return [
          `  await page.goto(${this.resolveScriptValue(commandIndex, 'url', command.params.url, parameters)});`,
        ];
      case 'search':
      case 'smart_search':
        return [
          '  {',
          '    const searchInput = await findSearchInput(page);',
          '    await searchInput.click();',
          `    await searchInput.fill(${this.resolveScriptValue(commandIndex, 'query', command.params.query, parameters)});`,
          '    await searchInput.press("Enter");',
          '    await page.waitForLoadState("domcontentloaded").catch(() => {});',
          '  }',
        ];
      case 'click_result':
        return [
          `  page = await clickSearchResult(page, context, ${this.resolveScriptValue(commandIndex, 'index', command.params.index, parameters)});`,
        ];
      case 'switch_latest_tab':
        return [
          '  page = context.pages().at(-1) || page;',
          '  await page.bringToFront().catch(() => {});',
        ];
      case 'close_tab':
        return [
          '  await page.close().catch(() => {});',
          '  page = context.pages().at(-1) || page;',
          '  if (page) await page.bringToFront().catch(() => {});',
        ];
      case 'click':
        if (command.locator) {
          return [
            `  await ${this.toPlaywrightLocatorExpression(command.locator)}.first().click();`,
          ];
        }
        if (typeof command.params.selector === 'string') {
          return [
            `  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().click();`,
          ];
        }
        if (typeof command.params.text === 'string') {
          return [
            `  await page.getByText(${this.toJavaScriptLiteral(command.params.text)}, { exact: false }).first().click();`,
          ];
        }
        return ['  // Unsupported click command payload'];
      case 'fill':
        if (command.locator) {
          return [
            `  await ${this.toPlaywrightLocatorExpression(command.locator)}.first().fill(${this.resolveScriptValue(commandIndex, 'value', command.params.value, parameters)});`,
          ];
        }
        if (typeof command.params.selector === 'string') {
          return [
            `  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().fill(${this.resolveScriptValue(commandIndex, 'value', command.params.value, parameters)});`,
          ];
        }
        return ['  // Unsupported fill command payload'];
      case 'type_text':
        return [
          `  await page.keyboard.type(${this.resolveScriptValue(commandIndex, 'text', command.params.text, parameters)});`,
          ...(typeof command.params.submit_key === 'string'
            ? [
                `  await page.keyboard.press(${this.toJavaScriptLiteral(command.params.submit_key)});`,
              ]
            : []),
        ];
      case 'press_key':
        return [`  await page.keyboard.press(${this.toJavaScriptLiteral(command.params.key)});`];
      case 'wait':
        return [
          `  await page.waitForTimeout(${this.toJavaScriptLiteral(command.params.duration ?? 2000)});`,
        ];
      case 'scroll': {
        const direction =
          typeof command.params.direction === 'string' ? command.params.direction : 'down';
        const amount = typeof command.params.amount === 'number' ? command.params.amount : 600;
        if (direction === 'top') {
          return ['  await page.evaluate(() => window.scrollTo(0, 0));'];
        }
        if (direction === 'bottom') {
          return ['  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));'];
        }
        if (direction === 'up') {
          return [`  await page.evaluate(() => window.scrollBy(0, -${amount}));`];
        }
        return [`  await page.evaluate(() => window.scrollBy(0, ${amount}));`];
      }
      case 'screenshot':
        return [
          `  await page.screenshot({ path: ${this.toJavaScriptLiteral(`artifacts/step-${stepNumber}.png`)}, fullPage: true });`,
        ];
      case 'read_page':
      case 'get_text':
        return ['  console.log(await page.locator("body").innerText());'];
      default:
        return [`  // Unsupported command in exported script: ${command.tool}`];
    }
  }

  resolveScriptValue(
    commandIndex: number,
    parameterKey: string,
    fallbackValue: unknown,
    parameters: SkillParameterLike[]
  ): string {
    const sourceKey = `command.${commandIndex}.${parameterKey}`;
    const matched =
      parameters.find((param) => param.source === sourceKey) ||
      parameters.find((param) => param.source === this.buildLegacyParameterSource(parameterKey)) ||
      parameters.find((param) => param.name === this.buildLegacyParameterName(parameterKey));
    if (matched) {
      return this.toScriptConstName(matched.name);
    }
    return this.toJavaScriptLiteral(fallbackValue);
  }

  buildLegacyParameterSource(parameterKey: string): string | undefined {
    switch (parameterKey) {
      case 'url':
        return 'navigate.url';
      case 'query':
        return 'search.query';
      case 'index':
        return 'click_result.index';
      case 'value':
        return 'fill.value';
      default:
        return undefined;
    }
  }

  buildLegacyParameterName(parameterKey: string): string | undefined {
    switch (parameterKey) {
      case 'url':
        return 'url';
      case 'query':
        return 'query';
      case 'index':
        return 'resultIndex';
      case 'value':
        return 'value';
      default:
        return undefined;
    }
  }

  toPlaywrightLocatorExpression(locator: NonNullable<BrowserCommand['locator']>): string {
    if (locator.expression) {
      return `page.${locator.expression}`;
    }

    switch (locator.strategy) {
      case 'role':
        return `page.getByRole(${this.toJavaScriptLiteral(locator.value || locator.role || 'button')}${locator.name ? `, { name: ${this.toJavaScriptLiteral(locator.name)} }` : ''})`;
      case 'label':
        return `page.getByLabel(${this.toJavaScriptLiteral(locator.value || locator.name || '')})`;
      case 'placeholder':
        return `page.getByPlaceholder(${this.toJavaScriptLiteral(locator.value || '')})`;
      case 'testid':
        return `page.getByTestId(${this.toJavaScriptLiteral(locator.value || '')})`;
      case 'text':
        return `page.getByText(${this.toJavaScriptLiteral(locator.value || '')}, { exact: ${locator.exact ? 'true' : 'false'} })`;
      default:
        return `page.locator(${this.toJavaScriptLiteral(locator.value || '')})`;
    }
  }

  toScriptConstName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^(\d)/, '_$1')
      .toUpperCase();
  }

  coerceParameterExampleValue(name: string, value?: string): string | number {
    if (name === 'resultIndex') {
      const parsed = Number(value || '1');
      return Number.isFinite(parsed) ? parsed : 1;
    }
    return value || '';
  }

  toJavaScriptLiteral(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(typeof value === 'string' ? value : '');
  }
}
