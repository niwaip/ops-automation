import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';
import { WordAPI } from '../../../host/office/word/api';

interface CreateWordQueryHighlightControllerOptions {
  compareResult: TemplateCompareResponse | null;
  effectiveCompareCandidateFields: TemplateFieldCandidate[];
  setAnalysisError: (message: string | null, details?: string) => void;
  setIsHighlightingCandidates: (value: boolean) => void;
  setIsClearingHighlights: (value: boolean) => void;
  setCompareHighlightSummary: (summary: string | null) => void;
  addDebugLog: (
    level: 'info' | 'debug' | 'warn' | 'error',
    message: string,
    details?: string
  ) => void;
  getCandidateDisplayName: (candidate: TemplateFieldCandidate) => string;
}

async function highlightCompareCandidate(candidate: TemplateFieldCandidate): Promise<boolean> {
  const location = candidate.location;
  if (!location) {
    return false;
  }

  if (typeof location.contentControlId === 'number') {
    return WordAPI.highlightContentControlById(location.contentControlId);
  }

  if (
    typeof location.tableIndex === 'number' &&
    typeof location.rowIndex === 'number' &&
    typeof location.cellIndex === 'number'
  ) {
    return WordAPI.highlightTableCell(location.tableIndex, location.rowIndex, location.cellIndex);
  }

  if (
    typeof location.paragraphIndex === 'number' &&
    typeof location.anchorStart === 'number' &&
    typeof location.anchorEnd === 'number'
  ) {
    return WordAPI.highlightUnderlineByPosition(
      location.paragraphIndex,
      location.anchorStart,
      location.anchorEnd,
      candidate.anchorText
    );
  }

  const fallbackText = String(
    candidate.anchorText || candidate.sampleValue || candidate.matchText || ''
  ).trim();
  if (!fallbackText) {
    return false;
  }

  const highlightCount = await WordAPI.highlightText(fallbackText);
  return highlightCount > 0;
}

export function createWordQueryHighlightController(
  options: CreateWordQueryHighlightControllerOptions
) {
  const handleHighlightCompareCandidates = async () => {
    if (!options.compareResult) {
      return;
    }

    const candidates =
      options.effectiveCompareCandidateFields.length > 0
        ? options.effectiveCompareCandidateFields
        : options.compareResult.candidateFields;

    if (candidates.length === 0) {
      options.setCompareHighlightSummary('当前没有可高亮的候选参数。');
      return;
    }

    options.setAnalysisError(null, undefined);
    options.setIsHighlightingCandidates(true);
    options.setCompareHighlightSummary(null);

    try {
      await WordAPI.clearAllHighlights();
      let highlightedCount = 0;

      for (const candidate of candidates) {
        const highlighted = await highlightCompareCandidate(candidate);
        if (highlighted) {
          highlightedCount += 1;
        }
      }

      const summary =
        highlightedCount > 0
          ? `已高亮 ${highlightedCount} / ${candidates.length} 个候选位置，可直接回到文档核对。`
          : '本次未能定位到可高亮的位置，请检查候选锚点或文档内容是否已变化。';
      options.setCompareHighlightSummary(summary);
      options.addDebugLog(
        'info',
        'Word 候选参数高亮检测',
        [
          `候选总数: ${candidates.length}`,
          `高亮成功: ${highlightedCount}`,
          ...candidates
            .slice(0, 20)
            .map(
              (candidate, index) =>
                `${index + 1}. ${options.getCandidateDisplayName(candidate)} | ${candidate.anchorText || '无锚点'}`
            ),
        ].join('\n')
      );
    } catch (error: any) {
      options.setCompareHighlightSummary('高亮检测失败，请稍后重试。');
      options.setAnalysisError(error?.message || '高亮检测失败', error?.stack);
    } finally {
      options.setIsHighlightingCandidates(false);
    }
  };

  const handleClearCompareHighlights = async () => {
    options.setIsClearingHighlights(true);
    options.setAnalysisError(null, undefined);

    try {
      await WordAPI.clearAllHighlights();
      options.setCompareHighlightSummary('已清除文档中的高亮标记。');
    } catch (error: any) {
      options.setCompareHighlightSummary('清除高亮失败，请稍后重试。');
      options.setAnalysisError(error?.message || '清除高亮失败', error?.stack);
    } finally {
      options.setIsClearingHighlights(false);
    }
  };

  return {
    handleHighlightCompareCandidates,
    handleClearCompareHighlights,
  };
}
