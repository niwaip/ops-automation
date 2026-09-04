import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import type { ContentMatchSnippet } from './dto/workspace.dto';

type MatrixInit = ArrayLike<number> | undefined;

class TextExtractionDomMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixInit) {
    if (!init || init.length < 6) return;
    [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init).slice(0, 6);
  }
}

function ensureExtractionPolyfills(): void {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = TextExtractionDomMatrix as unknown as typeof DOMMatrix;
  }
  if (!(Promise as any).withResolvers) {
    (Promise as any).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}

const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>;

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
  '.xml',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.sh',
  '.sql',
  '.env',
  '.conf',
  '.ini',
]);

@Injectable()
export class WorkspaceContentIndexerService {
  private readonly logger = new Logger(WorkspaceContentIndexerService.name);

  constructor(@Inject(STORAGE_DRIVER) private readonly storage: StorageDriver) {}

  /**
   * 判断文件是否为纯文本类文件
   */
  public isTextFile(fileName: string, mimeType?: string | null): boolean {
    if (
      mimeType &&
      (mimeType.startsWith('text/') ||
        mimeType.includes('json') ||
        mimeType.includes('xml') ||
        mimeType.includes('yaml'))
    ) {
      return true;
    }
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    return TEXT_FILE_EXTENSIONS.has(ext);
  }

  /**
   * 判断文件是否为 PDF 文件
   */
  public isPdfFile(fileName: string, mimeType?: string | null): boolean {
    if (mimeType === 'application/pdf') return true;
    return fileName.toLowerCase().endsWith('.pdf');
  }

