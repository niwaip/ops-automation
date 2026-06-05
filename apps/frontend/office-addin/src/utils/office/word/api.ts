import { DocumentFileAPI, hasZipHeader } from '../shared/document-file';
import { getWordHeaderAliasCandidates } from './parameter';

const WORD_BLANK_PATTERNS = [
  /[＿_]{2,}/g,
  /[ 　\t]{2,}/g,
  /：\s{2,}/g,
  /:\s{2,}/g,
  /[\s＿_　]{2,}/g,
];

function shouldDebugWordUnderlineParagraph(text: string): boolean {
  return /technical service is to be rendered|duration of technical service|技术服务地点|技术服务期限/iu.test(String(text || ''));
}

function stripWordContextSnippet(contextSnippet: string): string {
  return String(contextSnippet || '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[.\u2026]+|[.\u2026]+$/gu, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractLongestWordBlank(text: string): string {
  let longestBlank = '';
  for (const pattern of WORD_BLANK_PATTERNS) {
    const matches = text.match(pattern);
    if (!matches || matches.length === 0) {
      continue;
    }
    const currentLongest = matches.reduce((left, right) => (left.length >= right.length ? left : right), '');
    if (currentLongest.length > longestBlank.length) {
      longestBlank = currentLongest;
    }
  }
  return longestBlank;
}

function extractWordLabelValueTarget(text: string): { labelText: string; valueText: string } | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labelMatch = /(^|[\s(（【[])([^，。；;\n]{1,24}[：:])/u.exec(line);
    if (!labelMatch || typeof labelMatch.index !== 'number') {
      continue;
    }

    const labelText = labelMatch[2].trim();
    const labelCore = labelText.replace(/[：:]$/u, '').trim();
    if (!labelCore) {
      continue;
    }
    if (/[，。；;]/u.test(labelCore)) {
      continue;
    }
    if (/(?:如下|如下所示|说明如下|约定如下|内容如下|条款如下|方式如下|时间如下|支付如下)$/u.test(labelCore)) {
      continue;
    }

    const valueStart = labelMatch.index + labelMatch[0].length;
    const afterLabel = line.slice(valueStart).trim();
    if (!afterLabel) {
      continue;
    }

    const nextLabelMatch = /(^|[\s(（【[])[^，。；;\n]{1,24}[：:]/u.exec(afterLabel);
    let valueText = nextLabelMatch && typeof nextLabelMatch.index === 'number' && nextLabelMatch.index > 0
      ? afterLabel.slice(0, nextLabelMatch.index)
      : afterLabel;

    valueText = valueText.replace(/[，。；;]+$/u, '').trim();
    if (!valueText || valueText.length > 120) {
      continue;
    }

    return { labelText, valueText };
  }

  return null;
}

function extractWordMultilineLabelValueTarget(text: string): { labelText: string; valueText: string } | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const labelText = lines[index];
    const valueText = lines[index + 1];
    if (!/[：:]$/u.test(labelText)) {
      continue;
    }

    const labelCore = labelText.replace(/[：:]$/u, '').trim();
    if (!labelCore || /[，。；;]/u.test(labelCore)) {
      continue;
    }
    if (!valueText || /[：:]$/u.test(valueText)) {
      continue;
    }
    if (valueText.length > 120) {
      continue;
    }

    return {
      labelText,
      valueText: valueText.replace(/[，。；;]+$/u, '').trim(),
    };
  }

  return null;
}

function extractWordStandaloneLabelTarget(text: string): string | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/[：:]$/u.test(line)) {
      continue;
    }
    const labelCore = line.replace(/[：:]$/u, '').trim();
    if (!labelCore || /[，。；;]/u.test(labelCore)) {
      continue;
    }
    return line;
  }

  return null;
}

type UnderlineFallbackLanguage = 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';

type UnderlineSpaceCandidate = {
  paragraphIndex: number;
  paragraphText: string;
  text: string;
  start: number;
  end: number;
  blankIndex: number;
  blankCount: number;
  blankLength: number;
  hasUnderlineFormat: boolean;
  foundByContext: boolean;
  mirrorShape: string;
  language: UnderlineFallbackLanguage;
  hasKana: boolean;
};

function detectUnderlineFallbackLanguage(text: string): UnderlineFallbackLanguage {
  const sourceText = String(text || '');
  const hasZh = /[\u4e00-\u9fff]/u.test(sourceText);
  const hasJaKana = /[\u3040-\u30ff]/u.test(sourceText);
  const hasEn = /[A-Za-z]/.test(sourceText);
  const languageCount = Number(hasZh) + Number(hasJaKana) + Number(hasEn);

  if (languageCount > 1) {
    return 'mixed';
  }
  if (hasJaKana) {
    return 'ja';
  }
  if (hasZh) {
    return 'zh';
  }
  if (hasEn) {
    return 'en';
  }
  return 'unknown';
}

function buildUnderlineMirrorShape(text: string): string {
  const sourceText = String(text || '');
  let result = '';
  let previousToken = '';

  const pushToken = (token: string) => {
    if (!token) {
      return;
    }
    if (token === previousToken) {
      return;
    }
    result += token;
    previousToken = token;
  };

  for (const char of sourceText) {
    if (/[ 　\t_＿]/u.test(char)) {
      pushToken('_');
      continue;
    }
    if (/[：:]/u.test(char)) {
      pushToken(':');
      continue;
    }
    if (/[。．.!！？?]/u.test(char)) {
      pushToken('.');
      continue;
    }
    if (/[、，,；;]/u.test(char)) {
      pushToken(',');
      continue;
    }
    if (/[0-9０-９]/u.test(char)) {
      pushToken('9');
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      pushToken('A');
      continue;
    }
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(char)) {
      pushToken('X');
      continue;
    }
    pushToken('#');
  }

  return result;
}

function canUseMirrorUnderlineFallback(
  current: UnderlineSpaceCandidate,
  counterpart: UnderlineSpaceCandidate,
): boolean {
  if (current.hasUnderlineFormat || !counterpart.hasUnderlineFormat) {
    return false;
  }
  if (current.blankCount !== counterpart.blankCount || current.blankIndex !== counterpart.blankIndex) {
    return false;
  }
  if (current.blankLength !== counterpart.blankLength) {
    return false;
  }
  if (!current.mirrorShape || current.mirrorShape !== counterpart.mirrorShape) {
    return false;
  }
  if (Math.abs(current.paragraphIndex - counterpart.paragraphIndex) > 1) {
    return false;
  }

  const languagePair = new Set([current.language, counterpart.language]);
  if (languagePair.has('en') || languagePair.has('unknown')) {
    return false;
  }

  // Prefer bilingual-adjacent paragraphs, but still allow same-shape CJK mirrors
  // when one side contains Kana and the other does not.
  if (current.language === counterpart.language && current.hasKana === counterpart.hasKana) {
    return false;
  }

  return true;
}

function buildWordContextSearchTexts(contextSnippet: string): string[] {
  const normalizedSnippet = stripWordContextSnippet(contextSnippet);
  if (!normalizedSnippet) {
    return [];
  }

  const lines = normalizedSnippet
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  const aliasLines = lines.flatMap((line) => {
    const standaloneLabel = extractWordStandaloneLabelTarget(line);
    if (standaloneLabel) {
      return getWordHeaderAliasCandidates(standaloneLabel);
    }

    const labelValueTarget = extractWordLabelValueTarget(line);
    if (labelValueTarget?.labelText) {
      return getWordHeaderAliasCandidates(labelValueTarget.labelText);
    }

    return [];
  });

  const preferredLines = lines.filter((line) => extractLongestWordBlank(line) || extractWordLabelValueTarget(line));
  return Array.from(new Set([...preferredLines, ...aliasLines, ...lines])).slice(0, 10);
}

function buildWordInsertionSearchSnippets(text: string, fromEnd: boolean): string[] {
  const normalized = String(text || '');
  if (!normalized) {
    return [];
  }

  const snippets = fromEnd
    ? [normalized.slice(-24), normalized.slice(-16), normalized.slice(-8)]
    : [normalized.slice(0, 24), normalized.slice(0, 16), normalized.slice(0, 8)];

  return Array.from(new Set(
    snippets
      .map((snippet) => snippet.trim())
      .filter((snippet) => snippet.length >= 2)
  ));
}

function countWordTextOccurrencesBefore(sourceText: string, searchText: string, targetStart: number): number {
  const haystack = String(sourceText || '');
  const needle = String(searchText || '');
  if (!haystack || !needle) {
    return 0;
  }

  const safeTargetStart = Math.max(0, Math.min(targetStart, haystack.length));
  let count = 0;
  let searchFrom = 0;

  while (searchFrom < safeTargetStart) {
    const foundIndex = haystack.indexOf(needle, searchFrom);
    if (foundIndex < 0 || foundIndex >= safeTargetStart) {
      break;
    }
    count += 1;
    searchFrom = foundIndex + Math.max(needle.length, 1);
  }

  return count;
}

function pickWordSearchResultByPosition<T>(
  items: T[],
  sourceText: string,
  searchText: string,
  targetStart: number,
): T | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const occurrenceIndex = countWordTextOccurrencesBefore(sourceText, searchText, targetStart);
  return items[Math.min(occurrenceIndex, items.length - 1)] || items[0];
}

