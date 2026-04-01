import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { spawn, ChildProcess } from 'child_process';

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

interface BrowserSession {
  id: string;
  status: RecorderStatus;
  url: string;
  script: string;
  process?: ChildProcess;
  cdpPort: number;
  noVncPort: number;
}

@Injectable()
export class RecorderService implements OnModuleDestroy {
  private readonly logger = new Logger(RecorderService.name);
  private sessions: Map<string, BrowserSession> = new Map();
  private nextCdpPort = 9222;
  private nextNoVncPort = 6080;

  constructor() {}

  async onModuleDestroy() {
    // Clean up all browser sessions
    for (const [id, session] of this.sessions) {
      await this.stopBrowser(id);
    }
  }

  async startBrowser(sessionId: string, startUrl: string): Promise<{ cdpPort: number; noVncPort: number }> {
    const cdpPort = this.nextCdpPort++;
    const noVncPort = this.nextNoVncPort++;

    this.logger.log(`Starting browser for session ${sessionId} on CDP port ${cdpPort}`);

    // Use Chrome with remote debugging
    const chromeArgs = [
      '--remote-debugging-port=' + cdpPort,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu-sandbox',
      '--disable-dev-shm-usage',
      '--auto-open-devtools-for-tabs',
      startUrl,
    ];

    // Try to find Chrome on macOS
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    const browserProcess = spawn(chromePath, chromeArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const session: BrowserSession = {
      id: sessionId,
      status: 'recording',
      url: startUrl,
      script: '',
      process: browserProcess,
      cdpPort,
      noVncPort,
    };

    browserProcess.on('error', (err) => {
      this.logger.error(`Browser process error: ${err.message}`);
      session.status = 'error';
    });

    browserProcess.on('exit', (code) => {
      this.logger.log(`Browser process exited with code ${code}`);
      session.status = 'stopped';
    });

    this.sessions.set(sessionId, session);

    // Wait for browser to start
    await this.waitForBrowser(cdpPort);

    // Generate initial script
    session.script = this.generateInitialScript(startUrl);

    return { cdpPort, noVncPort };
  }

  private async waitForBrowser(port: number, maxAttempts = 30): Promise<void> {
    const http = await import('http');

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://localhost:${port}/json/version`, (res) => {
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
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Browser failed to start');
  }

  async stopBrowser(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.process) {
      return;
    }

    this.logger.log(`Stopping browser for session ${sessionId}`);

    try {
      // Gracefully close browser via CDP
      const http = await import('http');
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: session.cdpPort,
            path: '/json/close',
            method: 'GET',
          },
          () => resolve(),
        );
        req.on('error', () => resolve());
        req.end();
      });

      // Force kill if still running
      setTimeout(() => {
        if (session.process && !session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, 3000);
    } catch (err) {
      session.process.kill('SIGKILL');
    }

    session.status = 'stopped';
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