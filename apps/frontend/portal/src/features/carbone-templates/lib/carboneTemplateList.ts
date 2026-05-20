import type { CarboneSkill, CarboneTemplate } from '@/api/carbone';
import { buildOfficeAddinUrl } from '@/shared/config/runtime';

export const OFFICE_ADDIN_TASKPANE_URL = buildOfficeAddinUrl('/taskpane.html');
export const OFFICE_ADDIN_DOWNLOAD_URL = buildOfficeAddinUrl('/download');

export type SkillParameter = {
  name?: string;
  displayName?: string;
  dataType?: string;
  example?: unknown;
  required?: boolean;
  usage?: string;
};

export type ParameterRow = {
  key: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  exampleText: string;
  required: boolean;
  usage: string;
};

export type SkillOverview = {
  templateType: string;
  businessType: string;
  mainScene: string;
};

export const isDraftDocumentTemplate = (template: CarboneTemplate): boolean => {
  const fileName = String(template.fileName || '').trim().toLowerCase();
  return fileName.startsWith('draft-');
};

export const formatExampleValue = (value: unknown): string => {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const toParameterRow = (
  parameter: SkillParameter,
  fieldName: string
): ParameterRow => ({
  key: String(parameter.name || fieldName),
  fieldName,
  displayName: String(parameter.displayName || fieldName),
  dataType: String(parameter.dataType || 'text'),
  exampleText: formatExampleValue(parameter.example),
  required: Boolean(parameter.required),
  usage: String(parameter.usage || '-'),
});

export const extractSkillOverview = (skill?: CarboneSkill | null): SkillOverview => {
  const description = String(skill?.templateDescription || '');
  const businessType = (description.match(/业务类型：([^\n]+)/)?.[1] || '').trim();
  const mainScene = (description.match(/主要场景：([^\n]+)/)?.[1] || '').trim();

  return {
    templateType: String(skill?.templateType || '').trim(),
    businessType,
    mainScene,
  };
};

export const truncateText = (value: string, maxLength = 96): string => {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const getArrayParameterGroups = (
  parameters?: SkillParameter[]
): Array<{ arrayPath: string; fields: ParameterRow[] }> => {
  const groups = new Map<string, ParameterRow[]>();

  for (const parameter of parameters || []) {
    const name = String(parameter?.name || '');
    const match = name.match(/^([^[]+\[\])\.(.+)$/);
    if (!match) continue;

    const [, arrayPath, fieldName] = match;
    if (!groups.has(arrayPath)) {
      groups.set(arrayPath, []);
    }
    groups.get(arrayPath)?.push(toParameterRow(parameter, fieldName));
  }

  return Array.from(groups.entries())
    .map(([arrayPath, fields]) => ({
      arrayPath,
      fields: fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName, 'zh-Hans-CN')),
    }))
    .sort((a, b) => a.arrayPath.localeCompare(b.arrayPath, 'zh-Hans-CN'));
};

export const getScalarParameters = (parameters?: SkillParameter[]): ParameterRow[] => (
  (parameters || [])
    .filter((parameter) => {
      const name = String(parameter?.name || '');
      return name.length > 0 && !name.includes('[].');
    })
    .map((parameter) => toParameterRow(parameter, String(parameter?.name || '')))
    .sort((a, b) => a.fieldName.localeCompare(b.fieldName, 'zh-Hans-CN'))
);
