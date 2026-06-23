import { Injectable } from '@nestjs/common';
import { isPlaceholderTextValue } from '../../../common/placeholder-value';

@Injectable()
export class ParamValueService {
  hasMeaningfulRequiredInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed);
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulRequiredInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) =>
        this.hasMeaningfulRequiredInputValue(item)
      );
    }
    return true;
  }

  normalizeMeaningfulInputValue(value: unknown): unknown {
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

  buildArrayGroupTargetCounts(
    properties: Record<string, { type: string }>,
    recognizedParams: Record<string, unknown>
  ): Record<string, number> {
    return Object.entries(properties).reduce<Record<string, number>>((acc, [name, schema]) => {
      const groupKey = this.extractArrayGroupKey(name, schema.type);
      if (!groupKey) {
        return acc;
      }
      const count = this.countMeaningfulRequiredInputItems(recognizedParams[name]);
      if (count > 0) {
        acc[groupKey] = Math.max(acc[groupKey] || 0, count);
      }
      return acc;
    }, {});
  }

  countMeaningfulRequiredInputItems(value: unknown): number {
    if (value === undefined || value === null) {
      return 0;
    }
    if (Array.isArray(value)) {
      return value.filter((item) => this.hasMeaningfulRequiredInputValue(item)).length;
    }
    return this.hasMeaningfulRequiredInputValue(value) ? 1 : 0;
  }

  normalizeOptionalDefaultValue(value: unknown): unknown {
    return this.normalizeMeaningfulInputValue(value);
  }

  extractArrayGroupKey(name: string, type?: string): string | undefined {
    const arrayPathMatch = name.match(/^([a-zA-Z0-9_]+)\[\]/);
    if (arrayPathMatch?.[1]) {
      return arrayPathMatch[1];
    }

    if (String(type || '').toLowerCase() === 'array') {
      return name;
    }

    return undefined;
  }
}
