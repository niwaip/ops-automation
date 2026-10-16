import { Inject,Injectable,Logger } from '@nestjs/common';
import type { ContentMatchSnippet } from './dto/workspace.dto';
import { STORAGE_DRIVER,type StorageDriver } from './storage/storage-driver.interface';

import * as JSZipLib from 'jszip';

const loadZipAsync = (data: Buffer) => {
  const lib: any = (JSZipLib as any).default || JSZipLib;
  if (typeof lib.loadAsync === 'function') {
    return lib.loadAsync(data);
  }
  const instance = new lib();
  return instance.loadAsync(data);
};

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
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    const BINARY_OFFICE_EXTS = new Set([
      '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt',
      '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2',
      '.pdf', '.exe', '.dll', '.bin', '.iso', '.dmg',
    ]);
    if (BINARY_OFFICE_EXTS.has(ext)) {
      return false;
    }

    if (
      mimeType &&
      (mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/xml' ||
        mimeType.endsWith('+xml') ||
        mimeType.endsWith('+json') ||
        mimeType === 'application/x-yaml' ||
        mimeType === 'text/yaml' ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/typescript')
    ) {
      return true;
    }
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
   * 判断文件是否为 Word (.docx) 文件
   */
  public isDocxFile(fileName: string, mimeType?: string | null): boolean {
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
    return fileName.toLowerCase().endsWith('.docx');
  }

  /**
   * 判断文件是否为 Excel (.xlsx) 文件
   */
  public isXlsxFile(fileName: string, mimeType?: string | null): boolean {
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
    return fileName.toLowerCase().endsWith('.xlsx');
  }

  /**
   * 从 Word (.docx) 文件中提取自然排版纯文本
   */
  public async extractDocxText(data: Buffer): Promise<string | null> {
    try {
      const zip = await loadZipAsync(data);
      const docXml = zip.file('word/document.xml');
      if (!docXml) return null;
      const xml = await docXml.async('text');
      const paragraphs = xml
        .split(/<\/w:p>/gi)
        .map((p: string) => {
          const matches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/gi);
          if (!matches) return '';
          return matches.map((t) => t.replace(/<[^>]+>/g, '')).join('');
        })
        .filter((p: string) => p.trim().length > 0);
      return paragraphs.join('\n');
    } catch (err: any) {
      this.logger.warn(`Failed to extract docx text: ${err.message}`);
      return null;
    }
  }

  /**
   * 从 Excel (.xlsx) 文件中提取共享字符串文本与单元格数值数据
   */
  public async extractXlsxText(data: Buffer): Promise<string | null> {
    try {
      const zip = await loadZipAsync(data);

      // 1. 解析共享字符串表 (xl/sharedStrings.xml)
      const sharedStrings: string[] = [];
      const stringsXmlFile = zip.file('xl/sharedStrings.xml');
      if (stringsXmlFile) {
        const xml = await stringsXmlFile.async('text');
        const siMatches = xml.split(/<\/si>/gi);
        for (const si of siMatches) {
          const tMatches = si.match(/<t[^>]*>(.*?)<\/t>/gi);
          if (tMatches) {
            sharedStrings.push(tMatches.map((t) => t.replace(/<[^>]+>/g, '')).join(''));
          }
        }
      }

      // 2. 解析工作表数据 (xl/worksheets/sheet*.xml)，提取单元格数值、行关联及内联文本
      const sheetFiles = zip.file(/^xl\/worksheets\/sheet.*\.xml$/i);
      const rowLines: string[] = [];

      for (const sheetFile of sheetFiles) {
        const xml = await sheetFile.async('text');
        const rows = xml.split(/<\/row>/gi);
        for (const row of rows) {
          const cellValues: string[] = [];
          const cells = row.split(/<\/c>/gi);
          for (const cell of cells) {
            if (!cell.includes('<c ')) continue;
            const typeMatch = cell.match(/t="([^"]+)"/);
            const cellType = typeMatch ? typeMatch[1] : '';
            let val = '';
            if (cellType === 's') {
              const vMatch = cell.match(/<v>(\d+)<\/v>/);
              if (vMatch) {
                const idx = parseInt(vMatch[1], 10);
                val = sharedStrings[idx] || '';
              }
            } else if (cellType === 'inlineStr') {
              const tMatch = cell.match(/<t[^>]*>(.*?)<\/t>/);
              if (tMatch) val = tMatch[1].replace(/<[^>]+>/g, '');
            } else {
              const vMatch = cell.match(/<v>(.*?)<\/v>/);
              if (vMatch) {
                val = vMatch[1].replace(/<[^>]+>/g, '');
              }
            }
            if (val.trim()) {
              cellValues.push(val.trim());
            }
          }
          if (cellValues.length > 0) {
            rowLines.push(cellValues.join(' '));
          }
        }
      }

      if (rowLines.length > 0) {
        return rowLines.join('\n');
      }

      // 降级：若未找到工作表定义则返回共享字符串
      if (sharedStrings.length > 0) {
        return Array.from(new Set(sharedStrings)).join('\n');
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`Failed to extract xlsx text: ${err.message}`);
      return null;
    }
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

      if (this.isDocxFile(fileName, mimeType)) {
        return await this.extractDocxText(data);
      }

      if (this.isXlsxFile(fileName, mimeType)) {
        return await this.extractXlsxText(data);
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
      // 彻底拦截以 PK\x03\x04 (0x50 0x4B) 开头的 ZIP 二进制压缩流及包含控制字符的损坏缓存
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
        this.logger.warn(`Discarding invalid binary zip text cache for ${storagePath}`);
        return null;
      }
      let text = buf.toString('utf-8');
      if (text.includes('\0') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text.slice(0, 500))) {
        this.logger.warn(`Discarding binary corrupted text cache for ${storagePath}`);
        return null;
      }
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

    if (
      this.isPdfFile(fileName, mimeType) ||
      this.isDocxFile(fileName, mimeType) ||
      this.isXlsxFile(fileName, mimeType)
    ) {
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

      // 针对 <=3 字符的纯英数短词（如 ks、03 等），要求词边界匹配，防止在 tasks 等长词内部产生错误子串命中
      if (compactKeyword.length <= 3 && /^[a-z0-9]+$/i.test(compactKeyword)) {
        const boundaryRegex = new RegExp(`(^|[^a-zA-Z0-9])${compactKeyword}([^a-zA-Z0-9]|$)`, 'i');
        if (!boundaryRegex.test(lowerLine)) {
          continue;
        }
      }

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
      // 仅当下一行自身也不完整包含关键词时，才判定为真正的跨行切断，避免产生相邻行合并与行号前移
      if (i < lines.length - 1 && compactKeyword.length >= 2) {
        const nextLine = lines[i + 1];
        const lowerNextLine = nextLine.toLowerCase();
        const nextLineHasKeyword =
          lowerNextLine.includes(lowerKeyword) ||
          lowerNextLine.replace(/[\s_]+/g, '').includes(compactKeyword);

        if (!nextLineHasKeyword) {
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
    }

    return results;
  }
}
