import { Injectable, Optional } from '@nestjs/common';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import { PlaywrightNavigationHandler } from './playwright-navigation.handler';
import {
  CliActionResult,
  CliExecResult,
  CliSessionState,
  EPHEMERAL_REF_RE,
  ELEMENT_NOT_FOUND_PATTERN,
  getDefaultPlaywrightConfig,
  LOCATOR_ERROR_PATTERN,
  PLAYWRIGHT_ARIA_ROLES,
  PlaywrightCliConfig,
  PlaywrightCliContext,
  STRICT_MODE_VIOLATION_PATTERN,
} from './playwright.types';

@Injectable()
export class PlaywrightInteractionHandler {
  private readonly config: PlaywrightCliConfig;
  private context?: PlaywrightCliContext;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    private readonly navigationHandler: PlaywrightNavigationHandler,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  setContext(context: PlaywrightCliContext): void {
    this.context = context;
  }

  private exec(sessionId: string, args: string[], timeoutMs?: number): Promise<CliExecResult> {
    if (this.context) {
      return timeoutMs !== undefined
        ? this.context.execCli(sessionId, args, timeoutMs)
        : this.context.execCli(sessionId, args);
    }
    return timeoutMs !== undefined
      ? this.cliRunner.execCli(sessionId, args, timeoutMs)
      : this.cliRunner.execCli(sessionId, args);
  }

  private ensureReady(sessionId: string): Promise<void> {
    return this.context
      ? this.context.ensureSessionReady(sessionId)
      : this.sessionManager.ensureSessionReady(sessionId);
  }

  private settle(sessionId: string): Promise<void> {
    return this.context
      ? this.context.settlePageAfterAction(sessionId)
      : this.navigationHandler.settlePageAfterAction(sessionId);
  }

  private callSimpleCommand(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliActionResult> {
    return this.context
      ? this.context.handleSimpleCommand(sessionId, command, args)
      : this.handleSimpleCommand(sessionId, command, args);
  }

  private getSession(sessionId: string): CliSessionState {
    return this.context
      ? this.context.getOrCreateSession(sessionId)
      : this.sessionManager.getOrCreateSession(sessionId);
  }

  async handleClick(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    const explicitTarget = this.cliRunner.readOptionalStringParam(params, ['target', 'selector']);
    if (explicitTarget) {
      const positionalClickResult = await this.executePositionalSelectorAction(
        sessionId,
        explicitTarget,
        'click'
      );
      if (positionalClickResult) {
        return positionalClickResult;
      }
      return this.callSimpleCommand(sessionId, 'click', [explicitTarget]);
    }

    const text = this.cliRunner.readOptionalStringParam(params, ['text']);
    if (!text) {
      throw new Error('Missing required parameter: target or selector or text');
    }

    await this.ensureReady(sessionId);
    const result = await this.exec(sessionId, [
      'run-code',
      this.buildTextClickScript(sessionId, text),
    ]);
    this.cliRunner.assertNoCliError(result, 'Text click failed');

    return {
      status: 'success',
      command: 'click',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { text },
    };
  }

  buildTextClickScript(sessionId: string, text: string): string {
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    return `async page => {
      const activePage = ${activePageExpr};
      const clickByText = async (scope) => {
        const candidates = [
          scope.getByRole('button', { name: ${JSON.stringify(text)}, exact: false }).first(),
          scope.getByRole('link', { name: ${JSON.stringify(text)}, exact: false }).first(),
          scope.getByText(${JSON.stringify(text)}, { exact: false }).first(),
        ];
        for (const locator of candidates) {
          const count = await locator.count().catch(() => 0);
          if (!count) continue;
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await locator.click({ force: true, timeout: 5000 });
          return true;
        }
        return false;
      };

      if (await clickByText(activePage).catch(() => false)) {
        await activePage.waitForTimeout(300).catch(() => {});
        return JSON.stringify({ text: ${JSON.stringify(text)}, matchedIn: 'page' });
      }

      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        if (await clickByText(frame).catch(() => false)) {
          await activePage.waitForTimeout(300).catch(() => {});
          return JSON.stringify({ text: ${JSON.stringify(text)}, matchedIn: 'iframe' });
        }
      }

      throw new Error(${JSON.stringify(`Text click failed to find element: ${text}`)});
    }`;
  }

  async handleFill(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    const selector = this.cliRunner.requireStringParam(params, ['target', 'selector']);
    const value = this.cliRunner.requireStringParam(params, ['value', 'text']);

    // Primary path: standard playwright fill
    try {
      const result = await this.callSimpleCommand(sessionId, 'fill', [selector, value]);
      return result;
    } catch (primaryErr: unknown) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr || '');
      const isVisibilityIssue =
        /timeout/i.test(msg) ||
        /not visible/i.test(msg) ||
        /hidden/i.test(msg) ||
        /not interactable/i.test(msg) ||
        /element is not attached/i.test(msg);

      if (!isVisibilityIssue) throw primaryErr;
    }

