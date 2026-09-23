import { Injectable, Logger } from '@nestjs/common';
import { getBrowserWorkerUrl, getInternalAuthHeaders } from '../../config/service-endpoints';
import type { ExecutionResult } from './cdp-executor.types';

@Injectable()
export class CdpWorkerClientService {
  private readonly logger = new Logger(CdpWorkerClientService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();

  async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.logger.log(`POST ${path} with body: ${JSON.stringify(body)}`);
    const response = await fetch(`${this.browserWorkerUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getInternalAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      this.logger.error(`Request failed ${path}: ${response.status} ${text}`);
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse response: ${text}`);
    }
  }

  async startBrowser(
    sessionId: string,
    url: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(`Starting browser for session ${sessionId} at ${url}`);
      const result = await this.postJson<{ success: boolean; message?: string }>('/browser/init', {
        runtimeSessionId: sessionId,
        initialUrl: url,
        backend: 'cli',
      });
      return result.success
        ? { success: true }
        : { success: false, error: result.message || 'Failed to start browser' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start browser: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async navigateToUrl(
    url: string,
    sessionId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const sid = sessionId || `session-${Date.now()}`;
    return this.startBrowser(sid, url);
  }

  async closeBrowser(sessionId?: string): Promise<void> {
    try {
      const result = await this.postJson<{ success: boolean }>('/browser/reset', {
        runtimeSessionId: sessionId,
        backend: 'cli',
      });
      this.logger.log(`Browser stopped: ${result.success}`);
    } catch (error) {
      this.logger.warn(`Failed to stop browser: ${error}`);
    }
  }

  async captureFinalState(
    sessionId?: string,
    backend: string = 'cli',
    extractedPage?: Pick<ExecutionResult, 'text' | 'html'>,
    extractHtmlFn?: (raw?: unknown) => string | undefined
  ): Promise<ExecutionResult> {
    try {
      const reuseExtractedPage = Boolean(extractedPage?.text || extractedPage?.html);
      const commands = reuseExtractedPage
        ? [{ tool: 'screenshot', params: {} }]
        : [
            { tool: 'read_page', params: { max_length: 30000 } },
            { tool: 'screenshot', params: {} },
          ];
      const result = await this.postJson<{
        success: boolean;
        results: Array<Record<string, unknown>>;
        message?: string;
      }>('/browser/execute', {
        runtimeSessionId: sessionId,
        backend,
        commands,
      });

      const rawPage: any = reuseExtractedPage ? {} : result.results?.[0] || {};
      const rawPageData: any = rawPage.data || {};
      const rawScreenshot: any = result.results?.[reuseExtractedPage ? 0 : 1] || {};
      const pageSuccess = reuseExtractedPage || rawPage.status !== 'error';
      const screenshotSuccess = !rawScreenshot?.status || rawScreenshot.status !== 'error';
      return {
        success: pageSuccess,
        step_id: 'final_state',
        action: 'final_state',
        error: pageSuccess
          ? undefined
          : String(
              rawPage.message ||
                rawScreenshot.message ||
                result.message ||
                'Final state capture failed'
            ),
        message:
          typeof rawPage.message === 'string' &&
          rawPage.message &&
          !rawPage.message.includes('### Result')
            ? rawPage.message
            : typeof result.message === 'string' &&
                result.message &&
                !result.message.includes('### Result')
              ? result.message
              : '最终状态捕获成功',
        screenshot:
          screenshotSuccess && typeof rawScreenshot.screenshot === 'string'
            ? rawScreenshot.screenshot
            : typeof rawPage.screenshot === 'string'
              ? rawPage.screenshot
              : undefined,
        text:
          typeof extractedPage?.text === 'string'
            ? extractedPage.text
            : typeof rawPageData.text === 'string'
              ? rawPageData.text
              : typeof rawPage.text === 'string'
                ? rawPage.text
                : undefined,
        html:
          typeof extractedPage?.html === 'string'
            ? extractedPage.html
            : extractHtmlFn
              ? extractHtmlFn(rawPage.html)
              : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Final state capture failed: ${errorMsg}`);
      return {
        success: false,
        step_id: 'final_state',
        action: 'final_state',
        error: errorMsg,
      };
    }
  }

  emitDebugEvent(location: string, msg: string, data: Record<string, unknown>): void {
    try {
      const debugUrl = process.env.SESSION_EXECUTION_DEBUG_ENDPOINT?.trim();
      if (!debugUrl) {
        return;
      }
      fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: process.env.SESSION_EXECUTION_DEBUG_SESSION_ID || 'session-execution',
          runId: process.env.SESSION_EXECUTION_DEBUG_RUN_ID || 'runtime',
          location,
          msg,
          data,
          ts: Date.now(),
        }),
      }).catch(() => {});
    } catch {
      // debug emission must never throw
    }
  }
}
