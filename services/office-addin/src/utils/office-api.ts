/**
 * Office Addin - Office API 封装
 * 尕装 Office JavaScript API，支持 Word/Excel/PPT 操作
 */

import { OfficeAppType } from '../taskpane/store';

/**
 * 获取当前 Office 应用类型
 */
export function getOfficeType(): OfficeAppType {
  if (typeof Word !== 'undefined') return 'word';
  if (typeof Excel !== 'undefined') return 'excel';
  if (typeof PowerPoint !== 'undefined') return 'ppt';
  return 'word'; // 默认
}

/**
 * Word 操作
 */
export const WordAPI = {
  /**
   * 获取文档全部内容
   */
  async getDocumentContent(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const body = context.document.body;
        body.load('text');
        await context.sync();
        resolve(body.text);
      }).catch(reject);
    });
  },

  /**
   * 获取文档结构（段落、表格、图片）
   */
  async getDocumentStructure(): Promise<{
    paragraphs: Array<{ text: string; index: number }>;
    tables: Array<{ rows: number; cols: number; content: string[][]; index: number }>;
    images: Array<{ index: number; altText: string }>;
  }> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 获取段落
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('text');
        await context.sync();

        // 获取表格
        const tables = context.document.body.tables;
        tables.load('rowCount,columnCount');
        await context.sync();

        const tableData = [];
        for (let i = 0; i < tables.items.length; i++) {
          const table = tables.items[i];
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          const content: string[][] = [];
          for (const row of rows.items) {
            const cells = row.cells;
            cells.load('items');
            await context.sync();
            const rowContent = cells.items.map((cell) => {
              cell.body.load('text');
              return cell.body.text;
            });
            await context.sync();
            content.push(rowContent);
          }
          tableData.push({
            rows: table.rowCount,
            cols: table.columnCount,
            content,
            index: i,
          });
        }

        // 获取图片
        const images = context.document.body.inlinePictures;
        images.load('items');
        await context.sync();

        const imageData = images.items.map((img, idx) => ({
          index: idx,
          altText: img.altText || '',
        }));

        resolve({
          paragraphs: paragraphs.items.map((p, idx) => ({
            text: p.text,
            index: idx,
          })),
          tables: tableData,
          images: imageData,
        });
      }).catch(reject);
    });
  },

  /**
   * 在指定位置插入标记
   */
  async insertMarker(marker: string, position?: { paragraphIndex: number; textRange: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        if (position) {
          // 在指定段落插入
          const paragraphs = context.document.body.paragraphs;
          paragraphs.load('items');
          await context.sync();

          const paragraph = paragraphs.items[position.paragraphIndex];
          const range = paragraph.search(position.textRange);
          range.load('items');
          await context.sync();

          if (range.items.length > 0) {
            range.items[0].insertText(marker, Word.InsertLocation.replace);
          }
        } else {
          // 在当前位置插入
          context.document.body.insertText(marker, Word.InsertLocation.end);
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  /**
   * 替换文本
   */
  async replaceText(oldText: string, newText: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const results = context.document.body.search(oldText);
        results.load('items');
        await context.sync();

        for (const item of results.items) {
          item.insertText(newText, Word.InsertLocation.replace);
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  /**
   * 高亮文本（用于预览）
   * 先搜索文本，选中找到的结果，滚动到视图，并添加高亮标记
   */
  async highlightText(text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 处理特殊字符：空格和空白标记
        // 如果text是单个空格或空白标记，搜索时需要特殊处理
        let searchText = text;
        if (text === ' ' || text.trim() === '') {
          // 空白标记不能直接搜索，需要根据上下文来搜索
          // 这种情况下，我们跳过高亮，返回0表示未找到
          console.log('空白标记无法直接高亮');
          resolve(0);
          return;
        }

        // 使用 search 方法查找所有匹配
        const searchResults = context.document.body.search(searchText, {
          matchCase: false,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        const foundCount = searchResults.items.length;

        if (foundCount > 0) {
          // 选中第一个找到的结果，使其可见
          const firstResult = searchResults.items[0];
          firstResult.select();

          // 尝试添加高亮颜色（Word 2016+ 支持）
          // 使用 font 高亮作为替代方案
          firstResult.font.highlightColor = 'yellow';

          await context.sync();

          // 滚动到选中位置
          // Word API 不直接支持滚动，但选中后会自动滚动
        }

        resolve(foundCount);
      }).catch((error) => {
        reject(error);
      });
    });
  },

  /**
   * 按上下文高亮文本
   * 根据上下文片段找到对应的位置并高亮
   */
  async highlightByContext(contextSnippet: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 从上下文片段中提取关键文本（去除前后省略号）
        let searchText = contextSnippet
          .replace(/^[\.\.\.]*/, '')
          .replace(/[\.\.\.]*$/, '')
          .trim();

        // 如果上下文太短，尝试搜索原始文本
        if (searchText.length < 5) {
          resolve(0);
          return;
        }

        // 搜索上下文片段
        const searchResults = context.document.body.search(searchText, {
          matchCase: false,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        const foundCount = searchResults.items.length;

        if (foundCount > 0) {
          // 选中并高亮第一个结果
          const firstResult = searchResults.items[0];
          firstResult.select();
          firstResult.font.highlightColor = 'yellow';
          await context.sync();
        }

        resolve(foundCount);
      }).catch((error) => {
        reject(error);
      });
    });
  },

  /**
   * 获取选中的文本
   */
  async getSelectedText(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
        resolve(selection.text);
      }).catch(reject);
    });
  },

  /**
   * 在选中位置插入循环标记
   */
  async insertLoopMarker(arrayPath: string, selectionContent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const selection = context.document.getSelection();
        const originalText = selection.text;

        // 包装为循环标记 {#d.array} ... {/d.array}
        const loopStart = `{#${arrayPath}}`;
        const loopEnd = `{/${arrayPath}}`;

        selection.insertText(`${loopStart}${originalText}${loopEnd}`, Word.InsertLocation.replace);
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },
};

