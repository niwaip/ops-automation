import { AISuggestion } from '../../app/store';
import { WordAPI } from '../office/word/api';
import { HostCapabilities } from './capabilities';
import { Anchor, DocumentElement, DocumentIR, DocumentSelection, TemplateSource } from './document-ir';
import { HostAdapter } from './types';

export class WordAdapter implements HostAdapter {
  host = 'word' as const;

  private getWordAnchor(suggestion: AISuggestion) {
    return suggestion.details?.wordAnchor;
  }

  private hasPreciseWordAnchor(suggestion: AISuggestion): boolean {
    return Boolean(this.getWordAnchor(suggestion));
  }

  private canUseContextSnippet(contextSnippet: string | undefined): contextSnippet is string {
    return typeof contextSnippet === 'string' && contextSnippet.trim().length >= 2;
  }

  private isSafeLiteralPlaceholder(text: string): boolean {
    const normalized = String(text || '').trim();
    if (!normalized) {
      return false;
    }

    return /[＿_]{2,}/u.test(normalized)
      || /^\{[#/]?[^}\n]{1,120}\}$/u.test(normalized)
      || /^\$\{[^}\n]{1,120}\}$/u.test(normalized)
      || /^<[^<>\n]{1,120}>$/u.test(normalized)
      || /^\[\[[^\]\n]{1,120}\]\]$/u.test(normalized);
  }

  private extractLoopArrayPath(suggestion: AISuggestion): string {
    const directPath = String(suggestion.details?.arrayPath || '').trim();
    if (directPath) {
      return directPath.replace(/\[(?:i(?:\+\d+)?)?\]$/u, '');
    }

    const normalizedName = String(suggestion.suggestedName || '').trim();
    const loopMatch = normalizedName.match(/\{#([^}]+)\}/u);
    if (loopMatch?.[1]) {
      return loopMatch[1].trim();
    }

    const variableMatch = normalizedName
      .replace(/[{}]/g, '')
      .match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[(?:i(?:\+\d+)?)?\]\.[A-Za-z_][A-Za-z0-9_]*$/u);
    return variableMatch?.[1]?.trim() || '';
  }

  private isTableLoopSuggestion(suggestion: AISuggestion): boolean {
    return suggestion.type === 'loop' && Boolean(this.extractLoopArrayPath(suggestion));
  }

  private isTableLoopColumnSuggestion(suggestion: AISuggestion): boolean {
    if (suggestion.type === 'loop') {
      return false;
    }

    return Boolean(this.extractLoopArrayPath(suggestion));
  }

  private normalizeTableCellReplacementText(replacementText: string): string {
    const normalizedText = String(replacementText || '').trim();
    if (!normalizedText || /[\r\n]/u.test(normalizedText)) {
      return normalizedText;
    }

    const markers = normalizedText.match(/\{[^{}\n]+\}/gu) || [];
    const nonMarkerText = normalizedText.replace(/\{[^{}\n]+\}/gu, '').trim();
    if (markers.length < 2 || nonMarkerText) {
      return normalizedText;
    }

    const hasChineseMarker = markers.some((marker) => /_(cn|zh|zhcn)\}$/iu.test(marker));
    const hasJapaneseMarker = markers.some((marker) => /_(jp|ja)\}$/iu.test(marker));
    if (!hasChineseMarker || !hasJapaneseMarker) {
      return normalizedText;
    }

