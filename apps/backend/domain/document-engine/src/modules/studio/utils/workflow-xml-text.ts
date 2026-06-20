import { Logger } from '@nestjs/common';
import JSZip from 'jszip';

const logger = new Logger('WorkflowXmlText');

export function extractSampleText(contentBase64: string | undefined, warnings: string[]): string {
  if (!contentBase64) {
    return '';
  }
  try {
    const base64 = contentBase64.replace(/^base64:/, '');
    const buffer = Buffer.from(base64, 'base64');
    const text = buffer.toString('utf-8');
    if (text.includes('<w:t')) {
      return text;
    }
    return text;
  } catch {
    warnings.push('样本文档解析失败，已回退为仅基于模板结构分析');
    return '';
  }
}

export async function extractSampleTextRich(
  contentBase64: string | undefined,
  warnings: string[]
): Promise<string> {
  if (!contentBase64) {
    return '';
  }

  try {
    const base64 = contentBase64.replace(/^base64:/, '');
    const buffer = Buffer.from(base64, 'base64');
    const header = buffer.subarray(0, 2).toString('utf-8');

    if (header === 'PK') {
      const zip = await JSZip.loadAsync(buffer);
      const documentFile = zip.file('word/document.xml');
      if (documentFile) {
        const xml = await documentFile.async('text');
        const extracted = extractReadableTextFromWordXml(xml);
        if (extracted) {
          return extracted;
        }
      }
    }

    const text = buffer.toString('utf-8');
    if (text.includes('<w:t')) {
      return extractReadableTextFromWordXml(text);
    }

    return normalizePlainText(text);
  } catch (error) {
    logger.warn(`样本文本提取失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    warnings.push('样本文本提取失败，已退化为仅基于模板内容');
    return '';
  }
}

export function extractReadableTextFromWordXml(xml: string): string {
  return normalizePlainText(
    xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

export function normalizePlainText(value: string): string {
  return value
    .replace(/[^\S\r\n\t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
