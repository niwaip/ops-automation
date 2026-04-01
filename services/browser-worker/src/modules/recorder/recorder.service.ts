import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as http from 'http';

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

  // Codegen API endpoint in browser-chrome container
  private readonly codegenHost = process.env.CHROME_REMOTE_DEBUGGING_HOST || 'browser-chrome';
  private readonly codegenPort = parseInt(process.env.CODEGEN_API_PORT || '3000', 10);

  constructor(private eventEmitter: EventEmitter2) {}

  async onModuleDestroy() {
    for (const [id, session] of this.sessions) {
      await this.stopBrowser(id);
    }
  }

  async startBrowser(sessionId: string, startUrl: string): Promise<{ cdpPort: number; noVncPort: number }> {
    this.logger.log(`Starting codegen for session ${sessionId}`);
    this.logger.log(`Calling codegen API at http://${this.codegenHost}:${this.codegenPort}`);

    // Check if codegen API is available
    await this.waitForCodegenApi();

    // Start codegen via API
    const success = await this.startCodegen(sessionId, startUrl);
    if (!success) {
      throw new Error('Failed to start codegen');
    }

    const session: BrowserSession = {
      id: sessionId,
      status: 'recording',
      url: startUrl,
      script: '',
      cdpPort: 9222,
      noVncPort: 6080,
    };

    this.sessions.set(sessionId, session);

    // Start polling for script updates
    this.pollScript(sessionId);

    return { cdpPort: 9222, noVncPort: 6080 };
  }

  private async waitForCodegenApi(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://${this.codegenHost}:${this.codegenPort}/health`, (res) => {
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
        this.logger.log(`Codegen API is ready at http://${this.codegenHost}:${this.codegenPort}`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Codegen API not available');
  }

  private async startCodegen(sessionId: string, url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get(
        `http://${this.codegenHost}:${this.codegenPort}/start?session=${encodeURIComponent(sessionId)}&url=${encodeURIComponent(url)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              this.logger.log(`Codegen start response: ${JSON.stringify(result)}`);
              resolve(result.status === 'started');
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on('error', (err) => {
        this.logger.error(`Failed to start codegen: ${err.message}`);
        resolve(false);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private pollScript(sessionId: string): void {
    const interval = setInterval(async () => {
      const session = this.sessions.get(sessionId);
      if (!session || session.status !== 'recording') {
        clearInterval(interval);
        return;
      }

      try {
        const script = await this.getScript();
        if (script && script !== session.script) {
          session.script = script;
          this.logger.log(`Script updated for session ${sessionId}`);
          // Emit event for real-time updates
          this.eventEmitter.emit('script.updated', { sessionId, script });
        }
      } catch (err) {
        this.logger.error(`Failed to poll script: ${err}`);
      }
    }, 2000);

    // Store interval for cleanup on the session
    const session = this.sessions.get(sessionId);
    if (session) {
      (session as any).__pollInterval = interval;
    }
  }

  private async getScript(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const req = http.get(`http://${this.codegenHost}:${this.codegenPort}/script`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result.script || '');
          } catch {
            reject(new Error('Failed to parse script response'));
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

  async stopBrowser(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.logger.log(`Stopping codegen for session ${sessionId}`);

    // Clear poll interval
    const pollInterval = (session as any).__pollInterval;
    if (pollInterval) {
      clearInterval(pollInterval);
    }

    // Stop codegen via API and get final script
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const req = http.get(`http://${this.codegenHost}:${this.codegenPort}/stop`, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Failed to parse stop response'));
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });

      if (result.script) {
        session.script = result.script;
        this.logger.log(`Final script received: ${session.script.length} chars`);
      }
    } catch (err) {
      this.logger.error(`Failed to stop codegen: ${err}`);
    }

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
}