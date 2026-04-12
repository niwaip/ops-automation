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
   * 获取段落详细格式信息（用于辅助AI判断）
   * 包括字体大小、颜色、对齐方式等
   */
  async getParagraphsWithFormat(): Promise<Array<{
    text: string;
    index: number;
    format: {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;  // AI可用的判断标志
    };
  }>> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('text,style');
        await context.sync();

        const result = paragraphs.items.map((p, idx) => {
          // 加载段落格式信息
          const range = p.getRange(Word.RangeLocation.whole);
          range.load('font/size,font/bold,alignment');

          return {
            text: p.text,
            index: idx,
            format: {
              // 格式信息会在下面填充
            }
          };
        });

        await context.sync();

        // 填充格式信息
        const formattedResult = paragraphs.items.map((p, idx) => {
          const range = p.getRange(Word.RangeLocation.whole);
          const fontSize = range.font?.size || 12;
          const isBold = range.font?.bold || false;
          const alignment = range.alignment || Word.Alignment.left;

          // 判断是否是标题（字体大于14或加粗且长度小于50）
          const isTitle = (fontSize > 14 || isBold) && p.text.trim().length < 50;

          return {
            text: p.text,
            index: idx,
            format: {
              fontSize: fontSize,
              isBold: isBold,
              alignment: alignment === Word.Alignment.left ? 'left' :
                         alignment === Word.Alignment.centered ? 'center' :
                         alignment === Word.Alignment.right ? 'right' : 'justified',
              isTitle: isTitle
            }
          };
        });

        await context.sync();
        resolve(formattedResult);
      }).catch(reject);
    });
  },

  /**
   * 获取图片Base64数据（用于AI视觉分析）
   * 可以将图片发送给AI进行视觉识别
   */
  async getImagesBase64(): Promise<Array<{
    index: number;
    altText: string;
    base64: string;  // 图片的Base64编码
    width: number;
    height: number;
  }>> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const images = context.document.body.inlinePictures;
        images.load('items');
        await context.sync();

        const result = [];
        for (let i = 0; i < images.items.length; i++) {
          const img = images.items[i];
          img.load('altText,width,height');

          // 获取图片Base64数据
          const imageBase64 = img.getBase64ImageSrc();
          await context.sync();

          result.push({
            index: i,
            altText: img.altText || '',
            base64: imageBase64 || '',
            width: img.width || 0,
            height: img.height || 0
          });
        }

        resolve(result);
      }).catch(reject);
    });
  },

  /**
   * 获取带下划线的文本段落（用于识别需要参数化的位置）
   * 合同中"下划线+空格"通常是需要填写内容的地方
   */
  async getUnderlinedTexts(): Promise<Array<{
    text: string;           // 带下划线的文本内容
    underlineType: string;  // 下划线类型 (Single, Double, Dotted等)
    index: number;          // 段落索引
    paragraphText: string;  // 所在段落的完整文本
    position: {             // 在段落中的位置
      start: number;
      end: number;
    };
  }>> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        const result: Array<{
          text: string;
          underlineType: string;
          index: number;
          paragraphText: string;
          position: { start: number; end: number };
        }> = [];

        for (let pIdx = 0; pIdx < paragraphs.items.length; pIdx++) {
          const paragraph = paragraphs.items[pIdx];
          const fullText = paragraph.text;

          // 获取段落中所有文本范围，检查字体下划线属性
          // 使用 split 方法将段落按字符分割检查
          const ranges = paragraph.split(fullText, [' '], true);
          ranges.load('items');
          await context.sync();

          // 对于每个分割的范围，检查是否有下划线
          for (let rIdx = 0; rIdx < ranges.items.length; rIdx++) {
            const range = ranges.items[rIdx];
            range.load('font/underline,text');
          }
          await context.sync();

          // 找出带下划线的文本段
          let currentUnderlineStart = -1;
          let currentUnderlineText = '';
          let currentUnderlineType = 'None';

          for (let rIdx = 0; rIdx < ranges.items.length; rIdx++) {
            const range = ranges.items[rIdx];
            const underline = range.font.underline;
            const text = range.text || '';

            // 如果有下划线且不是 'None'
            if (underline && underline !== 'None' && underline !== 'Mixed') {
              if (currentUnderlineStart === -1) {
                currentUnderlineStart = rIdx;
                currentUnderlineType = underline as string;
              }
              currentUnderlineText += text;
            } else {
              // 结束当前下划线段
              if (currentUnderlineStart !== -1 && currentUnderlineText.trim() !== '') {
                // 计算在原文中的位置
                const startPos = fullText.indexOf(currentUnderlineText);
                if (startPos >= 0) {
                  result.push({
                    text: currentUnderlineText,
                    underlineType: currentUnderlineType,
                    index: pIdx,
                    paragraphText: fullText,
                    position: {
                      start: startPos,
                      end: startPos + currentUnderlineText.length
                    }
                  });
                }
              }
              currentUnderlineStart = -1;
              currentUnderlineText = '';
              currentUnderlineType = 'None';
            }
          }

          // 处理段落末尾的下划线
          if (currentUnderlineStart !== -1 && currentUnderlineText.trim() !== '') {
            const startPos = fullText.indexOf(currentUnderlineText);
            if (startPos >= 0) {
              result.push({
                text: currentUnderlineText,
                underlineType: currentUnderlineType,
                index: pIdx,
                paragraphText: fullText,
                position: {
                  start: startPos,
                  end: startPos + currentUnderlineText.length
                }
              });
            }
          }
        }

        resolve(result);
      }).catch(reject);
    });
  },

  /**
   * 高亮指定段落中的特定位置
   * 用于精确高亮空白/下划线位置
   */
  async highlightAtPosition(paragraphIndex: number, startPos: number, endPos: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        if (paragraphIndex >= paragraphs.items.length) {
          resolve(false);
          return;
        }

        const paragraph = paragraphs.items[paragraphIndex];
        const text = paragraph.text;

        // 获取要高亮的文本
        const highlightText = text.substring(startPos, endPos);
        if (!highlightText || highlightText.trim() === '') {
          resolve(false);
          return;
        }

        // 在段落中搜索并高亮
        const searchResults = paragraph.search(highlightText, {
          matchCase: true,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        if (searchResults.items.length > 0) {
          // 高亮第一个匹配
          const firstMatch = searchResults.items[0];
          firstMatch.select();
          firstMatch.font.highlightColor = 'yellow';
          await context.sync();
          resolve(true);
        } else {
          resolve(false);
        }
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
   * 清除所有高亮标记
   * 在预览新内容前先清除之前的高亮
   */
  async clearAllHighlights(): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 获取文档中的所有段落
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        // 清除每个段落的高亮
        for (const paragraph of paragraphs.items) {
          const range = paragraph.getRange(Word.RangeLocation.whole);
          range.load('font/highlightColor');
          await context.sync();

          // 如果有高亮，清除它
          if (range.font.highlightColor && range.font.highlightColor !== 'none') {
            range.font.highlightColor = 'none';
          }
        }

        // 同步更改
        await context.sync();
        resolve();
      }).catch((error) => {
        console.warn('清除高亮失败:', error);
        resolve();  // 即使失败也继续，不影响后续操作
      });
    });
  },

  /**
   * 清除特定文本的高亮
   */
  async clearHighlight(text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        if (!text || text.trim() === '') {
          resolve(0);
          return;
        }

        const searchResults = context.document.body.search(text, {
          matchCase: false,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        const count = searchResults.items.length;
        for (const item of searchResults.items) {
          item.font.highlightColor = 'none';
        }
        await context.sync();
        resolve(count);
      }).catch(reject);
    });
  },

  /**
   * 按上下文高亮文本（精确版）
   * 根据上下文片段找到对应的位置，只高亮空白部分（下划线或空格）
   * 而不是整个上下文，使高亮区域更精确
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

        // 提取空白部分（用于精确高亮）
        // 匹配：下划线、多个空格、冒号后的空白等
        const blankPatterns = [
          /[＿_]{2,}/g,           // 下划线（至少2个）
          /[ 　]{3,}/g,           // 多个空格（至少3个）
          /：\s+/g,               // 冒号后的空白
          /:\s+/g,                // 英文冒号后的空白
        ];

        // 找出上下文中的空白部分
        let blankText = '';
        for (const pattern of blankPatterns) {
          const matches = searchText.match(pattern);
          if (matches && matches.length > 0) {
            // 使用最长的空白匹配
            blankText = matches.reduce((a, b) => a.length >= b.length ? a : b);
            break;
          }
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
          // 获取第一个匹配的段落
          const firstResult = searchResults.items[0];

          if (blankText && blankText.trim() !== '') {
            // 在找到的上下文范围内搜索空白部分并高亮
            const blankSearch = firstResult.search(blankText, {
              matchCase: false,
              matchWholeWord: false
            });
            blankSearch.load('items');
            await context.sync();

            if (blankSearch.items.length > 0) {
              // 只高亮空白部分
              const blankMatch = blankSearch.items[0];
              blankMatch.select();
              blankMatch.font.highlightColor = 'yellow';
              await context.sync();
              resolve(1);
              return;
            }
          }

          // 如果没有找到空白部分，高亮整个上下文但缩小范围
          // 只高亮中间部分（去掉前后各5个字符）
          const text = firstResult.text;
          if (text.length > 20) {
            // 尝试找到空白特征并高亮该区域
            const midStart = Math.floor(text.length * 0.3);
            const midEnd = Math.floor(text.length * 0.7);
            const midText = text.substring(midStart, midEnd);

            // 如果中间部分有空白特征，高亮它
            const midBlankMatch = midText.match(/[＿_\s　]{2,}/);
            if (midBlankMatch) {
              const innerSearch = firstResult.search(midBlankMatch[0], {
                matchCase: false,
                matchWholeWord: false
              });
              innerSearch.load('items');
              await context.sync();

              if (innerSearch.items.length > 0) {
                innerSearch.items[0].select();
                innerSearch.items[0].font.highlightColor = 'yellow';
                await context.sync();
                resolve(1);
                return;
              }
            }
          }

          // 最后选择：高亮找到的范围，但至少定位到位置
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