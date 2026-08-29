import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getSessionBrokerUrl } from '../config/service-endpoints';

export interface BrowserRuntimeSessionLease {
  runtimeSessionId: string;
  ownedByRuntime: boolean;
}

type RuntimeSessionResponse = {
  id: string;
  runtimeType?: string;
  state?: string;
};

@Injectable()
export class CapabilityReleaseBrowserSessionBrokerService {
  private readonly logger = new Logger(CapabilityReleaseBrowserSessionBrokerService.name);
  private readonly sessionBrokerUrl = getSessionBrokerUrl();

  async acquire(input: {
    runtimeSessionId?: string;
    userId?: string;
    executionId?: string;
  }): Promise<BrowserRuntimeSessionLease> {
    if (input.runtimeSessionId) {
      const response = await axios.get<RuntimeSessionResponse>(
        `${this.sessionBrokerUrl}/runtime-sessions/${input.runtimeSessionId}`,
        { timeout: 30000 }
      );
      if (response.data.runtimeType && response.data.runtimeType !== 'browser') {
        throw new Error(
          `Runtime session ${input.runtimeSessionId} is not a browser session`
        );
      }
      if (
        response.data.state &&
        response.data.state !== 'ready' &&
        response.data.state !== 'busy'
      ) {
        throw new Error(
          `Runtime session ${input.runtimeSessionId} is not active (state=${response.data.state})`
        );
      }
      return {
        runtimeSessionId: response.data.id,
        ownedByRuntime: false,
      };
    }

    const response = await axios.post<RuntimeSessionResponse>(
      `${this.sessionBrokerUrl}/runtime-sessions`,
      {
        userId: input.userId || 'system',
        runtimeType: 'browser',
        ...(this.isUuid(input.executionId) ? { executionId: input.executionId } : {}),
      },
      { timeout: 60000 }
    );
    return {
      runtimeSessionId: response.data.id,
      ownedByRuntime: true,
    };
  }

  async closeOwnedQuietly(lease: BrowserRuntimeSessionLease, reason: string): Promise<void> {
    if (!lease.ownedByRuntime) {
      return;
    }
    try {
      await axios.post(
        `${this.sessionBrokerUrl}/runtime-sessions/${lease.runtimeSessionId}/close`,
        { reason },
        { timeout: 30000 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to close owned browser runtime session ${lease.runtimeSessionId}: ${message}`
      );
    }
  }

  async freeze(runtimeSessionId: string, reason: string): Promise<void> {
    await axios.post(
      `${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/freeze`,
      { reason },
      { timeout: 30000 }
    );
  }

  private isUuid(value: string | undefined): value is string {
    return Boolean(
      value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value
        )
    );
  }
}
