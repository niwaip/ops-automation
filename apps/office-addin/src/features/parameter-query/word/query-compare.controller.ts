import type { DocumentIR } from '../../../host/adapters/document-ir';
import type { TemplateCompareResponse } from '../../../api/carbone-api';
import { WordAPI } from '../../../host/office/word/api';
import { extractReadableTextFromWordBase64 } from '../../../shared/utils/office-file-upload';
import type { WordSectionDisplayLanguage } from '../../../host/office/word/chapter';

export type CompareParagraph = {
  id: string;
  text: string;
  index: number;
  format: {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
    style?: string;
    styleBuiltIn?: string;
  };
};

export type CompareUnderlineRange = {
  text: string;
  underlineType: string;
  index: number;
  paragraphIndex: number;
  paragraphText: string;
  position: { start: number; end: number };
};

export type CompareTableCellInfo = {
  sourceBlockId?: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  text: string;
};

type SampleUploadStateLike = {
  uploaded: boolean;
  fileName?: string;
  fileBase64?: string;
  revision: number;
};

type HostAdapterLike = {
  extractDocument: () => Promise<unknown>;
};

type WordCompareCacheEntryLike = {
  updatedAt: number;
  result: TemplateCompareResponse;
};

interface CreateWordQueryCompareControllerOptions {
  hostAdapter: HostAdapterLike;
  sampleUploadState: SampleUploadStateLike;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: WordSectionDisplayLanguage[];
  technicalServiceDebugKeywords: string[];
  setCompareHighlightSummary: (summary: string | null) => void;
  setCompareCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
  setUnderstandingResult: (result: null) => void;
  setRecognitionResult: (result: null) => void;
  setSectionGenerationResults: (results: any[]) => void;
  setRecognitionActivated: (activated: boolean) => void;
  setSuggestions: (suggestions: any[]) => void;
  setCollapsedRecognitionSections: (sections: Record<string, boolean>) => void;
  setRecognitionCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setRecognitionCacheUpdatedAt: (updatedAt: number | null) => void;
  setAnalysisError: (message: string | null, details?: string) => void;
  setIsComparing: (value: boolean) => void;
  setCompareDocumentIr: (documentIr: Record<string, any> | null) => void;
  setCompareResult: (result: TemplateCompareResponse | null) => void;
  addDebugLog: (
    level: 'info' | 'debug' | 'warn' | 'error',
    message: string,
    details?: string
  ) => void;
  buildWordCompareCacheKey: (
    templateDocumentIr: Record<string, any>,
    sampleUploadState: SampleUploadStateLike,
    selectedTemplateType: string,
    headingLanguages: string[]
  ) => string;
  loadWordCompareCache: () => Record<string, WordCompareCacheEntryLike>;
  removeWordCompareCacheEntry: (cacheKey: string) => void;
  saveWordCompareCacheEntry: (entry: {
    cacheKey: string;
    result: TemplateCompareResponse;
    updatedAt: number;
  }) => void;
  buildFrontendCompareResult: (args: {
    templateType: string;
    headingLanguages: WordSectionDisplayLanguage[];
    paragraphs: CompareParagraph[];
    underlines: CompareUnderlineRange[];
    tableCells: CompareTableCellInfo[];
    sampleText: string;
    tableAnchorParagraphMap: Map<number, number>;
  }) => TemplateCompareResponse;
  buildTableAnchorParagraphMap: (
    ooxml: string,
    paragraphs: CompareParagraph[]
  ) => Map<number, number>;
  buildCompareDebugText: (result: TemplateCompareResponse, details: Record<string, any>) => string;
  buildWordKeywordFocusedDebugExcerpt: (args: {
    title: string;
    text: string;
    keywords: string[];
  }) => string;
  buildWordParameterDetectionDebugText: (args: {
    templateType: string;
    paragraphs: CompareParagraph[];
    underlines: Array<{
      text: string;
      underlineType: string;
      paragraphIndex: number;
      paragraphText: string;
      position: { start: number; end: number };
    }>;
    tableCells: CompareTableCellInfo[];
    sampleText?: string;
    includeLabelOnly?: boolean;
    keywordFilters?: string[];
    maxParagraphs?: number;
  }) => string;
  buildWordDocumentStructureDebugText: (documentIr: DocumentIR) => string;
  buildWordChapterDetectionDebugText: (documentIr: DocumentIR) => string;
}

