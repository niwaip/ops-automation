import { Injectable } from '@nestjs/common';
import {
  BrowserExecutionControllerService,
  type BrowserExecutionControllerInput,
  type RecorderDebugChatExecutionOutcome,
  type RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';

export type {
  BrowserExecutionControllerInput,
  RecorderControlTokenStateLike,
  RecorderDebugChatExecutionOutcome,
  RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';

@Injectable()
export class RecorderDebugChatExecutionService {
  constructor(
    private readonly browserExecutionControllerService: BrowserExecutionControllerService
  ) {}

  async executeAndResolve<TSession extends RecorderDebugExecutionSessionLike>(input: {
    session: TSession;
  } & BrowserExecutionControllerInput<TSession>): Promise<RecorderDebugChatExecutionOutcome> {
    return this.browserExecutionControllerService.executeAndResolve(input);
  }
}
