import { Injectable } from '@nestjs/common';
import { BrowserRuntimeSessionState } from '../domain/browser.types';

@Injectable()
export class BrowserSessionRegistry {
  private readonly sessions = new Map<string, BrowserRuntimeSessionState>();

  upsert(session: BrowserRuntimeSessionState): BrowserRuntimeSessionState {
    this.sessions.set(session.runtimeSessionId, session);
    return session;
  }

  get(runtimeSessionId: string): BrowserRuntimeSessionState | undefined {
    return this.sessions.get(runtimeSessionId);
  }

  delete(runtimeSessionId: string): void {
    this.sessions.delete(runtimeSessionId);
  }

  list(): BrowserRuntimeSessionState[] {
    return [...this.sessions.values()];
  }

  patch(
    runtimeSessionId: string,
    patch: Partial<BrowserRuntimeSessionState>,
  ): BrowserRuntimeSessionState | undefined {
    const existing = this.sessions.get(runtimeSessionId);
    if (!existing) {
      return undefined;
    }

    const next: BrowserRuntimeSessionState = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(runtimeSessionId, next);
    return next;
  }
}