async function insertWordTextAtParagraphPosition(
  paragraph: Word.Paragraph,
  paragraphText: string,
  position: number,
  replacementText: string,
): Promise<boolean> {
  const safePosition = Math.max(0, Math.min(position, paragraphText.length));
  const beforeText = paragraphText.slice(0, safePosition);
  const afterText = paragraphText.slice(safePosition);

  const beforeSnippets = buildWordInsertionSearchSnippets(beforeText, true);
  for (const snippet of beforeSnippets) {
    const snippetSearch = paragraph.search(snippet, {
      matchCase: true,
      matchWholeWord: false,
    });
    snippetSearch.load('items');
    await paragraph.context.sync();

    if (snippetSearch.items.length === 0) {
      continue;
    }

    snippetSearch.items[snippetSearch.items.length - 1].insertText(replacementText, Word.InsertLocation.end);
    await paragraph.context.sync();
    return true;
  }

  const afterSnippets = buildWordInsertionSearchSnippets(afterText, false);
  for (const snippet of afterSnippets) {
    const snippetSearch = paragraph.search(snippet, {
      matchCase: true,
      matchWholeWord: false,
    });
    snippetSearch.load('items');
    await paragraph.context.sync();

    if (snippetSearch.items.length === 0) {
      continue;
    }

    snippetSearch.items[0].insertText(replacementText, Word.InsertLocation.start);
    await paragraph.context.sync();
    return true;
  }

  return false;
}

async function replaceWordValueNearLabel(
  context: Word.RequestContext,
  labelText: string,
  valueText: string,
  replacementText: string,
): Promise<boolean> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load('items');
  await context.sync();

  for (const paragraph of paragraphs.items) {
    paragraph.load('text');
  }
  await context.sync();

  const normalizedLabel = String(labelText || '').trim();
  const normalizedValue = String(valueText || '').trim();
  if (!normalizedLabel || !normalizedValue) {
    return false;
  }

  for (let index = 0; index < paragraphs.items.length; index += 1) {
    const paragraph = paragraphs.items[index];
    const paragraphText = String(paragraph.text || '');
    if (!paragraphText.includes(normalizedLabel)) {
      continue;
    }

    if (paragraphText.includes(normalizedValue)) {
      const valueSearch = paragraph.search(normalizedValue, {
        matchCase: false,
        matchWholeWord: false,
      });
      valueSearch.load('items');
      await context.sync();

      if (valueSearch.items.length > 0) {
        valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
        await context.sync();
        return true;
      }
    }

    const nextParagraph = paragraphs.items[index + 1];
    if (!nextParagraph) {
      continue;
    }
    const nextParagraphText = String(nextParagraph.text || '');
    if (!nextParagraphText.includes(normalizedValue)) {
      continue;
    }

    const valueSearch = nextParagraph.search(normalizedValue, {
      matchCase: false,
      matchWholeWord: false,
    });
    valueSearch.load('items');
    await context.sync();

    if (valueSearch.items.length > 0) {
      valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
      await context.sync();
      return true;
    }
  }

  return false;
}

async function insertWordValueAfterLabel(
  foundRange: Word.Range,
  labelText: string,
  replacementText: string,
): Promise<boolean> {
  const normalizedLabel = String(labelText || '').trim();
  const normalizedFoundText = String(foundRange.text || '').trim();
  if (!normalizedLabel || !normalizedFoundText) {
    return false;
  }

  if (normalizedFoundText === normalizedLabel || normalizedFoundText.endsWith(normalizedLabel)) {
    foundRange.insertText(replacementText, Word.InsertLocation.end);
    return true;
  }

  const labelSearch = foundRange.search(normalizedLabel, {
    matchCase: false,
    matchWholeWord: false,
  });
  labelSearch.load('items');
  await foundRange.context.sync();

  if (labelSearch.items.length === 0) {
    return false;
  }

  labelSearch.items[0].insertText(replacementText, Word.InsertLocation.end);
  return true;
}

/**
 * 获取当前 Office 应用类型
 */

