import { Injectable, Logger } from '@nestjs/common';
import { UpdateWorkflowActivityProgressDto } from './execution.dto';
import { ExecutionPhaseService } from './execution-phase.service';

type ExecutionPhaseRecord = Record<string, unknown>;

@Injectable()
export class WorkflowActivityProgressService {
  private readonly logger = new Logger(WorkflowActivityProgressService.name);

  constructor(private readonly executionPhaseService: ExecutionPhaseService) {}

  async sync(executionId: string, dto: UpdateWorkflowActivityProgressDto): Promise<void> {
    const phases = await this.executionPhaseService.listByExecutionId(executionId);
    const workflowActivityPhases = phases
      .filter((phase) => {
        const phaseType = this.readNonEmptyString(phase.phaseType, phase.phase_type);
        if (phaseType !== 'workflow_activity') {
          return false;
        }
        const input = this.readRecord(phase.input, phase.input_json);
        return this.readNonEmptyString(input?.parentPhaseKey) === dto.parentPhaseKey;
      })
      .sort((left, right) => {
        const leftInput = this.readRecord(left.input, left.input_json);
        const rightInput = this.readRecord(right.input, right.input_json);
        const leftOrder = Number(leftInput?.order || 0);
        const rightOrder = Number(rightInput?.order || 0);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return String(left.phaseKey || left.phase_key || '').localeCompare(
          String(right.phaseKey || right.phase_key || '')
        );
      });

    if (workflowActivityPhases.length === 0) {
      return;
    }

    const currentPhase = workflowActivityPhases.find((phase) => {
      const input = this.readRecord(phase.input, phase.input_json);
      const order = Number(input?.order || 0);
      if (dto.activityOrder && order === dto.activityOrder) {
        return true;
      }
      return Boolean(
        dto.activityName &&
          this.readNonEmptyString(phase.phaseName, phase.phase_name) === dto.activityName
      );
    });

    if (!currentPhase) {
      this.logger.warn(
        `Workflow activity progress ignored for execution ${executionId}: parentPhaseKey=${dto.parentPhaseKey}, activityOrder=${dto.activityOrder ?? '-'}, activityName=${dto.activityName ?? '-'}`
      );
      return;
    }

    await this.completePreviousRunningPhases(executionId, dto, workflowActivityPhases, currentPhase);
    await this.markCurrentPhaseRunning(executionId, dto, currentPhase);
  }

  private async completePreviousRunningPhases(
    executionId: string,
    dto: UpdateWorkflowActivityProgressDto,
    phases: ExecutionPhaseRecord[],
    currentPhase: ExecutionPhaseRecord
  ): Promise<void> {
    const currentOrder = Number(
      this.readRecord(currentPhase.input, currentPhase.input_json)?.order || dto.activityOrder || 0
    );
    const runtimeSessionId =
      dto.runtimeSessionId ||
      this.readNonEmptyString(currentPhase.runtimeSessionId, currentPhase.runtime_session_id) ||
      null;

    for (const phase of phases) {
      const phaseKey = this.readNonEmptyString(phase.phaseKey, phase.phase_key);
      const currentPhaseKey = this.readNonEmptyString(currentPhase.phaseKey, currentPhase.phase_key);
      if (!phaseKey || phaseKey === currentPhaseKey) {
        continue;
      }

      const phaseInput = this.readRecord(phase.input, phase.input_json);
      const phaseOrder = Number(phaseInput?.order || 0);
      const phaseStatus = this.readNonEmptyString(phase.status) || 'pending';
      if (
        phaseOrder > 0 &&
        currentOrder > 0 &&
        phaseOrder < currentOrder &&
        phaseStatus === 'running'
      ) {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey,
          phaseName: this.readNonEmptyString(phase.phaseName, phase.phase_name) || phaseKey,
          phaseType:
            this.readNonEmptyString(phase.phaseType, phase.phase_type) || 'workflow_activity',
          status: 'completed',
          attempt: Number(phase.attempt || 1),
          runtimeSessionId:
            runtimeSessionId ||
            this.readNonEmptyString(phase.runtimeSessionId, phase.runtime_session_id) ||
            null,
          input: phaseInput,
          output: this.readRecord(phase.output, phase.output_json),
          errorCode: null,
          errorMessage: null,
          startedAt: this.toNullableDate(phase.startedAt || phase.started_at),
          completedAt: new Date(),
        });
      }
    }
  }

  private async markCurrentPhaseRunning(
    executionId: string,
    dto: UpdateWorkflowActivityProgressDto,
    currentPhase: ExecutionPhaseRecord
  ): Promise<void> {
    const currentPhaseKey = this.readNonEmptyString(currentPhase.phaseKey, currentPhase.phase_key);
    const currentPhaseName = this.readNonEmptyString(
      currentPhase.phaseName,
      currentPhase.phase_name
    );
    const currentPhaseType =
      this.readNonEmptyString(currentPhase.phaseType, currentPhase.phase_type) ||
      'workflow_activity';
    const currentAttempt = Number(currentPhase.attempt || 1);
    const currentInput = this.readRecord(currentPhase.input, currentPhase.input_json);
    const currentOutput = this.readRecord(currentPhase.output, currentPhase.output_json);
    const currentStartedAt = this.toNullableDate(currentPhase.startedAt || currentPhase.started_at);
    const runtimeSessionId =
      dto.runtimeSessionId ||
      this.readNonEmptyString(currentPhase.runtimeSessionId, currentPhase.runtime_session_id) ||
      null;

    if (!currentPhaseKey || !currentPhaseName) {
      return;
    }

    const currentStatus = this.readNonEmptyString(currentPhase.status) || 'pending';
    if (currentStatus !== 'completed') {
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey: currentPhaseKey,
        phaseName: currentPhaseName,
        phaseType: currentPhaseType,
        status: 'running',
        attempt: currentAttempt,
        runtimeSessionId,
        input: currentInput,
        output: currentOutput,
        errorCode: null,
        errorMessage: null,
        startedAt: currentStartedAt || new Date(),
        completedAt: null,
      });
    }
  }

  private readRecord(...values: unknown[]): Record<string, unknown> | null {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private toNullableDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    return value instanceof Date ? value : new Date(String(value));
  }
}
