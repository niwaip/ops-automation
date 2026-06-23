import { Injectable } from '@nestjs/common';
import { RequiredInputDTO } from '../../../interfaces';
import { resolveFriendlyInputDisplayName } from '../../../common/input-label';

@Injectable()
export class ParamRequiredInputPresentationService {
  decorateArrayGroupCompletenessDescription(
    description: string | undefined,
    currentCount: number,
    targetCount: number,
    incomplete: boolean
  ): string | undefined {
    const base = String(description || '').trim();
    if (!incomplete) {
      return base || description;
    }
    const note = `当前仅识别 ${currentCount}/${targetCount} 条，请补齐同组其它行`;
    return base ? `${base}；${note}` : note;
  }

  resolveRequiredInputDisplayName(
    name: string,
    displayName?: string,
    description?: string
  ): string | undefined {
    const resolved = resolveFriendlyInputDisplayName({
      name,
      display_name: displayName,
      description,
    });
    return resolved || displayName || name;
  }

  decorateRequiredInputDescription(
    description: string | undefined,
    value: unknown,
    missingReason: RequiredInputDTO['missing_reason'],
    confidence?: number
  ): string | undefined {
    const base = String(description || '').trim();
    if (!missingReason || missingReason === 'missing') {
      return base || description;
    }

    const preview = this.summarizeInputValue(value);
    const confidenceText =
      typeof confidence === 'number' ? `，当前识别置信度 ${(confidence * 100).toFixed(0)}%` : '';
    const reason =
      missingReason === 'overall_low_confidence'
        ? `已识别候选值“${preview}”，但本轮整体识别置信度偏低${confidenceText}，请确认或改写`
        : missingReason === 'partial_group'
          ? `已识别候选值“${preview}”，但同组数组条数尚未对齐，请确认已识别内容并补齐缺失项`
          : `已识别候选值“${preview}”，但该字段置信度偏低${confidenceText}，请确认或改写`;
    return base ? `${base}；${reason}` : reason;
  }

  summarizeInputValue(value: unknown): string {
    if (Array.isArray(value)) {
      const normalized = value.map((item) => String(item ?? '').trim()).filter(Boolean);
      if (normalized.length === 0) {
        return '空';
      }
      return normalized.length === 1 ? normalized[0]! : `${normalized[0]} 等 ${normalized.length} 项`;
    }

    const text = String(value ?? '').trim();
    if (!text) {
      return '空';
    }
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  }

  resolveRenderPath(
    schemaMeta: Record<string, unknown>
  ): Partial<Pick<RequiredInputDTO, 'render_path'>> {
    if (typeof schemaMeta.renderPath === 'string' && schemaMeta.renderPath.trim()) {
      return { render_path: schemaMeta.renderPath.trim() };
    }
    if (Array.isArray(schemaMeta.renderPath)) {
      const renderPaths = schemaMeta.renderPath
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (renderPaths.length > 0) {
        return { render_path: renderPaths };
      }
    }
    return {};
  }
}
