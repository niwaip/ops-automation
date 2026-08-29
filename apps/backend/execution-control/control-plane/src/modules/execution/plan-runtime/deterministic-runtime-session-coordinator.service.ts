import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionRuntimeSessionService } from '../adapters/execution-runtime-session.service';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';

const ACTIVE_BROWSER_SESSION_STATES = ['ready', 'busy'] as const;
const TERMINAL_CLOSEABLE_SESSION_STATES = ['ready', 'busy', 'error'] as const;

@Injectable()
export class DeterministicRuntimeSessionCoordinatorService {
  private readonly logger = new Logger(DeterministicRuntimeSessionCoordinatorService.name);
  private readonly pendingBrowserAllocations = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeSessions: ExecutionRuntimeSessionService,
    private readonly eventPublisher: ExecutionStreamService
  ) {}

  async ensureBrowserSession(input: {
    executionId: string;
    userId: string;
    stepId?: string;
  }): Promise<string> {
    const existing = await this.prisma.runtimeSession.findFirst({
      where: {
        executionId: input.executionId,
        runtimeType: 'browser',
        state: { in: [...ACTIVE_BROWSER_SESSION_STATES] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return existing.id;
    }

    const frozen = await this.prisma.runtimeSession.findFirst({
      where: {
        executionId: input.executionId,
        runtimeType: 'browser',
        state: 'frozen',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (frozen) {
      const error = new Error(
        `Browser runtime session ${frozen.id} is frozen for human takeover`
      ) as Error & { code?: string };
      error.code = 'BROWSER_SESSION_FROZEN';
      throw error;
    }

    const pending = this.pendingBrowserAllocations.get(input.executionId);
    if (pending) {
      return pending;
    }

    const allocation = this.allocateBrowserSession(input).finally(() => {
      this.pendingBrowserAllocations.delete(input.executionId);
    });
    this.pendingBrowserAllocations.set(input.executionId, allocation);
    return allocation;
  }

  async closeForTerminalExecution(executionId: string, reason: string): Promise<void> {
    this.pendingBrowserAllocations.delete(executionId);
    const sessions = await this.prisma.runtimeSession.findMany({
      where: {
        executionId,
        runtimeType: 'browser',
        state: { in: [...TERMINAL_CLOSEABLE_SESSION_STATES] },
      },
      orderBy: { createdAt: 'desc' },
    });

    await Promise.all(
      sessions.map((session: { id: string }) =>
        this.runtimeSessions.closeQuietly(session.id, executionId, reason)
      )
    );
  }

  private async allocateBrowserSession(input: {
    executionId: string;
    userId: string;
    stepId?: string;
  }): Promise<string> {
    const runtimeSession = await this.runtimeSessions.allocateRuntimeSession({
      userId: input.userId,
      executionId: input.executionId,
      runtimeType: 'browser',
    });
    await this.eventPublisher.createEvent(
      input.executionId,
      'runtime.allocated' as any,
      {
        runtimeSessionId: runtimeSession.id,
        runtimeType: 'browser',
        source: 'deterministic_plan',
      },
      input.stepId ? { stepId: input.stepId } : undefined
    );
    this.logger.log(
      `Allocated standard browser session ${runtimeSession.id} for deterministic execution ${input.executionId}`
    );
    return runtimeSession.id;
  }
}
