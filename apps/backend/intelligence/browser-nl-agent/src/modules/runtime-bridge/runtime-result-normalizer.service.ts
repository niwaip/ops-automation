import { Injectable } from '@nestjs/common';
import type { BrowserNlAgentTurnResult, BrowserObservationSnapshot } from '../../contracts/browser-nl-agent.types';

@Injectable()
export class RuntimeResultNormalizerService {
  normalize(snapshot: BrowserObservationSnapshot, message?: string): BrowserNlAgentTurnResult {
    return {
      status: 'running',
      observation: snapshot,
      message,
    };
  }
}
