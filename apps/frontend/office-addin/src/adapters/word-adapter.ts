import { AISuggestion } from '../taskpane/store';
import { OfficeHelper } from '../utils/office-api';
import { HostCapabilities } from './capabilities';
import { Anchor, DocumentElement, DocumentIR, DocumentSelection, TemplateSource } from './document-ir';
import { HostAdapter } from './types';

export class WordAdapter implements HostAdapter {
  host = 'word' as const;

  private getWordAnchor(suggestion: AISuggestion) {
    return suggestion.details?.wordAnchor;
  }

  private async previewByAnchor(suggestion: AISuggestion): Promise<boolean> {
    const wordAnchor = this.getWordAnchor(suggestion);
    if (!wordAnchor) {
      return false;
    }

    if (wordAnchor.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      return OfficeHelper.Word.highlightContentControlById(wordAnchor.contentControlId);
    }

    if (
      wordAnchor.type === 'table-cell' &&
      typeof wordAnchor.tableIndex === 'number' &&
      typeof wordAnchor.rowIndex === 'number' &&
      typeof wordAnchor.cellIndex === 'number'
    ) {
      return OfficeHelper.Word.highlightTableCell(
        wordAnchor.tableIndex,
        wordAnchor.rowIndex,
        wordAnchor.cellIndex
      );
    }

    return false;
  }

  private async applyByAnchor(suggestion: AISuggestion): Promise<boolean> {
    const wordAnchor = this.getWordAnchor(suggestion);
    if (!wordAnchor) {
      return false;
    }

    if (wordAnchor.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      return OfficeHelper.Word.replaceContentControlText(wordAnchor.contentControlId, suggestion.suggestedName);
    }

    if (
      wordAnchor.type === 'table-cell' &&
      typeof wordAnchor.tableIndex === 'number' &&
      typeof wordAnchor.rowIndex === 'number' &&
      typeof wordAnchor.cellIndex === 'number'
    ) {
      return OfficeHelper.Word.replaceTableCellText(
        wordAnchor.tableIndex,
        wordAnchor.rowIndex,
        wordAnchor.cellIndex,
        suggestion.suggestedName
      );
    }

    return false;
  }

  async getCapabilities(): Promise<HostCapabilities> {
    return {
      canExtractDocument: true,
      canExtractSelection: true,
      canPreviewSuggestion: true,
      canApplySuggestion: true,
      canExportTemplateSource: true,
      warnings: [],
    };
  }

  async extractDocument(): Promise<DocumentIR> {
    const [structure, paragraphFormats, underlineInfo, contentControls, tableCells] = await Promise.all([
      OfficeHelper.Word.getDocumentStructure(),
      OfficeHelper.Word.getParagraphsWithFormat(),
      OfficeHelper.Word.getUnderlinedTexts(),
      OfficeHelper.Word.getContentControls(),
      OfficeHelper.Word.getTableCells(),
    ]);

    const paragraphElements: DocumentElement[] = paragraphFormats.map((paragraph) => ({
      id: `word-paragraph-${paragraph.index}`,
      type: 'paragraph',
      text: paragraph.text,
      hostData: {
        index: paragraph.index,
        format: paragraph.format,
      },
    }));

    const tableElements: DocumentElement[] = structure.tables.map((table) => ({
      id: `word-table-${table.index}`,
      type: 'table',
      text: table.content.map((row) => row.join(' | ')).join('\n'),
      hostData: {
        index: table.index,
        rows: table.rows,
        cols: table.cols,
        content: table.content,
      },
    }));

    const cellElements: DocumentElement[] = tableCells.map((cell) => {
      const anchorId = `word-cell-range-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`;
      return {
        id: `word-cell-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`,
        type: 'cell',
        text: cell.text,
        anchorIds: [anchorId],
        hostData: {
          tableIndex: cell.tableIndex,
          rowIndex: cell.rowIndex,
          cellIndex: cell.cellIndex,
        },
      };
    });

    const contentControlElements: DocumentElement[] = contentControls.map((control) => ({
      id: `word-content-control-${control.id}`,
      type: 'paragraph',
      text: control.text,
      anchorIds: [`word-content-control-${control.id}`],
      hostData: {
        id: control.id,
        title: control.title,
        tag: control.tag,
        type: control.type,
        subtype: control.subtype,
        appearance: control.appearance,
        cannotDelete: control.cannotDelete,
        cannotEdit: control.cannotEdit,
        parentTableCell: control.parentTableCell,
      },
    }));

    const underlineAnchors: Anchor[] = underlineInfo.map((item, index) => ({
      id: `word-range-${index}`,
      type: 'word-range',
      text: item.text,
      ref: {
        paragraphIndex: item.paragraphIndex,
        start: item.position.start,
        end: item.position.end,
        paragraphText: item.paragraphText,
        underlineType: item.underlineType,
      },
    }));

    const cellAnchors: Anchor[] = tableCells.map((cell) => ({
      id: `word-cell-range-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`,
      type: 'word-range',
      text: cell.text,
      ref: {
        tableIndex: cell.tableIndex,
        rowIndex: cell.rowIndex,
        cellIndex: cell.cellIndex,
        anchorSource: 'table-cell',
      },
    }));

    const contentControlAnchors: Anchor[] = contentControls.map((control) => ({
      id: `word-content-control-${control.id}`,
      type: 'word-content-control',
      text: control.text,
      ref: {
        id: control.id,
        title: control.title,
        tag: control.tag,
        type: control.type,
        subtype: control.subtype,
        appearance: control.appearance,
        parentTableCell: control.parentTableCell,
      },
    }));

    const anchors: Anchor[] = [...underlineAnchors, ...cellAnchors, ...contentControlAnchors];

    const cellCount = structure.tables.reduce((total, table) => total + table.rows * table.cols, 0);
    const rowCount = structure.tables.reduce((total, table) => total + table.rows, 0);

    return {
      host: this.host,
      metadata: {
        language: 'zh-CN',
        title: contentControls.find((control) => control.title)?.title || undefined,
      },
      elements: [...paragraphElements, ...tableElements, ...cellElements, ...contentControlElements],
      anchors,
      stats: {
        paragraphCount: structure.paragraphs.length,
        tableCount: structure.tables.length,
        rowCount,
        cellCount,
      },
    };
  }

