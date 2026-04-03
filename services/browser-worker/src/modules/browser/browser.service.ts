import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as http from 'http';

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export interface BrowserSession {
  id: string;
  status: 'idle' | 'ready' | 'executing' | 'error';
  createdAt: Date;
}

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private session: BrowserSession | null = null;

  // Chrome CDP endpoint in browser-chrome container
  private readonly chromeHost = process.env.CHROME_REMOTE_DEBUGGING_HOST || 'browser-chrome';
  private readonly chromePort = parseInt(process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222', 10);
  private readonly codegenPort = parseInt(process.env.CODEGEN_API_PORT || '3000', 10);

  async onModuleDestroy() {
    if (this.session) {
      await this.resetBrowser();
    }
  }

  async initBrowser(): Promise<{ success: boolean; message: string }> {
    this.logger.log('Initializing browser for AI control');

    try {
      // Start AI control browser via codegen API
      const result = await this.startAIBrowser('about:blank');

      if (!result.success) {
        return { success: false, message: result.message || 'Failed to start AI browser' };
      }

      this.session = {
        id: `ai-${Date.now()}`,
        status: 'ready',
        createdAt: new Date(),
      };

      this.logger.log('Browser initialized successfully');
      return { success: true, message: 'Browser session initialized' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize browser: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }
  }

  private async startAIBrowser(url: string): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/ai/start?url=${encodeURIComponent(url)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.status === 'started') {
                resolve({ success: true });
              } else {
                resolve({ success: false, message: result.error || 'Unknown error' });
              }
            } catch {
              resolve({ success: false, message: 'Failed to parse response' });
            }
          });
        }
      );
      req.on('error', (err) => {
        resolve({ success: false, message: err.message });
      });
      req.setTimeout(30000, () => {
        req.destroy();
        resolve({ success: false, message: 'AI browser start timeout' });
      });
    });
  }

  async executeCommands(commands: MCPCommand[]): Promise<{ success: boolean; results: any[]; message?: string }> {
    if (!this.session) {
      return { success: false, results: [], message: 'Browser not initialized' };
    }

    // If session is in error state, try to recover
    if (this.session.status === 'error') {
      this.logger.log('Session in error state, attempting recovery...');
      this.session.status = 'ready';
    }

    if (this.session.status !== 'ready') {
      return { success: false, results: [], message: `Browser not ready (status: ${this.session.status})` };
    }

    this.session.status = 'executing';
    const results: any[] = [];

    try {
      for (const command of commands) {
        this.logger.log(`Executing command: ${command.tool} with params: ${JSON.stringify(command.params)}`);
        try {
          const result = await this.executeCommand(command);
          results.push(result);
        } catch (cmdError: unknown) {
          const cmdErrorMsg = cmdError instanceof Error ? cmdError.message : 'Unknown error';
          this.logger.error(`Command ${command.tool} failed: ${cmdErrorMsg}`);
          results.push({ status: 'error', message: cmdErrorMsg });
          // Continue with next command instead of stopping
        }
      }

      this.session.status = 'ready';
      return { success: true, results };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.session.status = 'error';
      this.logger.error(`Command execution failed: ${errorMsg}`);
      return { success: false, results, message: errorMsg };
    }
  }

  private async executeCommand(command: MCPCommand): Promise<any> {
    switch (command.tool) {
      case 'navigate':
        return await this.navigate(command.params.url as string);
      case 'click':
        return await this.click(command.params.selector as string, command.params.text as string);
      case 'click_result':
        return await this.clickResult(command.params.index as number);
      case 'fill':
        return await this.fill(command.params.selector as string, command.params.value as string);
      case 'screenshot':
        return await this.screenshot();
      case 'snapshot':
        return await this.snapshot();
      case 'read_page':
        return await this.readPage(command.params.selector as string, command.params.max_length as number);
      case 'wait':
        return await this.wait(command.params.selector as string, command.params.duration as number);
      case 'hover':
        return await this.hover(command.params.selector as string);
      case 'press_key':
        return await this.pressKey(command.params.key as string);
      case 'evaluate':
        return await this.evaluate(command.params.script as string);
      default:
        throw new Error(`Unknown command: ${command.tool}`);
    }
  }

  async resetBrowser(): Promise<void> {
    // Stop AI browser session
    return new Promise<void>((resolve) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/ai/stop`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            this.session = null;
            resolve();
          });
        }
      );
      req.on('error', (err) => {
        this.logger.warn(`Stop AI browser request failed: ${err.message}`);
        this.session = null;
        resolve();
      });
      req.setTimeout(5000, () => {
        req.destroy();
        this.session = null;
        resolve();
      });
    });
  }

  private async navigate(url: string): Promise<{ status: string; url: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/navigate?url=${encodeURIComponent(url)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: 'success', url: result.url || url });
            } catch {
              resolve({ status: 'success', url });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(30000, () => {  // Increased from 15s to 30s
        req.destroy();
        reject(new Error('Navigate timeout'));
      });
    });
  }

  private async click(selector?: string, text?: string): Promise<{ status: string }> {
    const target = text || selector;
    if (!target) {
      throw new Error('Click requires selector or text');
    }

    return new Promise((resolve, reject) => {
      const url = text
        ? `http://${this.chromeHost}:${this.codegenPort}/click?text=${encodeURIComponent(text)}`
        : `http://${this.chromeHost}:${this.codegenPort}/click?selector=${encodeURIComponent(selector!)}`;

      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({ status: result.status || 'success' });
          } catch {
            resolve({ status: 'success' });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Click timeout'));
      });
    });
  }

  private async clickResult(index: number): Promise<{ status: string; message?: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/click_result?index=${index}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: result.status || 'success', message: result.message });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Click result timeout'));
      });
    });
  }

  private async fill(selector: string, value: string): Promise<{ status: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/fill?selector=${encodeURIComponent(selector)}&value=${encodeURIComponent(value)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: result.status || 'success' });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Fill timeout'));
      });
    });
  }

  private async screenshot(): Promise<{ status: string; screenshot?: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/screenshot`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: 'success', screenshot: result.screenshot });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Screenshot timeout'));
      });
    });
  }

  private async snapshot(): Promise<{ status: string; snapshot?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/snapshot`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: 'success', snapshot: result.snapshot });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Snapshot timeout'));
      });
    });
  }

  private async wait(selector?: string, duration?: number): Promise<{ status: string }> {
    return new Promise((resolve, reject) => {
      let url = `http://${this.chromeHost}:${this.codegenPort}/wait`;
      if (selector) {
        url += `?selector=${encodeURIComponent(selector)}`;
      } else if (duration) {
        url += `?duration=${duration}`;
      }

      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: 'success' }));
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Wait timeout'));
      });
    });
  }

  private async hover(selector: string): Promise<{ status: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/hover?selector=${encodeURIComponent(selector)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ status: 'success' }));
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Hover timeout'));
      });
    });
  }

  private async pressKey(key: string): Promise<{ status: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/press?key=${encodeURIComponent(key)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ status: 'success' }));
        }
      );
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Press timeout'));
      });
    });
  }

  private async evaluate(script: string): Promise<{ status: string; result?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/evaluate?script=${encodeURIComponent(script)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({ status: 'success', result: result.result });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Evaluate timeout'));
      });
    });
  }

  getSession(): BrowserSession | null {
    return this.session;
  }

  isReady(): boolean {
    return this.session !== null && this.session.status === 'ready';
  }
}