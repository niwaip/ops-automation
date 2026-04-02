import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright-core';

export interface TemplateStep {
  step_id: string;
  action: string;
  params?: Record<string, unknown>;
  locator?: { type: string; value: string };
  wait?: { type: string; value?: string; timeout?: number };
  retry?: { max_attempts: number; delay_ms: number };
  on_fail?: string;
}

export interface ExecutionResult {
  success: boolean;
  step_id: string;
  error?: string;
  screenshot?: string;
}

@Injectable()
export class CdpExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(CdpExecutor.name);

  // Browser connection settings
  private readonly cdpHost = process.env.CDP_HOST || 'localhost';
  private readonly cdpPort = process.env.CDP_PORT || '9222';

  // Playwright browser instance
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  /**
   * Connect to remote Chrome via CDP
   */
  private async connect(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    const cdpEndpoint = `http://${this.cdpHost}:${this.cdpPort}`;
    this.logger.log(`Connecting to Chrome via CDP: ${cdpEndpoint}`);

    try {
      this.browser = await chromium.connectOverCDP(cdpEndpoint);
      this.logger.log('Connected to Chrome successfully');
      return this.browser;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to Chrome: ${errorMsg}`);
      throw new Error(`Failed to connect to Chrome: ${errorMsg}`);
    }
  }

  /**
   * Get or create a page
   */
  private async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const browser = await this.connect();
    const contexts = browser.contexts();

    if (contexts.length > 0) {
      this.context = contexts[0];
    } else {
      this.context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
    }

    const pages = this.context.pages();
    if (pages.length > 0) {
      this.page = pages[0];
    } else {
      this.page = await this.context.newPage();
    }

    return this.page;
  }

  /**
   * Close browser connection
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.logger.log('Browser connection closed');
    }
  }

  /**
   * Navigate to URL
   */
  async navigateToUrl(url: string, sessionId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();
      this.logger.log(`Navigating to: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      this.logger.log(`Navigated to ${url} successfully`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Navigation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Execute a single step
   */
  async executeStep(step: TemplateStep): Promise<ExecutionResult> {
    const page = await this.getPage();
    const maxAttempts = step.retry?.max_attempts || 1;
    const delayMs = step.retry?.delay_ms || 1000;

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Executing step ${step.step_id} (attempt ${attempt}/${maxAttempts}): ${step.action}`);

        switch (step.action) {
          case 'navigate':
            await this.executeNavigate(page, step);
            break;

          case 'click':
            await this.executeClick(page, step);
            break;

          case 'fill':
          case 'type':
            await this.executeFill(page, step);
            break;

          case 'wait':
            await this.executeWait(page, step);
            break;

          case 'screenshot':
            await this.executeScreenshot(page, step);
            break;

          case 'scroll':
            await this.executeScroll(page, step);
            break;

          case 'press':
            await this.executePress(page, step);
            break;

          default:
            this.logger.warn(`Unknown action: ${step.action}`);
        }

        this.logger.log(`Step ${step.step_id} completed successfully`);
        return { success: true, step_id: step.step_id };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Step ${step.step_id} attempt ${attempt} failed: ${lastError}`);

        if (attempt < maxAttempts) {
          await this.sleep(delayMs);
        }
      }
    }

    return { success: false, step_id: step.step_id, error: lastError };
  }

  /**
   * Execute navigate action
   */
  private async executeNavigate(page: Page, step: TemplateStep): Promise<void> {
    const url = step.params?.url as string;
    if (!url) throw new Error('Navigate action requires url parameter');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  /**
   * Execute click action
   */
  private async executeClick(page: Page, step: TemplateStep): Promise<void> {
    const locator = this.getLocator(page, step);
    await locator.click({ timeout: 10000 });
  }

  /**
   * Execute fill/type action
   */
  private async executeFill(page: Page, step: TemplateStep): Promise<void> {
    const locator = this.getLocator(page, step);
    const value = step.params?.value as string || step.params?.text as string || '';

    // Clear and fill
    await locator.clear();
    await locator.fill(value);
  }

  /**
   * Execute wait action
   */
  private async executeWait(page: Page, step: TemplateStep): Promise<void> {
    const waitType = step.wait?.type || step.params?.type as string;
    const waitValue = step.wait?.value || step.params?.value;
    const timeout = step.wait?.timeout || step.params?.timeout as number || 10000;

    switch (waitType) {
      case 'selector':
        await page.waitForSelector(waitValue as string, { timeout });
        break;

      case 'timeout':
      case 'time':
        await this.sleep(waitValue as number || 1000);
        break;

      case 'navigation':
        await page.waitForURL(waitValue as string || '**/*', { timeout });
        break;

      case 'load':
        await page.waitForLoadState('load', { timeout });
        break;

      default:
        await this.sleep(1000);
    }
  }

  /**
   * Execute screenshot action
   */
  private async executeScreenshot(page: Page, step: TemplateStep): Promise<void> {
    const path = step.params?.path as string || `/tmp/screenshot-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    this.logger.log(`Screenshot saved to ${path}`);
  }

  /**
   * Execute scroll action
   */
  private async executeScroll(page: Page, step: TemplateStep): Promise<void> {
    const direction = step.params?.direction as string || 'down';
    const amount = step.params?.amount as number || 500;

    if (direction === 'down') {
      await page.mouse.wheel(0, amount);
    } else if (direction === 'up') {
      await page.mouse.wheel(0, -amount);
    }
  }

  /**
   * Execute press action
   */
  private async executePress(page: Page, step: TemplateStep): Promise<void> {
    const key = step.params?.key as string || 'Enter';

    if (step.locator) {
      const locator = this.getLocator(page, step);
      await locator.press(key);
    } else {
      await page.keyboard.press(key);
    }
  }

  /**
   * Get Playwright locator from step definition
   */
  private getLocator(page: Page, step: TemplateStep): Locator {
    if (!step.locator) {
      throw new Error('Step requires locator definition');
    }

    const { type, value } = step.locator;

    switch (type) {
      case 'css':
        return page.locator(value);

      case 'xpath':
        return page.locator(`xpath=${value}`);

      case 'text':
        return page.locator(`text=${value}`);

      case 'role':
        // Parse role selector like "button[name=\"Submit\"]"
        const roleMatch = value.match(/(\w+)(?:\[name="([^"]+)"\])?/);
        if (roleMatch) {
          const role = roleMatch[1];
          const name = roleMatch[2];
          if (name) {
            return page.getByRole(role as any, { name });
          }
          return page.getByRole(role as any);
        }
        return page.locator(`role=${value}`);

      case 'placeholder':
        return page.getByPlaceholder(value);

      case 'label':
        return page.getByLabel(value);

      case 'testId':
        return page.getByTestId(value);

      default:
        return page.locator(value);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute all steps in a template
   */
  async executeSteps(steps: TemplateStep[], sessionId?: string): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const step of steps) {
      const result = await this.executeStep(step);
      results.push(result);

      if (!result.success && step.on_fail === 'stop') {
        this.logger.warn(`Stopping execution due to failed step ${step.step_id}`);
        break;
      }

      // Small delay between steps
      await this.sleep(500);
    }

    return results;
  }
}