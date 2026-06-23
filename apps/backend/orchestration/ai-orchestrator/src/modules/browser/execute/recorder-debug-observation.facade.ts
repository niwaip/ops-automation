import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../../model/model.service';
import { RecorderObservationService } from '../observe';
import type { RecorderDebugObservation } from './recorder-debug.types';

@Injectable()
export class RecorderDebugObservationFacade {
  private readonly logger = new Logger(RecorderDebugObservationFacade.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly recorderObservationService: RecorderObservationService
  ) {}

  async describePage(input: {
    userMessage: string;
    observation: RecorderDebugObservation;
    userRoles: string[];
    modelId?: string;
  }): Promise<string> {
    const structuredSummary = this.recorderObservationService.buildObservationSummary(
      input.observation
    );
    const preferredModel =
      input.modelId ||
      this.modelService.getPreferredDefaultModel({
        mode: 'chat',
        userRoles: input.userRoles,
      })?.id;

    if (!preferredModel) {
      return structuredSummary;
    }

    try {
      const response = await this.modelService.callModel(
        preferredModel,
        [
          'You are helping a user debug a React page through browser observations.',
          'Answer in concise Chinese.',
          'If the user asks what parameters are needed, focus on the visible inputs, buttons, and current page context.',
          `User question: ${input.userMessage}`,
          `Page observation:\n${structuredSummary}`,
        ].join('\n\n')
      );
      return response.content || structuredSummary;
    } catch (error) {
      this.logger.warn(
        `Failed to generate recorder debug description: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return structuredSummary;
    }
  }

  buildRecorderObservationSummary(
    observation?: RecorderDebugObservation
  ): string | undefined {
    if (!observation) {
      return undefined;
    }

    return [
      observation.title ? `title=${observation.title}` : '',
      observation.currentPageUrl ? `url=${observation.currentPageUrl}` : '',
      observation.text ? `text=${observation.text.slice(0, 400)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  inferRecorderPageType(observation?: RecorderDebugObservation): string | undefined {
    if (!observation) {
      return undefined;
    }

    const combinedText = [observation.title || '', observation.text || ''].join(' ').toLowerCase();
    if (/(登录|登入|log\s*in|sign\s*in|ログイン)/i.test(combinedText)) {
      return 'login';
    }
    if (/(详情|明细|detail)/i.test(combinedText)) {
      return 'detail';
    }
    if (/(列表|一览|list|approval)/i.test(combinedText)) {
      return 'list';
    }
    return undefined;
  }
}
