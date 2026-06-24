import { Injectable } from '@nestjs/common';
import type { BrowserNlAgentSession } from '../../contracts/browser-nl-agent.types';

@Injectable()
export class SessionMemoryService {
  update(session: BrowserNlAgentSession, key: string, value: unknown): BrowserNlAgentSession {
    return {
      ...session,
      memory: {
        ...(session.memory || {}),
        [key]: value,
      },
    };
  }
}
