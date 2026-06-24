import { Injectable } from '@nestjs/common';
import type { BrowserNlAgentSession } from '../../contracts/browser-nl-agent.types';

@Injectable()
export class GoalInterpreterService {
  interpret(session: BrowserNlAgentSession): string {
    return session.userGoal.trim();
  }
}
