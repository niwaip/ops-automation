import { Logger } from '@nestjs/common';
import { WorkflowTemplateFieldSpec } from './workflow-assets';
import {
  safeText,
  normalizeLookupText,
  splitTableCellLines,
  detectTextLanguageHint,
  isConcreteLanguageHint,
} from './workflow-parser-format';

const logger = new Logger('WorkflowTableNormalizer');

export function resolveTabularRowWidth(lines: string[][], itemSchema?: string[]): number | undefined {
  if (Array.isArray(itemSchema) && itemSchema.length >= 2) {
    return itemSchema.length;
  }

  const counts = new Map<number, number>();
  for (const row of lines) {
    if (row.length < 2) {
      continue;
    }
    counts.set(row.length, (counts.get(row.length) || 0) + 1);
  }

  let selectedWidth: number | undefined;
  let selectedCount = 0;
  for (const [width, count] of counts.entries()) {
    if (count > selectedCount) {
      selectedWidth = width;
      selectedCount = count;
    }
  }
  return selectedWidth;
}

export function shouldMergeBilingualTabularRows(
  currentRow: string[],
  nextRow: string[],
  expectedWidth: number,
): boolean {
  if (currentRow.length !== expectedWidth || nextRow.length !== expectedWidth) {
    return false;
  }

  const currentHint = detectTextLanguageHint(currentRow.join(' '));
  const nextHint = detectTextLanguageHint(nextRow.join(' '));
  if (
    isConcreteLanguageHint(currentHint)
    && isConcreteLanguageHint(nextHint)
    && currentHint !== nextHint
  ) {
    return true;
  }

  return currentRow.some((cell, index) => {
    const currentText = safeText(cell);
    const nextText = safeText(nextRow[index]);
    if (!currentText || !nextText || currentText === nextText) {
      return false;
    }
    const currentCellHint = detectTextLanguageHint(currentText);
    const nextCellHint = detectTextLanguageHint(nextText);
    return isConcreteLanguageHint(currentCellHint)
      && isConcreteLanguageHint(nextCellHint)
      && currentCellHint !== nextCellHint;
  });
}

export function mergeTabularCellText(primary: string, secondary: string): string {
  const first = safeText(primary);
  const second = safeText(secondary);
  if (!first) {
    return second;
  }
  if (!second || first === second) {
    return first;
  }
  return `${first}\n${second}`;
}

export function resolveListColumnKeys(
  headerRow: string[],
  itemSchema: string[] | undefined,
  expectedWidth: number,
): string[] {
  if (Array.isArray(itemSchema) && itemSchema.length === expectedWidth) {
    return itemSchema;
  }

  return headerRow.map((header, index) => {
    const normalizedHeader = normalizeLookupText(safeText(header));
    if (/项目|件名|project/u.test(normalizedHeader)) {
      return 'projectName';
    }
    if (/品名|服务|名称|item|service/u.test(normalizedHeader)) {
      return 'itemName';
    }
    if (/数量|qty|quantity/u.test(normalizedHeader)) {
      return 'quantity';
    }
    if (/维护费|メンテ|金额|费用|price|fee|amount/u.test(normalizedHeader)) {
      return 'maintenanceFee';
    }
    return `column${index + 1}`;
  });
}

export function normalizeTableListRows(
  rows: Array<Record<string, unknown>>,
  spec: WorkflowTemplateFieldSpec,
  sourceLanguage: string,
  targetLanguages: string[],
): Array<Record<string, unknown>> {
  if (spec.type !== 'table_row' || !Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const preferredLanguages = resolveTableRowLanguages(spec, sourceLanguage, targetLanguages);
  const hasExplicitAliases = rows.some((row) =>
    Object.keys(row || {}).some((key) => Boolean(extractTableFieldBaseKey(key, preferredLanguages))),
  );
  const hasMultilineCells = rows.some((row) =>
    Object.values(row || {}).some((value) => splitTableCellLines(safeText(value)).length >= 2),
  );
  const shouldExpand = hasExplicitAliases || (preferredLanguages.length >= 2 && hasMultilineCells);
  if (!shouldExpand) {
    return rows;
  }

  const normalizedRows = rows.map((row) => normalizeTableListRow(row, spec, preferredLanguages));
  const expandedRows = normalizedRows.filter((row, index) =>
    JSON.stringify(row) !== JSON.stringify(rows[index])
  ).length;

  if (expandedRows > 0) {
    logger.log(
      `[table-data] normalized field=${spec.fieldId} rows=${rows.length} expandedRows=${expandedRows} languages=${preferredLanguages.join(',') || 'auto'}`,
    );
    logger.debug(
      `[table-data] normalized field=${spec.fieldId} sampleKeys=${Object.keys(normalizedRows[0] || {}).join(',')}`,
    );
  }

  return normalizedRows;
}

export function normalizeTableListRow(
  row: Record<string, unknown>,
  spec: WorkflowTemplateFieldSpec,
  preferredLanguages: string[],
): Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row;
  }

  const normalizedRow: Record<string, unknown> = { ...row };
  const rowKeys = Object.keys(normalizedRow);
  const rowHasMultilingualSignal = rowKeys.some((key) =>
    Boolean(extractTableFieldBaseKey(key, preferredLanguages)),
  ) || Object.values(normalizedRow).some((value) =>
    splitTableCellLines(safeText(value)).length >= 2,
  );
  const baseKeys = new Set<string>(
    rowKeys.map((key) => extractTableFieldBaseKey(key, preferredLanguages) || key),
  );

  for (const itemKey of spec.itemSchema || []) {
    baseKeys.add(extractTableFieldBaseKey(itemKey, preferredLanguages) || itemKey);
  }

  for (const baseKey of baseKeys) {
    const aliasMap = resolveTableCellAliasMap(
      normalizedRow,
      baseKey,
      preferredLanguages,
      rowHasMultilingualSignal,
    );
    for (const [lang, value] of aliasMap.entries()) {
      const languageKey = `${baseKey}_${lang}`;
      if (normalizedRow[languageKey] === undefined && value !== undefined) {
        normalizedRow[languageKey] = value;
      }
    }

    if (normalizedRow[baseKey] === undefined) {
      const mergedValue = mergeTableLanguageValues(aliasMap, preferredLanguages);
      if (mergedValue !== undefined) {
        normalizedRow[baseKey] = mergedValue;
      }
    }
  }

  return normalizedRow;
}

