import type { WordSectionDisplayLanguage } from '../../../host/office/word/chapter';

export const WORD_TECHNICAL_SERVICE_DEBUG_KEYWORDS = [
  '技术服务地点',
  'Place where the technical service is to be rendered',
  '技术服务期限',
  'Duration of technical service',
  '技术服务费总额为',
  'The total amount of such compensation for technical service is',
  '乙方指定银行帐号为',
  'Number of the Bank account designated by Party B is as follows',
];

export const WORD_SECTION_RECOGNITION_BATCH_SIZE = 6;
export const WORD_SECTION_RECOGNITION_MAX_ROUNDS = 5;

export type SampleUploadState = {
  uploaded: boolean;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  revision: number;
};

export type CompareHeadingLanguageSelection = WordSectionDisplayLanguage;

function isContractDocumentType(templateType: string): boolean {
  return templateType === 'contract';
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function getCompareDocumentTypeLabel(templateType: string): string {
  return isContractDocumentType(templateType) ? '合同' : '其他';
}

export function normalizeCompareHeadingLanguages(
  languages: CompareHeadingLanguageSelection[]
): CompareHeadingLanguageSelection[] {
  const normalized = Array.from(new Set(
    languages.filter((language): language is CompareHeadingLanguageSelection =>
      language === 'zh' || language === 'ja' || language === 'en'
    )
  ));

  return normalized.length > 0 ? normalized : ['zh'];
}

export function getCompareHeadingLanguageSummary(
  languages: CompareHeadingLanguageSelection[]
): string {
  const normalized = normalizeCompareHeadingLanguages(languages);
  const labels: Record<CompareHeadingLanguageSelection, string> = {
    zh: '中文',
    ja: '日语',
    en: '英语',
  };
  return normalized.map((language) => labels[language]).join(' + ');
}
