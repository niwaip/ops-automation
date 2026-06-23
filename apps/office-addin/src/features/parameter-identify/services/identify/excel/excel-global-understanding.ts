import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { ExcelSheetPairState } from '../../../../../app/store';
import { ExcelAPI } from '../../../../../host/office/excel/api';
import { resolveAnalysisExecutor } from '../../analysis-executor';
import { serializeDocument } from '../common/document-serialize';
import type { AnalyzeDocumentOptions, AnalyzeResponse } from '../common/identify.types';

export interface AnalyzeExcelWorkbookUnderstandingResult {
  documentIR: DocumentIR;
  summary: string;
  contextAnalysis?: Record<string, unknown>;
}

interface WorkbookSheetSummary {
  name: string;
  index: number;
  address: string;
  rowCount: number;
  columnCount: number;
  tables: Array<{
    name: string;
    address: string;
    headerAddress?: string;
    dataBodyAddress?: string;
  }>;
  values: (string | number | boolean | null)[][];
  formulas: string[][];
}

export function buildExcelGlobalUnderstandingContext(
  documentIR: DocumentIR,
  templateType: string
): string {
  const sheetCount = documentIR.stats.sheetCount || 0;
  const cellCount = documentIR.stats.cellCount || 0;

  return `当前提供的是一份待理解的文档内容摘录，来源于 Excel 工作簿。请根据全部可见 sheet 的内容理解文档类型、业务目的、关键字段、各部分职责以及它们之间的关系。当前共有${sheetCount}个可见sheet、约${cellCount}个单元格，模板类型线索为 ${templateType}。`;
}

export function buildExcelGlobalUnderstandingSummary(response: AnalyzeResponse): string {
  const globalUnderstandingText = String(
    response.contextAnalysis?.globalUnderstandingText || ''
  ).trim();
  if (globalUnderstandingText) {
    return globalUnderstandingText;
  }

  const detectedTemplateType = String(response.contextAnalysis?.detectedTemplateType || 'unknown');
  const userIntent = String(response.contextAnalysis?.userIntent || '未提供');
  const globalBusinessSummary = String(
    response.contextAnalysis?.globalBusinessSummary || ''
  ).trim();
  const recommendedDataSchema = String(
    response.contextAnalysis?.recommendedDataSchema || ''
  ).trim();
  const namingPrinciples = Array.isArray(response.contextAnalysis?.namingPrinciples)
    ? (response.contextAnalysis?.namingPrinciples as unknown[])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('、')
    : '';
  const keyEntities = Array.isArray(response.contextAnalysis?.keyEntities)
    ? (response.contextAnalysis?.keyEntities as unknown[])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('、')
    : '';
  const candidateSuggestions = (response.rawSuggestions || response.suggestions || []).slice(0, 8);
  const suggestionSummary =
    candidateSuggestions.length > 0
      ? candidateSuggestions
          .map((suggestion) => {
            const name =
              'suggestedName' in suggestion ? String(suggestion.suggestedName || '') : '';
            const original =
              'originalText' in suggestion ? String(suggestion.originalText || '') : '';
            return [name, original].filter(Boolean).join(' <- ');
          })
          .filter(Boolean)
          .join('；')
      : '未返回候选参数';

  return (
    `模板类型判断: ${detectedTemplateType}。业务目的: ${userIntent}。` +
    `${globalBusinessSummary ? `业务摘要: ${globalBusinessSummary}。` : ''}` +
    `${keyEntities ? `关键实体: ${keyEntities}。` : ''}` +
    `${recommendedDataSchema ? `建议数据模型: ${recommendedDataSchema}。` : ''}` +
    `${namingPrinciples ? `命名原则: ${namingPrinciples}。` : ''}` +
    `全局候选摘要: ${suggestionSummary}。`
  );
}

function recalculateDocumentStats(documentIR: DocumentIR): DocumentIR['stats'] {
  const sheetElements = documentIR.elements.filter((element) => element.type === 'sheet');
  const cellElements = documentIR.elements.filter((element) => element.type === 'cell');
  const tableCount = sheetElements.reduce((count, element) => {
    const tables = Array.isArray(element.hostData?.tables) ? element.hostData?.tables.length : 0;
    return count + tables;
  }, 0);
  const pairIndexes = new Set(
    sheetElements
      .map((element) => Number(element.hostData?.pairIndex ?? -1))
      .filter((pairIndex) => pairIndex >= 0)
  );

  return {
    ...documentIR.stats,
    sheetCount: sheetElements.length,
    sheetPairCount: pairIndexes.size,
    tableCount,
    cellCount: cellElements.length,
  };
}

function buildWorkbookSheetPairLookup(
  pairs: ExcelSheetPairState[]
): Map<number, { pairIndex: number; sheetRole: 'mock' | 'data' }> {
  const lookup = new Map<number, { pairIndex: number; sheetRole: 'mock' | 'data' }>();

  pairs.forEach((pair) => {
    if (typeof pair.leftSheetIndex === 'number') {
      lookup.set(pair.leftSheetIndex, {
        pairIndex: pair.pairIndex,
        sheetRole: 'mock',
      });
    }
    if (typeof pair.rightSheetIndex === 'number') {
      lookup.set(pair.rightSheetIndex, {
        pairIndex: pair.pairIndex,
        sheetRole: 'data',
      });
    }
  });

  return lookup;
}