export function resolveTableRowLanguages(
  spec: WorkflowTemplateFieldSpec,
  sourceLanguage: string,
  targetLanguages: string[],
): string[] {
  return Array.from(
    new Set([
      spec.sourceLanguage || sourceLanguage,
      ...(spec.targetLanguages || []),
      ...targetLanguages,
    ].filter(Boolean)),
  );
}

export function extractTableFieldBaseKey(key: string, preferredLanguages: string[]): string | undefined {
  const match = key.match(/^(.+)_([a-z]{2,5})$/iu);
  if (!match) {
    return undefined;
  }

  const suffix = match[2].toLowerCase();
  if (preferredLanguages.includes(suffix) || ['zh', 'ja', 'en'].includes(suffix)) {
    return match[1];
  }
  return undefined;
}

export function resolveTableCellAliasMap(
  row: Record<string, unknown>,
  baseKey: string,
  preferredLanguages: string[],
  rowHasMultilingualSignal: boolean,
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  const baseValue = safeText(row[baseKey]);

  for (const [key, rawValue] of Object.entries(row)) {
    const suffix = extractTableLanguageSuffix(key, baseKey);
    const normalizedValue = safeText(rawValue);
    if (!suffix || !normalizedValue) {
      continue;
    }
    aliasMap.set(suffix, normalizedValue);
  }

  if (!baseValue) {
    if (rowHasMultilingualSignal && preferredLanguages.length >= 2 && baseKey in row) {
      for (const language of preferredLanguages) {
        if (!aliasMap.has(language)) {
          aliasMap.set(language, '');
        }
      }
    }
    return aliasMap;
  }

  if (preferredLanguages.length === 0 && aliasMap.size === 0) {
    return aliasMap;
  }

  const lines = splitTableCellLines(baseValue);
  if (lines.length >= 2 && preferredLanguages.length >= 2) {
    const orderedLanguages = orderTableLanguagesForCell(lines, preferredLanguages);
    for (let index = 0; index < orderedLanguages.length && index < lines.length; index += 1) {
      const language = orderedLanguages[index];
      if (!aliasMap.has(language)) {
        aliasMap.set(language, lines[index]);
      }
    }
    return aliasMap;
  }

  if (lines.length === 1 && preferredLanguages.length >= 1) {
    const [line] = lines;
    const hint = detectTextLanguageHint(line);
    if (isLanguageNeutralTableValue(line)) {
      for (const language of preferredLanguages) {
        if (!aliasMap.has(language)) {
          aliasMap.set(language, line);
        }
      }
    } else if (isConcreteLanguageHint(hint)) {
      if (!aliasMap.has(hint)) {
        aliasMap.set(hint, line);
      }
    } else {
      for (const language of preferredLanguages) {
        if (!aliasMap.has(language)) {
          aliasMap.set(language, line);
        }
      }
    }
  }

  return aliasMap;
}

export function extractTableLanguageSuffix(key: string, baseKey: string): string | undefined {
  const match = key.match(/^(.+)_([a-z]{2,5})$/iu);
  if (!match || match[1] !== baseKey) {
    return undefined;
  }
  return match[2].toLowerCase();
}

export function orderTableLanguagesForCell(lines: string[], preferredLanguages: string[]): string[] {
  const detectedLanguages = lines
    .map((line) => detectTextLanguageHint(line))
    .filter((hint): hint is 'zh' | 'ja' | 'en' => isConcreteLanguageHint(hint));

  if (
    detectedLanguages.length === lines.length
    && new Set(detectedLanguages).size === detectedLanguages.length
  ) {
    return detectedLanguages;
  }

  return preferredLanguages.slice(0, lines.length);
}

export function mergeTableLanguageValues(
  aliasMap: Map<string, string>,
  preferredLanguages: string[],
): string | undefined {
  const orderedValues = preferredLanguages
    .map((language) => safeText(aliasMap.get(language)))
    .filter(Boolean);
  const fallbackValues = Array.from(aliasMap.values()).filter((value) =>
    !orderedValues.includes(value),
  );
  const values = [...orderedValues, ...fallbackValues];
  if (values.length === 0) {
    return undefined;
  }
  if (values.every((value) => value === values[0])) {
    return values[0];
  }
  return values.join('\n');
}

export function isLanguageNeutralTableValue(value: string): boolean {
  const normalizedValue = safeText(value);
  if (!normalizedValue) {
    return false;
  }
  return /^[¥$€￥0-9,.\-/%() \t年月日天工作日元円个次份]*$/u.test(normalizedValue);
}
