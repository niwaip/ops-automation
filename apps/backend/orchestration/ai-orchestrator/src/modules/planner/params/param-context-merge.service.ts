import { Injectable } from '@nestjs/common';
import { RecognizeParamsResponseDTO } from '../../../interfaces';
import { isPlaceholderTextValue } from '../../../common/placeholder-value';
import { SkillMatchResult } from '../../react-engine/interfaces';

@Injectable()
export class ParamContextMergeService {
  mergeRecognizedWithCollectedContext(
    recognized: RecognizeParamsResponseDTO,
    schema: SkillMatchResult['paramsSchema'],
    context?: Record<string, unknown>
  ): RecognizeParamsResponseDTO {
    const collectedParams = this.extractCollectedParamsFromContext(context, schema);
    if (Object.keys(collectedParams).length === 0) {
      return recognized;
    }

    const recognizedParams = recognized.params || {};
    const recognizedKeys = new Set(Object.keys(recognizedParams));
    const mergedParams = {
      ...collectedParams,
      ...recognizedParams,
    };

    const mergedFieldConfidences: Record<string, number> = {
      ...Object.fromEntries(Object.keys(collectedParams).map((key) => [key, 1])),
      ...(recognized.field_confidences || {}),
    };

    const mergedUncertainFields = (recognized.uncertain_fields || []).filter(
      (field) =>
        !Object.prototype.hasOwnProperty.call(collectedParams, field) || recognizedKeys.has(field)
    );

    return {
      ...recognized,
      params: mergedParams,
      field_confidences:
        Object.keys(mergedFieldConfidences).length > 0
          ? mergedFieldConfidences
          : recognized.field_confidences,
      uncertain_fields: mergedUncertainFields,
      debug: {
        llmCalls: recognized.debug?.llmCalls,
        notes: [
          ...(recognized.debug?.notes || []),
          `planner 已合并 waiting_input 上下文中的 ${Object.keys(collectedParams).length} 个已确认参数`,
        ],
      },
    };
  }

  extractCollectedParamsFromContext(
    context: Record<string, unknown> | undefined,
    schema: SkillMatchResult['paramsSchema']
  ): Record<string, unknown> {
    if (!context || context.mode !== 'waiting_input_resume') {
      return {};
    }

    const alreadyCollected =
      typeof context.already_collected === 'object' &&
      context.already_collected &&
      !Array.isArray(context.already_collected)
        ? (context.already_collected as Record<string, unknown>)
        : undefined;
    if (!alreadyCollected) {
      return {};
    }

    const schemaProperties = schema?.properties || {};
    return Object.fromEntries(
      Object.entries(alreadyCollected)
        .filter(([key]) => Boolean(schemaProperties[key]))
        .map(([key, value]) => [key, this.normalizeMeaningfulInputValue(value)] as const)
        .filter(([, value]) => value !== undefined)
    );
  }

  private normalizeMeaningfulInputValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed) ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeMeaningfulInputValue(item))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'object') {
      const normalizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.normalizeMeaningfulInputValue(item)] as const)
        .filter(([, item]) => item !== undefined);
      return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    return value;
  }
}