export const WordAPI = {
  _lastUnderlineDebugReport: '' as string,
  _debugLogger: null as null | ((level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string) => void),

  getLastUnderlineDebugReport(): string {
    return this._lastUnderlineDebugReport || '';
  },

  clearLastUnderlineDebugReport(): void {
    this._lastUnderlineDebugReport = '';
  },

  setDebugLogger(
    logger: ((level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string) => void) | null
  ): void {
    this._debugLogger = logger;
  },

  clearDebugLogger(): void {
    this._debugLogger = null;
  },

  emitDebugLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string): void {
    this._debugLogger?.(level, message, details);
    const consoleMethod = level === 'error'
      ? 'error'
      : level === 'warn'
        ? 'warn'
        : level === 'debug'
          ? 'debug'
          : 'log';
    console[consoleMethod](`[WORD LOOP] ${message}`, details || '');
  },

  /**
   * 获取文档全部内容（纯文本）
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
   * 使用Word.run API获取文档文件（推荐方式）
   * 尝试使用Word专用的getFileOrNull方法（如果支持）
   * 如果不支持，回退到getFileAsync
   */
  async getDocumentFileViaWordRun(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 检查是否支持getFileOrNull（Word 1.3+ API）
        // 这是一个较新的API，可能在某些版本中不支持
        const document = context.document;

        // 尝试使用getFileOrNull方法（如果存在）
        // @ts-ignore - getFileOrNull可能在某些Office版本中不存在
        if (document.getFileOrNull && typeof document.getFileOrNull === 'function') {
          try {
            // @ts-ignore
            const file = document.getFileOrNull(Word.FileType.docx);
            file.load('base64');
            await context.sync();

            if (file.value && file.value.base64) {
              const base64 = file.value.base64;
              console.log('Word.run getFileOrNull成功，base64长度:', base64?.length);

              // 验证是否是有效的docx（PK开头）
              try {
                const decoded = atob(base64.substring(0, 50));
                if (decoded.substring(0, 2) === 'PK') {
                  console.log('Word.run获取到有效的docx文件（PK header验证通过）');
                  resolve(base64);
                  return;
                } else {
                  console.warn('Word.run获取的数据不是有效docx（无PK header）');
                }
              } catch (e) {
                console.warn('Word.run base64解码验证失败:', e);
              }
            }
          } catch (e) {
            console.warn('Word.run getFileOrNull调用失败:', e);
          }
        }

        // getFileOrNull不支持或失败，尝试使用body.getOoxml()
        // 注意：getOoxml()返回的是OOXML格式，不是完整的docx文件
        const body = document.body;
        body.load('text');
        await context.sync();

        // 获取文档内容作为文本（最后的fallback）
        const text = body.text;
        console.log('Word.run返回文本内容，长度:', text?.length);
        reject(new Error('Word.run getFileOrNull不支持，需要使用getFileAsync方式'));
      }).catch((error) => {
        console.error('Word.run失败:', error);
        reject(error);
      });
    });
  },

  /**
   * 获取文档文件内容（Base64编码的docx文件）
   * 使用更大的sliceSize（4MB）提高可靠性
   */
  async getDocumentFileBase64(): Promise<string> {
    return DocumentFileAPI.getCompressedDocumentBase64();
  },

  /**
   * 使用Word.run获取整个文档的内容并转换为base64
   * 通过body.getOoxml()获取完整的OOXML格式
   */
  async getDocumentAsBase64(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        // 获取整个文档（不只是body）
        const document = context.document;
        const body = document.body;

        // 方法1：尝试获取OOXML格式的完整文档
        const ooxml = body.getOoxml();
        await context.sync();

        if (ooxml.value && ooxml.value.length > 0) {
          console.log('OOXML获取成功，长度:', ooxml.value.length);
          // OOXML是XML格式，需要转base64
          const base64 = this.utf8ToBase64(ooxml.value);
          resolve(base64);
          return;
        }

        // 方法2：如果OOXML失败，获取纯文本
        body.load('text');
        await context.sync();
        const text = body.text;
        console.log('纯文本获取成功，长度:', text?.length);
        resolve(this.utf8ToBase64(text || ''));
      }).catch((error) => {
        console.error('Word.run获取文档失败:', error);
        reject(error);
      });
    });
  },

  /**
   * 使用Document.getFileContentAsync（新版API，如果支持）
   * 直接返回base64编码的文件内容
   */
  async getFileContentBase64(): Promise<string> {
    return DocumentFileAPI.getFileContentBase64();
  },

  /**
   * 使用OOXML方式获取文档内容（备用方案）
   * Word.run API方式获取文档的Open XML格式
   */
  async getDocumentOoxml(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const body = context.document.body;
        const ooxml = body.getOoxml();
        await context.sync();
        console.log('OOXML length:', ooxml.value?.length);
        resolve(ooxml.value);
      }).catch((error) => {
        console.error('获取OOXML失败:', error);
        reject(error);
      });
    });
  },

  /**
   * 获取文档文件Base64（多种方式尝试，按优先级）
   * 优先使用Word.run专用的getFileOrNull方法
   */
  async getDocumentFileBase64WithFallback(): Promise<{ base64: string; method: string; isValidDocx: boolean }> {
    // 方法1: Word.run getFileOrNull（Word专用API，最可靠）
    try {
      const base64 = await this.getDocumentFileViaWordRun();
      if (base64 && base64.length > 0) {
        // 验证是否是有效的docx（PK开头）
        try {
          const decoded = atob(base64.substring(0, 50));
          if (decoded.substring(0, 2) === 'PK') {
            console.log('Word.run getFileOrNull成功获取有效docx文件');
            return { base64, method: 'wordRunGetFile', isValidDocx: true };
          }
        } catch (e) {
          console.warn('Word.run验证失败');
        }
        // 即使无PK header，也返回数据让上层处理
        console.warn('Word.run返回数据无PK header，但仍返回');
        return { base64, method: 'wordRunGetFile', isValidDocx: false };
      }
    } catch (e) {
      console.warn('Word.run getFileOrNull失败或不支持:', e);
    }

    // 方法2: 尝试getFileContentAsync（较新API，直接返回base64）
    try {
      const base64 = await this.getFileContentBase64();
      if (base64 && base64.length > 0) {
        // 验证是否是有效的docx（PK开头）
        try {
          const decoded = atob(base64.substring(0, 50));
          if (decoded.substring(0, 2) === 'PK') {
            console.log('getFileContentAsync成功获取有效docx文件');
            return { base64, method: 'getFileContentAsync', isValidDocx: true };
          }
        } catch (e) {
          console.warn('getFileContentAsync验证失败');
        }
        console.warn('getFileContentAsync返回数据无PK header，但仍返回');
        return { base64, method: 'getFileContentAsync', isValidDocx: false };
      }
    } catch (e) {
      console.warn('getFileContentAsync失败或不支持:', e);
    }

    // 方法3: 尝试getFileAsync（切片方式，使用4MB sliceSize）
    try {
      const base64 = await this.getDocumentFileBase64();
      if (base64 && base64.length > 0) {
        try {
          const decoded = atob(base64.substring(0, 50));
          if (decoded.substring(0, 2) === 'PK') {
            console.log('getFileAsync成功获取有效docx文件');
            return { base64, method: 'getFileAsync', isValidDocx: true };
          }
        } catch (e) {
          console.warn('getFileAsync base64验证失败');
        }
        console.warn('getFileAsync返回数据无PK header，但仍返回');
        return { base64, method: 'getFileAsync', isValidDocx: false };
      }
    } catch (e) {
      console.warn('getFileAsync失败:', e);
    }

    // 方法4: 使用Word.run获取OOXML（不是完整的docx，但可以作为备选）
    try {
      const base64 = await this.getDocumentAsBase64();
      if (base64 && base64.length > 0) {
        console.log('使用Word.run OOXML方式获取文档（非完整docx）');
        return { base64, method: 'wordRunOoxml', isValidDocx: false };
      }
    } catch (e) {
      console.warn('Word.run OOXML方式也失败:', e);
    }

    // 方法5: 纯文本（最后的fallback）
    const text = await this.getDocumentContent();
    console.warn('使用纯文本作为fallback');
    return { base64: this.utf8ToBase64(text), method: 'text', isValidDocx: false };
  },

  /**
   * 将UTF-8字符串转换为Base64
   * 解决btoa无法处理中文字符的问题
   */
  utf8ToBase64(str: string): string {
    try {
      // 使用TextEncoder将字符串编码为UTF-8字节
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      // 将字节转换为base64
      // 在浏览器中使用btoa处理Uint8Array需要先转换为字符串
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    } catch (e) {
      console.error('UTF-8转Base64失败:', e);
      // 如果TextEncoder不支持，尝试encodeURIComponent方法
      try {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
      } catch (e2) {
        console.error('备用转换也失败:', e2);
        return '';
      }
    }
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
        tables.load('items');
        await context.sync();

        const tableData = [];
        for (let i = 0; i < tables.items.length; i++) {
          const table = tables.items[i];
          table.load('rowCount,columnCount');
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          const content: string[][] = [];
          for (const row of rows.items) {
            const cells = row.cells;
            cells.load('items');
            await context.sync();
            cells.items.forEach((cell) => {
              cell.body.load('text');
            });
            await context.sync();
            const rowContent = cells.items.map((cell) => cell.body.text);
            content.push(rowContent);
          }
          tableData.push({
            rows: table.rowCount,
            cols: content[0]?.length || 0,
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
          altText: img.altTextTitle || img.altTextDescription || '',
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
   * 获取 Word 内容控件信息
   */
  async getContentControls(): Promise<Array<{
    id: number;
    title: string;
    tag: string;
    text: string;
    type: string;
    subtype?: string;
    appearance?: string;
    cannotDelete: boolean;
    cannotEdit: boolean;
    parentTableCell?: { rowIndex: number; cellIndex: number } | null;
  }>> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const controls = context.document.contentControls;
        controls.load('items');
        await context.sync();

        for (const control of controls.items) {
          control.load('id,title,tag,text,type,subtype,appearance,cannotDelete,cannotEdit');
          control.parentTableCellOrNullObject.load('isNullObject,rowIndex,cellIndex');
        }
        await context.sync();

        resolve(
          controls.items.map((control) => ({
            id: control.id,
            title: control.title || '',
            tag: control.tag || '',
            text: control.text || '',
            type: String(control.type || ''),
            subtype: control.subtype ? String(control.subtype) : undefined,
            appearance: control.appearance ? String(control.appearance) : undefined,
            cannotDelete: Boolean(control.cannotDelete),
            cannotEdit: Boolean(control.cannotEdit),
            parentTableCell: control.parentTableCellOrNullObject.isNullObject
              ? null
              : {
                  rowIndex: control.parentTableCellOrNullObject.rowIndex,
                  cellIndex: control.parentTableCellOrNullObject.cellIndex,
                },
          }))
        );
      }).catch((error) => {
        console.warn('getContentControls error:', error);
        resolve([]);
      });
    });
  },

  /**
   * 获取表格单元格结构
   */
  async getTableCells(): Promise<Array<{
    tableIndex: number;
    rowIndex: number;
    cellIndex: number;
    text: string;
  }>> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();

        const cellsData: Array<{
          tableIndex: number;
          rowIndex: number;
          cellIndex: number;
          text: string;
        }> = [];

        for (let tableIndex = 0; tableIndex < tables.items.length; tableIndex += 1) {
          const table = tables.items[tableIndex];
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          for (const row of rows.items) {
            const cells = row.cells;
            cells.load('items');
            await context.sync();

            for (const cell of cells.items) {
              cell.load('rowIndex,cellIndex');
              cell.body.load('text');
            }
            await context.sync();

            for (const cell of cells.items) {
              cellsData.push({
                tableIndex,
                rowIndex: cell.rowIndex,
                cellIndex: cell.cellIndex,
                text: cell.body.text || '',
              });
            }
          }
        }

        resolve(cellsData);
      }).catch((error) => {
        console.warn('getTableCells error:', error);
        resolve([]);
      });
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
      isTitle?: boolean;
      style?: string;
      styleBuiltIn?: string;
      isListItem?: boolean;
      listLevel?: number;
      listString?: string;
      listId?: number;
    };
  }>> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        // 为所有段落和它们的 range 加载属性
        const ranges: any[] = [];
        for (let i = 0; i < paragraphs.items.length; i++) {
          const p = paragraphs.items[i];
          const paragraphObject = p as any;
          paragraphObject.load('text,style,styleBuiltIn,isListItem');
          const listItemObject = paragraphObject.listItemOrNullObject || paragraphObject.listItem;
          if (listItemObject) {
            listItemObject.load('level,listString');
          }
          const listObject = paragraphObject.listOrNullObject || paragraphObject.list;
          if (listObject) {
            listObject.load('id');
          }
          const r = p.getRange(Word.RangeLocation.whole);
          r.load('font/size,font/bold,alignment');
          ranges.push({ paragraph: paragraphObject, range: r, listItem: listItemObject, list: listObject, index: i });
        }
        await context.sync();

        // 然后读取格式信息（使用已经加载的对象）
        const result = ranges.map(({ paragraph, range, listItem, list, index }) => {
          const fontSize = range.font.size || 12;
          const isBold = range.font.bold || false;
          const alignment = range.alignment;
          const style = typeof paragraph.style === 'string' ? paragraph.style : '';
          const styleBuiltIn = typeof paragraph.styleBuiltIn === 'string' ? paragraph.styleBuiltIn : '';
          const isListItem = Boolean(paragraph.isListItem);
          const listLevel = isListItem && typeof listItem?.level === 'number' ? listItem.level : undefined;
          const listString = isListItem && typeof listItem?.listString === 'string' ? listItem.listString : '';
          const listId = isListItem && typeof list?.id === 'number' ? list.id : undefined;

          const isTitle = (fontSize > 14 || isBold) && paragraph.text.trim().length < 50;

          return {
            text: paragraph.text,
            index: index,
            format: {
              fontSize: fontSize,
              isBold: isBold,
              alignment: alignment === Word.Alignment.left ? 'left' :
                         alignment === Word.Alignment.centered ? 'center' :
                         alignment === Word.Alignment.right ? 'right' : 'justified',
              isTitle: isTitle,
              style,
              styleBuiltIn,
              isListItem,
              listLevel,
              listString,
              listId,
            }
          };
        });

        resolve(result);
      }).catch((e) => {
        console.error('getParagraphsWithFormat error:', e);
        resolve([]);
      });
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
          img.load('altTextTitle,altTextDescription,width,height');

          // 获取图片Base64数据
          const imageBase64 = img.getBase64ImageSrc();
          await context.sync();

          result.push({
            index: i,
            altText: img.altTextTitle || img.altTextDescription || '',
            base64: imageBase64.value || '',
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
   * 核心概念：合同中"下划线+空格"=需要参数化的位置
   *
   * 逻辑：
   * 1. 下划线字符 `_` 或 `____`：直接作为参数（无需检查 font.underline）
   * 2. 空格区域：需要检查 font.underline 格式才作为参数
   */
  async getUnderlinedTexts(): Promise<Array<{
    text: string;
    underlineType: string;
    index: number;
    paragraphIndex: number;  // 段落索引
    paragraphText: string;
    position: { start: number; end: number };
  }>> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const result: any[] = [];
        const spaceCandidates: UnderlineSpaceCandidate[] = [];
        const warrantyDebugLines: string[] = [];
        const targetUnderlineDebugLines: string[] = [];
        const pushWarrantyDebug = (line: string) => {
          warrantyDebugLines.push(line);
          console.log(line);
        };
        const pushTargetUnderlineDebug = (line: string, details?: Record<string, unknown>) => {
          const detailText = details ? ` | ${JSON.stringify(details)}` : '';
          const finalLine = `${line}${detailText}`;
          targetUnderlineDebugLines.push(finalLine);
          console.log(finalLine);
          WordAPI.emitDebugLog('debug', line, details ? JSON.stringify(details, null, 2) : undefined);
        };
        const detectionStats = {
          spaceRanges: 0,
          contextHits: 0,
          directHits: 0,
          noSearchResult: 0,
          filteredByUnderline: 0,
          searchErrors: 0,
        };

        console.log('[DEBUG] 开始检测下划线参数位置...');

        try {
          const paragraphs = context.document.body.paragraphs;
          paragraphs.load('items');
          await context.sync();
          console.log(`[DEBUG] 文档共 ${paragraphs.items.length} 个段落`);

          // 遍历每个段落
          for (let pIdx = 0; pIdx < paragraphs.items.length; pIdx++) {
            const paragraph = paragraphs.items[pIdx];
            paragraph.load('text');
            await context.sync();

            const fullText = paragraph.text || '';
            if (!fullText || fullText.length < 2) continue;
            const isWarrantyDebugParagraph = /保修期|アフターサービス保証期間|年内|年とする/u.test(fullText);
            const isUnderlineDebugParagraph = shouldDebugWordUnderlineParagraph(fullText);
            const paragraphLanguage = detectUnderlineFallbackLanguage(fullText);
            const paragraphHasKana = /[\u3040-\u30ff]/u.test(fullText);

            if (isWarrantyDebugParagraph) {
              pushWarrantyDebug(`[DEBUG][WARRANTY] 段落${pIdx} 原文: ${JSON.stringify(fullText)}`);
            }
            // #region debug-point A:underline-paragraph-entry
            if (isUnderlineDebugParagraph) {
              pushTargetUnderlineDebug('[DEBUG][UNDERLINE][A] target paragraph entered underline scan', {
                location: 'api.ts:getUnderlinedTexts:paragraph-entry',
                paragraphIndex: pIdx,
                paragraphLanguage,
                paragraphHasKana,
                paragraphText: fullText,
              });
            }
            // #endregion

            // ===== 步骤1：分类查找空白区域 =====
            // A. 下划线字符：直接作为参数
            const underlineCharMatches: Array<{ text: string; start: number; end: number }> = [];
            const underlineCharRegex = /[＿_]{2,}/g;  // 至少2个下划线字符
            let match: RegExpExecArray | null;
            while ((match = underlineCharRegex.exec(fullText)) !== null) {
              underlineCharMatches.push({
                text: match[0],
                start: match.index,
                end: match.index + match[0].length
              });
            }

            // B. 空格区域：需要检查 font.underline
            const spaceMatches: Array<{ text: string; start: number; end: number }> = [];
            const spaceRegex = /[ 　\t]{2,}/g;  // 至少2个空格/制表符
            while ((match = spaceRegex.exec(fullText)) !== null) {
              // 避免与下划线字符重叠
              if (!underlineCharMatches.some(u => Math.abs(u.start - match!.index) < 2)) {
                spaceMatches.push({
                  text: match[0],
                  start: match.index,
                  end: match.index + match[0].length
                });
              }
            }

            const totalBlankCount = underlineCharMatches.length + spaceMatches.length;
            if (totalBlankCount === 0) continue;
            console.log(`[DEBUG] 段落 ${pIdx}: 发现 ${underlineCharMatches.length} 个下划线字符 + ${spaceMatches.length} 个空格区域`);
            // #region debug-point A:underline-blank-scan
            if (isUnderlineDebugParagraph) {
              pushTargetUnderlineDebug('[DEBUG][UNDERLINE][A] target paragraph blank scan result', {
                location: 'api.ts:getUnderlinedTexts:blank-scan',
                paragraphIndex: pIdx,
                underlineCharCount: underlineCharMatches.length,
                underlineCharRanges: underlineCharMatches,
                spaceCount: spaceMatches.length,
                spaceRanges: spaceMatches,
                paragraphText: fullText,
              });
            }
            // #endregion
            if (isWarrantyDebugParagraph) {
              pushWarrantyDebug(
                `[DEBUG][WARRANTY] 段落${pIdx} 空白统计: underlineChar=${underlineCharMatches.length}, spaces=${spaceMatches.length}`
              );
              underlineCharMatches.forEach((underlineMatch, underlineIndex) => {
                pushWarrantyDebug(
                  `[DEBUG][WARRANTY] 段落${pIdx} 下划线字符#${underlineIndex + 1}: ${underlineMatch.start}-${underlineMatch.end} ${JSON.stringify(underlineMatch.text)}`
                );
              });
              spaceMatches.forEach((spaceMatch, spaceIndex) => {
                pushWarrantyDebug(
                  `[DEBUG][WARRANTY] 段落${pIdx} 空格候选#${spaceIndex + 1}: ${spaceMatch.start}-${spaceMatch.end} ${JSON.stringify(spaceMatch.text)}`
                );
              });
            }

            // ===== 步骤2：下划线字符直接加入结果 =====
            // 下划线字符（_）本身就是参数标记，不需要检查 font.underline
            for (const underlineMatch of underlineCharMatches) {
              result.push({
                text: underlineMatch.text,
                underlineType: 'underline-char',
                index: result.length,
                paragraphIndex: pIdx,
                paragraphText: fullText,
                position: { start: underlineMatch.start, end: underlineMatch.end }
              });
              console.log(`[DEBUG] ✓ 下划线字符: 段落${pIdx} 位置${underlineMatch.start}-${underlineMatch.end}`);
            }

            // ===== 步骤3：空格区域检查 font.underline =====
            for (let spaceIndex = 0; spaceIndex < spaceMatches.length; spaceIndex += 1) {
              const spaceMatch = spaceMatches[spaceIndex];
              detectionStats.spaceRanges += 1;
              const candidateMeta: UnderlineSpaceCandidate = {
                paragraphIndex: pIdx,
                paragraphText: fullText,
                text: spaceMatch.text,
                start: spaceMatch.start,
                end: spaceMatch.end,
                blankIndex: spaceIndex,
                blankCount: spaceMatches.length,
                blankLength: spaceMatch.text.length,
                hasUnderlineFormat: false,
                foundByContext: false,
                mirrorShape: buildUnderlineMirrorShape(fullText),
                language: paragraphLanguage,
                hasKana: paragraphHasKana,
              };
              try {
                const blankText = spaceMatch.text;
                let hasUnderlineFormat = false;
                let foundByContext = false;
                let countedUnderlineFilter = false;
                let contextRangeCount = 0;
                let directRangeCount = 0;
                let contextUnderlineStates: string[] = [];
                let directUnderlineStates: string[] = [];

                // 优先使用上下文扩展文本定位，避免直接搜索纯空格带来的误命中或漏命中。
                const extendBefore = 4;
                const extendAfter = 4;
                const extendedStart = Math.max(0, spaceMatch.start - extendBefore);
                const extendedEnd = Math.min(fullText.length, spaceMatch.end + extendAfter);
                const extendedText = fullText.substring(extendedStart, extendedEnd);

                if (isWarrantyDebugParagraph) {
                  pushWarrantyDebug(
                    `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 扩展上下文 ${JSON.stringify(extendedText)}`
                  );
                }

                if (extendedText.length > blankText.length) {
                  const extSearchResults = paragraph.search(extendedText, {
                    matchCase: true,
                    matchWholeWord: false,
                  });
                  extSearchResults.load('items');
                  await context.sync();

                  if (extSearchResults.items.length > 0) {
                    const extRange = extSearchResults.items[0];
                    const blankInExt = extRange.search(blankText, {
                      matchCase: false,
                      matchWholeWord: false,
                    });
                    blankInExt.load('items');
                    await context.sync();

                    if (blankInExt.items.length > 0) {
                      for (const foundRange of blankInExt.items) {
                        foundRange.load('text,font/underline');
                      }
                      await context.sync();
                      contextRangeCount = blankInExt.items.length;
                      contextUnderlineStates = blankInExt.items.map((foundRange) => String(foundRange.font.underline));

                      if (isWarrantyDebugParagraph) {
                        pushWarrantyDebug(
                          `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 上下文命中 ${blankInExt.items.length} 个空格 range`
                        );
                        blankInExt.items.forEach((foundRange, foundIndex) => {
                          pushWarrantyDebug(
                            `[DEBUG][WARRANTY] 段落${pIdx} 上下文range#${foundIndex + 1}: text=${JSON.stringify(foundRange.text)} underline=${String(foundRange.font.underline)}`
                          );
                        });
                      }

                      hasUnderlineFormat = blankInExt.items.some((foundRange) => {
                        const underline = foundRange.font.underline;
                        return underline && underline !== 'None' && underline !== 'Mixed';
                      });
                      foundByContext = hasUnderlineFormat;
                      candidateMeta.hasUnderlineFormat = hasUnderlineFormat;
                      candidateMeta.foundByContext = foundByContext;

                      if (!hasUnderlineFormat) {
                        detectionStats.filteredByUnderline += 1;
                        countedUnderlineFilter = true;
                        console.log(
                          `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 上下文定位成功，但空格区域 underline 为 None/Mixed`
                        );
                      }
                    } else {
                      if (isWarrantyDebugParagraph) {
                        pushWarrantyDebug(
                          `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 上下文内没有找到空格片段`
                        );
                      }
                      console.log(
                        `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 上下文命中，但在上下文内未找到空格片段`
                      );
                    }
                  } else {
                    if (isWarrantyDebugParagraph) {
                      pushWarrantyDebug(
                        `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 扩展上下文未命中`
                      );
                    }
                    console.log(
                      `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 未找到扩展上下文 "${extendedText}"`
                    );
                  }
                }

                if (!hasUnderlineFormat) {
                  const searchResults = paragraph.search(blankText, {
                    matchCase: false,
                    matchWholeWord: false
                  });
                  searchResults.load('items');
                  await context.sync();

                  if (isWarrantyDebugParagraph) {
                    pushWarrantyDebug(
                      `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 直接搜索命中 ${searchResults.items.length} 个 range`
                    );
                  }

                  if (searchResults.items.length === 0) {
                    detectionStats.noSearchResult += 1;
                    console.log(`[DEBUG] 段落${pIdx} 位置${spaceMatch.start}: 未找到空格文本`);
                    continue;
                  }

                  for (const foundRange of searchResults.items) {
                    foundRange.load('text,font/underline');
                  }
                  await context.sync();
                  directRangeCount = searchResults.items.length;
                  directUnderlineStates = searchResults.items.map((foundRange) => String(foundRange.font.underline));

                  if (isWarrantyDebugParagraph) {
                    searchResults.items.forEach((foundRange, foundIndex) => {
                      pushWarrantyDebug(
                        `[DEBUG][WARRANTY] 段落${pIdx} 直接range#${foundIndex + 1}: text=${JSON.stringify(foundRange.text)} underline=${String(foundRange.font.underline)}`
                      );
                    });
                  }

                  hasUnderlineFormat = searchResults.items.some((foundRange) => {
                    const underline = foundRange.font.underline;
                    return underline && underline !== 'None' && underline !== 'Mixed';
                  });
                  candidateMeta.hasUnderlineFormat = hasUnderlineFormat;

                  if (!hasUnderlineFormat) {
                    if (!countedUnderlineFilter) {
                      detectionStats.filteredByUnderline += 1;
                    }
                    console.log(
                      `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 直接搜索命中，但空格区域 underline 为 None/Mixed`
                    );
                  }
                }

                if (hasUnderlineFormat) {
                  if (foundByContext) {
                    detectionStats.contextHits += 1;
                  } else {
                    detectionStats.directHits += 1;
                  }
                  result.push({
                    text: blankText,
                    underlineType: foundByContext ? 'SingleContext' : 'Single',
                    index: result.length,
                    paragraphIndex: pIdx,
                    paragraphText: fullText,
                    position: { start: spaceMatch.start, end: spaceMatch.end }
                  });
                  console.log(`[DEBUG] ✓ 下划线空格: 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}`);
                  if (isWarrantyDebugParagraph) {
                    pushWarrantyDebug(
                      `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 已写入结果，类型=${foundByContext ? 'SingleContext' : 'Single'}`
                    );
                  }
                } else if (isWarrantyDebugParagraph) {
                  pushWarrantyDebug(
                    `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 未写入结果，原因=underline 未通过或搜索未命中`
                  );
                }
                // #region debug-point B:underline-space-decision
                if (isUnderlineDebugParagraph) {
                  pushTargetUnderlineDebug('[DEBUG][UNDERLINE][B] target paragraph space candidate decision', {
                    location: 'api.ts:getUnderlinedTexts:space-decision',
                    paragraphIndex: pIdx,
                    paragraphText: fullText,
                    blankIndex: spaceIndex,
                    blankStart: spaceMatch.start,
                    blankEnd: spaceMatch.end,
                    blankLength: spaceMatch.text.length,
                    extendedText,
                    contextRangeCount,
                    contextUnderlineStates,
                    directRangeCount,
                    directUnderlineStates,
                    hasUnderlineFormat,
                    foundByContext,
                    resultWritten: hasUnderlineFormat,
                  });
                }
                // #endregion
              } catch (searchErr) {
                detectionStats.searchErrors += 1;
                console.warn('[DEBUG] 空格搜索错误:', searchErr);
              }
              spaceCandidates.push(candidateMeta);
            }
          }
        } catch (formatErr) {
          console.warn('[DEBUG] 格式检测总错误:', formatErr);
        }

        const confirmedCandidateKeys = new Set(
          result.map((entry) => `${entry.paragraphIndex}:${entry.position.start}:${entry.position.end}`)
        );
        const paragraphCandidateMap = new Map<number, UnderlineSpaceCandidate[]>();
        spaceCandidates.forEach((candidate) => {
          const currentList = paragraphCandidateMap.get(candidate.paragraphIndex) || [];
          currentList.push(candidate);
          paragraphCandidateMap.set(candidate.paragraphIndex, currentList);
        });

        paragraphCandidateMap.forEach((candidates) => {
          candidates.sort((left, right) => left.start - right.start);
        });

        const fallbackCandidates: typeof result = [];
        spaceCandidates.forEach((candidate) => {
          if (candidate.hasUnderlineFormat) {
            return;
          }

          const fallbackKey = `${candidate.paragraphIndex}:${candidate.start}:${candidate.end}`;
          if (confirmedCandidateKeys.has(fallbackKey)) {
            return;
          }

          const neighborParagraphs = [
            paragraphCandidateMap.get(candidate.paragraphIndex - 1) || [],
            paragraphCandidateMap.get(candidate.paragraphIndex + 1) || [],
          ].flat();
            if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
              pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] evaluating mirror fallback candidates', {
                location: 'api.ts:getUnderlinedTexts:mirror-fallback',
                paragraphIndex: candidate.paragraphIndex,
                paragraphText: candidate.paragraphText,
                candidateLanguage: candidate.language,
                candidateHasKana: candidate.hasKana,
                candidateBlankIndex: candidate.blankIndex,
                candidateBlankCount: candidate.blankCount,
                candidateBlankLength: candidate.blankLength,
                candidateMirrorShape: candidate.mirrorShape,
                neighborSummaries: neighborParagraphs.map((neighbor) => ({
                  paragraphIndex: neighbor.paragraphIndex,
                  language: neighbor.language,
                  hasKana: neighbor.hasKana,
                  blankIndex: neighbor.blankIndex,
                  blankCount: neighbor.blankCount,
                  blankLength: neighbor.blankLength,
                  hasUnderlineFormat: neighbor.hasUnderlineFormat,
                  mirrorShapeMatched: neighbor.mirrorShape === candidate.mirrorShape,
                  paragraphText: neighbor.paragraphText,
                })),
              });
            }

          const mirroredSource = neighborParagraphs.find((neighbor) =>
            canUseMirrorUnderlineFallback(candidate, neighbor)
          );

          if (!mirroredSource) {
              if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
                pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] mirror fallback not applied', {
                  location: 'api.ts:getUnderlinedTexts:mirror-fallback-miss',
                  paragraphIndex: candidate.paragraphIndex,
                  paragraphText: candidate.paragraphText,
                  candidateLanguage: candidate.language,
                  candidateHasKana: candidate.hasKana,
                });
              }
            return;
          }

          fallbackCandidates.push({
            text: candidate.text,
            underlineType: 'bilingual-mirror-fallback',
            index: 0,
            paragraphIndex: candidate.paragraphIndex,
            paragraphText: candidate.paragraphText,
            position: { start: candidate.start, end: candidate.end },
          });
          confirmedCandidateKeys.add(fallbackKey);

          const isWarrantyDebugParagraph = /保修期|アフターサービス保証期間|年内|年とする/u.test(candidate.paragraphText);
          if (isWarrantyDebugParagraph) {
            pushWarrantyDebug(
              `[DEBUG][WARRANTY] 段落${candidate.paragraphIndex} 空格${candidate.start}-${candidate.end}: 镜像兜底生效，参考段落${mirroredSource.paragraphIndex} 同序号空格已确认 underline`
            );
          }
            if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
              pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] mirror fallback applied', {
                location: 'api.ts:getUnderlinedTexts:mirror-fallback-hit',
                paragraphIndex: candidate.paragraphIndex,
                paragraphText: candidate.paragraphText,
                mirroredSourceParagraphIndex: mirroredSource.paragraphIndex,
                mirroredSourceLanguage: mirroredSource.language,
                mirroredSourceHasKana: mirroredSource.hasKana,
                mirroredSourceParagraphText: mirroredSource.paragraphText,
              });
            }
        });

        if (fallbackCandidates.length > 0) {
          fallbackCandidates.forEach((item) => result.push(item));
        }

          const targetResultEntries = result.filter((entry) => shouldDebugWordUnderlineParagraph(entry.paragraphText));
          if (targetResultEntries.length > 0 || targetUnderlineDebugLines.length > 0) {
            pushTargetUnderlineDebug('[DEBUG][UNDERLINE][D] final underline result snapshot', {
              location: 'api.ts:getUnderlinedTexts:final-result',
              matchedEntryCount: targetResultEntries.length,
              matchedEntries: targetResultEntries.map((entry) => ({
                paragraphIndex: entry.paragraphIndex,
                underlineType: entry.underlineType,
                start: entry.position.start,
                end: entry.position.end,
                text: entry.text,
                paragraphText: entry.paragraphText,
              })),
            });
          }

        WordAPI._lastUnderlineDebugReport = [...targetUnderlineDebugLines, ...warrantyDebugLines].length > 0
          ? [...targetUnderlineDebugLines, ...warrantyDebugLines].join('\n')
          : '本次未捕获到目标英文下划线段落或保修期定向下划线调试信息。';

        console.log('[DEBUG] 最终检测到', result.length, '个参数位置');
        console.log('[DEBUG] 下划线空格检测统计:', detectionStats);
        // 按段落索引优先排序，然后按位置排序（文档顺序）
        resolve(result.sort((a, b) => {
          if (a.paragraphIndex !== b.paragraphIndex) {
            return a.paragraphIndex - b.paragraphIndex;
          }
          return a.position.start - b.position.start;
        }).map((entry, index) => ({
          ...entry,
          index,
        })));
      }).catch((e) => { console.error('[DEBUG] underline总错误:', e); resolve([]); });
    });
  },

  /**
   * 按段落索引和位置高亮下划线区域
   * 使用扩展文本搜索来精确定位（解决相同文本多次出现的问题）
   */
  async highlightUnderlineByPosition(paragraphIndex: number, startPos: number, endPos: number, _textHint?: string): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        console.log(`[DEBUG] highlightUnderline: 段落${paragraphIndex}, 位置${startPos}-${endPos}`);

        if (paragraphIndex >= paragraphs.items.length) {
          console.warn(`[DEBUG] 段落索引 ${paragraphIndex} 超出范围`);
          resolve(false);
          return;
        }

        const paragraph = paragraphs.items[paragraphIndex];
        paragraph.load('text');
        await context.sync();

        const fullText = paragraph.text;
        console.log(`[DEBUG] 段落全文: "${fullText.substring(0, 60)}..."`);

        try {
          // 直接搜索空白文本（与替换逻辑一致）
          const blankText = fullText.substring(startPos, endPos);
          console.log(`[DEBUG] 空白文本: "${blankText}" (${blankText.length}字符)`);

          if (blankText.length >= 1) {
            // 使用扩展文本搜索来精确定位（前后4字符）
            const extendBefore = 4;
            const extendAfter = 4;
            const extendedStart = Math.max(0, startPos - extendBefore);
            const extendedEnd = Math.min(fullText.length, endPos + extendAfter);
            const extendedText = fullText.substring(extendedStart, extendedEnd);

            console.log(`[DEBUG] 扩展文本: "${extendedText}"`);

            // 先搜索扩展文本定位段落中的具体位置
            const extSearchResults = paragraph.search(extendedText, {
              matchCase: true,
              matchWholeWord: false
            });
            extSearchResults.load('items');
            await context.sync();

            if (extSearchResults.items.length > 0) {
              // 在扩展文本范围内搜索空白
              const extRange = pickWordSearchResultByPosition(
                extSearchResults.items,
                fullText,
                extendedText,
                extendedStart,
              ) || extSearchResults.items[0];
              const blankInExt = extRange.search(blankText, {
                matchCase: false,
                matchWholeWord: false
              });
              blankInExt.load('items');
              await context.sync();

              if (blankInExt.items.length > 0) {
                const targetRange = pickWordSearchResultByPosition(
                  blankInExt.items,
                  extendedText,
                  blankText,
                  startPos - extendedStart,
                ) || blankInExt.items[0];
                targetRange.select();
                targetRange.font.highlightColor = 'yellow';
                await context.sync();
                console.log(`[DEBUG] ✓ 已高亮空白: "${blankText}"`);
                resolve(true);
                return;
              }
            }

            // 后备：直接在段落中搜索空白（可能高亮多个）
            const blankSearchResults = paragraph.search(blankText, {
              matchCase: false,
              matchWholeWord: false
            });
            blankSearchResults.load('items');
            await context.sync();

            if (blankSearchResults.items.length > 0) {
              // 高亮第一个匹配
              const targetRange = pickWordSearchResultByPosition(
                blankSearchResults.items,
                fullText,
                blankText,
                startPos,
              ) || blankSearchResults.items[0];
              targetRange.select();
              targetRange.font.highlightColor = 'yellow';
              await context.sync();
              console.log(`[DEBUG] ✓ 已高亮空白（后备）: "${blankText}"`);
              resolve(true);
              return;
            }
          }

          // 最终后备：选中整个段落
          const paraRange = paragraph.getRange(Word.RangeLocation.whole);
          paraRange.select();
          await context.sync();
          console.log(`[DEBUG] 已选中段落 ${paragraphIndex}（最终后备）`);
          resolve(true);
        } catch (err) {
          console.warn(`[DEBUG] 高亮失败:`, err);
          resolve(false);
        }
      }).catch((e) => {
        console.error('[DEBUG] highlightUnderline 错误:', e);
        resolve(false);
      });
    });
  },

  /**
   * 按段落索引和位置替换下划线区域为参数标记
   * 使用原始段落文本（避免替换后文本变化导致位置错乱）
   */
  async replaceUnderlineByPosition(paragraphIndex: number, startPos: number, endPos: number, replacement: string, _textHint?: string, originalParagraphText?: string): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        console.log(`[DEBUG] replaceUnderline: 段落${paragraphIndex}, 位置${startPos}-${endPos}, 替换为 "${replacement}"`);

        if (paragraphIndex >= paragraphs.items.length) {
          console.warn(`[DEBUG] 段落索引 ${paragraphIndex} 超出范围`);
          resolve(false);
          return;
        }

        const paragraph = paragraphs.items[paragraphIndex];

        try {
          // 使用原始段落文本（检测时的文本）计算扩展文本
          // 如果提供了 originalParagraphText，使用它；否则获取当前文本
          let fullText = originalParagraphText;
          if (!fullText) {
            paragraph.load('text');
            await context.sync();
            fullText = paragraph.text;
          }

          if (startPos >= endPos) {
            const inserted = await insertWordTextAtParagraphPosition(
              paragraph,
              fullText,
              startPos,
              replacement
            );
            if (inserted) {
              console.log(`[DEBUG] ✓ 已插入（定位点）: 位置${startPos} -> "${replacement}"`);
              resolve(true);
              return;
            }
          }

          // 方法1：直接搜索空白文本（最简单可靠）
          const blankText = fullText.substring(startPos, endPos);
          console.log(`[DEBUG] 空白文本: "${blankText}" (${blankText.length}字符)`);

          if (blankText.length >= 2) {
            const searchResults = paragraph.search(blankText, {
              matchCase: false,
              matchWholeWord: false
            });
            searchResults.load('items');
            await context.sync();

            console.log(`[DEBUG] 搜索结果数量: ${searchResults.items.length}`);

            if (searchResults.items.length > 0) {
              // 如果有多个匹配，使用扩展文本定位
              if (searchResults.items.length > 1) {
                console.log(`[DEBUG] 多个匹配，使用扩展文本定位`);

                // 计算扩展文本（包含前后字符）
                const extendBefore = 4;
                const extendAfter = 4;
                const extendedStart = Math.max(0, startPos - extendBefore);
                const extendedEnd = Math.min(fullText.length, endPos + extendAfter);
                const extendedText = fullText.substring(extendedStart, extendedEnd);

                console.log(`[DEBUG] 扩展文本: "${extendedText}"`);

                const extendedSearch = paragraph.search(extendedText, {
                  matchCase: true,
                  matchWholeWord: false
                });
                extendedSearch.load('items');
                await context.sync();

                if (extendedSearch.items.length > 0) {
                  // 在扩展文本中搜索空白部分
                  const foundRange = pickWordSearchResultByPosition(
                    extendedSearch.items,
                    fullText,
                    extendedText,
                    extendedStart,
                  ) || extendedSearch.items[0];
                  const blankInExtended = foundRange.search(blankText, {
                    matchCase: false,
                    matchWholeWord: false
                  });
                  blankInExtended.load('items');
                  await context.sync();

                  if (blankInExtended.items.length > 0) {
                    const targetRange = pickWordSearchResultByPosition(
                      blankInExtended.items,
                      extendedText,
                      blankText,
                      startPos - extendedStart,
                    ) || blankInExtended.items[0];
                    targetRange.insertText(replacement, Word.InsertLocation.replace);
                    await context.sync();
                    console.log(`[DEBUG] ✓ 已替换（扩展定位）: "${blankText.substring(0, 10)}..." → "${replacement}"`);
                    resolve(true);
                    return;
                  }
                }
              }

              // 单个匹配或扩展定位失败，直接替换第一个
              const targetRange = pickWordSearchResultByPosition(
                searchResults.items,
                fullText,
                blankText,
                startPos,
              ) || searchResults.items[0];
              targetRange.insertText(replacement, Word.InsertLocation.replace);
              await context.sync();
              console.log(`[DEBUG] ✓ 已替换（直接）: "${blankText.substring(0, 10)}..." → "${replacement}"`);
              resolve(true);
              return;
            }
          }

          console.warn(`[DEBUG] 未找到可替换的文本`);
          resolve(false);
        } catch (err) {
          console.warn(`[DEBUG] 替换失败:`, err);
          resolve(false);
        }
      }).catch((e) => {
        console.error('[DEBUG] replaceUnderline 错误:', e);
        resolve(false);
      });
    });
  },
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

  async highlightContentControlById(contentControlId: number): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const contentControl = context.document.contentControls.getByIdOrNullObject(contentControlId);
        contentControl.load('isNullObject');
        await context.sync();

        if (contentControl.isNullObject) {
          resolve(false);
          return;
        }

        const range = contentControl.getRange(Word.RangeLocation.whole);
        range.select();
        range.font.highlightColor = 'yellow';
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('highlightContentControlById error:', error);
        resolve(false);
      });
    });
  },

  async replaceContentControlText(contentControlId: number, replacementText: string): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const contentControl = context.document.contentControls.getByIdOrNullObject(contentControlId);
        contentControl.load('isNullObject');
        await context.sync();

        if (contentControl.isNullObject) {
          resolve(false);
          return;
        }

        const contentRange = contentControl.getRange(Word.RangeLocation.content);
        contentRange.insertText(replacementText, Word.InsertLocation.replace);
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('replaceContentControlText error:', error);
        resolve(false);
      });
    });
  },

  async highlightTableCell(tableIndex: number, rowIndex: number, cellIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();

        if (tableIndex < 0 || tableIndex >= tables.items.length) {
          resolve(false);
          return;
        }

        const cell = tables.items[tableIndex].getCell(rowIndex, cellIndex);
        try {
          const wholeRange = cell.body.getRange(Word.RangeLocation.whole);
          wholeRange.load('text');
          await context.sync();
          if (String(wholeRange.text || '').trim()) {
            wholeRange.font.highlightColor = 'yellow';
            wholeRange.select();
            await context.sync();
            resolve(true);
            return;
          }
        } catch (wholeRangeError) {
          console.warn('highlightTableCell whole-range error:', wholeRangeError);
        }

        try {
          const table = tables.items[tableIndex];
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          const pickVisibleFallbackCell = async (targetRowIndex: number): Promise<Word.TableCell | null> => {
            if (targetRowIndex < 0 || targetRowIndex >= rows.items.length) {
              return null;
            }
            const targetRow = rows.items[targetRowIndex];
            const cells = targetRow.cells;
            cells.load('items');
            await context.sync();

            for (const candidateCell of cells.items) {
              candidateCell.load('cellIndex');
              candidateCell.body.load('text');
            }
            await context.sync();

            const visibleCells = cells.items
              .filter((candidateCell) => String(candidateCell.body.text || '').trim())
              .sort((left, right) =>
                Math.abs((left.cellIndex || 0) - cellIndex) - Math.abs((right.cellIndex || 0) - cellIndex)
              );

            return visibleCells[0] || null;
          };

          const fallbackCell = await pickVisibleFallbackCell(rowIndex)
            || await pickVisibleFallbackCell(0);

          if (fallbackCell) {
            const fallbackRange = fallbackCell.body.getRange(Word.RangeLocation.whole);
            fallbackRange.font.highlightColor = 'yellow';
          }

          const targetRange = cell.body.getRange(Word.RangeLocation.whole);
          targetRange.select();
          await context.sync();

          if (fallbackCell) {
            resolve(true);
            return;
          }

          const paragraphs = cell.body.paragraphs;
          paragraphs.load('items');
          await context.sync();

          if (paragraphs.items.length > 0) {
            for (const paragraph of paragraphs.items) {
              const range = paragraph.getRange(Word.RangeLocation.whole);
              range.font.highlightColor = 'yellow';
            }
            paragraphs.items[0].getRange(Word.RangeLocation.whole).select();
            await context.sync();
            resolve(true);
            return;
          }

          resolve(false);
        } catch (rangeError) {
          console.warn('highlightTableCell paragraph fallback error:', rangeError);
          resolve(false);
        }
      }).catch((error) => {
        console.warn('highlightTableCell error:', error);
        resolve(false);
      });
    });
  },

  async replaceTableCellText(
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    replacementText: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();

        if (tableIndex < 0 || tableIndex >= tables.items.length) {
          WordAPI.emitDebugLog('error', '普通表格单元格写入失败', `表格: ${tableIndex}\n行: ${rowIndex}\n列: ${cellIndex}\n原因: 表格索引越界`);
          resolve(false);
          return;
        }

        const table = tables.items[tableIndex];
        const rows = table.rows;
        rows.load('items');
        await context.sync();

        if (rowIndex < 0 || rowIndex >= rows.items.length) {
          WordAPI.emitDebugLog(
            'error',
            '普通表格单元格写入失败',
            `表格: ${tableIndex}\n行: ${rowIndex}\n列: ${cellIndex}\n原因: 目标行不存在`
          );
          resolve(false);
          return;
        }

        const targetRow = rows.items[rowIndex];
        const rowCells = await loadWordTableRowCells(context, targetRow);
        const targetCell = getWordTableCellByColumn(rowCells, cellIndex);
        if (!targetCell) {
          WordAPI.emitDebugLog(
            'error',
            '普通表格单元格写入失败',
            [
              `表格: ${tableIndex}`,
              `行: ${rowIndex}`,
              `列: ${cellIndex}`,
              `目标行内容: ${formatWordTableRowSnapshot(rowCells)}`,
              '原因: 未找到可写入单元格',
            ].join('\n'),
          );
          resolve(false);
          return;
        }

        const updated = await replaceWordTableCellTextPreservingParagraphs(context, targetCell, {
          replacementText,
        });
        if (!updated.updated) {
          WordAPI.emitDebugLog(
            'warn',
            '普通表格单元格写入未完成',
            [
              `表格: ${tableIndex}`,
              `行: ${rowIndex}`,
              `请求列: ${cellIndex}`,
              `实际命中列: ${updated.debugInfo.cellIndex}`,
              `写入内容: ${replacementText || '(empty)'}`,
              `目标行列索引: ${rowCells.map((cell) => Number(cell.cellIndex || 0)).join(', ') || '(none)'}`,
              '目标单元格原始段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.beforeParagraphTexts),
              '目标单元格内容段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.contentParagraphTextsBefore),
              `命中目标段落: p${updated.debugInfo.targetParagraphIndex}`,
              `是否追加新段落: ${updated.debugInfo.appendNewParagraph ? 'yes' : 'no'}`,
              '目标单元格写入后段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.afterParagraphTexts),
            ].join('\n'),
          );
        }
        resolve(updated.updated);
      }).catch((error) => {
        console.warn('replaceTableCellText error:', error);
        WordAPI.emitDebugLog(
          'error',
          '普通表格单元格写入异常',
          [
            `表格: ${tableIndex}`,
            `行: ${rowIndex}`,
            `列: ${cellIndex}`,
            `写入内容: ${replacementText || '(empty)'}`,
            error instanceof Error ? error.message : String(error),
          ].join('\n'),
        );
        resolve(false);
      });
    });
  },

  async applyLoopTableMarkersOnNextRow(
    tableIndex: number,
    rowIndex: number,
    arrayPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const normalizedArrayPath = extractWordLoopArrayPath(arrayPath);
        if (!normalizedArrayPath) {
          WordAPI.emitDebugLog('warn', '循环表格标记跳过', `表格: ${tableIndex}\n源行: ${rowIndex}\n原因: arrayPath 为空`);
          resolve(false);
          return;
        }

        const updated = await withWordTargetTableRow(
          context,
          tableIndex,
          rowIndex,
          async (targetRow, { columnCount, targetRowIndex }) => {
            const beforeCells = await loadWordTableRowCells(context, targetRow);
            const beforeSummary = formatWordTableRowSnapshot(beforeCells);
            const targetCells = beforeCells;
            const firstCell = getWordTableCellByColumn(targetCells, 0);
            const lastCell = getWordTableCellByColumn(targetCells, Math.max(columnCount - 1, 0));

            if (!firstCell || !lastCell) {
              WordAPI.emitDebugLog(
                'error',
                '循环表格标记失败',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `目标行内容: ${beforeSummary}`,
                  '原因: 未找到首列或末列单元格',
                ].join('\n'),
              );
              return false;
            }

            await replaceWordTableCellTextPreservingParagraphs(context, firstCell, {
              arrayPath: normalizedArrayPath,
              includeStart: true,
              includeEnd: firstCell === lastCell,
            });

            if (lastCell !== firstCell) {
              await replaceWordTableCellTextPreservingParagraphs(context, lastCell, {
                arrayPath: normalizedArrayPath,
                includeEnd: true,
                includeStart: false,
              });
            }

            const afterCells = await loadWordTableRowCells(context, targetRow);
            WordAPI.emitDebugLog(
              'debug',
              '循环表格标记已写入',
              [
                `表格: ${tableIndex}`,
                `源行: ${rowIndex}`,
                `目标行: ${targetRowIndex}`,
                `arrayPath: ${normalizedArrayPath}`,
                `写入前: ${beforeSummary}`,
                `写入后: ${formatWordTableRowSnapshot(afterCells)}`,
              ].join('\n'),
            );
            return true;
          }
        );

        resolve(Boolean(updated));
      }).catch((error) => {
        console.warn('applyLoopTableMarkersOnNextRow error:', error);
        resolve(false);
      });
    });
  },

  async replaceTableCellTextOnNextRow(
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    replacementText: string,
    arrayPath?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const normalizedArrayPath = extractWordLoopArrayPath(arrayPath || '');

        const updated = await withWordTargetTableRow(
          context,
          tableIndex,
          rowIndex,
          async (targetRow, { columnCount, targetRowIndex }) => {
            const beforeCells = await loadWordTableRowCells(context, targetRow);
            const beforeSummary = formatWordTableRowSnapshot(beforeCells);
            const targetCells = beforeCells;
            const targetCell = getWordTableCellByColumn(targetCells, cellIndex);
            if (!targetCell) {
              WordAPI.emitDebugLog(
                'error',
                '循环表格列写入失败',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `目标列: ${cellIndex}`,
                  `目标行内容: ${beforeSummary}`,
                  '原因: 未找到目标单元格',
                ].join('\n'),
              );
              return false;
            }

            const replaced = await replaceWordTableCellTextPreservingParagraphs(context, targetCell, {
              replacementText,
              arrayPath: normalizedArrayPath || undefined,
              includeStart: cellIndex <= 0,
              includeEnd: cellIndex >= Math.max(columnCount - 1, 0),
            });
            const afterCells = await loadWordTableRowCells(context, targetRow);
            if (!replaced.updated) {
              WordAPI.emitDebugLog(
                'warn',
                '循环表格列写入未完成',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `请求列: ${cellIndex}`,
                  `实际命中列: ${replaced.debugInfo.cellIndex}`,
                  `arrayPath: ${normalizedArrayPath || '(none)'}`,
                  `写入内容: ${replacementText || '(empty)'}`,
                  `目标行列索引: ${targetCells.map((cell) => Number(cell.cellIndex || 0)).join(', ') || '(none)'}`,
                  `includeStart: ${replaced.debugInfo.includeStart ? 'yes' : 'no'}`,
                  `includeEnd: ${replaced.debugInfo.includeEnd ? 'yes' : 'no'}`,
                  `写入前行: ${beforeSummary}`,
                  `写入后行: ${formatWordTableRowSnapshot(afterCells)}`,
                  '目标单元格原始段落:',
                  formatWordTableCellParagraphSnapshot(replaced.debugInfo.beforeParagraphTexts),
                  '目标单元格内容段落:',
                  formatWordTableCellParagraphSnapshot(replaced.debugInfo.contentParagraphTextsBefore),
                  `命中目标段落: p${replaced.debugInfo.targetParagraphIndex}`,
                  `是否追加新段落: ${replaced.debugInfo.appendNewParagraph ? 'yes' : 'no'}`,
                  '目标单元格写入后段落:',
                  formatWordTableCellParagraphSnapshot(replaced.debugInfo.afterParagraphTexts),
                ].join('\n'),
              );
            }
            return replaced.updated;
          },
          { suppressLocateLog: true }
        );

        resolve(Boolean(updated));
      }).catch((error) => {
        console.warn('replaceTableCellTextOnNextRow error:', error);
        resolve(false);
      });
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
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const clearHighlightColor = null as any;

        // 先清正文整段范围，再补清表格和内容控件，避免只清普通段落导致遗漏。
        const bodyRange = context.document.body.getRange(Word.RangeLocation.whole);
        bodyRange.font.highlightColor = clearHighlightColor;

        // 获取文档中的所有段落
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        const tables = context.document.body.tables;
        tables.load('items');
        const controls = context.document.contentControls;
        controls.load('items');
        await context.sync();

        // 清除每个段落的高亮
        for (const paragraph of paragraphs.items) {
          const range = paragraph.getRange(Word.RangeLocation.whole);
          range.font.highlightColor = clearHighlightColor;
        }

        // 清除内容控件的高亮
        for (const control of controls.items) {
          const range = control.getRange(Word.RangeLocation.whole);
          range.font.highlightColor = clearHighlightColor;
        }

        // 清除表格单元格内的高亮
        for (const table of tables.items) {
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          for (const row of rows.items) {
            const cells = row.cells;
            cells.load('items');
            await context.sync();

            for (const cell of cells.items) {
              const cellRange = cell.body.getRange(Word.RangeLocation.whole);
              cellRange.font.highlightColor = clearHighlightColor;
            }
          }
        }

        // 把当前选择收回到文档开头，避免用户把“选中态”误认为高亮还没清掉。
        context.document.body.getRange(Word.RangeLocation.start).select();

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
        const clearHighlightColor = null as any;
        for (const item of searchResults.items) {
          item.font.highlightColor = clearHighlightColor;
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

        // 独立标签（如“签订日期：”）通常只有 4-5 个字符，也需要支持安全定位。
        if (searchText.length < 2) {
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
        foundRange.load('text');
        await context.sync();

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
        const searchTexts = buildWordContextSearchTexts(contextSnippet);
        if (searchTexts.length === 0) {
          resolve({ success: false, replacedText: '' });
          return;
        }

        for (const searchText of searchTexts) {
          if (searchText.length < 2) {
            continue;
          }

          const searchResults = context.document.body.search(searchText, {
            matchCase: false,
            matchWholeWord: false
          });
          searchResults.load('items');
          await context.sync();

          if (searchResults.items.length === 0) {
            continue;
          }

          const candidateRanges = searchResults.items.slice(0, 3);
          for (const foundRange of candidateRanges) {
            foundRange.load('text');
          }
          await context.sync();

          for (const foundRange of candidateRanges) {
            const foundText = foundRange.text || searchText;
            const blankText = extractLongestWordBlank(searchText) || extractLongestWordBlank(foundText);
            if (blankText && blankText.length >= 2) {
              const blankSearch = foundRange.search(blankText, {
                matchCase: false,
                matchWholeWord: false
              });
              blankSearch.load('items');
              await context.sync();

              if (blankSearch.items.length > 0) {
                blankSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
                await context.sync();

                console.log(`精确替换空白: "${blankText}" → "${replacementText}"`);
                resolve({ success: true, replacedText: blankText });
                return;
              }
            }

            const labelValueTarget = extractWordLabelValueTarget(searchText) || extractWordLabelValueTarget(foundText);
            if (!labelValueTarget?.valueText) {
              const multilineLabelValueTarget = extractWordMultilineLabelValueTarget(searchText)
                || extractWordMultilineLabelValueTarget(foundText);
              if (multilineLabelValueTarget?.valueText) {
                const replaced = await replaceWordValueNearLabel(
                  context,
                  multilineLabelValueTarget.labelText,
                  multilineLabelValueTarget.valueText,
                  replacementText
                );
                if (replaced) {
                  console.log(`精确替换跨行标签后内容: "${multilineLabelValueTarget.valueText}" → "${replacementText}"`);
                  resolve({ success: true, replacedText: multilineLabelValueTarget.valueText });
                  return;
                }
              }

              const standaloneLabelText = extractWordStandaloneLabelTarget(searchText)
                || extractWordStandaloneLabelTarget(foundText);
              if (!standaloneLabelText) {
                continue;
              }

              const inserted = await insertWordValueAfterLabel(
                foundRange,
                standaloneLabelText,
                replacementText
              );
              if (inserted) {
                await context.sync();
                console.log(`精确插入标签后内容: "${standaloneLabelText}" + "${replacementText}"`);
                resolve({ success: true, replacedText: standaloneLabelText });
                return;
              }
              continue;
            }

            const valueSearch = foundRange.search(labelValueTarget.valueText, {
              matchCase: false,
              matchWholeWord: false
            });
            valueSearch.load('items');
            await context.sync();

            if (valueSearch.items.length > 0) {
              valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
              await context.sync();

              console.log(`精确替换标签后内容: "${labelValueTarget.valueText}" → "${replacementText}"`);
              resolve({ success: true, replacedText: labelValueTarget.valueText });
              return;
            }
          }
        }

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

  async focusParagraph(paragraphIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        if (paragraphIndex < 0 || paragraphIndex >= paragraphs.items.length) {
          resolve(false);
          return;
        }

        const range = paragraphs.items[paragraphIndex].getRange(Word.RangeLocation.whole);
        range.select();
        range.font.highlightColor = 'yellow';
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('focusParagraph error:', error);
        resolve(false);
      });
    });
  },

  /**
   * 在选中位置插入循环标记
   */
  async insertLoopMarker(arrayPath: string, _selectionContent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
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
