import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflow } from '@prisma/client';

export interface WorkflowDsl {
  name: string;
  taskQueue: string;
  steps: Array<{
    id: string;
    name: string;
    type: 'activity' | 'signal' | 'query';
    activityName?: string;
    input?: Record<string, any>;
    retryPolicy?: { maxRetries: number; backoffMs: number };
  }>;
  conditionals?: Array<{
    step: string;
    condition: string;
    skip?: boolean;
  }>;
}

export interface ActivityDsl {
  activities: Array<{
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: { maxRetries: number };
    handler: 'api' | 'carbone' | 'browser' | 'script';
    config: Record<string, any>;
  }>;
}

export interface CreateTemporalWorkflowDTO {
  name: string;
  description?: string;
  taskQueue?: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
}

export interface UpdateTemporalWorkflowDTO {
  name?: string;
  description?: string;
  taskQueue?: string;
  workflowDsl?: WorkflowDsl;
  activityDsl?: ActivityDsl;
  isActive?: boolean;
}

export interface TemporalValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class TemporalWorkflowService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<TemporalWorkflow[]> {
    return this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<TemporalWorkflow | null> {
    return this.prisma.temporalWorkflow.findUnique({ where: { id } });
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        taskQueue: data.taskQueue || 'SKILL_TASK_QUEUE',
        workflowDsl: data.workflowDsl as any,
        activityDsl: data.activityDsl as any,
        isActive: true,
      },
    });
  }

  async update(id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.taskQueue && { taskQueue: data.taskQueue }),
        ...(data.workflowDsl && { workflowDsl: data.workflowDsl as any }),
        ...(data.activityDsl && { activityDsl: data.activityDsl as any }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.temporalWorkflow.delete({ where: { id } });
    return { success: true };
  }

  async deploy(id: string): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: { deployedAt: new Date() },
    });
  }

  async validate(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<TemporalValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflowDsl.name) {
      errors.push('Workflow name is required');
    }

    if (!workflowDsl.steps || workflowDsl.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    const activityNames = new Set(activityDsl.activities.map(a => a.name));

    for (let i = 0; i < workflowDsl.steps.length; i++) {
      const step = workflowDsl.steps[i];

      if (!step.name) {
        errors.push(`Step ${i + 1} must have a name`);
      }

      if (step.type === 'activity' && !step.activityName) {
        errors.push(`Step "${step.name}" must specify an activity name`);
      } else if (step.type === 'activity' && step.activityName && !activityNames.has(step.activityName)) {
        errors.push(`Step "${step.name}" references activity "${step.activityName}" which is not defined in Activity DSL`);
      }
    }

    if (!activityDsl.activities || activityDsl.activities.length === 0) {
      warnings.push('No activities defined');
    }

    for (const activity of activityDsl.activities) {
      if (!activity.name) {
        errors.push('All activities must have a name');
      }
      if (!activity.fn) {
        errors.push(`Activity "${activity.name}" must have a function name`);
      }
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
    };
  }
}