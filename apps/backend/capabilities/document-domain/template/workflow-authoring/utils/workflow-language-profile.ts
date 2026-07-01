import { WorkflowDocumentIR, WorkflowLanguageProfile } from './workflow-assets';

import { detectTextLanguageHint, safeText } from './workflow-parser-format';

type SupportedWorkflowLanguage = 'zh' | 'ja' | 'en';

const SUPPORTED_WORKFLOW_LANGUAGES: SupportedWorkflowLanguage[] = ['zh', 'ja', 'en'];

export function normalizeWorkflowLanguage(
  language: string | undefined
): SupportedWorkflowLanguage | undefined {
  const normalized = safeText(language).toLowerCase();
  switch (normalized) {
    case 'zh':
    case 'cn':
    case 'zh-cn':
    case 'zh-hans':
    case 'zh-hans-cn':
      return 'zh';
    case 'ja':
    case 'jp':
    case 'ja-jp':
      return 'ja';
    case 'en':
    case 'en-us':
    case 'en-gb':
      return 'en';
    default:
      return undefined;
  }
}

export function collectDocumentLanguages(
  templateDocumentIr: WorkflowDocumentIR
): Set<SupportedWorkflowLanguage> {
  const detectedLanguages = new Set<SupportedWorkflowLanguage>();
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];

  for (const element of elements) {
    const text = safeText(element.text);
    if (text.length < 2) {
      continue;
    }
    const hint = detectTextLanguageHint(text);
    if (hint === 'zh' || hint === 'ja' || hint === 'en') {
      detectedLanguages.add(hint);
    }
  }

  return detectedLanguages;
}

export function isSimpleDocumentBilingualPair(
  leftLanguage: string | undefined,
  rightLanguage: string | undefined
): boolean {
  const left = normalizeWorkflowLanguage(leftLanguage);
  const right = normalizeWorkflowLanguage(rightLanguage);
  if (!left || !right || left === right) {
    return false;
  }

  return (
    (left === 'zh' && (right === 'ja' || right === 'en')) ||
    (right === 'zh' && (left === 'ja' || left === 'en'))
  );
}

export function resolveSimpleTargetLanguages(
  sourceLanguage: string,
  targetLanguages: string[],
  detectedLanguages: Set<SupportedWorkflowLanguage>
): SupportedWorkflowLanguage[] {
  const normalizedSourceLanguage = normalizeWorkflowLanguage(sourceLanguage) || 'zh';
  const requestedLanguages = new Set(
    targetLanguages
      .map((language) => normalizeWorkflowLanguage(language))
      .filter((language): language is SupportedWorkflowLanguage => Boolean(language))
  );

  if (
    normalizedSourceLanguage !== 'ja' &&
    (detectedLanguages.has('ja') || requestedLanguages.has('ja'))
  ) {
    return ['ja'];
  }
  if (
    normalizedSourceLanguage !== 'en' &&
    (detectedLanguages.has('en') || requestedLanguages.has('en'))
  ) {
    return ['en'];
  }
  if (
    normalizedSourceLanguage !== 'zh' &&
    (detectedLanguages.has('zh') || requestedLanguages.has('zh'))
  ) {
    return ['zh'];
  }

  return [];
}

export function buildSimpleWorkflowLanguageProfile(
  templateDocumentIr: WorkflowDocumentIR,
  sourceLanguage: string,
  targetLanguages: string[]
): WorkflowLanguageProfile {
  const normalizedSourceLanguage = normalizeWorkflowLanguage(sourceLanguage) || 'zh';
  const detectedLanguages = collectDocumentLanguages(templateDocumentIr);
  const resolvedTargetLanguages = resolveSimpleTargetLanguages(
    normalizedSourceLanguage,
    targetLanguages,
    detectedLanguages
  );

  return {
    sourceLanguage: normalizedSourceLanguage,
    targetLanguages: resolvedTargetLanguages,
    documentMode: resolvedTargetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
  };
}

export { SUPPORTED_WORKFLOW_LANGUAGES, SupportedWorkflowLanguage };