    // Fallback: force-fill via run-code (handles display:none elements)
    await this.ensureReady(sessionId);
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedSelector = this.normalizeSemanticRoleSelector(selector);
    const settleTimeout = this.config.cliPageSettleTimeoutMs;

    const buildForceFillScript = (scopeExpr: string) => `async page => {
      const activePage = ${activePageExpr};
      await activePage.waitForLoadState('domcontentloaded', { timeout: ${settleTimeout} }).catch(() => {});
      const scope = ${scopeExpr};
      const loc = scope.locator(${JSON.stringify(normalizedSelector)});
      const count = await loc.count().catch(() => 0);
      if (!count) throw new Error('force-fill: no element found for ' + ${JSON.stringify(normalizedSelector)});
      try {
        await loc.first().fill(${JSON.stringify(value)}, { force: true, timeout: 5000 });
        return JSON.stringify({ method: 'force-fill', selector: ${JSON.stringify(normalizedSelector)} });
      } catch {}
      await loc.first().evaluate((el, val) => {
        const input = el;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, val);
        } else {
          input.value = val;
        }
        ['input', 'change'].forEach(type =>
          input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
        );
      }, ${JSON.stringify(value)});
      return JSON.stringify({ method: 'js-value-set', selector: ${JSON.stringify(normalizedSelector)} });
    }`;

