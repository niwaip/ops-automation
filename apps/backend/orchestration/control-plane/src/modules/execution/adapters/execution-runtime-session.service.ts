import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getSessionBrokerUrl } from '../../../config/service-endpoints';
import { RuntimeSessionSummaryDto } from '../state/execution.dto';

@Injectable()
export class ExecutionRuntimeSessionService {
  private readonly logger = new Logger(ExecutionRuntimeSessionService.name);
  private readonly sessionBrokerUrl = getSessionBrokerUrl();

  async allocateRuntimeSession(input: {
    userId: string;
    executionId: string;
    runtimeType: string;
  }): Promise<RuntimeSessionSummaryDto> {
    const response = await axios.post<RuntimeSessionSummaryDto>(
      `${this.sessionBrokerUrl}/runtime-sessions`,
      {
        userId: input.userId,
        executionId: input.executionId,
        runtimeType: input.runtimeType,
      }
    );

    return response.data;
  }

  async closeQuietly(runtimeSessionId: string, executionId: string, reason: string): Promise<void> {
    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/close`, {});
      this.logger.log(
        `Runtime session ${runtimeSessionId} closed for execution ${executionId} (${reason})`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to close runtime session ${runtimeSessionId} for execution ${executionId} (${reason}): ${errorMessage}`
      );
    }
  }

  async freezeQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    reason: string
  ): Promise<void> {
    if (!runtimeSessionId) {
      return;
    }

    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/freeze`, {
        reason,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to freeze runtime session ${runtimeSessionId} for execution ${executionId}: ${errorMessage}`
      );
    }
  }

  async resumeQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    stepId?: string
  ): Promise<void> {
    if (!runtimeSessionId) {
      return;
    }

    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/resume`, {
        stepId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resume runtime session ${runtimeSessionId} for execution ${executionId}: ${errorMessage}`
      );
    }
  }
}