/**
 * Excel 操作
 */
export const ExcelAPI = {
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
};

/**
 * PowerPoint 操作
 */
export const PPTAPI = {
  /**
   * 获取所有幻灯片内容
   */
  async getSlidesContent(): Promise<Array<{
    index: number;
    shapes: Array<{ type: string; text: string; id: string }>;
  }>> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load('items');
        await context.sync();

        const slideData = [];
        for (const slide of slides.items) {
          const shapes = slide.shapes;
          shapes.load('items');
          await context.sync();

          const shapeData = shapes.items.map((shape) => {
            shape.load('type,textFrame');
            return shape;
          });
          await context.sync();

          slideData.push({
            index: slide.id,
            shapes: shapeData.map((s) => ({
              type: s.type,
              text: s.textFrame?.textRange?.text || '',
              id: s.id,
            })),
          });
        }
        resolve(slideData);
      }).catch(reject);
    });
  },

  /**
   * 在幻灯片形状中插入标记
   */
  async insertMarkerInShape(slideId: number, shapeId: string, marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        const slide = context.presentation.slides.getItem(slideId);
        const shape = slide.shapes.getItem(shapeId);
        shape.textFrame.textRange.text = marker;
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  /**
   * 创建幻灯片循环标记（复制幻灯片作为模板）
   */
  async setupSlideLoop(slideIndex: number, arrayPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      PowerPoint.run(async (context) => {
        // PowerPoint 不直接支持循环，需要通过特殊标记实现
        const slide = context.presentation.slides.getItem(slideIndex);
        const shapes = slide.shapes;
        shapes.load('items');
        await context.sync();

        // 在第一个形状中添加循环注释
        if (shapes.items.length > 0) {
          const firstShape = shapes.items[0];
          firstShape.load('textFrame');
          await context.sync();
          const currentText = firstShape.textFrame.textRange.text;
          firstShape.textFrame.textRange.text = `{{SLIDE_LOOP:${arrayPath}}}${currentText}`;
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },
};

/**
 * 通用 Office API
 */
export const OfficeHelper = {
  getOfficeType,
  Word: WordAPI,
  Excel: ExcelAPI,
  PowerPoint: PPTAPI,
};