    return markers.join('\n');
  }

  private async previewByAnchor(suggestion: AISuggestion): Promise<boolean> {
    const wordAnchor = this.getWordAnchor(suggestion);
    if (!wordAnchor) {
      return false;
    }

    if (wordAnchor.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      return WordAPI.highlightContentControlById(wordAnchor.contentControlId);
    }

    if (
      wordAnchor.type === 'table-cell' &&
      typeof wordAnchor.tableIndex === 'number' &&
      typeof wordAnchor.rowIndex === 'number' &&
      typeof wordAnchor.cellIndex === 'number'
    ) {
      return WordAPI.highlightTableCell(
        wordAnchor.tableIndex,
        wordAnchor.rowIndex,
        wordAnchor.cellIndex
      );
    }

    if (
      wordAnchor.type === 'text-range' &&
      typeof wordAnchor.paragraphIndex === 'number' &&
      typeof wordAnchor.start === 'number' &&
      typeof wordAnchor.end === 'number'
    ) {
      return WordAPI.highlightUnderlineByPosition(
        wordAnchor.paragraphIndex,
        wordAnchor.start,
        wordAnchor.end
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
      return WordAPI.replaceContentControlText(wordAnchor.contentControlId, suggestion.suggestedName);
    }

    if (
      wordAnchor.type === 'table-cell' &&
      typeof wordAnchor.tableIndex === 'number' &&
      typeof wordAnchor.rowIndex === 'number' &&
      typeof wordAnchor.cellIndex === 'number'
    ) {
      const loopArrayPath = this.extractLoopArrayPath(suggestion);
      const tableCellReplacementText = this.normalizeTableCellReplacementText(suggestion.suggestedName);

      if (this.isTableLoopSuggestion(suggestion) && loopArrayPath) {
        return WordAPI.applyLoopTableMarkersOnNextRow(
          wordAnchor.tableIndex,
          wordAnchor.rowIndex,
          loopArrayPath
        );
      }

      if (this.isTableLoopColumnSuggestion(suggestion) && loopArrayPath) {
        const columnApplied = await WordAPI.replaceTableCellTextOnNextRow(
          wordAnchor.tableIndex,
          wordAnchor.rowIndex,
          wordAnchor.cellIndex,
          tableCellReplacementText,
          loopArrayPath
        );
        return columnApplied;
      }

      return WordAPI.replaceTableCellText(
        wordAnchor.tableIndex,
        wordAnchor.rowIndex,
        wordAnchor.cellIndex,
        tableCellReplacementText
      );
    }

    if (
      wordAnchor.type === 'text-range' &&
      typeof wordAnchor.paragraphIndex === 'number' &&
      typeof wordAnchor.start === 'number' &&
      typeof wordAnchor.end === 'number'
    ) {
      return WordAPI.replaceUnderlineByPosition(
        wordAnchor.paragraphIndex,
        wordAnchor.start,
        wordAnchor.end,
        suggestion.suggestedName,
        suggestion.originalText,
        wordAnchor.paragraphText || suggestion.context || ''
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
      WordAPI.getDocumentStructure(),
      WordAPI.getParagraphsWithFormat(),
      WordAPI.getUnderlinedTexts(),
      WordAPI.getContentControls(),
      WordAPI.getTableCells(),
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
    const text = await WordAPI.getSelectedText();
    if (!text.trim()) {
      return null;
    }

    return { text };
  }

  async previewSuggestion(suggestion: AISuggestion): Promise<void> {
    await WordAPI.clearAllHighlights();

    const anchorPreviewSuccess = await this.previewByAnchor(suggestion);
    if (anchorPreviewSuccess) {
      return;
    }

    if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
      const info = suggestion.underlineInfo;
      const paragraphIndex = info.paragraphIndex ?? 0;
      const success = await WordAPI.highlightUnderlineByPosition(
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
    if (this.canUseContextSnippet(contextSnippet)) {
      const result = await WordAPI.highlightByContext(contextSnippet);
      if (result.found) {
        return;
      }
    }

    if (suggestion.originalText) {
      const count = await WordAPI.highlightText(suggestion.originalText);
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

    if (this.hasPreciseWordAnchor(suggestion)) {
      throw new Error('锚点写入失败，已停止上下文回退以避免写入到其他位置');
    }

    if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
      const info = suggestion.underlineInfo;
      const paragraphIndex = info.paragraphIndex ?? 0;
      const success = await WordAPI.replaceUnderlineByPosition(
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
    if (this.canUseContextSnippet(contextSnippet)) {
      const result = await WordAPI.replaceBlankWithContext(
        contextSnippet,
        suggestion.suggestedName
      );
      if (result.success) {
        return;
      }
    }

    if (this.isSafeLiteralPlaceholder(suggestion.originalText)) {
      await WordAPI.replaceText(suggestion.originalText, suggestion.suggestedName);
      return;
    }

    throw new Error('未能安全定位可替换位置，已跳过全文替换以避免覆盖合同正文');
  }

  async clearPreview(): Promise<void> {
    await WordAPI.clearAllHighlights();
  }

  async exportTemplateSource(): Promise<TemplateSource> {
    const result = await WordAPI.getDocumentFileBase64WithFallback();

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
