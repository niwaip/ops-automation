import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ValueBindingV1,
  RequiredUserInputV1,
  CompactCapabilityCardV1,
} from '@ops/backend-deterministic-plan';
import type { PromptDebugLLMCall } from '../../../interfaces';
import { RecognizerService } from '../../recognizer/recognizer.service';
import { NodeOutputBindingResolverService } from './node-output-binding-resolver.service';
import type { TopologyNodeV1 } from '../topology/deterministic-topology.types';
import {
  projectPreviousResultInput,
  resolveLlmOperationInputRole,
} from './previous-result-input-projector';

interface RawInputSchemaSnapshot {
  required?: string[];
  defaults?: Record<string, unknown>;
  properties?: Record<string, Record<string, unknown>>;
}

export interface ParameterBindingResult {
  nodeBindings: Record<string, Record<string, ValueBindingV1>>;
  planInputs: Record<string, Record<string, unknown>>;
  requiredUserInputs: RequiredUserInputV1[];
  llmCalls?: PromptDebugLLMCall[];
  notes?: string[];
}

/**
 * Parameter names that semantically carry "content to process". When no other
 * source resolves them and the session provides the previous task output, the
 * output is bound as a literal instead of asking the user again.
 */
const CONTENT_PARAM_NAMES = new Set([
  'content',
  'text',
  'markdown',
  'markdown_content',
  'summary',
  'body',
  'content_text',
  'input_text',
]);

const PREVIOUS_RESULT_RECOGNIZER_CONTEXT_LIMIT = 4000;

@Injectable()
export class MultiNodeParameterBinderService {
  private readonly logger = new Logger(MultiNodeParameterBinderService.name);

  constructor(
    private readonly outputResolver: NodeOutputBindingResolverService,
    @Optional() private readonly recognizerService?: RecognizerService,
  ) {}