    try {
      const r = await this.exec(sessionId, ['run-code', buildForceFillScript('activePage')]);
      this.cliRunner.assertNoCliError(r, 'force-fill on page failed');
      return {
        status: 'success',
        command: 'fill',
        stdout: r.stdout,
        stderr: r.stderr,
        data: { selector, value, forceFill: true },
      };
    } catch (pageErr: unknown) {
      const iframeResult = await this.executeIframeFallback(sessionId, 'fill', [
        selector,
        value,
      ]).catch(() => undefined);
      if (iframeResult) {
        return {
          status: 'success',
          command: 'fill',
          stdout: iframeResult.stdout,
          stderr: iframeResult.stderr,
          data: { selector, value, iframeFill: true },
        };
      }
      throw pageErr;
    }
  }

  async handleSimpleCommand(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliActionResult> {
    await this.ensureReady(sessionId);
    const normalizedArgs = args.map((arg, index) =>
      index === 0 ? this.normalizeSemanticRoleSelector(arg) : arg
    );
    let result: CliExecResult | undefined;
    try {
      result = await this.exec(sessionId, [command, ...normalizedArgs]);
      this.cliRunner.assertNoCliError(result, `${command} failed`);
    } catch (error: unknown) {
      const fallbackArgs = this.buildPlaceholderFallbackArgs(command, normalizedArgs, error);
      if (fallbackArgs) {
        let fbSucceeded = false;
        try {
          result = await this.exec(sessionId, [command, ...fallbackArgs]);
          this.cliRunner.assertNoCliError(result, `${command} failed`);
          fbSucceeded = true;
        } catch (fbError) {
          const remainingCandidates = this.buildLabelFallbackArgsList(command, normalizedArgs);
          let lastCandidateError: unknown = fbError;
          for (const candidateArgs of remainingCandidates) {
            try {
              result = await this.exec(sessionId, [command, ...candidateArgs]);
              this.cliRunner.assertNoCliError(result, `${command} failed`);
              fbSucceeded = true;
              break;
            } catch (candidateError) {
              lastCandidateError = candidateError;
            }
          }
          if (!fbSucceeded) {
            result = await this.executeIframeFallback(sessionId, command, fallbackArgs).catch(
              () => undefined
            );
            if (!result) throw lastCandidateError;
          }
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        if (
          command === 'click' &&
          STRICT_MODE_VIOLATION_PATTERN.test(errorMessage) &&
          normalizedArgs[0]
        ) {
          const firstResult = await this.executeStrictModeFirstFallback(
            sessionId,
            normalizedArgs[0]
          ).catch(() => undefined);
          if (firstResult) {
            result = firstResult;
          } else {
            result = await this.executeIframeFallback(sessionId, command, normalizedArgs).catch(
              () => undefined
            );
            if (!result) throw error;
          }
        } else if (ELEMENT_NOT_FOUND_PATTERN.test(errorMessage) || /failed/i.test(errorMessage)) {
          result = await this.executeIframeFallback(sessionId, command, normalizedArgs).catch(
            () => undefined
          );
          if (!result) throw error;
        } else {
          throw error;
        }
      }
    }

    if (command === 'click') {
      await this.settle(sessionId);
    }

    return {
      status: 'success',
      command,
      stdout: result!.stdout,
      stderr: result!.stderr,
    };
  }

  async executeIframeFallback(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliExecResult> {
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const target = args[0];
    if (!target || typeof target !== 'string' || command === 'press' || command === 'drag') {
      throw new Error(`Iframe fallback not supported for command: ${command}`);
    }

    let actionCode = '';
    if (command === 'click') {
      actionCode = `await loc.first().click({ force: true, timeout: 5000 });`;
    } else if (command === 'fill') {
      actionCode = `await loc.first().fill(${JSON.stringify(args[1] || '')}, { timeout: 5000 });`;
    } else if (command === 'hover') {
      actionCode = `await loc.first().hover({ timeout: 5000 });`;
    } else {
      throw new Error(`Iframe fallback not supported for command: ${command}`);
    }

    const script = `async page => {
      const activePage = ${activePageExpr};
      const frames = activePage.frames();
      let found = false;
      for (const frame of frames) {
        if (frame === activePage.mainFrame()) continue;
        const loc = frame.locator(${JSON.stringify(target)});
        if (await loc.count().catch(() => 0) > 0) {
          try {
            ${actionCode}
            found = true;
            break;
          } catch (e) {
            // ignore
          }
        }
      }
      if (!found) {
        throw new Error("Iframe fallback failed to find or interact with element");
      }
      return "iframe-fallback-success";
    }`;

    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, `Iframe fallback ${command} failed`);
    return result;
  }

  async handleTypeText(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureReady(sessionId);

    const text = this.cliRunner.requireStringParam(params, ['text', 'value']);
    const typeResult = await this.exec(sessionId, ['type', text]);
    this.cliRunner.assertNoCliError(typeResult, 'Type text failed');
    const submitKey = this.cliRunner.readOptionalStringParam(params, ['submit_key']);

    if (!submitKey) {
      return {
        status: 'success',
        command: 'type',
        stdout: typeResult.stdout,
        stderr: typeResult.stderr,
        data: { text },
      };
    }

    const pressResult = await this.exec(sessionId, ['press', submitKey]);
    this.cliRunner.assertNoCliError(pressResult, `Press ${submitKey} failed`);
    return {
      status: 'success',
      command: 'type_text',
      stdout: [typeResult.stdout, pressResult.stdout].filter(Boolean).join('\n'),
      stderr: [typeResult.stderr, pressResult.stderr].filter(Boolean).join('\n'),
      data: { text, submitKey },
    };
  }

  async handleWait(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureReady(sessionId);

    const selector =
      this.normalizeSemanticRoleSelector(
        this.cliRunner.readOptionalStringParam(params, ['target', 'selector']) || ''
      ) || undefined;
    const duration = this.cliRunner.readOptionalNumberParam(params, ['duration']) ?? 1000;
    const positionalSelector = selector ? this.parseNthMatchSelector(selector) : null;
    const selectorExpr = positionalSelector
      ? `activePage.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`
      : selector
        ? `activePage.locator(${JSON.stringify(selector)}).first()`
        : null;
    const frameSelectorExpr = positionalSelector
      ? `frame.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`
      : selector
        ? `frame.locator(${JSON.stringify(selector)}).first()`
        : null;

    const script = selectorExpr
      ? `async page => {
          const activePage = page;
          let found = false;
          try {
            await ${selectorExpr}.waitFor({ timeout: ${duration} });
            found = true;
          } catch (e) {
            for (const frame of activePage.frames()) {
              if (frame === activePage.mainFrame()) continue;
              try {
                await ${frameSelectorExpr}.waitFor({ timeout: ${duration} });
                found = true;
                break;
              } catch (e2) {}
            }
          }
          if (!found) throw new Error("Timeout waiting for selector in page and iframes");
          return "selector-ready";
        }`
      : `async page => { await page.waitForTimeout(${duration}); return "waited-${duration}"; }`;

    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Wait failed');

    return {
      status: 'success',
      command: 'wait',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { selector, duration },
    };
  }

  async handleScroll(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureReady(sessionId);

    const direction = this.cliRunner.readOptionalStringParam(params, ['direction']) || 'down';
    const amount = this.cliRunner.readOptionalNumberParam(params, ['amount']) ?? 600;

    let script = '';
    switch (direction) {
      case 'up':
        script = `async page => { await page.evaluate(() => window.scrollBy(0, -${amount})); return "scrolled-up"; }`;
        break;
      case 'top':
        script =
          'async page => { await page.evaluate(() => window.scrollTo(0, 0)); return "scrolled-top"; }';
        break;
      case 'bottom':
        script =
          'async page => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); return "scrolled-bottom"; }';
        break;
      default:
        script = `async page => { await page.evaluate(() => window.scrollBy(0, ${amount})); return "scrolled-down"; }`;
        break;
    }

    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Scroll failed');

    return {
      status: 'success',
      command: 'scroll',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { direction, amount },
    };
  }

  async resolveRuntimeTargetRefs(
    action: string,
    params: Record<string, unknown>,
    sessionId: string,
    generateLocatorFn: (targetRef: string, options?: { runtimeSessionId?: string }) => Promise<string | undefined>
  ): Promise<Record<string, unknown>> {
    const refKeys = this.getRuntimeTargetRefKeys(action);
    if (!refKeys.length) {
      return params;
    }

    let normalizedParams = params;
    for (const key of refKeys) {
      const value = normalizedParams[key];
      if (!this.isRuntimeTargetRef(value)) {
        continue;
      }

      const targetRef = value.trim();
      const resolvedLocator = await generateLocatorFn(targetRef, {
        runtimeSessionId: sessionId,
      });
      if (!resolvedLocator) {
        throw new Error(`Failed to resolve runtime target ref: ${targetRef}`);
      }

      if (normalizedParams === params) {
        normalizedParams = { ...params };
      }
      normalizedParams[key] = resolvedLocator;
    }

    return normalizedParams;
  }

  getRuntimeTargetRefKeys(action: string): string[] {
    switch (action) {
      case 'click':
      case 'fill':
      case 'hover':
      case 'press':
      case 'press_key':
      case 'wait':
      case 'screenshot':
      case 'snapshot':
      case 'read_page':
      case 'get_text':
        return ['target', 'selector'];
      case 'drag':
        return ['src', 'dst'];
      default:
        return [];
    }
  }

  isRuntimeTargetRef(value: unknown): value is string {
    return typeof value === 'string' && EPHEMERAL_REF_RE.test(value.trim());
  }

  buildPlaceholderFallbackArgs(
    command: string,
    args: string[],
    error: unknown
  ): string[] | undefined {
    if (command !== 'fill' || args.length < 2) {
      return undefined;
    }

    const errorMessage = error instanceof Error ? error.message : String(error || '');
    if (!LOCATOR_ERROR_PATTERN.test(errorMessage)) {
      return undefined;
    }

    const [target, ...restArgs] = args;
    if (!target) {
      return undefined;
    }

    const placeholder = this.extractRoleTextboxName(target);
    if (placeholder) {
      return [this.buildPlaceholderSelector(placeholder), ...restArgs];
    }

    const labelText = this.extractLabelText(target);
    if (labelText) {
      const candidates = this.buildAdjacentInputSelectors(labelText);
      if (candidates[0]) {
        return [candidates[0], ...restArgs];
      }
    }

    return undefined;
  }

  buildLabelFallbackArgsList(command: string, args: string[]): string[][] {
    if (command !== 'fill' || args.length < 2) {
      return [];
    }
    const [target, ...restArgs] = args;
    if (!target) {
      return [];
    }
    const labelText = this.extractLabelText(target);
    if (!labelText) {
      return [];
    }
    return this.buildAdjacentInputSelectors(labelText)
      .slice(1)
      .map((selector) => [selector, ...restArgs]);
  }

  extractLabelText(target: string): string | undefined {
    const match = target.match(/^(?:internal:)?label=(['"]?)(.+?)\1$/i);
    return match?.[2]?.trim() || undefined;
  }

  buildAdjacentInputSelectors(labelText: string): string[] {
    const escaped = labelText.replace(/"/g, '\\"');
    const regexEscaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
      `label:has-text("${escaped}") >> input >> visible=true >> nth=0`,
      `label:has-text("${escaped}") >> select >> visible=true >> nth=0`,
      `text="${escaped}" >> xpath=ancestor::tr[1] >> input[type="password"] >> visible=true >> nth=0`,
      `text="${escaped}" >> xpath=ancestor::tr[1] >> input:not([type="hidden"]):not([type="button"]):not([type="submit"]) >> visible=true >> nth=0`,
      `text="${escaped}" >> xpath=ancestor::tr[1] >> select >> visible=true >> nth=0`,
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> input[type="password"] >> visible=true >> nth=0`,
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> input:not([type="hidden"]):not([type="button"]):not([type="submit"]) >> visible=true >> nth=0`,
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> select >> visible=true >> nth=0`,
    ];
  }

  normalizeSemanticRoleSelector(target: string): string {
    if (!target || /^role=/i.test(target)) {
      return target;
    }

    const labelHasTextMatch = target.match(/^label:has-text\((['"]?)(.+?)\1\)$/i);
    if (labelHasTextMatch?.[2]) {
      return `internal:label="${labelHasTextMatch[2].trim()}"`;
    }

    const match = target.match(/^([a-z_][\w-]*)\[name=(['"]?)(.+?)\2\]$/i);
    if (!match?.[1] || !match[3]) {
      return target;
    }

    const role = match[1].trim().toLowerCase();
    if (!PLAYWRIGHT_ARIA_ROLES.has(role)) {
      return target;
    }

    const name = match[3].trim().replace(/"/g, '\\"');
    return `role=${role}[name="${name}"]`;
  }

  parseNthMatchSelector(target: string): {
    selector: string;
    index: number;
  } | null {
    const trimmed = target.trim();
    const match = trimmed.match(/^:nth-match\((.+),\s*(\d+)\)$/);
    if (!match?.[1] || !match[2]) {
      return null;
    }

    const index = Number(match[2]);
    if (!Number.isInteger(index) || index <= 0) {
      return null;
    }

    return {
      selector: match[1].trim(),
      index: index - 1,
    };
  }

  async executePositionalSelectorAction(
    sessionId: string,
    target: string,
    action: 'click'
  ): Promise<CliActionResult | null> {
    const positionalSelector = this.parseNthMatchSelector(target);
    if (!positionalSelector) {
      return null;
    }

    await this.ensureReady(sessionId);
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const locatorExpr = `scope.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`;
    const actionCode =
      action === 'click' ? `await locator.click({ force: true, timeout: 5000 });` : 'return null;';
    const settleTimeout = this.config.cliPageSettleTimeoutMs;
    const script = `async page => {
      const activePage = ${activePageExpr};
      await activePage.waitForLoadState('domcontentloaded', { timeout: ${settleTimeout} }).catch(() => {});
      await activePage.waitForLoadState('networkidle', { timeout: ${settleTimeout} }).catch(() => {});
      const runWithin = async (scope, matchedIn) => {
        const locator = ${locatorExpr};
        const count = await locator.count().catch(() => 0);
        if (!count) return null;
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        ${actionCode}
        return JSON.stringify({
          target: ${JSON.stringify(target)},
          selector: ${JSON.stringify(positionalSelector.selector)},
          index: ${positionalSelector.index},
          matchedIn,
        });
      };

      const pageResult = await runWithin(activePage, 'page').catch(() => null);
      if (pageResult) {
        return pageResult;
      }

      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        const frameResult = await runWithin(frame, 'iframe').catch(() => null);
        if (frameResult) {
          return frameResult;
        }
      }

      throw new Error(${JSON.stringify(`Positional selector action failed: ${target}`)});
    }`;

    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, `${action} failed`);
    if (action === 'click') {
      await this.settle(sessionId);
    }
    return {
      status: 'success',
      command: action,
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        target,
        selector: positionalSelector.selector,
        index: positionalSelector.index,
      },
    };
  }

  async executeStrictModeFirstFallback(
    sessionId: string,
    selector: string
  ): Promise<CliExecResult | undefined> {
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const script = `async page => {
      const activePage = ${activePageExpr};
      const tryFirst = async (scope) => {
        const loc = scope.locator(${JSON.stringify(selector)}).first();
        const count = await loc.count().catch(() => 0);
        if (!count) return null;
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ force: true, timeout: 5000 });
        return JSON.stringify({ selector: ${JSON.stringify(selector)}, matchedIn: 'page', first: true });
      };
      const pageResult = await tryFirst(activePage).catch(() => null);
      if (pageResult) return pageResult;
      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        const frameResult = await tryFirst(frame).catch(() => null);
        if (frameResult) return frameResult;
      }
      throw new Error('strict-mode-first fallback found no element for: ' + ${JSON.stringify(selector)});
    }`;

    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'strict-mode-first fallback failed');
    await this.settle(sessionId);
    return result;
  }

  extractRoleTextboxName(target: string): string | undefined {
    const match = target.match(/^(?:role=)?textbox\[name=(['"]?)(.+?)\1\]$/i);
    return match?.[2]?.trim() || undefined;
  }

  buildPlaceholderSelector(placeholder: string): string {
    const escapedPlaceholder = placeholder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `input[placeholder="${escapedPlaceholder}"], textarea[placeholder="${escapedPlaceholder}"]`;
  }
}
