import { Injectable } from '@nestjs/common';
import { TemplateJSON, ValidationResult, FORBIDDEN_PARAM_NAMES } from '../types/template.types';
import { LocatorValidator } from './locator.validator';

@Injectable()
export class TemplateValidator {
  constructor(private readonly locatorValidator: LocatorValidator) {}

  /**
   * Validate entire template structure
   */
  validate(template: TemplateJSON): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate required fields
    if (!template.id) {
      errors.push('Template ID is required');
    }
    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }
    if (!template.version) {
      errors.push('Template version is required');
    }
    if (!template.status) {
      errors.push('Template status is required');
    }

    // 2. Validate step IDs format
    if (!template.steps || template.steps.length === 0) {
      warnings.push('Template has no steps defined');
    } else {
      for (const step of template.steps) {
        // Step ID format check: step_{number}
        if (!step.step_id) {
          errors.push(`Step missing step_id`);
        } else if (!/^step_\d+$/.test(step.step_id)) {
          errors.push(`Step ID "${step.step_id}" does not match format "step_{number}"`);
        }

        // Action validation
        const validActions = [
          'click',
          'fill',
          'navigate',
          'wait',
          'select',
          'check',
          'screenshot',
          'assert',
          'search',
          'smart_search',
          'hover',
          'press',
          'press_key',
          'scroll',
          'type_text',
          'get_text',
          'snapshot',
          'read_page',
          'list_search_results',
          'click_result',
          'click_table_row',
          'switch_latest_tab',
          'close_tab',
          'read_value',
          'branch',
          'takeover_gate',
        ];
        if (!validActions.includes(step.action)) {
          errors.push(`Step "${step.step_id}" has invalid action "${step.action}"`);
        }

        // Locator validation for actions that require locators
        const locatorRequiredActions = ['click', 'fill', 'select', 'check', 'read_value'];
        if (locatorRequiredActions.includes(step.action) && !step.locator) {
          errors.push(`Step "${step.step_id}" with action "${step.action}" requires a locator`);
        }

        if (step.action === 'read_value') {
          if (!step.output_var || step.output_var.trim() === '') {
            errors.push(`Step "${step.step_id}" with action "read_value" requires output_var`);
          }

          const method = step.params?.method;
          if (
            method !== undefined &&
            !['innerText', 'textContent', 'value', 'attribute', 'visible'].includes(String(method))
          ) {
            errors.push(
              `Step "${step.step_id}" with action "read_value" has invalid params.method "${String(method)}"`
            );
          }

          if (
            step.params?.method === 'attribute' &&
            (!step.params?.attribute || String(step.params.attribute).trim() === '')
          ) {
            errors.push(
              `Step "${step.step_id}" with action "read_value" requires params.attribute when method is "attribute"`
            );
          }
        }

        if (step.action === 'branch') {
          if (!step.branch) {
            errors.push(`Step "${step.step_id}" with action "branch" requires branch config`);
          } else {
            if (!step.branch.condition_fn || step.branch.condition_fn.trim() === '') {
              errors.push(`Step "${step.step_id}" branch config requires condition_fn`);
            }

            if (!['continue', 'stop'].includes(step.branch.on_match)) {
              errors.push(
                `Step "${step.step_id}" branch config has invalid on_match "${String(step.branch.on_match)}"`
              );
            }

            if (!['continue', 'stop', 'takeover'].includes(step.branch.on_mismatch)) {
              errors.push(
                `Step "${step.step_id}" branch config has invalid on_mismatch "${String(step.branch.on_mismatch)}"`
              );
            }

            if (step.branch.on_mismatch === 'takeover' && !step.branch.takeover_reason?.trim()) {
              warnings.push(
                `Step "${step.step_id}" branch config should provide takeover_reason when on_mismatch is "takeover"`
              );
            }
          }
        }

        if (step.action === 'takeover_gate') {
          const takeoverReason = step.params?.takeover_reason ?? step.params?.reason;
          if (takeoverReason !== undefined && String(takeoverReason).trim() === '') {
            errors.push(
              `Step "${step.step_id}" with action "takeover_gate" has an empty takeover reason`
            );
          }
        }

        if (
          step.execution_policy &&
          ![
            'auto_execute',
            'require_confirmation',
            'require_takeover',
            'forbid_in_replay',
          ].includes(step.execution_policy)
        ) {
          errors.push(
            `Step "${step.step_id}" has invalid execution_policy "${String(step.execution_policy)}"`
          );
        }

        if (step.capture_profile) {
          const profile = step.capture_profile;
          const capture = profile.capture;
          if (profile.schemaVersion !== 'capture-profile/v1') {
            errors.push(`Step "${step.step_id}" capture profile has an unsupported schemaVersion`);
          }
          if (!['article', 'application', 'audit', 'raw'].includes(String(profile.profile))) {
            errors.push(`Step "${step.step_id}" capture profile has an invalid profile`);
          }
          if (
            !capture ||
            !['screenshot', 'html', 'snapshot', 'mainContent'].every(
              (key) => typeof capture[key as keyof typeof capture] === 'boolean'
            )
          ) {
            errors.push(`Step "${step.step_id}" capture profile is incomplete`);
          } else {
            if (!Object.values(capture).some(Boolean)) {
              errors.push(`Step "${step.step_id}" capture profile must enable at least one result`);
            }
            if (capture.mainContent && !capture.html) {
              errors.push(`Step "${step.step_id}" mainContent capture requires HTML capture`);
            }
            if (profile.profile === 'raw' && capture.mainContent) {
              errors.push(`Step "${step.step_id}" raw capture cannot enable mainContent`);
            }
          }
          const readiness = profile.readiness;
          if (readiness) {
            if (
              readiness.waitUntil !== undefined &&
              !['domcontentloaded', 'networkidle'].includes(readiness.waitUntil)
            ) {
              errors.push(`Step "${step.step_id}" readiness waitUntil is invalid`);
            }
            for (const [key, value] of [
              ['timeoutMs', readiness.timeoutMs],
              ['stableMs', readiness.stableMs],
              ['minCount', readiness.minCount],
              ['retryDelayMs', readiness.retryDelayMs],
            ] as const) {
              if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
                errors.push(`Step "${step.step_id}" readiness ${key} is invalid`);
              }
            }
            if (
              readiness.maxAttempts !== undefined &&
              (!Number.isInteger(readiness.maxAttempts) ||
                readiness.maxAttempts < 1 ||
                readiness.maxAttempts > 3)
            ) {
              errors.push(`Step "${step.step_id}" readiness maxAttempts is invalid`);
            }
            if (
              readiness.selector !== undefined &&
              (typeof readiness.selector !== 'string' || !readiness.selector.trim())
            ) {
              errors.push(`Step "${step.step_id}" readiness selector is invalid`);
            }
          }
          const quality = profile.quality;
          if (quality) {
            if (
              quality.minChars !== undefined &&
              (!Number.isInteger(quality.minChars) || quality.minChars < 0)
            ) {
              errors.push(`Step "${step.step_id}" quality minChars is invalid`);
            }
            if (
              quality.minConfidence !== undefined &&
              (!Number.isFinite(quality.minConfidence) ||
                quality.minConfidence < 0 ||
                quality.minConfidence > 1)
            ) {
              errors.push(`Step "${step.step_id}" quality minConfidence is invalid`);
            }
          }
        }

        // Validate locators
        const locatorResult = this.locatorValidator.validateStepLocators(step);
        errors.push(...locatorResult.errors);
        warnings.push(...locatorResult.warnings);
      }
    }

    // 3. Validate params_schema - check for forbidden parameter names (security)
    if (template.params_schema && template.params_schema.properties) {
      for (const paramName of Object.keys(template.params_schema.properties)) {
        const lowerParamName = paramName.toLowerCase();
        if (FORBIDDEN_PARAM_NAMES.some((forbidden) => lowerParamName.includes(forbidden))) {
          errors.push(
            `Forbidden parameter name "${paramName}" detected. Templates cannot contain password/secret parameters.`
          );
        }
      }

      // Check required array
      if (template.params_schema.required && !Array.isArray(template.params_schema.required)) {
        errors.push('params_schema.required must be an array');
      }
    }

    // 4. Validate state machine constraints
    // PUBLISHED templates must have at least one step
    if (template.status === 'PUBLISHED' && (!template.steps || template.steps.length === 0)) {
      errors.push('PUBLISHED templates must have at least one step');
    }

    // 5. Validate step uniqueness
    if (template.steps) {
      const stepIds = template.steps.map((s) => s.step_id);
      const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate step IDs found: ${duplicates.join(', ')}`);
      }
    }

    // 6. Validate idempotency keys uniqueness
    if (template.steps) {
      const idempotencyKeys = template.steps
        .filter((s) => s.idempotency_key)
        .map((s) => s.idempotency_key!);
      const duplicateKeys = idempotencyKeys.filter(
        (key, index) => idempotencyKeys.indexOf(key) !== index
      );
      if (duplicateKeys.length > 0) {
        errors.push(`Duplicate idempotency_keys found: ${duplicateKeys.join(', ')}`);
      }
    }

    this.validateWorkflowComposition(template.config, template.steps || [], errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateWorkflowComposition(
    config: Record<string, unknown> | undefined,
    templateSteps: TemplateJSON['steps'],
    errors: string[]
  ): void {
    const raw = config?.workflowComposition;
    if (raw === undefined) return;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('config.workflowComposition must be an object');
      return;
    }
    const composition = raw as Record<string, unknown>;
    if (composition.schemaVersion !== 'browser-template-workflow-composition/v1') {
      errors.push('config.workflowComposition has an unsupported schemaVersion');
    }
    const pages = Array.isArray(composition.pageAliases) ? composition.pageAliases : [];
    const outputs = Array.isArray(composition.outputDeclarations)
      ? composition.outputDeclarations
      : [];
    const posts = Array.isArray(composition.postProcessingSteps)
      ? composition.postProcessingSteps
      : undefined;
    if (pages.length === 0) errors.push('config.workflowComposition requires pageAliases');
    if (!posts) errors.push('config.workflowComposition.postProcessingSteps must be an array');
    if ((posts?.length || 0) > 0 && outputs.length === 0) {
      errors.push('config.workflowComposition post-processing requires outputDeclarations');
    }

    const aliasNames = pages
      .map((item) => this.readRecordString(item, 'alias'))
      .filter((item): item is string => Boolean(item));
    if (aliasNames.length !== pages.length) {
      errors.push('config.workflowComposition page aliases must be non-empty');
    }
    if (new Set(aliasNames).size !== aliasNames.length) {
      errors.push('config.workflowComposition page aliases must be unique');
    }
    const pagesByAlias = new Map<string, Record<string, unknown>>();
    const browserStepIds = new Set(templateSteps.map((step) => step.step_id));
    pages.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const page = item as Record<string, unknown>;
      const alias = this.readRecordString(page, 'alias');
      const sourceStepId = this.readRecordString(page, 'sourceStepId');
      const captureProfile = this.asRecord(page.captureProfile);
      const capture = this.asRecord(captureProfile?.capture);
      if (alias) pagesByAlias.set(alias, page);
      if (sourceStepId && !browserStepIds.has(sourceStepId)) {
        errors.push('config.workflowComposition page alias references an unknown browser step');
      }
      if (captureProfile?.schemaVersion !== 'capture-profile/v1') {
        errors.push('config.workflowComposition capture profile has an unsupported schemaVersion');
      }
      if (!['article', 'application', 'audit', 'raw'].includes(String(captureProfile?.profile))) {
        errors.push('config.workflowComposition capture profile has an invalid profile');
      }
      if (!capture || !Object.values(capture).some((value) => value === true)) {
        errors.push('config.workflowComposition capture profile must enable at least one result');
      }
    });

    const outputNames = outputs
      .map((item) => this.readRecordString(item, 'name'))
      .filter((item): item is string => Boolean(item));
    if (outputNames.length !== outputs.length) {
      errors.push('config.workflowComposition output names must be non-empty');
    }
    if (new Set(outputNames).size !== outputNames.length) {
      errors.push('config.workflowComposition output names must be unique');
    }
    outputs.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const output = item as Record<string, unknown>;
      const sourceAlias = this.readRecordString(output, 'sourcePageAlias');
      const sourceStepId = this.readRecordString(output, 'sourceStepId');
      if (!sourceAlias || !aliasNames.includes(sourceAlias)) {
        errors.push('config.workflowComposition output references an unknown page alias');
      }
      if (sourceStepId && !browserStepIds.has(sourceStepId)) {
        errors.push('config.workflowComposition output references an unknown browser step');
      }
      if (output.kind === 'content' && sourceAlias) {
        const page = pagesByAlias.get(sourceAlias);
        const captureProfile = this.asRecord(page?.captureProfile);
        const capture = this.asRecord(captureProfile?.capture);
        if (capture?.mainContent !== true) {
          errors.push('config.workflowComposition content output requires mainContent capture');
        }
      }
    });

    const postIds = (posts || [])
      .map((item) => this.readRecordString(item, 'id'))
      .filter((item): item is string => Boolean(item));
    const seenNodeIds = new Set<string>(['browser_recording']);
    const dependedOnNodeIds = new Set<string>();
    (posts || []).forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push('config.workflowComposition post-processing step must be an object');
        return;
      }
      const post = item as Record<string, unknown>;
      const type = this.readRecordString(post, 'type');
      const postId = this.readRecordString(post, 'id');
      const sourceStepId = this.readRecordString(post, 'sourceStepId');
      if (!postId) {
        errors.push('config.workflowComposition post-processing step requires id');
      }
      const explicitDependsOn = Array.isArray(post.dependsOn)
        ? (post.dependsOn as unknown[])
            .map((dependency) => String(dependency || '').trim())
            .filter(Boolean)
        : [];
      const dependsOn = explicitDependsOn.length > 0
        ? Array.from(new Set(explicitDependsOn))
        : ['browser_recording'];
      for (const dependency of dependsOn) {
        dependedOnNodeIds.add(dependency);
        if (!seenNodeIds.has(dependency)) {
          errors.push(
            `config.workflowComposition post-processing step references an unknown or forward dependency: ${dependency}`
          );
        }
      }
      if (!['browser_succeeded', 'browser_terminal'].includes(String(post.runWhen))) {
        errors.push('config.workflowComposition post-processing step has invalid runWhen');
      }
      const sourceStepIds = Array.isArray(post.sourceStepIds)
        ? (post.sourceStepIds as string[]).filter(Boolean)
        : sourceStepId
          ? [sourceStepId]
          : [];
      if (sourceStepIds.length > 0) {
        for (const stepId of sourceStepIds) {
          if (!browserStepIds.has(stepId)) {
            errors.push(
              `config.workflowComposition post-processing step references an unknown browser step: ${stepId}`
            );
          }
        }
      }
      if (type === 'llm_operation') {
        if (
          !this.readRecordString(post, 'operationId') ||
          !this.readRecordString(post, 'operationVersion')
        ) {
          errors.push(
            'config.workflowComposition LLM step requires operationId and operationVersion'
          );
        }
        const bindings = this.asRecord(post.inputBindings);
        Object.values(bindings || {}).forEach((value) => {
          const binding = this.asRecord(value);
          const sourceNodeId =
            this.readRecordString(binding, 'fromNodeId') ||
            this.readRecordString(binding, 'nodeId') ||
            'browser_recording';
          const rawPath = this.readRecordString(binding, 'path');
          const paths = Array.isArray(binding?.paths)
            ? (binding.paths as string[]).filter(Boolean)
            : rawPath?.includes(',')
              ? rawPath
                  .split(',')
                  .map((p) => p.trim())
                  .filter(Boolean)
              : rawPath
                ? [rawPath]
                : [];
          if (
            binding?.source === 'node_output' &&
            !dependsOn.includes(sourceNodeId)
          ) {
            errors.push('config.workflowComposition binding source must be a direct dependency');
          }
          if (
            binding?.source === 'node_output' &&
            sourceNodeId === 'browser_recording' &&
            (paths.length === 0 || paths.some((p) => !outputNames.includes(p)))
          ) {
            errors.push('config.workflowComposition LLM binding references an unknown output');
          }
          if (
            binding?.source === 'node_output' &&
            sourceNodeId === 'browser_recording' &&
            binding.transform !== 'resolve_text_content'
          ) {
            errors.push('config.workflowComposition content binding must use resolve_text_content');
          }
          if (
            binding?.source === 'node_output' &&
            sourceNodeId !== 'browser_recording' &&
            paths.length === 0
          ) {
            errors.push('config.workflowComposition chained binding requires an output path');
          }
        });
      } else if (type === 'workflow_skill') {
        if (!this.readRecordString(post, 'skillId') || !this.readRecordString(post, 'releaseId')) {
          errors.push('config.workflowComposition workflow step requires skillId and releaseId');
        }
      } else {
        errors.push(
          `config.workflowComposition has invalid post-processing type "${String(type)}"`
        );
      }
      if (postId) seenNodeIds.add(postId);
    });
    if (new Set(postIds).size !== postIds.length) {
      errors.push('config.workflowComposition post-processing step IDs must be unique');
    }
    if (postIds.includes('browser_recording')) {
      errors.push('config.workflowComposition post-processing step ID browser_recording is reserved');
    }
    const sinks = postIds.filter((postId) => !dependedOnNodeIds.has(postId));
    const finalNodeId = this.readRecordString(composition, 'finalNodeId');
    if (finalNodeId && !sinks.includes(finalNodeId)) {
      errors.push('config.workflowComposition finalNodeId must reference a DAG sink');
    } else if (!finalNodeId && sinks.length > 1) {
      errors.push('config.workflowComposition with multiple DAG sinks requires finalNodeId');
    }
  }

  private readRecordString(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  /**
   * Quick validation for compile output
   */
  validateCompileOutput(template: Partial<TemplateJSON>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.steps || template.steps.length === 0) {
      errors.push('Compiled template has no steps');
    }

    if (template.steps) {
      for (const step of template.steps) {
        const locatorResult = this.locatorValidator.validateStepLocators(step);
        errors.push(...locatorResult.errors);
        warnings.push(...locatorResult.warnings);
      }
    }

    if (template.params_schema?.properties) {
      for (const paramName of Object.keys(template.params_schema.properties)) {
        const lowerParamName = paramName.toLowerCase();
        if (FORBIDDEN_PARAM_NAMES.some((forbidden) => lowerParamName.includes(forbidden))) {
          errors.push(`Forbidden parameter "${paramName}" in compiled template`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
