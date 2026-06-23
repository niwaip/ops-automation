import { Logger } from '@nestjs/common';
import { WorkflowTemplateFieldSpec } from './workflow-assets';
import { safeText } from './document-xml-parser';
import {
  resolveTabularRowWidth,
  shouldMergeBilingualTabularRows,
  mergeTabularCellText,
  resolveListColumnKeys,
} from './workflow-table-normalizer';
import { isStudioVerboseDebugEnabled } from '../studio-debug.helper';

const logger = new Logger('WorkflowRenderInputHelper');
const verboseDebugEnabled = isStudioVerboseDebugEnabled();

export function readSelector(value: Record<string, unknown>, selector: string): unknown {
  const selectorText = safeText(selector);
  if (!selectorText) {
    return undefined;
  }

  const trySegments = (segments: string[]): unknown => {
    let current: unknown = value;
    for (const segment of segments) {
      if (
        !current ||
        typeof current !== 'object' ||
        !(segment in (current as Record<string, unknown>))
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  };

  const buildCandidateSegments = (path: string): string[][] => {
    const segments = path.split('.').filter(Boolean);
    return segments.map((_, index) => segments.slice(index));
  };

  const strippedSelector = selectorText.replace(/^\w+\./, '');
  const candidateGroups = [
    ...buildCandidateSegments(strippedSelector),
    ...buildCandidateSegments(selectorText),
  ];
  const seen = new Set<string>();

  for (const segments of candidateGroups) {
    const key = segments.join('.');
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const resolved = trySegments(segments);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
}

export function extractFieldValue(
  fieldId: string,
  userInput: string,
  overrideValue: unknown
): unknown {
  if (overrideValue !== undefined) {
    return overrideValue;
  }

  const normalizedInput = userInput.trim();
  const matchValue = (patterns: RegExp[]): string | undefined => {
    for (const pattern of patterns) {
      const match = normalizedInput.match(pattern);
      const value = match?.[1]?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  switch (fieldId) {
    case 'partyAName':
      return matchValue([/甲方(?:是|为)?([^，。；]+)/u, /委托方(?:是|为)?[:：]?\s*([^，。；]+)/u]);
    case 'partyBName':
      return matchValue([/乙方(?:是|为)?([^，。；]+)/u, /受托方(?:是|为)?[:：]?\s*([^，。；]+)/u]);
    case 'projectName':
      return matchValue([
        /项目(?:名称)?(?:是|为)?([^，。；]+)/u,
        /件名(?:是|为)?[:：]?\s*([^，。；]+)/u,
      ]);
    case 'serviceLocation':
    case 'deliveryLocation':
      return matchValue([
        /(?:服务|交付|签订)地点(?:是|为)?([^，。；]+)/u,
        /地点[:：]?\s*([^，。；]+)/u,
      ]);
    case 'serviceFeeTotal':
      return matchValue([
        /(?:技术服务费总额|服务费总额|合同总额|总金额|总价)(?:为|是)?([^，。；]+)/u,
        /(人民币[\d,]+(?:\.\d+)?元?)/u,
      ]);
    case 'paymentMode':
      return matchValue([/(一次支付|一次付款|一次性支付|一次|分期支付|分期付款|分期|分次支付)/u]);
    case 'bankAccount':
      return matchValue([/(?:银行账号|银行账户)(?:为|是)?([0-9]{8,})/u, /\b([0-9]{8,})\b/u]);
    case 'signingDate':
      return matchValue([
        /(?:签订日期|签约日期)(?:为|是)?([0-9]{4}[年/-][0-9]{1,2}[月/-][0-9]{1,2}日?)/u,
      ]);
    case 'acceptanceDays':
      return matchValue([/验收(?:期限|天数)?(?:为|是)?([0-9]+)\s*天/u]);
    case 'paymentDeadlineDays':
      return matchValue([/付款(?:期限|截止天数)?(?:为|是)?([0-9]+)\s*(?:天|工作日)/u]);
    case 'serviceScopeSummary':
      return matchValue([/(?:服务内容|服务范围)(?:是|为)?([^。；]+)/u]);
    default:
      return undefined;
  }
}

export function parseListValueFromText(
  rawInput: string,
  spec: WorkflowTemplateFieldSpec
): Array<Record<string, unknown>> | undefined {
  const normalizedInput = typeof rawInput === 'string' ? rawInput.replace(/\r/g, '') : '';
  if (!normalizedInput || !normalizedInput.includes('\t')) {
    return undefined;
  }

  const lines = normalizedInput
    .split('\n')
    .map((line) => line.replace(/^[ \f\v]+|[ \f\v]+$/g, ''))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t').map((cell) => cell.trim()));

  if (lines.length < 2) {
    return undefined;
  }

  const expectedWidth = resolveTabularRowWidth(lines, spec.itemSchema);
  if (!expectedWidth || expectedWidth < 2) {
    return undefined;
  }

  const candidateRows = lines.filter((row) => row.length === expectedWidth);
  if (candidateRows.length < 2) {
    return undefined;
  }

  const logicalRows: string[][] = [];
  for (let index = 0; index < candidateRows.length; index += 1) {
    const currentRow = candidateRows[index];
    const nextRow = candidateRows[index + 1];
    if (nextRow && shouldMergeBilingualTabularRows(currentRow, nextRow, expectedWidth)) {
      logicalRows.push(
        currentRow.map((cell, cellIndex) => mergeTabularCellText(cell, nextRow[cellIndex]))
      );
      index += 1;
      continue;
    }
    logicalRows.push(currentRow);
  }

  if (logicalRows.length < 2) {
    return undefined;
  }

  const headerRow = logicalRows[0];
  const dataRows = logicalRows.slice(1).filter((row) => row.some((cell) => safeText(cell)));

  if (dataRows.length === 0) {
    return undefined;
  }

  const columnKeys = resolveListColumnKeys(headerRow, spec.itemSchema, expectedWidth);
  const items = dataRows.map((row) => {
    const item: Record<string, unknown> = {};
    for (let index = 0; index < expectedWidth; index += 1) {
      const key = columnKeys[index];
      if (!key) {
        continue;
      }
      item[key] = safeText(row[index]);
    }
    return item;
  });
  if (spec.type === 'table_row' && verboseDebugEnabled) {
    logger.log(
      `[table-data] parsed field=${spec.fieldId} rows=${items.length} width=${expectedWidth}`
    );
  }
  return items;
}
