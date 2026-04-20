import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class TemporalWorkflowService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    return this.prisma.temporalWorkflow.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    description?: string;
    taskQueue: string;
    workflowDsl: WorkflowDsl;
    activityDsl: ActivityDsl;
  }) {
    return this.prisma.temporalWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        taskQueue: data.taskQueue,
        workflowDsl: data.workflowDsl as any,
        activityDsl: data.activityDsl as any,
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    description?: string;
    taskQueue: string;
    workflowDsl: WorkflowDsl;
    activityDsl: ActivityDsl;
    isActive: boolean;
  }>) {
    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        ...data,
        workflowDsl: data.workflowDsl as any,
        activityDsl: data.activityDsl as any,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.temporalWorkflow.delete({ where: { id } });
  }

  async deploy(id: string) {
    const workflow = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!workflow) throw new Error('Workflow not found');

    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: { deployedAt: new Date() },
    });
  }

  async validateDsl(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<{
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflowDsl.name) errors.push('Workflow name is required');
    if (!workflowDsl.taskQueue) errors.push('Task queue is required');
    if (!workflowDsl.steps || workflowDsl.steps.length === 0) {
      errors.push('At least one step is required');
    }

    const stepIds = new Set(workflowDsl.steps?.map(s => s.id) || []);
    for (const conditional of workflowDsl.conditionals || []) {
      if (!stepIds.has(conditional.step)) {
        errors.push(`Conditional references unknown step: ${conditional.step}`);
      }
    }

    const activityNames = new Set(activityDsl.activities?.map(a => a.name) || []);
    for (const step of workflowDsl.steps || []) {
      if (step.type === 'activity' && step.activityName) {
        if (!activityNames.has(step.activityName)) {
          errors.push(`Step "${step.id}" references unknown activity: ${step.activityName}`);
        }
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