import { DocumentFileAPI, hasZipHeader } from '../shared/document-file';

export const ExcelAPI = {
  normalizeDraftTemplateSheetName(sheetName: string): string {
    const sanitized = sheetName
      .replace(/\[_模板\]/g, '')
      .replace(/_模板$/g, '')
      .trim();
    return sanitized || sheetName;
  },

  /**
   * 获取整个工作簿的 sheet 概览
   * 用于 Excel 模板页按成对 sheet 展示空白模板和真实数据。
   */
  async getWorkbookSheets(): Promise<Array<{
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
    sampleValues: string[][];
  }>> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const worksheets = context.workbook.worksheets;
        worksheets.load('items/name');
        await context.sync();

        const sheetRefs: Array<{
          index: number;
          sheet: Excel.Worksheet;
          usedRange: Excel.Range;
          tables: Excel.TableCollection;
          tableRefs: Array<{
            table: Excel.Table;
            tableRange: Excel.Range;
            headerRange: Excel.Range;
          }>;
        }> = worksheets.items.map((sheet, index) => {
          const usedRange = sheet.getUsedRange();
          usedRange.load('address,rowCount,columnCount,values,formulas');

          const tables = sheet.tables;
          tables.load('items/name');

          return {
            index,
            sheet,
            usedRange,
            tables,
            tableRefs: [],
          };
        });

        await context.sync();

        for (const sheetRef of sheetRefs) {
          sheetRef.tableRefs = sheetRef.tables.items.map((table) => {
            const tableRange = table.getRange();
            const headerRange = table.getHeaderRowRange();
            table.load('name');
            tableRange.load('address,rowIndex,columnIndex,rowCount,columnCount');
            headerRange.load('address,rowIndex,columnIndex');
            return {
              table,
              tableRange,
              headerRange,
            };
          });
        }

        await context.sync();

        resolve(
          sheetRefs.map(({ index, sheet, usedRange, tableRefs = [] }) => ({
            name: sheet.name,
            index,
            address: usedRange.address || `${sheet.name}!A1`,
            rowCount: usedRange.rowCount || 0,
            columnCount: usedRange.columnCount || 0,
            tables: tableRefs.map(({ table, tableRange, headerRange }) => {
              const hasDataRows = (tableRange.rowCount || 0) > 1;
              const dataStartRow = (tableRange.rowIndex || 0) + 1;
              const dataEndRow = (tableRange.rowIndex || 0) + Math.max((tableRange.rowCount || 1) - 1, 1);
              const dataEndCol = (tableRange.columnIndex || 0) + Math.max((tableRange.columnCount || 1) - 1, 0);
              return {
                name: table.name || '',
                address: tableRange.address || '',
                headerAddress: headerRange.address || '',
                dataBodyAddress: hasDataRows
                  ? `${sheet.name}!R${dataStartRow + 1}C${(tableRange.columnIndex || 0) + 1}:R${dataEndRow + 1}C${dataEndCol + 1}`
                  : '',
              };
            }),
            values: (usedRange.values as (string | number | boolean | null)[][]) || [],
            formulas: (usedRange.formulas as string[][]) || [],
            sampleValues: ((usedRange.values as (string | number | boolean | null)[][]) || [])
              .slice(0, 8)
              .map((row) =>
                row.slice(0, 6).map((cell) => {
                  if (cell == null) return '';
                  return String(cell);
                })
              ),
          }))
        );
      }).catch(reject);
    });
  },

  async getWorkbookFileBase64WithFallback(): Promise<{
    content: string;
    method: string;
    isValidXlsx: boolean;
    mode: 'base64' | 'json';
  }> {
    try {
      const base64 = await DocumentFileAPI.getFileContentBase64();
      if (base64 && base64.length > 0) {
        return {
          content: base64,
          method: 'getFileContentAsync',
          isValidXlsx: hasZipHeader(base64),
          mode: 'base64',
        };
      }
    } catch (error) {
      console.warn('Excel getFileContentAsync失败或不支持:', error);
    }

    try {
      const base64 = await DocumentFileAPI.getCompressedDocumentBase64();
      if (base64 && base64.length > 0) {
        return {
          content: base64,
          method: 'getFileAsync',
          isValidXlsx: hasZipHeader(base64),
          mode: 'base64',
        };
      }
    } catch (error) {
      console.warn('Excel getFileAsync失败:', error);
    }

    const sheetData = await this.getSheetData();
    return {
      content: JSON.stringify(sheetData.values),
      method: 'json',
      isValidXlsx: false,
      mode: 'json',
    };
  },

  /**
   * 获取当前工作表数据
   */
  async getSheetData(): Promise<{
    range: { rows: number; cols: number };
    values: (string | number | null)[][];
    formulas: string[][];
  }> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        const usedRange = sheet.getUsedRange();
        usedRange.load('rowCount,columnCount,values,formulas');
        await context.sync();

        resolve({
          range: {
            rows: usedRange.rowCount,
            cols: usedRange.columnCount,
          },
          values: usedRange.values as (string | number | null)[][],
          formulas: usedRange.formulas as string[][],
        });
      }).catch(reject);
    });
  },

  /**
   * 获取选中的单元格
   */
  async getSelectedRange(): Promise<{
    address: string;
    values: (string | number | null)[][];
  }> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const selection = context.workbook.getSelectedRange();
        selection.load('address,values');
        await context.sync();

        resolve({
          address: selection.address,
          values: selection.values as (string | number | null)[][],
        });
      }).catch(reject);
    });
  },

  /**
   * 在单元格插入标记
   */
  async insertMarkerInCell(address: string, marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        const range = sheet.getRange(address);
        range.values = [[marker]];
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  /**
   * 批量插入标记
   */
  async insertMarkersBatch(
    mappings: Array<{ address: string; marker: string }>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        for (const mapping of mappings) {
          const range = sheet.getRange(mapping.address);
          range.values = [[mapping.marker]];
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  async insertMarkerInSheetCell(sheetName: string, address: string, marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getItem(sheetName);
        const range = sheet.getRange(address);
        range.load('values');
        await context.sync();

        const existingValue = range.values?.[0]?.[0] == null ? '' : String(range.values[0][0]);
        const loopStartMatches = existingValue.match(/\{#[^}]+\}/g) || [];
        const loopEndMatches = existingValue.match(/\{\/[^}]+\}/g) || [];

        let nextValue = marker;
        if (!marker.includes('{#') && loopStartMatches.length > 0) {
          nextValue = `${loopStartMatches.join('')}${nextValue}`;
        }
        if (!marker.includes('{/') && loopEndMatches.length > 0) {
          nextValue = `${nextValue}${loopEndMatches.join('')}`;
        }

        range.values = [[nextValue]];
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  async insertLoopMarkersInTable(
    sheetName: string,
    tableName: string,
    arrayPath: string,
    columnMappings?: Array<{
      headerName: string;
      variablePath: string;
      sampleValue?: string;
      columnIndex?: number;
    }>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getItem(sheetName);
        const table = sheet.tables.getItem(tableName);
        const tableRange = table.getRange();
        const tableRows = table.rows;
        tableRange.load('rowIndex,columnIndex,rowCount,columnCount');
        tableRows.load('count');
        await context.sync();

        const columnCount = Math.max(tableRange.columnCount || 1, 1);

        // 仅确保模板表至少存在 1 条数据行，不删除任何已有行，避免破坏真实数据或 Excel table 结构。
        if ((tableRows.count || 0) === 0) {
          table.rows.add(undefined, [Array.from({ length: columnCount }, () => '')]);
          await context.sync();
        }

        const templateRowIndex = (tableRange.rowIndex || 0) + 1;
        const templateCells = Array.from({ length: columnCount }, (_, columnOffset) =>
          sheet.getCell(templateRowIndex, (tableRange.columnIndex || 0) + columnOffset)
        );
        templateCells.forEach((cell) => cell.load('values'));
        await context.sync();

        templateCells.forEach((cell, columnOffset) => {
          const existingValue = cell.values?.[0]?.[0] == null ? '' : String(cell.values[0][0]);
          const matchedMapping = columnMappings?.find((mapping) => (mapping.columnIndex ?? columnOffset) === columnOffset);
          let nextValue = matchedMapping?.variablePath
            ? (matchedMapping.variablePath.startsWith('d.') ? `{${matchedMapping.variablePath}}` : `{d.${matchedMapping.variablePath}}`)
            : existingValue;

          if (columnOffset === 0) {
            nextValue = `{#${arrayPath}}${nextValue}`;
          }
          if (columnOffset === columnCount - 1) {
            nextValue = `${nextValue}{/${arrayPath}}`;
          }

          cell.values = [[nextValue]];
        });
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  async prepareWorkbookForDraft(
    pairs: Array<{
      hidden?: boolean;
      leftSheetName?: string;
      rightSheetName?: string;
    }>
  ): Promise<{
    renamedSheets: Array<{ from: string; to: string }>;
    deletedSheets: string[];
    frozenFormulaCount: number;
    deletedNamedItemCount: number;
  }> {
    const visiblePairs = pairs.filter((pair) => !pair.hidden);
    const deletedSheets = Array.from(
      new Set(
        visiblePairs
          .map((pair) => pair.rightSheetName?.trim())
          .filter((name): name is string => Boolean(name))
      )
    );

    return new Promise((resolve, reject) => {
      Excel.run(async (context) => {
        const worksheets = context.workbook.worksheets;
        worksheets.load('items/name');
        await context.sync();

        const existingNames = new Set(worksheets.items.map((sheet) => sheet.name));
        const escapeSheetName = (name: string) => name.replace(/'/g, "''");
        const referencesDeletedSheet = (formula: string): boolean =>
          deletedSheets.some((sheetName) =>
            formula.includes(`${sheetName}!`) || formula.includes(`'${escapeSheetName(sheetName)}'!`)
          );

        let frozenFormulaCount = 0;
        let deletedNamedItemCount = 0;
        const keepSheets = worksheets.items.filter((sheet) => !deletedSheets.includes(sheet.name));
        const keepSheetRanges = keepSheets.map((sheet) => {
          const usedRange = sheet.getUsedRange();
          usedRange.load('rowIndex,columnIndex,rowCount,columnCount,formulas,values');
          return { sheet, usedRange };
        });
        const workbookNames = context.workbook.names;
        workbookNames.load('items/name,items/formula');
        const worksheetNameCollections = keepSheets.map((sheet) => {
          const names = sheet.names;
          names.load('items/name,items/formula');
          return names;
        });
        await context.sync();

        for (const { sheet, usedRange } of keepSheetRanges) {
          const formulas = (usedRange.formulas as string[][]) || [];
          const values = (usedRange.values as (string | number | boolean | null)[][]) || [];
          for (let rowIndex = 0; rowIndex < formulas.length; rowIndex += 1) {
            for (let columnIndex = 0; columnIndex < (formulas[rowIndex] || []).length; columnIndex += 1) {
              const formula = formulas[rowIndex]?.[columnIndex];
              if (typeof formula === 'string' && formula.startsWith('=') && referencesDeletedSheet(formula)) {
                const currentValue = values[rowIndex]?.[columnIndex] ?? '';
                sheet.getCell((usedRange.rowIndex || 0) + rowIndex, (usedRange.columnIndex || 0) + columnIndex).values = [[currentValue]];
                frozenFormulaCount += 1;
              }
            }
          }
        }

        // Remove workbook-level and worksheet-level named items that still point to deleted sheets.
        for (const namedItem of workbookNames.items) {
          const formula = typeof namedItem.formula === 'string' ? namedItem.formula : '';
          if (formula && referencesDeletedSheet(formula)) {
            namedItem.delete();
            deletedNamedItemCount += 1;
          }
        }

        for (const names of worksheetNameCollections) {
          for (const namedItem of names.items) {
            const formula = typeof namedItem.formula === 'string' ? namedItem.formula : '';
            if (formula && referencesDeletedSheet(formula)) {
              namedItem.delete();
              deletedNamedItemCount += 1;
            }
          }
        }

        const renamedSheets: Array<{ from: string; to: string }> = [];
        const reservedNames = new Set(
          worksheets.items
            .map((sheet) => sheet.name)
            .filter((name) => !deletedSheets.includes(name))
        );

        deletedSheets.forEach((sheetName) => {
          if (existingNames.has(sheetName)) {
            worksheets.getItem(sheetName).delete();
          }
        });
        await context.sync();

        // After deletion, some defined names (like Print_Area, FilterDatabase) might become #REF! or orphaned.
        // We should clean up any remaining workbook-level and worksheet-level names that are broken.
        workbookNames.load('items/name,items/formula,items/value');
        const postWorksheetNameCollections = keepSheets.map((sheet) => {
          const names = sheet.names;
          names.load('items/name,items/formula,items/value');
          return names;
        });
        await context.sync();

        const cleanRefNames = (namesCollection: Excel.NamedItemCollection) => {
          for (const namedItem of namesCollection.items) {
            try {
              const formula = typeof namedItem.formula === 'string' ? namedItem.formula : '';
              const value = typeof namedItem.value === 'string' ? namedItem.value : '';
              if (formula.includes('#REF!') || value.includes('#REF!')) {
                namedItem.delete();
                deletedNamedItemCount += 1;
              }
            } catch (e) {
              // Ignore if already deleted or inaccessible
            }
          }
        };

        cleanRefNames(workbookNames);
        for (const names of postWorksheetNameCollections) {
          cleanRefNames(names);
        }
        await context.sync();

        for (const pair of visiblePairs) {
          const fromName = pair.leftSheetName?.trim();
          if (!fromName || !existingNames.has(fromName)) {
            continue;
          }

          const normalizedBaseName = this.normalizeDraftTemplateSheetName(fromName);
          let candidateName = normalizedBaseName.slice(0, 31) || fromName;
          let suffix = 1;

          reservedNames.delete(fromName);
          while (reservedNames.has(candidateName)) {
            const suffixLabel = ` (${suffix})`;
            candidateName = `${normalizedBaseName.slice(0, Math.max(31 - suffixLabel.length, 1))}${suffixLabel}`;
            suffix += 1;
          }

          if (candidateName !== fromName) {
            worksheets.getItem(fromName).name = candidateName;
            renamedSheets.push({ from: fromName, to: candidateName });
          }
          reservedNames.add(candidateName);
        }

        await context.sync();
        resolve({
          renamedSheets,
          deletedSheets,
          frozenFormulaCount,
          deletedNamedItemCount,
        });
      }).catch(reject);
    });
  },
};

/**
 * PowerPoint 操作
 */
