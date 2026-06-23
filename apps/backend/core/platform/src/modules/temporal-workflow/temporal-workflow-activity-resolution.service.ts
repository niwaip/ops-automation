import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BuiltinActivityRegistry,
  type BuiltinActivityDefinition,
} from './builtin-activity.registry';
import { resolveCustomActivityRef } from './temporal-workflow-custom-activity-ref.helper';
import type { ActivityDefinition, ActivityDsl, WorkflowStep } from './temporal-workflow.types';

export interface TemporalWorkflowActivityResolutionSupport {
  buildDeterministicActivityCode(activityDef: ActivityDsl['activities'][number]): string | null;
}

@Injectable()
export class TemporalWorkflowActivityResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry
  ) {}

  async enrichActivityDefinition(
    activity: ActivityDefinition,
    support: TemporalWorkflowActivityResolutionSupport
  ): Promise<ActivityDefinition> {
    const builtin =
      this.builtinActivityRegistry.getByFn(activity.fn) ||
      this.builtinActivityRegistry.findByLegacyIdentifier(activity.name);
    if (builtin) {
      return this.mapBuiltinToActivityDefinition(builtin, activity);
    }

    const dbActivity = await this.prisma.activity.findFirst({
      where: {
        OR: [{ name: activity.name }, { fn: activity.fn }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const merged: ActivityDefinition = {
      ...activity,
      generatedCode:
        activity.generatedCode ||
        dbActivity?.generatedCode ||
        support.buildDeterministicActivityCode(activity) ||
        undefined,
    };

    if (dbActivity) {
      return {
        ...this.mapDbActivityToDefinition(dbActivity),
        ...merged,
        generatedCode: merged.generatedCode,
      };
    }

    return merged;
  }

  async resolveActivityDefinition(
    step: WorkflowStep,
    activityDsl: ActivityDsl,
    support: TemporalWorkflowActivityResolutionSupport
  ): Promise<ActivityDefinition | null> {
    const activityFromDsl = this.findMatchingActivityInDsl(step, activityDsl);
    const builtinFromRef = step.activityRef
      ? this.builtinActivityRegistry.getByRef(step.activityRef)
      : null;
    if (builtinFromRef) {
      return this.mapBuiltinToActivityDefinition(
        builtinFromRef,
        activityFromDsl || {
          name: step.activityName || builtinFromRef.name,
          timeout: step.startToCloseTimeout || builtinFromRef.timeout,
        }
      );
    }

    if (step.activityRef?.startsWith('custom:')) {
      const activityId = step.activityRef.slice('custom:'.length).trim();
      if (!activityId) {
        return null;
      }
      if (this.isLikelyUuid(activityId)) {
        const dbActivity = await this.prisma.activity
          .findUnique({ where: { id: activityId } })
          .catch(() => null);
        if (dbActivity) {
          return this.mapDbActivityToDefinition(dbActivity);
        }
      }
      if (activityFromDsl) {
        return this.enrichActivityDefinition(activityFromDsl, support);
      }
      return null;
    }

    if (activityFromDsl) {
      return this.enrichActivityDefinition(activityFromDsl, support);
    }

    const builtinFromLegacyName = step.activityName
      ? this.builtinActivityRegistry.findByLegacyIdentifier(step.activityName)
      : null;
    if (builtinFromLegacyName) {
      return this.mapBuiltinToActivityDefinition(builtinFromLegacyName, {
        name: step.activityName || builtinFromLegacyName.name,
        timeout: step.startToCloseTimeout || builtinFromLegacyName.timeout,
      });
    }

    if (!step.activityName) {
      return null;
    }

    const dbActivity = await this.prisma.activity.findUnique({
      where: { name: step.activityName },
    });
    return dbActivity ? this.mapDbActivityToDefinition(dbActivity) : null;
  }

  private mapBuiltinToActivityDefinition(
    builtin: BuiltinActivityDefinition,
    overrides?: Partial<ActivityDefinition>
  ): ActivityDefinition {
    return {
      name: overrides?.name || builtin.name,
      fn: builtin.fn,
      timeout: overrides?.timeout || builtin.timeout,
      retryPolicy:
        overrides?.retryPolicy || (builtin.retryPolicy ? { ...builtin.retryPolicy } : undefined),
      handler: builtin.handler,
      config: {
        ...(builtin.config || {}),
        ...(overrides?.config || {}),
      },
      generatedCode: builtin.generatedCode,
    };
  }

  private mapDbActivityToDefinition(activity: {
    id?: string;
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: unknown;
    handler: 'api' | 'carbone' | 'browser' | 'script' | string;
    config: unknown;
    generatedCode?: string | null;
  }): ActivityDefinition {
    return {
      ...(activity.id
        ? {
            id: activity.id,
            activityRef: `custom:${activity.id}`,
          }
        : {}),
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout || '60s',
      retryPolicy: activity.retryPolicy as { maxRetries: number; backoffMs?: number } | undefined,
      handler: activity.handler as 'api' | 'carbone' | 'browser' | 'script',
      config:
        activity.config && typeof activity.config === 'object'
          ? (activity.config as Record<string, any>)
          : {},
      generatedCode: activity.generatedCode || undefined,
    };
  }

  private findMatchingActivityInDsl(
    step: WorkflowStep,
    activityDsl: ActivityDsl
  ): ActivityDefinition | null {
    const builtinFromRef = step.activityRef
      ? this.builtinActivityRegistry.getByRef(step.activityRef)
      : null;
    const candidates = activityDsl.activities || [];
    if (step.activityRef?.startsWith('custom:')) {
      const byRef = candidates.find(
        (activity, index) => resolveCustomActivityRef(activity, index) === step.activityRef
      );
      if (byRef) {
        return byRef;
      }
    }
    if (step.activityName) {
      const byName = candidates.find((activity) => activity.name === step.activityName);
      if (byName) {
        return byName;
      }
    }
    if (builtinFromRef) {
      const byBuiltin = candidates.find(
        (activity) =>
          activity.fn === builtinFromRef.fn ||
          activity.name === builtinFromRef.name ||
          activity.name === step.activityName
      );
      if (byBuiltin) {
        return byBuiltin;
      }
    }
    return null;
  }

  private isLikelyUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );
  }
}
