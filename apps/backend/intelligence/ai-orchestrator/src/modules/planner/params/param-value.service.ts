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
      if (!trimmed || isPlaceholderTextValue(trimmed)) {
        return undefined;
      }
      return this.sanitizeSearchActionSuffix(trimmed);
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

  sanitizeSearchActionSuffix(val: string): string {
    // First pass: strip trailing output-format instructions
    // e.g. "，最终输出md文件", "，生成markdown格式报告", ", output to markdown file"
    const OUTPUT_FORMAT_PATTERN =
      /\s*[，,。.；;]?\s*(?:(?:并且|并|然后)?\s*(?:最终|最后)?\s*(?:输出|生成|导出|写出|保存|制作|格式化|output|export|generate|save|write|create)?\s*(?:为|成|到|成为|as|in|to)?\s*(?:一个|一份)?\s*(?:md|markdown|txt|pdf|word|excel|csv|json)\s*(?:格式的)?\s*(?:文件|报告|文档|file|format|report|document)?|(?:输出|生成|制作|output|generate|export)\s*(?:md|markdown|txt|pdf)\s*(?:文件|格式|file|format)?)\s*$/i;
    const withoutOutput = val.replace(OUTPUT_FORMAT_PATTERN, '').trim() || val;

    // Second pass: strip trailing summarization/analysis action instructions
    // e.g. "并且对结果进行总结", "并分析", "并summarize"
    const SUMMARIZE_PATTERN =
      /\s*(?:并且|并|并且对结果|对结果|然后)?\s*(?:进行|做|给出)?\s*(?:总结|概括|归纳|分析|梳理|汇总|提炼|整理|summarize|summary|analysis\b)\s*$/i;
    const cleaned = withoutOutput.replace(SUMMARIZE_PATTERN, '').trim();

    return cleaned || val;
  }
}
