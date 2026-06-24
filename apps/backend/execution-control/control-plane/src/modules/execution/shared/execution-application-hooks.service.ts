import { Injectable } from '@nestjs/common';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { ExecutionStatus } from '../contracts/execution-status';
import { ExecutionLifecycleHooks, RequestUserContext } from '../lifecycle/execution-lifecycle.service';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { ExecutionDto } from '../state/execution.dto';

type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

interface ExecutionApplicationLifecycleCallbacks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
}

interface ExecutionApplicationApprovalCallbacks
  extends ExecutionApplicationLifecycleCallbacks {
  startExecution: (executionId: string) => Promise<void>;
}

interface ExecutionApplicationCreateCallbacks {
  getExecutionDto: (id: string) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  enterWaitingInput: (execution: Record<string, unknown>, stepId: string) => Promise<void>;
  startExecution: (executionId: string) => Promise<void>;
}

interface ExecutionApplicationSubmitInputCallbacks
  extends ExecutionApplicationLifecycleCallbacks {
  startExecution: (executionId: string) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
}

interface ExecutionApplicationStartCallbacks {
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  bootstrapBrowserExecution: (
    execution: Record<string, unknown>,
    runtimeSessionId: string
  ) => Promise<void>;
}

@Injectable()
export class ExecutionApplicationHooksService {
  createLifecycleHooks(
    input: ExecutionApplicationLifecycleCallbacks
  ): ExecutionLifecycleHooks {
    return {
      getExecutionDto: input.getExecutionDto,
      updateStatus: input.updateStatus,
      emitEvent: input.emitEvent,
    };
  }

  createApprovalHooks(
    input: ExecutionApplicationApprovalCallbacks
  ): ExecutionApplicationApprovalCallbacks {
    const lifecycleHooks = this.createLifecycleHooks(input);

    return {
      ...lifecycleHooks,
      startExecution: input.startExecution,
    };
  }

  createCreateHooks(
    input: ExecutionApplicationCreateCallbacks
  ): ExecutionApplicationCreateCallbacks {
    return {
      getExecutionDto: input.getExecutionDto,
      emitEvent: input.emitEvent,
      enterWaitingInput: input.enterWaitingInput,
      startExecution: input.startExecution,
    };
  }

  createSubmitInputHooks(
    input: ExecutionApplicationSubmitInputCallbacks
  ): ExecutionApplicationSubmitInputCallbacks {
    const lifecycleHooks = this.createLifecycleHooks(input);

    return {
      ...lifecycleHooks,
      startExecution: input.startExecution,
      advanceExecutionFlow: input.advanceExecutionFlow,
    };
  }

  createStartHooks(
    input: ExecutionApplicationStartCallbacks
  ): ExecutionApplicationStartCallbacks {
    return {
      updateStatus: input.updateStatus,
      emitEvent: input.emitEvent,
      advanceExecutionFlow: input.advanceExecutionFlow,
      bootstrapBrowserExecution: input.bootstrapBrowserExecution,
    };
  }
}
