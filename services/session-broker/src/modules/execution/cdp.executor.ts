import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CdpExecutor {
  private readonly logger = new Logger(CdpExecutor.name);

  // Browser-Chrome Codegen API endpoint
  // In Docker, use service name; locally use localhost
  private readonly browserHost = process.env.BROWSER_HOST ||
    (process.env.DOCKER_ENV ? 'ops-browser-chrome' : 'localhost');
  private readonly browserPort = process.env.BROWSER_PORT || '3000';

  /**
   * Start browser and navigate to URL via browser-chrome codegen API
   * Calls /start?session=<sessionId>&url=<url> to launch Playwright codegen
   */
  async navigateToUrl(url: string, sessionId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const apiUrl = `http://${this.browserHost}:${this.browserPort}`;

      this.logger.log(`Starting browser via codegen API: ${apiUrl}`);

      // Call codegen API to start browser with URL
      const sid = sessionId || `session-${Date.now()}`;
      const startUrl = `${apiUrl}/start?session=${encodeURIComponent(sid)}&url=${encodeURIComponent(url)}`;

      this.logger.log(`Calling: ${startUrl}`);

      const response = await fetch(startUrl);

      if (!response.ok) {
        const error = `Failed to start browser: ${response.status}`;
        this.logger.error(error);
        return { success: false, error };
      }

      const result = await response.json() as { status?: string; message?: string };
      this.logger.log(`Browser started: ${JSON.stringify(result)}`);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start browser: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Stop browser recording and get generated script
   */
  async stopBrowser(): Promise<{ success: boolean; script?: string; error?: string }> {
    try {
      const apiUrl = `http://${this.browserHost}:${this.browserPort}`;
      const response = await fetch(`${apiUrl}/stop`);

      if (!response.ok) {
        return { success: false, error: `Failed to stop: ${response.status}` };
      }

      const result = await response.json() as { script?: string };
      return { success: true, script: result.script };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get recording status
   */
  async getStatus(): Promise<{ recording: boolean; session?: string }> {
    try {
      const apiUrl = `http://${this.browserHost}:${this.browserPort}`;
      const response = await fetch(`${apiUrl}/status`);

      if (!response.ok) {
        return { recording: false };
      }

      return await response.json() as { recording: boolean; session?: string };
    } catch {
      return { recording: false };
    }
  }
}