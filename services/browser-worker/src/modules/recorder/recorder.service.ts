import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as dns from 'dns';

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

  // Chrome CDP endpoint from browser-chrome container
  private readonly chromeHost = process.env.CHROME_REMOTE_DEBUGGING_HOST || 'host.docker.internal';
  private readonly chromePort = parseInt(process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222', 10);
  private resolvedIp: string | null = null;

  constructor() {
    this.resolveChromeHost();
  }

  private async resolveChromeHost(): Promise<void> {
    // Resolve hostname to IP address to avoid Chrome Host header check
    if (this.chromeHost === 'localhost' || this.chromeHost === 'host.docker.internal') {
      this.resolvedIp = this.chromeHost;
      return;
    }

    try {
      // Try DNS resolution
      const addresses = await new Promise<string[]>((resolve, reject) => {
        dns.lookup(this.chromeHost, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses ? [addresses] : []);
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

    // Check if Chrome CDP is available
    await this.waitForBrowser();

    // Navigate to the target URL via CDP
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
        // Try resolving DNS again on failure
        await this.resolveChromeHost();
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Browser failed to start - Chrome CDP not available');
  }

  private async navigateToUrl(url: string): Promise<void> {
    const http = await import('http');
    const host = this.getChromeHost();

    const pages = await new Promise<any[]>((resolve, reject) => {
      const req = http.get(`http://${host}:${this.chromePort}/json/list`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
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

    if (pages.length > 0) {
      const pageId = pages[0].id;
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: host,
            port: this.chromePort,
            path: `/json/navigate?pageId=${pageId}&url=${encodeURIComponent(url)}`,
            method: 'GET',
          },
          (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Navigate failed: ${res.statusCode}`));
            }
          },
        );
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        req.end();
      });
      this.logger.log(`Navigated to ${url}`);
    }
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