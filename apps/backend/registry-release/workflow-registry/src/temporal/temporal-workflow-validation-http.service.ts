import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { TemporalWorkflowValidationFacadeService } from './temporal-workflow-validation-facade.service';

@Injectable()
export class TemporalWorkflowValidationHttpService {
  constructor(private readonly validationFacade: TemporalWorkflowValidationFacadeService) {}

  async validateWorkflowRealRequest(data: {
    code: string;
    fn: string;
    input?: Record<string, any>;
    taskQueue?: string;
    timeout?: string;
  }): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.validationFacade.validateWorkflowReal(
      data.code,
      data.fn,
      data.input,
      data.taskQueue,
      data.timeout
    );
  }

  async validateWorkflowRealStreamRequest(
    data: {
      code: string;
      fn: string;
      input?: Record<string, any>;
      taskQueue?: string;
      timeout?: string;
    },
    res: Response
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await this.validationFacade.validateWorkflowRealStreaming(
        data.code,
        data.fn,
        data.input,
        data.taskQueue,
        data.timeout,
        (log: string) => {
          res.write(`data: ${JSON.stringify({ type: 'log', content: log })}\n\n`);
        }
      );

      if (result.success) {
        res.write(
          `data: ${JSON.stringify({ type: 'done', success: true, score: result.score, result: result.result, traceback: result.traceback })}\n\n`
        );
      } else {
        res.write(
          `data: ${JSON.stringify({ type: 'done', success: false, error: result.error, score: result.score, result: result.result, traceback: result.traceback, logs: result.logs })}\n\n`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      res.write(`data: ${JSON.stringify({ type: 'error', content: message })}\n\n`);
    }

    res.end();
  }
}