function buildExcelDocumentIRFromWorkbookSheets(
  workbookSheets: WorkbookSheetSummary[],
  selectedSheetIndexes: number[],
  configuredPairs: ExcelSheetPairState[]
): DocumentIR {
  const selectedSheetSet = new Set(selectedSheetIndexes);
  const pairLookup = buildWorkbookSheetPairLookup(configuredPairs);
  const elements: DocumentIR['elements'] = [];
  const anchors: DocumentIR['anchors'] = [];

  workbookSheets
    .filter((sheet) => selectedSheetSet.has(sheet.index))
    .sort((a, b) => a.index - b.index)
    .forEach((sheet) => {
      const pairMeta = pairLookup.get(sheet.index);
      const sheetRole = pairMeta?.sheetRole || (sheet.index % 2 === 0 ? 'mock' : 'data');
      const pairIndex = pairMeta?.pairIndex ?? -1;
      const sheetElementId = `excel-sheet-${sheet.index}`;

      elements.push({
        id: sheetElementId,
        type: 'sheet',
        text: sheet.name,
        hostData: {
          sheetIndex: sheet.index,
          sheetName: sheet.name,
          sheetRole,
          pairIndex,
          tableNames: sheet.tables.map((table) => table.name),
          tables: sheet.tables,
          address: sheet.address,
        },
      });

      for (let rowIndex = 0; rowIndex < sheet.values.length; rowIndex += 1) {
        const row = sheet.values[rowIndex] || [];
        for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
          const value = row[colIndex];
          const cellText = value == null ? '' : String(value);
          const cellAnchorId = `excel-range-${sheet.index}-${rowIndex}-${colIndex}`;

          elements.push({
            id: `excel-cell-${sheet.index}-${rowIndex}-${colIndex}`,
            type: 'cell',
            text: cellText,
            anchorIds: [cellAnchorId],
            hostData: {
              sheetIndex: sheet.index,
              sheetName: sheet.name,
              sheetRole,
              pairIndex,
              rowIndex,
              colIndex,
              formula: sheet.formulas[rowIndex]?.[colIndex] || '',
            },
          });

          anchors.push({
            id: cellAnchorId,
            type: 'excel-range',
            text: cellText,
            ref: {
              sheetIndex: sheet.index,
              sheetName: sheet.name,
              sheetRole,
              pairIndex,
              rowIndex,
              colIndex,
            },
          });
        }
      }
    });

  const documentIR: DocumentIR = {
    host: 'excel',
    metadata: {
      title: 'Excel Workbook Understanding',
    },
    elements,
    anchors,
    stats: {
      sheetCount: 0,
      sheetPairCount: 0,
      tableCount: 0,
      cellCount: 0,
    },
  };

  return {
    ...documentIR,
    stats: recalculateDocumentStats(documentIR),
  };
}

function buildDocumentIRSubset(
  documentIR: DocumentIR,
  includeElement: (element: DocumentIR['elements'][number]) => boolean
): DocumentIR {
  const elements = documentIR.elements.filter(includeElement);
  const anchorIds = new Set(elements.flatMap((element) => element.anchorIds || []));
  const anchors = documentIR.anchors.filter((anchor) => anchorIds.has(anchor.id));
  const subset: DocumentIR = {
    host: documentIR.host,
    metadata: { ...documentIR.metadata },
    elements,
    anchors,
    stats: documentIR.stats,
  };

  return {
    ...subset,
    stats: recalculateDocumentStats(subset),
  };
}

export function buildExcelGlobalDataDocumentIR(documentIR: DocumentIR): DocumentIR {
  return buildDocumentIRSubset(documentIR, (element) => {
    if (element.type !== 'sheet' && element.type !== 'cell') {
      return false;
    }
    return element.hostData?.sheetRole === 'data';
  });
}

export async function analyzeExcelWorkbookUnderstanding(
  options: AnalyzeDocumentOptions & {
    selectedSheetIndexes: number[];
    configuredPairs?: ExcelSheetPairState[];
  }
): Promise<AnalyzeExcelWorkbookUnderstandingResult> {
  if (options.selectedSheetIndexes.length === 0) {
    throw new Error('请至少选择一个 sheet 再执行文档理解');
  }

  const workbookSheets = (await ExcelAPI.getWorkbookSheets()) as WorkbookSheetSummary[];
  const documentIR = buildExcelDocumentIRFromWorkbookSheets(
    workbookSheets,
    options.selectedSheetIndexes,
    options.configuredPairs || []
  );

  const executor = resolveAnalysisExecutor({
    apiBaseUrl: options.apiBaseUrl,
    useMultiStage: false,
    requestedKind: options.analysisExecutor,
    thinking: options.thinking,
    aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
  });

  const response = await executor.analyze({
    host: 'excel',
    documentIR,
    documentContent: serializeDocument(documentIR),
    documentType: 'xlsx',
    templateType: options.templateType,
    context: buildExcelGlobalUnderstandingContext(documentIR, options.templateType),
    analysisStage: 'excel-global-understanding',
  });
  const summary = buildExcelGlobalUnderstandingSummary(response);

  return {
    documentIR,
    summary,
    contextAnalysis: {
      ...(response.contextAnalysis as Record<string, unknown> | undefined),
      analysisExecutor: executor.kind,
      requestedAnalysisExecutor: executor.requestedKind,
      supportsThinking: executor.supportsThinking,
      usedAI: true,
    },
  };
}
