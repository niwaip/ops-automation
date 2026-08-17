import { Injectable } from '@nestjs/common';
import { buildDeterministicWorkflowCodeForWorkflow } from './temporal-workflow-deterministic-builder';
import type { ActivityDsl, WorkflowDsl } from './temporal-workflow.types';
import { BuiltinActivityRegistry } from './builtin-activity.registry';
import { TemporalWorkflowConfigService } from '../../workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';

export enum SkeletonFallbackReason {
  HAS_CONDITIONALS = 'has_conditionals',
  HAS_SIGNAL_HANDLERS = 'has_signal_handlers',
  HAS_SAGA_ERROR_HANDLING = 'has_saga_error_handling',
  HAS_PARALLEL_STEPS = 'has_parallel_steps',
  ACTIVITY_CODE_MISSING = 'activity_code_missing',
  DETERMINISTIC_BUILDER_UNSUPPORTED = 'deterministic_builder_unsupported',
}

export interface SkeletonCompileResult {
  success: boolean;
  code?: string;
  error?: string;
  fallbackReason?: SkeletonFallbackReason;
}

@Injectable()
export class WorkflowSkeletonCompiler {
  constructor(
    private readonly builtinActivityRegistry: BuiltinActivityRegistry,
    private readonly workflowConfigService: TemporalWorkflowConfigService,
    private readonly workflowNormalizationService: TemporalWorkflowNormalizationService
  ) {}

  /**
   * Evaluates whether a WorkflowDsl can be compiled via the deterministic skeleton compiler,
   * and returns the compilation result or the reason why AI skeleton fallback is required.
   */
  compile(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): SkeletonCompileResult {
    // 1. Top-level topology validation
    const activitySteps = (workflowDsl.steps || []).filter((step) => step.type === 'activity');
    if (workflowDsl.steps.length !== activitySteps.length) {
      return {
        success: false,
        fallbackReason: SkeletonFallbackReason.HAS_PARALLEL_STEPS,
      };
    }
    if (workflowDsl.conditionals && workflowDsl.conditionals.length > 0) {
      return {
        success: false,
        fallbackReason: SkeletonFallbackReason.HAS_CONDITIONALS,
      };
    }
    if (workflowDsl.signalHandlers && workflowDsl.signalHandlers.length > 0) {
      return {
        success: false,
        fallbackReason: SkeletonFallbackReason.HAS_SIGNAL_HANDLERS,
      };
    }
    if (workflowDsl.errorHandling?.type === 'saga') {
      return {
        success: false,
        fallbackReason: SkeletonFallbackReason.HAS_SAGA_ERROR_HANDLING,
      };
    }

    // 2. Check if all activity definitions have generatedCode
    const missingActivity = activityDsl.activities.find((act) => !act.generatedCode);
    if (missingActivity) {
      return {
        success: false,
        fallbackReason: SkeletonFallbackReason.ACTIVITY_CODE_MISSING,
      };
    }

    // 3. Delegate to deterministic workflow builder
    try {
      const code = buildDeterministicWorkflowCodeForWorkflow(workflowDsl, activityDsl, {
        builtinActivityRegistry: this.builtinActivityRegistry,
        workflowConfigService: this.workflowConfigService,
        workflowNormalizationService: this.workflowNormalizationService,
      });

      if (!code) {
        return {
          success: false,
          fallbackReason: SkeletonFallbackReason.DETERMINISTIC_BUILDER_UNSUPPORTED,
          error: '全部 Activity 均有固定实现，但当前拓扑或参数形状未被确定性骨架编译器支持',
        };
      }

      return {
        success: true,
        code,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `骨架编译失败: ${error?.message || String(error)}`,
      };
    }
  }
}