  async extractSelection(): Promise<DocumentSelection | null> {
    const text = await OfficeHelper.Word.getSelectedText();
    if (!text.trim()) {
      return null;
    }

    return { text };
  }

  async previewSuggestion(suggestion: AISuggestion): Promise<void> {
    await OfficeHelper.Word.clearAllHighlights();

    const anchorPreviewSuccess = await this.previewByAnchor(suggestion);
    if (anchorPreviewSuccess) {
      return;
    }

    if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
      const info = suggestion.underlineInfo;
      const paragraphIndex = info.paragraphIndex ?? 0;
      const success = await OfficeHelper.Word.highlightUnderlineByPosition(
        paragraphIndex,
        info.position?.start || 0,
        info.position?.end || 0,
        suggestion.originalText
      );
      if (success) {
        return;
      }
    }

    const contextSnippet = suggestion.context || suggestion.details?.context || suggestion.elementPath;
    if (contextSnippet && contextSnippet.length > 5) {
      const result = await OfficeHelper.Word.highlightByContext(contextSnippet);
      if (result.found) {
        return;
      }
    }

    if (suggestion.originalText) {
      const count = await OfficeHelper.Word.highlightText(suggestion.originalText);
      if (count > 0) {
        return;
      }
    }

    throw new Error('未能定位到可预览的位置');
  }

  async applySuggestion(suggestion: AISuggestion): Promise<void> {
    const anchorApplySuccess = await this.applyByAnchor(suggestion);
    if (anchorApplySuccess) {
      return;
    }

    if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
      const info = suggestion.underlineInfo;
      const paragraphIndex = info.paragraphIndex ?? 0;
      const success = await OfficeHelper.Word.replaceUnderlineByPosition(
        paragraphIndex,
        info.position?.start || 0,
        info.position?.end || 0,
        suggestion.suggestedName,
        suggestion.originalText,
        info.paragraphText || ''
      );
      if (success) {
        return;
      }
    }

    const contextSnippet = suggestion.context || suggestion.details?.context || suggestion.elementPath;
    if (contextSnippet && contextSnippet.length > 5) {
      const result = await OfficeHelper.Word.replaceBlankWithContext(
        contextSnippet,
        suggestion.suggestedName
      );
      if (result.success) {
        return;
      }
    }

    await OfficeHelper.Word.replaceText(suggestion.originalText, suggestion.suggestedName);
  }

  async clearPreview(): Promise<void> {
    await OfficeHelper.Word.clearAllHighlights();
  }

  async exportTemplateSource(): Promise<TemplateSource> {
    const result = await OfficeHelper.Word.getDocumentFileBase64WithFallback();

    return {
      format: 'docx',
      content: `base64:${result.base64}`,
      mode: 'base64',
      isBinaryFile: result.isValidDocx,
      warnings: result.isValidDocx ? [] : [`文档通过 ${result.method} 导出，结果可能不是完整 docx 文件`],
    };
  }

  async validateEnvironment(): Promise<{ ok: boolean; warnings: string[] }> {
    return { ok: true, warnings: [] };
  }
}
