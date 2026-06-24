import { Injectable } from '@nestjs/common';
import type { BrowserAtomicAction } from '../../contracts/browser-nl-agent.types';

export type RuntimeBridgeCommand = {
  tool: BrowserAtomicAction['tool'];
  params: Record<string, unknown>;
};

@Injectable()
export class BrowserRuntimeBridgeService {
  toRuntimeCommand(action: BrowserAtomicAction): RuntimeBridgeCommand {
    return {
      tool: action.tool,
      params: action.params,
    };
  }
}