  public async bindParameters(
    userRequest: string,
    nodes: TopologyNodeV1[],
    capabilityMap: Map<string, CompactCapabilityCardV1>,
    originalInputSchema?: Record<string, RawInputSchemaSnapshot>,
    systemInputs?: Record<string, unknown>,
  ): Promise<ParameterBindingResult> {
    const nodeBindings: Record<string, Record<string, ValueBindingV1>> = {};
    const planInputs: Record<string, Record<string, unknown>> = {};
    const requiredUserInputs: RequiredUserInputV1[] = [];
    const llmCalls: PromptDebugLLMCall[] = [];
    const notes: string[] = [];

    for (const node of nodes) {
      const card = capabilityMap.get(node.capabilityKey);
      const compressedInputs = (card?.inputs as Record<string, string>) || {};
      const bindings: Record<string, ValueBindingV1> = {};
      const nodeInputs: Record<string, unknown> = {};
      const rawSchema =
        originalInputSchema?.[node.capabilityKey] ||
        ((card as any)?._rawInputSchema as RawInputSchemaSnapshot | undefined);
      const requiredFields = new Set(
        Array.isArray(rawSchema?.required) ? rawSchema.required : [],
      );

      nodeBindings[node.ref] = bindings;
      planInputs[node.ref] = nodeInputs;

      const unresolvedFields: string[] = [];
      for (const paramName of Object.keys(compressedInputs)) {
        if (this.isSensitiveFieldName(paramName)) continue;
        const rawProperty = rawSchema?.properties?.[paramName] || { type: 'string' };
        const llmInputRole = card?.kind === 'llm_operation'
          ? resolveLlmOperationInputRole(paramName, rawProperty)
          : undefined;
        if (systemInputs && Object.prototype.hasOwnProperty.call(systemInputs, paramName)) {
          const systemValue = systemInputs[paramName];
          const normalized = this.normalizeBySchema(systemValue, rawProperty);
          if (normalized !== undefined) {
            nodeInputs[paramName] = normalized;
            bindings[paramName] = { source: 'user_input', path: paramName };
            continue;
          }
        }

        if (llmInputRole === 'instruction' && userRequest.trim()) {
          const instruction = userRequest.trim();
          nodeInputs[paramName] = instruction;
          bindings[paramName] = { source: 'literal', value: instruction } as ValueBindingV1;
          continue;
        }

        const upstreamBinding = llmInputRole === 'instruction' || llmInputRole === 'configuration'
          ? undefined
          : this.resolveUpstreamBinding(
              paramName,
              node,
              nodes,
              capabilityMap,
            );
        if (upstreamBinding) {
          bindings[paramName] = upstreamBinding;
          continue;
        }

        // A root, pure LLM Operation may consume the immutable snapshot of the
        // latest completed execution. Projection is based on the declared input
        // schema, so this works for summaries, rewrites, extraction and future
        // array/object/text operations without prompt-specific parameter rules.
        if (card?.kind === 'llm_operation' && node.dependsOn.length === 0) {
          const projected = projectPreviousResultInput(rawProperty, systemInputs, paramName);
          if (projected) {
            const normalized = this.normalizeBySchema(projected.value, rawProperty);
            if (normalized !== undefined) {
              nodeInputs[paramName] = normalized;
              bindings[paramName] = { source: 'literal', value: normalized } as ValueBindingV1;
              notes.push(
                `参数 '${node.ref}.${paramName}' 已从上一次完成执行${projected.sourceExecutionId ? ` ${projected.sourceExecutionId}` : ''}的不可变结果快照中按 Schema 投影。`,
              );
              continue;
            }
          }
        }

        unresolvedFields.push(paramName);
      }

      const recognizerProperties = this.buildRecognizerProperties(
        unresolvedFields,
        compressedInputs,
        rawSchema,
      );
      let recognizedParams: Record<string, unknown> = {};

      if (Object.keys(recognizerProperties).length > 0) {
        if (this.recognizerService) {
          const previousResultText =
            card?.kind !== 'llm_operation' && typeof systemInputs?.previousResultText === 'string'
              ? systemInputs.previousResultText.slice(0, PREVIOUS_RESULT_RECOGNIZER_CONTEXT_LIMIT)
              : undefined;
          const recognized = await this.recognizerService.recognizeParams({
            template_id: card?.displayName || card?.id || node.capabilityKey,
            user_input: userRequest,
            fallbackMode: 'none',
            postProcessMode: 'schema_only',
            context: {
              skill_name: card?.displayName || card?.id || node.capabilityKey,
              skill_description: card?.summary || '',
              node_ref: node.ref,
              ...(previousResultText ? { previous_result_text: previousResultText } : {}),
            },
            params_schema: {
              properties: recognizerProperties as any,
              required: unresolvedFields.filter((field) => requiredFields.has(field)),
            },
          });
          recognizedParams = recognized.params || {};
          llmCalls.push(...(recognized.debug?.llmCalls || []));
          notes.push(...(recognized.debug?.notes || []));
        } else {
          notes.push(
            `Node '${node.ref}' parameter recognizer is unavailable; no fixed-rule extraction was attempted.`,
          );
        }
      }

      for (const paramName of unresolvedFields) {
        const property = recognizerProperties[paramName] || { type: 'string' };
        const schemaSummary = compressedInputs[paramName] || 'string';
        const recognizedHasValue = Object.prototype.hasOwnProperty.call(
          recognizedParams,
          paramName,
        );

        if (recognizedHasValue) {
          const normalized = this.normalizeBySchema(recognizedParams[paramName], property);
          if (normalized !== undefined) {
            nodeInputs[paramName] = normalized;
            bindings[paramName] = { source: 'literal', value: normalized } as ValueBindingV1;
            continue;
          }
          this.logger.warn(
            `Ignoring LLM-recognized value for '${node.ref}.${paramName}' because it violates the selected Skill schema.`,
          );
        }

        const rawDefault = rawSchema?.defaults?.[paramName];
        const summaryDefault = this.decodeSummaryDefault(schemaSummary);
        const defaultCandidate = rawDefault !== undefined ? rawDefault : summaryDefault;
        const normalizedDefault = this.normalizeBySchema(defaultCandidate, property);
        if (normalizedDefault !== undefined) {
          nodeInputs[paramName] = normalizedDefault;
          bindings[paramName] = {
            source: 'literal',
            value: normalizedDefault,
          } as ValueBindingV1;
          continue;
        }

        if (!requiredFields.has(paramName)) continue;

        // Session context fallback: content-carrying parameters reuse the most
        // recent completed task output instead of asking the user again.
        const previousResultText =
          typeof systemInputs?.previousResultText === 'string'
            ? systemInputs.previousResultText.trim()
            : '';
        if (CONTENT_PARAM_NAMES.has(paramName) && previousResultText) {
          nodeInputs[paramName] = previousResultText;
          bindings[paramName] = {
            source: 'literal',
            value: previousResultText,
          } as ValueBindingV1;
          notes.push(
            `参数 '${node.ref}.${paramName}' 未在请求中提供，已自动使用会话中上一次任务的输出作为输入。`,
          );
          continue;
        }

        const inputPath = `planInputs.${node.ref}.${paramName}`;
        const nodeId = `${node.ref}_${card?.displayName || 'step'}`;
        bindings[paramName] = {
          source: 'user_input',
          path: inputPath,
        } as ValueBindingV1;
        requiredUserInputs.push({
          targetField: paramName,
          nodeId,
          prompt: `请输入 ${card?.displayName || node.ref} 的 ${paramName} 参数`,
          name: `${node.ref}.${paramName}`,
          inputPath,
          type: this.resolveDeclaredType(property, schemaSummary),
          description:
            typeof property.description === 'string'
              ? property.description
              : `请输入 ${card?.displayName || node.ref} 的 ${paramName} 参数`,
          missing: true,
        });
      }
    }

    return {
      nodeBindings,
      planInputs,
      requiredUserInputs,
      ...(llmCalls.length > 0 ? { llmCalls } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    };
  }

  private resolveUpstreamBinding(
    paramName: string,
    node: TopologyNodeV1,
    nodes: TopologyNodeV1[],
    capabilityMap: Map<string, CompactCapabilityCardV1>,
  ): ValueBindingV1 | undefined {
    for (const depRef of node.dependsOn) {
      const depNode = nodes.find((candidate) => candidate.ref === depRef);
      const depCard = capabilityMap.get(depNode?.capabilityKey || '');
      const depOutputs = (depCard?.outputs as any)?.properties
        ? ((depCard?.outputs as any).properties as Record<string, unknown>)
        : (depCard?.outputs as Record<string, unknown>) || {};
      const binding = this.outputResolver.resolveNodeOutputBinding(
        depRef,
        depOutputs,
        paramName,
      );
      if (binding) return binding;
    }
    return undefined;
  }

  private buildRecognizerProperties(
    unresolvedFields: string[],
    compressedInputs: Record<string, string>,
    rawSchema?: RawInputSchemaSnapshot,
  ): Record<string, Record<string, unknown>> {
    const properties: Record<string, Record<string, unknown>> = {};
    for (const field of unresolvedFields) {
      const rawProperty = rawSchema?.properties?.[field];
      if (rawProperty) {
        properties[field] = { ...rawProperty };
        continue;
      }
      const summary = compressedInputs[field] || 'string';
      properties[field] = {
        type: summary.split('[')[0] || 'string',
        ...this.decodeSummaryEnum(summary),
      };
    }
    return properties;
  }

  private normalizeBySchema(
    value: unknown,
    property: Record<string, unknown>,
  ): unknown {
    if (value === undefined || value === null) return undefined;
    const type = String(property.type || 'string').toLowerCase();
    let normalized: unknown;

    if (type === 'number' || type === 'integer') {
      if (typeof value === 'number') {
        normalized = value;
      } else if (typeof value === 'string' && value.trim() !== '') {
        normalized = Number(value.trim());
      }
      if (typeof normalized !== 'number' || !Number.isFinite(normalized)) return undefined;
      if (type === 'integer' && !Number.isInteger(normalized)) return undefined;
    } else if (type === 'boolean') {
      if (typeof value === 'boolean') normalized = value;
      else if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) {
        normalized = value.trim().toLowerCase() === 'true';
      } else return undefined;
    } else if (type === 'array') {
      normalized = Array.isArray(value) ? value : this.parseJsonValue(value, Array.isArray);
      if (!Array.isArray(normalized)) return undefined;
    } else if (type === 'object' || type === 'json') {
      normalized =
        value && typeof value === 'object' && !Array.isArray(value)
          ? value
          : this.parseJsonValue(
              value,
              (candidate) => Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate)),
            );
      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return undefined;
    } else {
      if (typeof value === 'string') normalized = value.trim();
      else if (typeof value === 'number' || typeof value === 'boolean') normalized = String(value);
      else return undefined;
      if (normalized === '') return undefined;
    }

    const enumValues = Array.isArray(property.enum) ? property.enum : undefined;
    if (enumValues && enumValues.length > 0 && !enumValues.includes(normalized as never)) {
      return undefined;
    }
    if (typeof normalized === 'string') {
      const minLength = this.asFiniteNumber(property.minLength);
      const maxLength = this.asFiniteNumber(property.maxLength);
      if (minLength !== undefined && normalized.length < minLength) return undefined;
      if (maxLength !== undefined && normalized.length > maxLength) return undefined;
      if (typeof property.pattern === 'string') {
        try {
          if (!new RegExp(property.pattern).test(normalized)) return undefined;
        } catch {
          this.logger.warn(`Ignoring invalid schema pattern: ${property.pattern}`);
          return undefined;
        }
      }
    }
    if (Array.isArray(normalized)) {
      const minItems = this.asFiniteNumber(property.minItems);
      const maxItems = this.asFiniteNumber(property.maxItems);
      if (minItems !== undefined && normalized.length < minItems) return undefined;
      if (maxItems !== undefined && normalized.length > maxItems) return undefined;
    }
    if (typeof normalized === 'number') {
      const minimum = this.asFiniteNumber(property.minimum);
      const maximum = this.asFiniteNumber(property.maximum);
      if (minimum !== undefined && normalized < minimum) return undefined;
      if (maximum !== undefined && normalized > maximum) return undefined;
    }
    return normalized;
  }

  private asFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private parseJsonValue(
    value: unknown,
    predicate: (candidate: unknown) => boolean,
  ): unknown {
    if (typeof value !== 'string') return undefined;
    try {
      const parsed = JSON.parse(value);
      return predicate(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private decodeSummaryEnum(summary: string): { enum?: Array<string | number> } {
    const match = summary.match(/\[enum=([^\]]*)\]/);
    if (!match?.[1]) return {};
    return {
      enum: match[1]
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => (/^-?\d+(\.\d+)?$/.test(token) ? Number(token) : token)),
    };
  }

  private decodeSummaryDefault(summary: string): unknown {
    const match = summary.match(/\[default=([^\]]*)\]/);
    return match?.[1]?.trim() || undefined;
  }

  private resolveDeclaredType(
    property: Record<string, unknown>,
    summary: string,
  ): string {
    return String(property.type || summary.split('[')[0] || 'string');
  }

  private isSensitiveFieldName(fieldName: string): boolean {
    return /api[_-]?key|token|secret|password|credential|authorization/i.test(fieldName);
  }
}
