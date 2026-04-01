import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as dns from 'dns';
import WebSocket from 'ws';

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

interface BrowserSession {
  id: string;
  status: RecorderStatus;
  url: string;
  script: string;
  cdpPort: number;
  noVncPort: number;
}

@Injectable()
export class RecorderService implements OnModuleDestroy {
  private readonly logger = new Logger(RecorderService.name);
  private sessions: Map<string, BrowserSession> = new Map();

  private readonly chromeHost = process.env.CHROME_REMOTE_DEBUGGING_HOST || 'host.docker.internal';
  private readonly chromePort = parseInt(process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222', 10);
  private resolvedIp: string | null = null;

  constructor() {
    this.resolveChromeHost();
  }

  private async resolveChromeHost(): Promise<void> {
    if (this.chromeHost === 'localhost' || this.chromeHost === 'host.docker.internal') {
      this.resolvedIp = this.chromeHost;
      return;
    }

    try {
      const addresses = await new Promise<string[]>((resolve, reject) => {
        dns.lookup(this.chromeHost, (err, address) => {
          if (err) reject(err);
          else resolve(address ? [address] : []);
        });
      });

      if (addresses.length > 0) {
        this.resolvedIp = addresses[0];
        this.logger.log(`Resolved ${this.chromeHost} to ${this.resolvedIp}`);
      } else {
        this.resolvedIp = this.chromeHost;
      }
    } catch (err) {
      this.logger.warn(`Failed to resolve ${this.chromeHost}, using as-is: ${err}`);
      this.resolvedIp = this.chromeHost;
    }
  }

  async onModuleDestroy() {
    for (const [id, session] of this.sessions) {
      await this.stopBrowser(id);
    }
  }

  private getChromeHost(): string {
    return this.resolvedIp || this.chromeHost;
  }

  async startBrowser(sessionId: string, startUrl: string): Promise<{ cdpPort: number; noVncPort: number }> {
    this.logger.log(`Starting browser for session ${sessionId}`);
    const host = this.getChromeHost();
    this.logger.log(`Connecting to Chrome at ${host}:${this.chromePort}`);

    await this.waitForBrowser();
    await this.navigateToUrl(startUrl);

    const session: BrowserSession = {
      id: sessionId,
      status: 'recording',
      url: startUrl,
      script: '',
      cdpPort: this.chromePort,
      noVncPort: 6080,
    };

    this.sessions.set(sessionId, session);
    session.script = this.generateInitialScript(startUrl);

    return { cdpPort: this.chromePort, noVncPort: 6080 };
  }

  private async waitForBrowser(maxAttempts = 30): Promise<void> {
    const http = await import('http');
    const host = this.getChromeHost();

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://${host}:${this.chromePort}/json/version`, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error('Not ready'));
            }
          });
          req.on('error', reject);
          req.setTimeout(1000, () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });
        this.logger.log(`Chrome CDP is ready at ${host}:${this.chromePort}`);
        return;
      } catch {
        await this.resolveChromeHost();
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Browser failed to start - Chrome CDP not available');
  }

  private async getWebSocketDebuggerUrl(): Promise<string> {
    const http = await import('http');
    const host = this.getChromeHost();

    return new Promise<string>((resolve, reject) => {
      const req = http.get(`http://${host}:${this.chromePort}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const pages = JSON.parse(data);
            if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
              resolve(pages[0].webSocketDebuggerUrl);
            } else {
              reject(new Error('No page with WebSocket URL found'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  private async navigateToUrl(url: string): Promise<void> {
    const host = this.getChromeHost();
    this.logger.log(`Navigating to ${url} via WebSocket CDP`);

    // Get WebSocket debugger URL and replace localhost with actual host
    let wsUrl = await this.getWebSocketDebuggerUrl();
    // Replace localhost in WebSocket URL with the resolved IP
    wsUrl = wsUrl.replace('localhost', host);
    this.logger.log(`Connecting to WebSocket: ${wsUrl}`);

    // Connect to page WebSocket
    const ws = new WebSocket(wsUrl);

    return new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        this.logger.log('WebSocket connected, sending Page.navigate command');

        // Send Page.navigate command
        const navigateCommand = {
          id: 1,
          method: 'Page.navigate',
          params: { url }
        };
        ws.send(JSON.stringify(navigateCommand));
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          this.logger.log(`CDP response: ${JSON.stringify(response)}`);

          if (response.id === 1) {
            if (response.error) {
              ws.close();
              reject(new Error(`Navigate error: ${response.error.message || JSON.stringify(response.error)}`));
            } else {
              this.logger.log(`Successfully navigated to ${url}`);
              ws.close();
              resolve();
            }
          }
        } catch (e) {
          this.logger.error(`Failed to parse CDP response: ${e}`);
        }
      });

      ws.on('error', (err) => {
        this.logger.error(`WebSocket error: ${err.message}`);
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on('close', () => {
        this.logger.log('WebSocket closed');
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
          reject(new Error('Navigate timeout'));
        }
      }, 10000);
    });
  }

  async stopBrowser(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.logger.log(`Stopping browser session ${sessionId}`);
    session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateScript(sessionId: string, script: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.script = script;
    }
  }

  private generateInitialScript(url: string): string {
    return `// Playwright Script - Recorded from Browser Control Plane
// Started at: ${new Date().toISOString()}
// Target URL: ${url}

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to start URL
  await page.goto('${url}');

  // ============================================
  // Your recorded actions will appear here
  // ============================================

  // Keep browser open for inspection
  // await browser.close();
})();
`;
  }
}