export type UploadHostType = 'word' | 'excel' | 'ppt';

export type OfficeUploadConfig = {
  accept: string;
  validExtensions: string[];
  title: string;
  hint: string;
  invalidMessage: string;
};

export function getOfficeUploadConfig(hostType: UploadHostType): OfficeUploadConfig {
  switch (hostType) {
    case 'excel':
      return {
        accept: '.xlsx',
        validExtensions: ['.xlsx'],
        title: '真实样本工作簿上传',
        hint: '上传一份与当前模板结构接近的真实 Excel 工作簿，用于补充预览和保存验证。',
        invalidMessage: '请上传有效的 Excel 工作簿文件（.xlsx）',
      };
    case 'ppt':
      return {
        accept: '.pptx',
        validExtensions: ['.pptx'],
        title: '真实样本演示文稿上传',
        hint: '上传一份与当前模板结构接近的真实 PowerPoint 文件，用于补充预览和保存验证。',
        invalidMessage: '请上传有效的 PowerPoint 文件（.pptx）',
      };
    case 'word':
    default:
      return {
        accept: '.docx',
        validExtensions: ['.docx'],
        title: '真实样本文档上传',
        hint: '上传一份与当前空白模板结构接近的真实 Word 合同或历史样本，用于增强参数识别、预览验证与模板保存。',
        invalidMessage: '请上传有效的 Word 文档文件（.docx）',
      };
  }
}

export function isValidOfficeUpload(file: File, config: OfficeUploadConfig): boolean {
  const fileName = String(file.name || '').toLowerCase();
  return config.validExtensions.some((ext) => fileName.endsWith(ext));
}

export async function readFileAsBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function normalizePlainText(value: string): string {
  return value
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractReadableTextFromWordXml(xml: string): string {
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

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

async function inflateZipEntry(
  compressed: Uint8Array,
  compressionMethod: number
): Promise<Uint8Array> {
  if (compressionMethod === 0) {
    return compressed;
  }

  if (compressionMethod !== 8) {
    throw new Error(`不支持的 ZIP 压缩方式: ${compressionMethod}`);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持 DecompressionStream，无法解压 docx');
  }

  const exactBuffer = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength
  ) as ArrayBuffer;
  const stream = new Blob([exactBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractZipEntryText(bytes: Uint8Array, entryPath: string): Promise<string> {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error('未找到 ZIP central directory');
  }

  const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const decoder = new TextDecoder();

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      bytes[cursor] !== 0x50 ||
      bytes[cursor + 1] !== 0x4b ||
      bytes[cursor + 2] !== 0x01 ||
      bytes[cursor + 3] !== 0x02
    ) {
      break;
    }

    const compressionMethod = readUint16LE(bytes, cursor + 10);
    const compressedSize = readUint32LE(bytes, cursor + 20);
    const fileNameLength = readUint16LE(bytes, cursor + 28);
    const extraLength = readUint16LE(bytes, cursor + 30);
    const commentLength = readUint16LE(bytes, cursor + 32);
    const localHeaderOffset = readUint32LE(bytes, cursor + 42);
    const fileName = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    if (fileName === entryPath) {
      if (
        bytes[localHeaderOffset] !== 0x50 ||
        bytes[localHeaderOffset + 1] !== 0x4b ||
        bytes[localHeaderOffset + 2] !== 0x03 ||
        bytes[localHeaderOffset + 3] !== 0x04
      ) {
        throw new Error('ZIP local header 无效');
      }

      const localNameLength = readUint16LE(bytes, localHeaderOffset + 26);
      const localExtraLength = readUint16LE(bytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const uncompressed = await inflateZipEntry(compressed, compressionMethod);
      return decoder.decode(uncompressed);
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return '';
}

export async function extractReadableTextFromWordBase64(contentBase64: string): Promise<string> {
  if (!contentBase64) {
    return '';
  }

  const base64 = contentBase64.replace(/^base64:/, '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const header = String.fromCharCode(...bytes.slice(0, 2));

  if (header === 'PK') {
    const xml = await extractZipEntryText(bytes, 'word/document.xml');
    if (xml) {
      return extractReadableTextFromWordXml(xml);
    }
  }

  const decodedText = new TextDecoder().decode(bytes);
  if (decodedText.includes('<w:t')) {
    return extractReadableTextFromWordXml(decodedText);
  }

  return normalizePlainText(decodedText);
}