  /**
   * 从文件 Buffer 中提取纯文本
   */
  public async extractText(
    data: Buffer,
    fileName: string,
    mimeType?: string | null
  ): Promise<string | null> {
    try {
      if (this.isTextFile(fileName, mimeType)) {
        return data.toString('utf-8');
      }

      if (this.isPdfFile(fileName, mimeType)) {
        ensureExtractionPolyfills();
        const pdfjs = await importEsm('pdfjs-dist');
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
        const maxPages = Math.min(doc.numPages, 100);
        const pagesText: string[] = [];

        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const pageText = this.cleanPdfPageItems(content.items || []);
          if (pageText) {
            pagesText.push(`--- Page ${i} ---\n${pageText}`);
          }
          page.cleanup();
        }

        await doc.destroy();
        return pagesText.join('\n\n');
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`Failed to extract text from ${fileName}: ${err.message}`);
      return null;
    }
  }

  /**
   * 将 PDF 单页的文本 Item 清洗重构成自然排版的段落与行，彻底去除 CJK 字间无意义空格并保留自然词隙
   */
  private cleanPdfPageItems(items: any[]): string {
    if (!items || items.length === 0) return '';
    const lines: Array<Array<{ str: string; x: number; y: number; width: number }>> = [];
    let currentLine: Array<{ str: string; x: number; y: number; width: number }> = [];
    let currentY: number | null = null;

    for (const it of items) {
      if (!it.str || it.str.trim() === '') continue;
      const y = it.transform ? it.transform[5] : 0;
      const x = it.transform ? it.transform[4] : 0;
      const width = it.width || 0;

      if (currentY === null || Math.abs(y - currentY) > 3) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
        currentY = y;
      }
      currentLine.push({ str: it.str, x, y, width });
    }
    if (currentLine.length > 0) lines.push(currentLine);

    const isCjk = (ch: string) => /[\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF]/.test(ch);
    const isAlphaNum = (ch: string) => /[A-Za-z0-9]/.test(ch);
    const isPunct = (ch: string) => /[，。！？：；、（）《》【】“”‘’—…,.!?:;()[\]{}]/.test(ch);

    const rawLines = lines
      .map((lineItems) => {
        lineItems.sort((a, b) => a.x - b.x);
        let lineText = '';
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];
          const str = item.str.normalize('NFKC');
          if (i === 0) {
            lineText += str;
          } else {
            const prev = lineItems[i - 1];
            const prevEnd = prev.x + (prev.width || 0);
            const gap = item.x - prevEnd;
            const prevChar = lineText.slice(-1);
            const nextChar = str.charAt(0);

            if (isAlphaNum(prevChar) && isAlphaNum(nextChar) && gap > 1.5) {
              lineText += ' ' + str;
            } else if (
              !isCjk(prevChar) &&
              !isCjk(nextChar) &&
              !isPunct(prevChar) &&
              !isPunct(nextChar) &&
              gap > 4
            ) {
              lineText += ' ' + str;
            } else {
              lineText += str;
            }
          }
        }
        return lineText.trim();
      })
      .filter((l) => {
        if (!l) return false;
        // 过滤页眉页脚时间戳或打印 URL 噪声
        if (/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{1,2}/.test(l)) return false;
        if (/^localhost:\d+\/app\/\s+\d+\/\d+$/.test(l)) return false;
        return true;
      });

    // 段落解折行：缝合同一段落内被排版硬换行切割的句子与词语
    const isSentenceEnd = (ch: string) => /[。！？!?:；;]/.test(ch);
    const paragraphs: string[] = [];
    let currentPara = '';

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!currentPara) {
        currentPara = line;
        continue;
      }

      const prevChar = currentPara.slice(-1);
      const nextChar = line.charAt(0);

      // 英文跨行连字符拼接 (e.g. trans- \n former)
      if (
        currentPara.endsWith('-') &&
        isAlphaNum(currentPara.slice(-2, -1)) &&
        isAlphaNum(nextChar)
      ) {
        currentPara = currentPara.slice(0, -1) + line;
        continue;
      }

      // 标题、列表、编号或图表说明作为独立段落起点
      const isHeadingOrList =
        /^(?:[0-9]+[.\s]|[一二三四五六七八九十]+[、.]|[•\-*]|图\s*[0-9]|表\s*[0-9]|步骤\s*[0-9])/.test(
          line
        );

      if (isSentenceEnd(prevChar) || isHeadingOrList) {
        paragraphs.push(currentPara);
        currentPara = line;
      } else {
        // 软换行：中文相连无空格，英文相连加空格
        if (isCjk(prevChar) || isCjk(nextChar)) {
          currentPara += line;
        } else {
          currentPara += ' ' + line;
        }
      }
    }
    if (currentPara) paragraphs.push(currentPara);

    return paragraphs.join('\n');
  }

  /**
   * 检测纯文本是否包含旧版 PDF 提取引入的字间空格等脏数据
   */
  private hasUncleanedPdfArtifacts(text: string): boolean {
    return /(?:[\u4e00-\u9fa5]\s+){3,}[\u4e00-\u9fa5]/.test(text);
  }

  /**
   * 对旧版缓存内容做兜底的行间/字间空格清理
   */
  private cleanLegacyExtractedText(text: string): string {
    return text
      .replace(
        /([\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF])\s+([\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF])/g,
        '$1$2'
      )
      .replace(
        /([\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF])\s+([\u4e00-\u9fa5\u3400-\u4dbf\uF900-\uFAFF])/g,
        '$1$2'
      )
      .replace(/([，。！？：；、（）《》【】“”‘’—…])\s+/g, '$1')
      .replace(/\s+([，。！？：；、（）《》【】“”‘’—…])/g, '$1');
  }

  /**
   * 写入伴生纯文本缓存文件
   */
  public async cacheExtractedText(storagePath: string, text: string): Promise<void> {
    try {
      const cachePath = `${storagePath}.extracted.txt`;
      await this.storage.putFile(cachePath, Buffer.from(text, 'utf-8'));
    } catch (err: any) {
      this.logger.warn(`Failed to cache extracted text for ${storagePath}: ${err.message}`);
    }
  }

  /**
   * 获取文件的纯文本视图（优先读取缓存，若无缓存且为文本/PDF则即时提取并写入缓存）
   */
  public async getExtractedText(
    storagePath: string,
    fileName: string,
    mimeType?: string | null
  ): Promise<string | null> {
    const cacheKey = `${storagePath}.extracted.txt`;
    if (await this.storage.exists(cacheKey)) {
      const buf = await this.storage.getFile(cacheKey);
      let text = buf.toString('utf-8');
      if (this.hasUncleanedPdfArtifacts(text)) {
        if (await this.storage.exists(storagePath)) {
          const rawBuf = await this.storage.getFile(storagePath);
          const freshText = await this.extractText(rawBuf, fileName, mimeType);
          if (freshText) {
            await this.cacheExtractedText(storagePath, freshText);
            return freshText;
          }
        }
        text = this.cleanLegacyExtractedText(text);
      }
      return text;
    }

    if (this.isTextFile(fileName, mimeType)) {
      if (await this.storage.exists(storagePath)) {
        const buf = await this.storage.getFile(storagePath);
        return buf.toString('utf-8');
      }
    }

    if (this.isPdfFile(fileName, mimeType)) {
      if (await this.storage.exists(storagePath)) {
        const buf = await this.storage.getFile(storagePath);
        const text = await this.extractText(buf, fileName, mimeType);
        if (text) {
          await this.cacheExtractedText(storagePath, text);
          return text;
        }
      }
    }

    return null;
  }

  /**
   * 在单一文件文本中执行关键词匹配并提取行号与命中上下文片段
   */
  public async grepFile(
    storagePath: string,
    fileName: string,
    mimeType: string | null,
    keyword: string,
    maxMatches = 5
  ): Promise<ContentMatchSnippet[]> {
    const text = await this.getExtractedText(storagePath, fileName, mimeType);
    if (!text) return [];

    const lines = text.split(/\r?\n/);
    const results: ContentMatchSnippet[] = [];
    const lowerKeyword = keyword.toLowerCase();
    const compactKeyword = lowerKeyword.replace(/[\s_]+/g, '');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      let matchIndex = lowerLine.indexOf(lowerKeyword);
      let matchLength = keyword.length;

      // 容错匹配：如果关键词包含/缺少空格导致未直接命中，进行紧凑字符匹配
      if (matchIndex === -1 && compactKeyword.length >= 2) {
        const compactLine = lowerLine.replace(/[\s_]+/g, '');
        const compactIdx = compactLine.indexOf(compactKeyword);
        if (compactIdx !== -1) {
          let currentCompact = 0;
          for (let c = 0; c < line.length; c++) {
            if (!/[\s_]/.test(line[c])) {
              if (currentCompact === compactIdx) {
                matchIndex = c;
                break;
              }
              currentCompact++;
            }
          }
          let currentTarget = 0;
          for (let c = matchIndex; c < line.length; c++) {
            if (!/[\s_]/.test(line[c])) {
              currentTarget++;
              if (currentTarget >= compactKeyword.length) {
                matchLength = c - matchIndex + 1;
                break;
              }
            }
          }
        }
      }

      if (matchIndex !== -1) {
        // 生成保留前后上下文的精炼片段（最多截取 140 字符）
        const start = Math.max(0, matchIndex - 30);
        const end = Math.min(line.length, matchIndex + matchLength + 50);
        let snippet = line.slice(start, end).trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < line.length) snippet = snippet + '...';

        results.push({
          line: i + 1,
          snippet,
        });

        if (results.length >= maxMatches) {
          break;
        }
        continue;
      }

      // 跨行滑动窗口：防止关键词刚好跨越换行符（如“代码库方\n面的能力”或“静态\n缺陷修复”）
      if (i < lines.length - 1 && compactKeyword.length >= 2) {
        const nextLine = lines[i + 1];
        const combined = line + ' ' + nextLine;
        const normalizedCombined = combined.normalize('NFKC');
        const compactCombined = normalizedCombined.toLowerCase().replace(/[\s_]+/g, '');
        if (compactCombined.includes(compactKeyword)) {
          const snippet = (line.trim() + ' ' + nextLine.trim()).slice(0, 140);
          results.push({
            line: i + 1,
            snippet,
          });
          if (results.length >= maxMatches) {
            break;
          }
        }
      }
    }

    return results;
  }
}
