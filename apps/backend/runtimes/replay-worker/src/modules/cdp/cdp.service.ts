import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as playwright from 'playwright-core';
import {
  CDPConnectionState,
  Locator,
  StepAction,
  StepActionParams,
  StepResult,
  AssertionResult,
  Assertion,
} from '../../interfaces';

/**
 * Default step timeout in milliseconds
 */
const DEFAULT_STEP_TIMEOUT_MS = 30000;

/**
 * CDP Client Service
 * Connects to browser via CDP and executes browser automation actions
 */
@Injectable()
export class CdpService implements OnModuleDestroy {
  private readonly logger = new Logger(CdpService.name);
  private browser: playwright.Browser | null = null;
  private page: playwright.Page | null = null;
  private context: playwright.BrowserContext | null = null;
  private connectionState: CDPConnectionState = {
    connected: false,
    cdp_url: '',
  };

  async onModuleDestroy() {
    await this.close();
  }

  /**
   * Connect to browser via CDP endpoint
   */
  async connect(cdpUrl: string): Promise<CDPConnectionState> {
    try {
      this.logger.log(`Connecting to CDP endpoint: ${cdpUrl}`);

      // Connect to existing browser via CDP
      this.browser = await playwright.chromium.connectOverCDP(cdpUrl);

      // Get the default context and page
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0] ?? null;
        if (this.context) {
          const pages = this.context.pages();
          if (pages.length > 0) {
            this.page = pages[0] ?? null;
          } else {
            this.page = await this.context.newPage();
          }
        }
      } else {
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
      }

      if (!this.page) {
        throw new Error('Failed to get page from browser');
      }

      this.connectionState = {
        connected: true,
        cdp_url: cdpUrl,
        page_id: this.page.url(),
        connected_at: new Date(),
      };

