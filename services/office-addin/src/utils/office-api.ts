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
        paragraphs.load('items');
        await context.sync();

        // 先为所有段落加载必要的属性
        for (const paragraph of paragraphs.items) {
          paragraph.load('text');
          const range = paragraph.getRange(Word.RangeLocation.whole);
          range.load('font/size,font/bold,alignment');
        }
        await context.sync();

        // 然后读取格式信息
        const result = paragraphs.items.map((p, idx) => {
          const range = p.getRange(Word.RangeLocation.whole);
          const fontSize = range.font.size || 12;
          const isBold = range.font.bold || false;
          const alignment = range.alignment;

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

        resolve(result);
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
   *
   * 使用更简单的方式：遍历段落中每个字符范围，检查下划线属性
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

          // 先加载段落文本
          paragraph.load('text');
          await context.sync();

          const fullText = paragraph.text;

          if (!fullText || fullText.trim() === '') {
            continue;  // 跳过空段落
          }

          try {
            // 使用 getTextRanges 方法获取段落中的文本范围
            // 参数：分隔符数组，是否包含分隔符，是否包含空范围
            const textRanges = paragraph.getTextRanges(['\n'], true, false);
            textRanges.load('items');
            await context.sync();

            // 为每个范围加载字体下划线属性
            for (const range of textRanges.items) {
              range.load('text,font/underline');
            }
            await context.sync();

            // 检查每个范围的下划线属性
            for (const range of textRanges.items) {
              const underline = range.font.underline;
              const rangeText = range.text || '';

              // 如果有下划线且不是 'None'
              if (underline && underline !== 'None' && underline !== 'Mixed') {
                // 计算在段落中的位置
                const startPos = fullText.indexOf(rangeText);
                if (startPos >= 0) {
                  result.push({
                    text: rangeText,
                    underlineType: underline.toString(),
                    index: pIdx,
                    paragraphText: fullText,
                    position: {
                      start: startPos,
                      end: startPos + rangeText.length
                    }
                  });
                }
              }
            }
          } catch (rangeError) {
            // 如果 getTextRanges 失败，尝试使用搜索方式
            console.warn(`段落 ${pIdx} 获取文本范围失败，尝试备用方法`);

            // 备用方法：搜索段落中的下划线特征
            const underlinePatterns = ['______', '____', '___', '__', '＿', '_'];
            for (const pattern of underlinePatterns) {
              try {
                const searchResults = paragraph.search(pattern, {
                  matchCase: false,
                  matchWholeWord: false
                });
                searchResults.load('items');
                await context.sync();

                for (const foundRange of searchResults.items) {
                  foundRange.load('text,font/underline');
                }
                await context.sync();

                for (const foundRange of searchResults.items) {
                  const underline = foundRange.font.underline;
                  if (underline && underline !== 'None') {
                    const foundText = foundRange.text || '';
                    const startPos = fullText.indexOf(foundText);
                    if (startPos >= 0) {
                      result.push({
                        text: foundText,
                        underlineType: underline.toString(),
                        index: pIdx,
                        paragraphText: fullText,
                        position: {
                          start: startPos,
                          end: startPos + foundText.length
                        }
                      });
                    }
                  }
                }
              } catch (searchError) {
                console.warn(`段落 ${pIdx} 搜索下划线失败:`, searchError);
              }
            }
          }
        }

        console.log(`检测到 ${result.length} 个下划线位置`);
        resolve(result);
      }).catch((error) => {
        console.error('获取下划线信息失败:', error);
        reject(error);
      });
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
   * 按上下文高亮文本（精确版 - 只高亮空白部分）
   * 根据上下文片段找到对应的位置，只高亮空白部分（下划线或空格）
   * 核心概念：合同中"下划线+空格"=需要参数化的位置
   */
  async highlightByContext(contextSnippet: string): Promise<{ found: boolean; blankText: string }> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 从上下文片段中提取关键文本（去除前后省略号）
        let searchText = contextSnippet
          .replace(/^[\.\.\.]*/, '')
          .replace(/[\.\.\.]*$/, '')
          .trim();

        // 如果上下文太短，返回未找到
        if (searchText.length < 5) {
          resolve({ found: false, blankText: '' });
          return;
        }

        // ===== 步骤1: 提取空白部分（用于精确高亮）=====
        // 优先级：下划线 > 多空格 > 冒号后空白
        const blankPatterns = [
          { pattern: /[＿_]{2,}/g, name: 'underline' },     // 下划线（至少2个）- 最高优先级
          { pattern: /[ 　]{3,}/g, name: 'spaces' },        // 多个空格（至少3个）
          { pattern: /：\s{2,}/g, name: 'colon-blank' },    // 中文冒号后的空白（至少2空格）
          { pattern: /:\s{2,}/g, name: 'colon-blank-en' },  // 英文冒号后的空白（至少2空格）
        ];

        let blankText = '';
        let blankType = '';
        for (const { pattern, name } of blankPatterns) {
          const matches = searchText.match(pattern);
          if (matches && matches.length > 0) {
            // 使用最长的空白匹配
            blankText = matches.reduce((a, b) => a.length >= b.length ? a : b);
            blankType = name;
            break;
          }
        }

        // 如果没有找到空白特征，尝试检测更宽泛的模式
        if (!blankText) {
          // 检测任何空白序列（包括空格、制表符等）
          const anyBlankMatch = searchText.match(/[\s＿_　]{2,}/g);
          if (anyBlankMatch) {
            blankText = anyBlankMatch.reduce((a, b) => a.length >= b.length ? a : b);
            blankType = 'general-blank';
          }
        }

        // ===== 步骤2: 搜索上下文定位 =====
        const searchResults = context.document.body.search(searchText, {
          matchCase: false,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        if (searchResults.items.length === 0) {
          resolve({ found: false, blankText: blankText });
          return;
        }

        const foundRange = searchResults.items[0];

        // ===== 步骤3: 只高亮空白部分 =====
        if (blankText && blankText.length >= 2) {
          // 在找到的上下文范围内精确搜索空白部分
          const blankSearch = foundRange.search(blankText, {
            matchCase: false,
            matchWholeWord: false
          });
          blankSearch.load('items');
          await context.sync();

          if (blankSearch.items.length > 0) {
            // 只高亮空白部分（这就是需要替换的位置）
            const blankMatch = blankSearch.items[0];
            blankMatch.select();
            blankMatch.font.highlightColor = 'yellow';
            await context.sync();

            console.log(`精确高亮空白: "${blankText}" (${blankType})`);
            resolve({ found: true, blankText: blankText });
            return;
          }
        }

        // ===== 步骤4: 后备方案 - 如果空白提取失败，尝试在原文中查找 =====
        const foundText = foundRange.text;

        // 在找到的文本中搜索空白特征
        for (const { pattern, name } of blankPatterns) {
          const matches = foundText.match(pattern);
          if (matches && matches.length > 0) {
            const foundBlank = matches[0];
            const innerSearch = foundRange.search(foundBlank, {
              matchCase: false,
              matchWholeWord: false
            });
            innerSearch.load('items');
            await context.sync();

            if (innerSearch.items.length > 0) {
              innerSearch.items[0].select();
              innerSearch.items[0].font.highlightColor = 'yellow';
              await context.sync();

              console.log(`后备高亮空白: "${foundBlank}" (${name})`);
              resolve({ found: true, blankText: foundBlank });
              return;
            }
          }
        }

        // ===== 最后方案: 如果仍找不到空白，高亮整个上下文但缩小范围 =====
        // 只高亮中间部分（通常是空白所在位置）
        const textLen = foundText.length;
        if (textLen > 10) {
          // 假设空白在中间位置，高亮中间 50% 区域
          const midStart = Math.floor(textLen * 0.25);
          const midEnd = Math.floor(textLen * 0.75);
          const midText = foundText.substring(midStart, midEnd);

          // 尝试在中间区域找空白
          const midBlankMatch = midText.match(/[\s＿_　]+/);
          if (midBlankMatch) {
            const innerSearch = foundRange.search(midBlankMatch[0], {
              matchCase: false,
              matchWholeWord: false
            });
            innerSearch.load('items');
            await context.sync();

            if (innerSearch.items.length > 0) {
              innerSearch.items[0].select();
              innerSearch.items[0].font.highlightColor = 'yellow';
              await context.sync();

              resolve({ found: true, blankText: midBlankMatch[0] });
              return;
            }
          }
        }

        // 完全找不到空白特征，返回失败
        resolve({ found: false, blankText: '' });
      }).catch((error) => {
        reject(error);
      });
    });
  },

  /**
   * 替换空白部分为变量标记
   * 只替换空白部分（下划线+空格），保留上下文中的标签文字
   * 例如：将 "甲方：______" 中的 "______" 替换为 "{d.partyA}"
   */
  async replaceBlankWithContext(
    contextSnippet: string,
    replacementText: string
  ): Promise<{ success: boolean; replacedText: string }> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 从上下文片段中提取关键文本
        let searchText = contextSnippet
          .replace(/^[\.\.\.]*/, '')
          .replace(/[\.\.\.]*$/, '')
          .trim();

        if (searchText.length < 5) {
          resolve({ success: false, replacedText: '' });
          return;
        }

        // ===== 步骤1: 提取空白部分 =====
        const blankPatterns = [
          /[＿_]{2,}/g,     // 下划线（至少2个）
          /[ 　]{3,}/g,     // 多个空格（至少3个）
          /：\s{2,}/g,      // 中文冒号后的空白
          /:\s{2,}/g,       // 英文冒号后的空白
          /[\s＿_　]{2,}/g, // 任何空白序列
        ];

        let blankText = '';
        for (const pattern of blankPatterns) {
          const matches = searchText.match(pattern);
          if (matches && matches.length > 0) {
            blankText = matches.reduce((a, b) => a.length >= b.length ? a : b);
            break;
          }
        }

        // ===== 步骤2: 搜索上下文定位 =====
        const searchResults = context.document.body.search(searchText, {
          matchCase: false,
          matchWholeWord: false
        });
        searchResults.load('items');
        await context.sync();

        if (searchResults.items.length === 0) {
          resolve({ success: false, replacedText: '' });
          return;
        }

        const foundRange = searchResults.items[0];

        // ===== 步骤3: 只替换空白部分 =====
        if (blankText && blankText.length >= 2) {
          // 在找到的上下文范围内精确搜索空白部分
          const blankSearch = foundRange.search(blankText, {
            matchCase: false,
            matchWholeWord: false
          });
          blankSearch.load('items');
          await context.sync();

          if (blankSearch.items.length > 0) {
            // 只替换空白部分，保留上下文中的标签
            const blankMatch = blankSearch.items[0];
            blankMatch.insertText(replacementText, Word.InsertLocation.replace);
            await context.sync();

            console.log(`精确替换空白: "${blankText}" → "${replacementText}"`);
            resolve({ success: true, replacedText: blankText });
            return;
          }
        }

        // ===== 后备方案: 在原文中查找空白 =====
        const foundText = foundRange.text;

        for (const pattern of blankPatterns) {
          const matches = foundText.match(pattern);
          if (matches && matches.length > 0) {
            const foundBlank = matches[0];
            const innerSearch = foundRange.search(foundBlank, {
              matchCase: false,
              matchWholeWord: false
            });
            innerSearch.load('items');
            await context.sync();

            if (innerSearch.items.length > 0) {
              innerSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
              await context.sync();

              console.log(`后备替换空白: "${foundBlank}" → "${replacementText}"`);
              resolve({ success: true, replacedText: foundBlank });
              return;
            }
          }
        }

        // 完全找不到空白特征
        resolve({ success: false, replacedText: '' });
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