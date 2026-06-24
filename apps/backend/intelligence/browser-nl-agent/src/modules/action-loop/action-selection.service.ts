import { Injectable } from '@nestjs/common';
import type {
  BrowserAtomicAction,
  BrowserNlAgentTurnResult,
  BrowserObservationSnapshot,
} from '../../contracts/browser-nl-agent.types';

@Injectable()
export class ActionSelectionService {
  select(snapshot: BrowserObservationSnapshot, actions: BrowserAtomicAction[]): BrowserNlAgentTurnResult {
    return {
      status: actions.length > 0 ? 'running' : 'blocked',
      observation: snapshot,
      nextActions: actions,
      requiresTakeover: actions.length === 0,
    };
  }
}