export function createWordQueryCompareController(options: CreateWordQueryCompareControllerOptions) {
  const handleStartCompare = async () => {
    options.setCompareHighlightSummary(null);
    options.setCompareCacheStatus(null);
    options.setCompareCacheUpdatedAt(null);
    options.setUnderstandingResult(null);
    options.setRecognitionResult(null);
    options.setSectionGenerationResults([]);
    options.setRecognitionActivated(false);
    options.setSuggestions([]);
    options.setCollapsedRecognitionSections({});
    options.setRecognitionCacheStatus(null);
    options.setRecognitionCacheUpdatedAt(null);
    options.setAnalysisError(null, undefined);

    if (!options.sampleUploadState.fileBase64) {
      options.setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return;
    }

    options.setIsComparing(true);
    try {
      const templateDocumentIr = await options.hostAdapter.extractDocument();
      const compareCacheKey = options.buildWordCompareCacheKey(
        templateDocumentIr as Record<string, any>,
        options.sampleUploadState,
        options.selectedTemplateType,
        options.effectiveCompareHeadingLanguages
      );
      const cachedCompareEntry = options.loadWordCompareCache()[compareCacheKey];

      options.setCompareDocumentIr(templateDocumentIr as Record<string, any>);

      if (cachedCompareEntry) {
        options.removeWordCompareCacheEntry(compareCacheKey);
      }
      options.addDebugLog(
        'info',
        'Word 参数查询重新执行',
        '本次点击“查询”已跳过已有缓存，并将在完成后写回最新结果。'
      );

      const [paragraphs, underlines, tableCells, ooxml, sampleText] = await Promise.all([
        WordAPI.getParagraphsWithFormat(),
        WordAPI.getUnderlinedTexts(),
        WordAPI.getTableCells(),
        WordAPI.getDocumentOoxml(),
        options.sampleUploadState.fileBase64
          ? extractReadableTextFromWordBase64(options.sampleUploadState.fileBase64)
          : Promise.resolve(''),
      ]);

      const normalizedParagraphs: CompareParagraph[] = paragraphs.map((paragraph) => ({
        id: `word-paragraph-${paragraph.index}`,
        text: paragraph.text,
        index: paragraph.index,
        format: paragraph.format,
      }));
      const normalizedUnderlines: CompareUnderlineRange[] = underlines.map((underline) => ({
        text: underline.text,
        underlineType: underline.underlineType,
        index: underline.index,
        paragraphIndex: underline.paragraphIndex,
        paragraphText: underline.paragraphText,
        position: underline.position,
      }));
      const normalizedTableCells: CompareTableCellInfo[] = tableCells.map((cell) => ({
        sourceBlockId: `word-cell-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`,
        tableIndex: cell.tableIndex,
        rowIndex: cell.rowIndex,
        cellIndex: cell.cellIndex,
        text: cell.text,
      }));

      const result = options.buildFrontendCompareResult({
        templateType: options.selectedTemplateType,
        headingLanguages: options.effectiveCompareHeadingLanguages,
        paragraphs: normalizedParagraphs,
        underlines: normalizedUnderlines,
        tableCells: normalizedTableCells,
        sampleText,
        tableAnchorParagraphMap: options.buildTableAnchorParagraphMap(ooxml, normalizedParagraphs),
      });

      const nextUpdatedAt = Date.now();
      const uncachedResult: TemplateCompareResponse = {
        ...result,
        cacheStatus: {
          compareHit: false,
        },
      };
      options.saveWordCompareCacheEntry({
        cacheKey: compareCacheKey,
        result: uncachedResult,
        updatedAt: nextUpdatedAt,
      });
      options.setCompareResult(uncachedResult);
      options.setCompareCacheStatus('miss');
      options.setCompareCacheUpdatedAt(nextUpdatedAt);
      options.addDebugLog(
        'info',
        'Word 参数查询完成',
        options.buildCompareDebugText(uncachedResult, {
          underlineCount: underlines.length,
          underlineCharCount: underlines.filter(
            (underline) => underline.underlineType === 'underline-char'
          ).length,
          underlineSpaceCount: underlines.filter(
            (underline) => underline.underlineType !== 'underline-char'
          ).length,
          tableCellCount: tableCells.length,
          paragraphCount: paragraphs.length,
          underlines: normalizedUnderlines,
        })
      );
      options.addDebugLog(
        'debug',
        'Word 保修期下划线采集诊断',
        options.buildWordKeywordFocusedDebugExcerpt({
          title: '【下划线定向诊断】',
          text: WordAPI.getLastUnderlineDebugReport(),
          keywords: options.technicalServiceDebugKeywords,
        })
      );
      options.addDebugLog(
        'debug',
        'Word 参数查询逐段诊断',
        options.buildWordParameterDetectionDebugText({
          templateType: options.selectedTemplateType,
          paragraphs: normalizedParagraphs,
          underlines: normalizedUnderlines.map((underline) => ({
            text: underline.text,
            underlineType: underline.underlineType,
            paragraphIndex: underline.paragraphIndex,
            paragraphText: underline.paragraphText,
            position: underline.position,
          })),
          tableCells: normalizedTableCells,
          sampleText,
          includeLabelOnly: true,
          keywordFilters: options.technicalServiceDebugKeywords,
        })
      );
      options.addDebugLog(
        'debug',
        'Word 完整文档结构快照',
        options.buildWordDocumentStructureDebugText(templateDocumentIr as DocumentIR)
      );
      options.addDebugLog(
        'debug',
        'Word 章节判定明细',
        options.buildWordChapterDetectionDebugText(templateDocumentIr as DocumentIR)
      );
    } catch (error: any) {
      options.setAnalysisError(
        error?.message || '参数查询失败',
        error?.stack || error?.response?.data
          ? JSON.stringify(error.response?.data, null, 2)
          : undefined
      );
    } finally {
      options.setIsComparing(false);
    }
  };

  return {
    handleStartCompare,
  };
}
