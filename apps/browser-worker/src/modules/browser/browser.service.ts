import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as http from 'http';
import {
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export interface BrowserSession {
  id: string;
  status: 'idle' | 'ready' | 'executing' | 'error';
  createdAt: Date;
  runtimeSessionId?: string;
  controlMode?: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozenReason?: string;
}

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private session: BrowserSession | null = null;

  // Chrome CDP endpoint in browser-chrome container
  private readonly chromeHost = process.env.CHROME_REMOTE_DEBUGGING_HOST || 'ops-browser-chrome';
  private readonly codegenPort = parseInt(process.env.CODEGEN_API_PORT || '3011', 10);

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
        controlMode: 'AGENT_RUNNING',
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

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    if (!this.session) {
      return {
        success: false,
        shouldTakeover: false,
        errorMessage: 'Browser not initialized',
      };
    }

    if (this.session.controlMode === 'HUMAN_CONTROL') {
      return {
        success: false,
        errorCode: 'RUNTIME_FROZEN',
        errorMessage: this.session.frozenReason || 'Browser session is under human control',
        shouldTakeover: true,
        takeoverReason: this.session.frozenReason || 'Browser session is under human control',
      };
    }

    this.session.runtimeSessionId = dto.runtimeSessionId;

    this.logger.log(`Executing step: ${dto.action} for execution ${dto.executionId}, step ${dto.stepId}`);

    try {
      let result: any;
      let snapshotId: string | undefined;

      switch (dto.action) {
        case 'goto':
          result = await this.navigate(dto.target || '');
          break;
        case 'click':
          result = await this.click(dto.target);
          break;
        case 'fill':
          if (dto.args?.value) {
            result = await this.fill(dto.target || '', dto.args.value as string);
          } else {
            throw new Error('fill action requires args.value');
          }
          break;
        case 'screenshot':
          result = await this.screenshot();
          snapshotId = `snap-${Date.now()}`;
          break;
        case 'snapshot':
          result = await this.snapshot();
          snapshotId = result.snapshot?.id || `snap-${Date.now()}`;
          break;
        case 'evaluate':
          if (dto.args?.script) {
            result = await this.evaluate(dto.args.script as string);
          } else {
            throw new Error('evaluate action requires args.script');
          }
          break;
        case 'wait':
          if (dto.target) {
            result = await this.wait(dto.target, dto.args?.duration as number);
          } else {
            result = await this.wait(undefined, dto.args?.duration as number);
          }
          break;
        case 'scroll':
          result = await this.scroll(
            (dto.args?.direction as string) || 'down',
            (dto.args?.amount as number) || 300
          );
          break;
        case 'press_key':
          result = await this.pressKey(dto.target || '');
          break;
        case 'hover':
          result = await this.hover(dto.target || '');
          break;
        default:
          throw new Error(`Unknown action: ${dto.action}`);
      }

      // Handle assertion if provided
      if (dto.assertion && result.status === 'error') {
        return {
          success: false,
          snapshotId,
          output: result,
          errorCode: 'ASSERTION_FAILED',
          errorMessage: result.message || 'Assertion failed',
          shouldTakeover: false,
        };
      }

      // Check if takeover is required based on result
      const shouldTakeover = result.template_info?.requires_takeover || false;
      const takeoverReason = result.template_info?.takeover_reason;

      return {
        success: result.status === 'success' || result.status === 'completed',
        snapshotId,
        output: result,
        shouldTakeover,
        takeoverReason,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Step execution failed: ${errorMsg}`);

      return {
        success: false,
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage: errorMsg,
        shouldTakeover: false,
      };
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
        return await this.screenshot(
          command.params.format as string,
          command.params.quality as number,
          command.params.scale as number,
          command.params.full_page as boolean
        );
      case 'snapshot':
        return await this.snapshot();
      case 'read_page':
        return await this.readPage(command.params.selector as string, command.params.max_length as number);
      case 'drag':
        return await this.drag(command.params.src as string, command.params.dst as string);
      case 'type_text':
        return await this.typeText(command.params.text as string, command.params.submit_key as string);
      case 'scroll':
        return await this.scroll(command.params.direction as string, command.params.amount as number);
      case 'get_text':
        return await this.getText();
      case 'wait':
        return await this.wait(command.params.selector as string, command.params.duration as number);
      case 'hover':
        return await this.hover(command.params.selector as string);
      case 'press_key':
        return await this.pressKey(command.params.key as string);
      case 'search':
        return await this.smartSearch(command.params.query as string);
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

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    if (!this.session) {
      await this.initBrowser();
    }

    if (!this.session) {
      throw new Error('Browser session unavailable');
    }

    this.session.runtimeSessionId = dto.runtimeSessionId;
    this.session.controlMode = 'HUMAN_CONTROL';
    this.session.frozenReason = dto.reason || 'Human takeover requested';

    this.logger.log(`Browser session frozen for runtime ${dto.runtimeSessionId}`);

    return this.getControlState(dto.runtimeSessionId);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    if (!this.session) {
      await this.initBrowser();
    }

    if (!this.session) {
      throw new Error('Browser session unavailable');
    }

    this.session.runtimeSessionId = dto.runtimeSessionId;
    this.session.controlMode = 'AGENT_RUNNING';
    this.session.frozenReason = undefined;

    this.logger.log(`Browser session resumed for runtime ${dto.runtimeSessionId}`);

    return this.getControlState(dto.runtimeSessionId);
  }

  getControlState(runtimeSessionId?: string): BrowserControlStateDto {
    return {
      runtimeSessionId: runtimeSessionId || this.session?.runtimeSessionId || 'unknown',
      controlMode: this.session?.controlMode || 'AGENT_RUNNING',
      frozen: this.session?.controlMode === 'HUMAN_CONTROL',
      reason: this.session?.frozenReason,
    };
  }

  private async navigate(url: string): Promise<{ status: string; url: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/navigate?url=${encodeURIComponent(url)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                url: result.url || url,
                template_info: result.template_info
              });
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

  private async click(selector?: string, text?: string): Promise<{ status: string; template_info?: any }> {
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
            resolve({
              status: result.status || 'success',
              template_info: result.template_info
            });
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

  private async clickResult(index: number): Promise<{ status: string; message?: string; template_info?: any; link_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/click_result?index=${index}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                message: result.message,
                template_info: result.template_info,
                link_info: result.link_info
              });
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

  private async fill(selector: string, value: string): Promise<{ status: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/fill?selector=${encodeURIComponent(selector)}&value=${encodeURIComponent(value)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                template_info: result.template_info
              });
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

  private async screenshot(
    format?: string,
    quality?: number,
    scale?: number,
    fullPage?: boolean
  ): Promise<{ status: string; screenshot?: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const params: string[] = [];
      if (format) params.push(`format=${encodeURIComponent(format)}`);
      if (quality) params.push(`quality=${quality}`);
      if (scale) params.push(`scale=${scale}`);
      if (fullPage !== undefined) params.push(`full_page=${fullPage}`);

      const url = params.length > 0
        ? `http://${this.chromeHost}:${this.codegenPort}/screenshot?${params.join('&')}`
        : `http://${this.chromeHost}:${this.codegenPort}/screenshot`;

      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: result.status || 'success',
              screenshot: result.screenshot,
              template_info: result.template_info
            });
          } catch {
            resolve({ status: 'success' });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Screenshot timeout'));
      });
    });
  }

  private async snapshot(): Promise<{ status: string; snapshot?: any; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/snapshot`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                snapshot: result.snapshot,
                template_info: result.template_info
              });
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

  private async readPage(selector?: string, maxLength?: number): Promise<{ status: string; content?: any; template_info?: any }> {
    let url = `http://${this.chromeHost}:${this.codegenPort}/read_page`;
    const params: string[] = [];
    if (selector) {
      params.push(`selector=${encodeURIComponent(selector)}`);
    }
    if (maxLength) {
      params.push(`max_length=${maxLength}`);
    }
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: result.status || 'success',
              content: result.content,
              template_info: result.template_info
            });
          } catch {
            resolve({ status: 'success' });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Read page timeout'));
      });
    });
  }

  private async drag(src: string, dst: string): Promise<{ status: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/drag?src=${encodeURIComponent(src)}&dst=${encodeURIComponent(dst)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                template_info: result.template_info
              });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Drag timeout'));
      });
    });
  }

  private async typeText(text: string, submitKey?: string): Promise<{ status: string; template_info?: any }> {
    let url = `http://${this.chromeHost}:${this.codegenPort}/type_text?text=${encodeURIComponent(text)}`;
    if (submitKey) {
      url += `&submit_key=${encodeURIComponent(submitKey)}`;
    }

    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: result.status || 'success',
              template_info: result.template_info
            });
          } catch {
            resolve({ status: 'success' });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Type text timeout'));
      });
    });
  }

  private async scroll(direction: string, amount: number): Promise<{ status: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/scroll?direction=${direction}&amount=${amount || 300}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                template_info: result.template_info
              });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Scroll timeout'));
      });
    });
  }

  private async getText(): Promise<{ status: string; text?: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/get_text`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                text: result.text,
                template_info: result.template_info
              });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Get text timeout'));
      });
    });
  }

  private async wait(selector?: string, duration?: number): Promise<{ status: string; template_info?: any }> {
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
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: result.status || 'success',
              template_info: result.template_info
            });
          } catch {
            resolve({ status: 'success' });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Wait timeout'));
      });
    });
  }

  private async hover(selector: string): Promise<{ status: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/hover?selector=${encodeURIComponent(selector)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                template_info: result.template_info
              });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Hover timeout'));
      });
    });
  }

  private async pressKey(key: string): Promise<{ status: string; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/press?key=${encodeURIComponent(key)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                template_info: result.template_info
              });
            } catch {
              resolve({ status: 'success' });
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Press timeout'));
      });
    });
  }

  private async evaluate(script: string): Promise<{ status: string; result?: any; template_info?: any }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/evaluate?script=${encodeURIComponent(script)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve({
                status: result.status || 'success',
                result: result.result,
                template_info: result.template_info
              });
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

  // Smart search - analyze page and perform search
  private async smartSearch(query: string): Promise<{ status: string; message?: string; snapshot?: string; template_info?: any }> {
    this.logger.log(`Smart search for: ${query}`);

    return new Promise((resolve, reject) => {
      // Call the smart search endpoint that analyzes page and performs search
      const req = http.get(
        `http://${this.chromeHost}:${this.codegenPort}/smart_search?query=${encodeURIComponent(query)}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              // Check if the result indicates an error
              if (result.status === 'error') {
                this.logger.error(`Smart search failed: ${result.message}`);
                resolve({
                  status: 'error',
                  message: result.message || 'Search failed',
                  snapshot: result.snapshot,
                  template_info: result.template_info,
                });
              } else {
                resolve({
                  status: 'success',
                  message: result.message,
                  snapshot: result.snapshot,
                  template_info: result.template_info,
                });
              }
            } catch (e) {
              this.logger.error(`Smart search parse error: ${e}`);
              resolve({ status: 'error', message: 'Failed to parse response' });
            }
          });
        }
      );
      req.on('error', (err) => {
        this.logger.error(`Smart search request error: ${err.message}`);
        reject(err);
      });
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Smart search timeout'));
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