      this.logger.log(`Successfully connected to CDP: ${cdpUrl}`);
      return this.connectionState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to CDP: ${errorMessage}`);
      this.connectionState = {
        connected: false,
        cdp_url: cdpUrl,
      };
      throw new Error(`CDP connection failed: ${errorMessage}`);
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): CDPConnectionState {
    return this.connectionState;
  }

  /**
   * Execute a step action on the browser
   */
  async execute(
    action: StepAction,
    locator?: Locator,
    params?: StepActionParams,
    timeoutMs?: number
  ): Promise<StepResult> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;

    if (!this.page) {
      throw new Error('Not connected to browser. Call connect() first.');
    }

    try {
      this.logger.debug(`Executing action: ${action}`);

      let result: StepResult = {
        success: true,
        action,
        locator,
        duration_ms: 0,
      };

      switch (action) {
        case 'click':
          result = await this.executeClick(locator, timeout);
          break;
        case 'fill':
          result = await this.executeFill(locator, params?.value, timeout);
          break;
        case 'navigate':
          result = await this.executeNavigate(params?.url, timeout);
          break;
        case 'wait':
          result = await this.executeWait(params, timeout);
          break;
        case 'select':
          result = await this.executeSelect(locator, params?.value, timeout);
          break;
        case 'check':
          result = await this.executeCheck(locator, params?.checked ?? true, timeout);
          break;
        case 'screenshot':
          result = await this.executeScreenshot();
          break;
        case 'assert':
          result = await this.executeAssertion(locator, params, timeout);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      result.duration_ms = Date.now() - startTime;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Action ${action} failed: ${err.message}`);

      return {
        success: false,
        action,
        locator,
        duration_ms: Date.now() - startTime,
        error_class: err.constructor.name,
        error_message: err.message,
      };
    }
  }

  /**
   * Freeze browser input (pause CDP input handling)
   */
  async freeze(): Promise<void> {
    if (!this.page) {
      return;
    }

    this.logger.log('Freezing browser input');
    // In playwright, we can simulate freezing by setting a flag
    // Actual implementation would use CDP commands to disable input
    await this.page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__frozen__ = true;
    });
  }

  /**
   * Unfreeze browser input (resume CDP input handling)
   */
  async unfreeze(): Promise<void> {
    if (!this.page) {
      return;
    }

    this.logger.log('Unfreezing browser input');
    await this.page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__frozen__ = false;
    });
  }

  /**
   * Close CDP connection
   */
  async close(): Promise<void> {
    this.logger.log('Closing CDP connection');

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.context = null;
    }

    this.connectionState = {
      connected: false,
      cdp_url: '',
    };
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(): Promise<string | null> {
    if (!this.page) {
      return null;
    }

    try {
      const screenshot = await this.page.screenshot({
        type: 'png',
        fullPage: false,
      });
      // Return base64 encoded screenshot
      return screenshot?.toString('base64') ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get current page URL
   */
  getCurrentUrl(): string {
    return this.page?.url() ?? '';
  }

  /**
   * Get page title
   */
  getTitle(): string {
    return this.page?.url() ?? '';
  }

  // Private action execution methods

  private async buildLocator(locator: Locator): Promise<playwright.Locator> {
    if (!this.page) {
      throw new Error('Page not available');
    }

    const pwLocator = this.convertLocator(locator);

    // Try primary locator, then fallback
    try {
      await pwLocator.waitFor({ state: 'attached', timeout: 1000 });
      return pwLocator;
    } catch {
      if (locator.fallback) {
        const fallbackLocator = this.convertLocator(locator.fallback);
        await fallbackLocator.waitFor({ state: 'attached', timeout: 1000 });
        return fallbackLocator;
      }
      throw new Error(`Element not found: ${locator.value}`);
    }
  }

  private convertLocator(locator: Locator): playwright.Locator {
    if (!this.page) {
      throw new Error('Page not available');
    }

    switch (locator.type) {
      case 'role':
        // Use generic locator for role with name
        return this.page.locator(`role=${locator.value}`);
      case 'text':
        return this.page.getByText(locator.value);
      case 'label':
        return this.page.getByLabel(locator.value, { exact: false });
      case 'test-id':
        return this.page.getByTestId(locator.value);
      case 'css':
        return this.page.locator(locator.value);
      case 'xpath':
        return this.page.locator(`xpath=${locator.value}`);
      default:
        return this.page.locator(locator.value);
    }
  }

  private async executeClick(locator: Locator | undefined, timeout: number): Promise<StepResult> {
    if (!locator) {
      throw new Error('Click action requires a locator');
    }

    const pwLocator = await this.buildLocator(locator);
    await pwLocator.click({ timeout });

    return {
      success: true,
      action: 'click',
      locator,
      duration_ms: 0,
    };
  }

  private async executeFill(
    locator: Locator | undefined,
    value: string | undefined,
    timeout: number
  ): Promise<StepResult> {
    if (!locator) {
      throw new Error('Fill action requires a locator');
    }
    if (!value) {
      throw new Error('Fill action requires a value');
    }

    const pwLocator = await this.buildLocator(locator);
    await pwLocator.fill(value, { timeout });

    return {
      success: true,
      action: 'fill',
      locator,
      duration_ms: 0,
    };
  }

  private async executeNavigate(url: string | undefined, timeout: number): Promise<StepResult> {
    if (!url) {
      throw new Error('Navigate action requires a URL');
    }

    if (!this.page) {
      throw new Error('Page not available');
    }

    await this.page.goto(url, { timeout, waitUntil: 'domcontentloaded' });

    return {
      success: true,
      action: 'navigate',
      duration_ms: 0,
    };
  }

  private async executeWait(
    params: StepActionParams | undefined,
    timeout: number
  ): Promise<StepResult> {
    if (!this.page) {
      throw new Error('Page not available');
    }

    const waitType = params?.wait_type ?? 'timeout';
    const waitValue = params?.wait_value ?? params?.timeout ?? 1000;

    if (waitType === 'timeout') {
      await this.page.waitForTimeout(waitValue as number);
    } else if (waitType === 'visible' && typeof waitValue === 'string') {
      await this.page.locator(waitValue).waitFor({ state: 'visible', timeout });
    } else if (waitType === 'hidden' && typeof waitValue === 'string') {
      await this.page.locator(waitValue).waitFor({ state: 'hidden', timeout });
    } else if (waitType === 'text' && typeof waitValue === 'string') {
      await this.page.waitForSelector(`text=${waitValue}`, { timeout });
    }

    return {
      success: true,
      action: 'wait',
      duration_ms: 0,
    };
  }

  private async executeSelect(
    locator: Locator | undefined,
    value: string | undefined,
    timeout: number
  ): Promise<StepResult> {
    if (!locator) {
      throw new Error('Select action requires a locator');
    }
    if (!value) {
      throw new Error('Select action requires a value');
    }

    const pwLocator = await this.buildLocator(locator);
    await pwLocator.selectOption(value, { timeout });

    return {
      success: true,
      action: 'select',
      locator,
      duration_ms: 0,
    };
  }

  private async executeCheck(
    locator: Locator | undefined,
    checked: boolean,
    timeout: number
  ): Promise<StepResult> {
    if (!locator) {
      throw new Error('Check action requires a locator');
    }

    const pwLocator = await this.buildLocator(locator);
    if (checked) {
      await pwLocator.check({ timeout });
    } else {
      await pwLocator.uncheck({ timeout });
    }

    return {
      success: true,
      action: 'check',
      locator,
      duration_ms: 0,
    };
  }

  private async executeScreenshot(): Promise<StepResult> {
    const screenshotRef = await this.takeScreenshot();

    return {
      success: true,
      action: 'screenshot',
      duration_ms: 0,
      screenshot_ref: screenshotRef ?? undefined,
    };
  }

  private async executeAssertion(
    locator: Locator | undefined,
    _params: StepActionParams | undefined,
    _timeout: number
  ): Promise<StepResult> {
    if (!this.page) {
      throw new Error('Page not available');
    }

    const assertionResults: AssertionResult[] = [];

    // Simple visibility assertion
    if (locator) {
      const pwLocator = await this.buildLocator(locator);
      const isVisible = await pwLocator.isVisible();

      assertionResults.push({
        type: 'visible',
        expected: true,
        actual: isVisible,
        passed: isVisible === true,
      });
    }

    const passed = assertionResults.every((r) => r.passed);

    return {
      success: passed,
      action: 'assert',
      locator,
      duration_ms: 0,
      assertion_results: assertionResults,
      error_message: passed ? undefined : 'Assertion failed',
    };
  }

  /**
   * Run assertions on the page
   */
  async runAssertions(assertions: Assertion[], _timeout: number): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await this.runSingleAssertion(assertion);
      results.push(result);
    }

    return results;
  }

  private async runSingleAssertion(assertion: Assertion): Promise<AssertionResult> {
    if (!this.page) {
      return {
        type: assertion.type,
        expected: assertion.expected,
        passed: false,
      };
    }

    switch (assertion.type) {
      case 'visible':
        if (assertion.locator) {
          const pwLocator = this.convertLocator(assertion.locator);
          const isVisible = await pwLocator.isVisible();
          return {
            type: 'visible',
            expected: assertion.expected,
            actual: isVisible,
            passed: isVisible === assertion.expected,
          };
        }
        break;
      case 'hidden':
        if (assertion.locator) {
          const pwLocator = this.convertLocator(assertion.locator);
          const isHidden = !(await pwLocator.isVisible());
          return {
            type: 'hidden',
            expected: assertion.expected,
            actual: isHidden,
            passed: isHidden === assertion.expected,
          };
        }
        break;
      case 'text':
        if (assertion.locator) {
          const pwLocator = this.convertLocator(assertion.locator);
          const text = await pwLocator.textContent();
          return {
            type: 'text',
            expected: assertion.expected,
            actual: text ?? undefined,
            passed: text === assertion.expected,
          };
        }
        break;
      case 'value':
        if (assertion.locator) {
          const pwLocator = this.convertLocator(assertion.locator);
          const value = await pwLocator.inputValue();
          return {
            type: 'value',
            expected: assertion.expected,
            actual: value,
            passed: value === assertion.expected,
          };
        }
        break;
      case 'count':
        if (assertion.locator) {
          const pwLocator = this.convertLocator(assertion.locator);
          const count = await pwLocator.count();
          return {
            type: 'count',
            expected: assertion.expected,
            actual: count,
            passed: count === assertion.expected,
          };
        }
        break;
    }

    return {
      type: assertion.type,
      expected: assertion.expected,
      passed: false,
    };
  }
}
