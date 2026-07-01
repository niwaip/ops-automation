import { Logger } from '@nestjs/common';
import { DocumentElement } from '../document-structure.service';
import {
  DEFAULT_PATH_MAPPINGS,
  PathMappingRule,
  StaticElement,
  TemplateConfig,
  VariableMapping,
} from './types';

const logger = new Logger('StudioTemplateConfigPathHelper');

export function validateVariableMappings(
  mappings: any[],
  elements: DocumentElement[],
  pathMappings?: PathMappingRule[],
  staticElements?: StaticElement[]
): VariableMapping[] {
  const result: VariableMapping[] = [];
  const protectedTitleTexts = new Set<string>(
    (Array.isArray(staticElements) ? staticElements : [])
      .filter((item) => String(item?.type || '').trim() === 'title')
      .map((item) => String(item?.content || '').trim())
      .filter(Boolean)
  );

  for (const mapping of mappings) {
    const index = mapping.elementIndex !== undefined ? mapping.elementIndex - 1 : mapping.index;

    if (index !== undefined && index >= 0 && index < elements.length) {
      const element = elements[index];
      let path = mapping.path || `d.var_${index}`;
      path = normalizeVariablePath(path, pathMappings);

      if (shouldSkipProtectedTitleVariableMapping(path, element, mapping, protectedTitleTexts)) {
        continue;
      }

      let type = mapping.type || 'text';
      if (element.type === 'image' || (element.imageId && element.imageId !== '')) {
        type = 'image';
      }

      result.push({
        path,
        sampleValue: element.text || mapping.sampleValue || mapping.content || '',
        index,
        type,
        reason: mapping.reason || 'AI 识别的变量',
      });
    }
  }

  return result;
}

export function normalizeVariablePath(
  originalPath: string,
  pathMappings?: PathMappingRule[]
): string {
  const mappings = pathMappings || DEFAULT_PATH_MAPPINGS;

  for (const rule of mappings) {
    if (rule.patterns.includes(originalPath)) {
      logger.debug(`Path mapping: ${originalPath} -> ${rule.standardPath} (${rule.description})`);
      return rule.standardPath;
    }

    for (const pattern of rule.patterns) {
      if (matchPathPattern(originalPath, pattern)) {
        logger.debug(
          `Path mapping (pattern): ${originalPath} -> ${rule.standardPath} (${rule.description})`
        );
        return rule.standardPath;
      }
    }
  }

  if (!originalPath.startsWith('d.')) {
    const correctedPath = `d.${originalPath.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}`;
    logger.debug(`Auto-correcting path: ${originalPath} -> ${correctedPath}`);
    return correctedPath;
  }

  return originalPath;
}

export function matchPathPattern(path: string, pattern: string): boolean {
  if (path === pattern) return true;
  if (path.toLowerCase() === pattern.toLowerCase()) return true;

  const snakeCase = (value: string) =>
    value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (snakeCase(path) === snakeCase(pattern)) return true;

  return false;
}

export function normalizeTemplateConfig(config: TemplateConfig): TemplateConfig {
  if (!config) return config;

  if (config.variableMappings && Array.isArray(config.variableMappings)) {
    config.variableMappings = config.variableMappings.map((mapping) => ({
      ...mapping,
      path: normalizeVariablePath(mapping.path),
    }));
  }

  if (config.tableLoops && Array.isArray(config.tableLoops)) {
    config.tableLoops = config.tableLoops.map((loop) => ({
      ...loop,
      columnMappings: (loop.columnMappings || []).map((col) => ({
        ...col,
        variablePath: normalizeColumnPath(col.variablePath),
      })),
    }));
  }

  return config;
}

export function normalizeColumnPath(path: string): string {
  if (!path) return path;

  const arrayMatch = path.match(/^(d\.[A-Za-z0-9_.]+)\[\]\.(\w+)$/);
  if (arrayMatch) {
    const arrayPath = arrayMatch[1];
    const fieldName = arrayMatch[2];
    const normalizedFieldName = normalizeFieldName(fieldName);
    return `${arrayPath}[].${normalizedFieldName}`;
  }

  return path;
}

export function normalizeFieldName(fieldName: string): string {
  const fieldMappings: Record<string, string> = {
    starttime: 'start',
    startTime: 'start',
    begin: 'start',
    开始: 'start',
    stepaction: 'action',
    stepAction: 'action',
    stepResult: 'result',
    stepresult: 'result',
    stepStatus: 'status',
    stepstatus: 'status',
    resultAction: 'result',
    resultaction: 'result',
  };

  return fieldMappings[fieldName] || fieldName.toLowerCase();
}

export function shouldSkipProtectedTitleVariableMapping(
  path: string,
  element: DocumentElement,
  mapping: any,
  protectedTitleTexts: Set<string>
): boolean {
  if (protectedTitleTexts.size === 0) {
    return false;
  }

  const normalizedPath = String(path || '')
    .trim()
    .toLowerCase();
  const elementText = String(element?.text || element?.content || '').trim();
  const mappingText = String(mapping?.sampleValue || mapping?.content || '').trim();
  const isProtectedTitle =
    String(element?.type || '').trim() === 'title' ||
    protectedTitleTexts.has(elementText) ||
    protectedTitleTexts.has(mappingText);

  if (!isProtectedTitle) {
    return false;
  }

  return /(^d\.title$|\.title$)/u.test(normalizedPath);
}
