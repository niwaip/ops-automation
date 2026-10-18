import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export interface DetectedMimeResult {
  mimeType: string;
  category: 'image' | 'audio' | 'document' | 'text';
  extension: string;
}

/**
 * Inspect file header magic bytes to detect authentic file type
 * and reject disguised executables or malicious payloads.
 */
export function inspectBinaryMimeType(
  buffer: Buffer,
  declaredFilename: string,
  _declaredMimeType?: string
): DetectedMimeResult {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Empty file buffer provided');
  }

  const ext = path.extname(declaredFilename || '').toLowerCase();

  // 1. Immediately reject dangerous binary executable signatures
  if (buffer.length >= 4) {
    // ELF binary (\x7FELF)
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      throw new BadRequestException('Executable binary files (ELF) are strictly forbidden');
    }
    // Windows PE / DOS executable (MZ)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestException('Executable binary files (PE/EXE) are strictly forbidden');
    }
    // Mach-O binary
    if (
      (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
      (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe)
    ) {
      throw new BadRequestException('Executable binary files (Mach-O) are strictly forbidden');
    }
  }

  // Shell script (#!)
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    throw new BadRequestException('Executable script files (shebang #!) are strictly forbidden');
  }

  // 2. Magic byte checks for known formats
  const ALLOWED_IMAGE_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.dib',
    '.tiff', '.tif', '.ico', '.avif', '.heic', '.heif', '.svg',
    '.emf', '.wmf'
  ]);

  const validateImageExtension = (formatName: string) => {
    if (ext && !ALLOWED_IMAGE_EXTS.has(ext)) {
      throw new BadRequestException(`File content is ${formatName} image, but declared extension is ${ext}`);
    }
  };

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    validateImageExtension('PNG');
    return { mimeType: 'image/png', category: 'image', extension: ext === '.png' ? '.png' : '.png' };
  }

  // JPEG: FF D8 (SOI marker)
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    validateImageExtension('JPEG');
    return { mimeType: 'image/jpeg', category: 'image', extension: ext === '.jpeg' ? '.jpeg' : '.jpg' };
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    validateImageExtension('GIF');
    return { mimeType: 'image/gif', category: 'image', extension: '.gif' };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    validateImageExtension('WebP');
    return { mimeType: 'image/webp', category: 'image', extension: '.webp' };
  }

  // BMP: BM (0x42 0x4D)
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    validateImageExtension('BMP');
    return { mimeType: 'image/bmp', category: 'image', extension: '.bmp' };
  }

  // TIFF: II*\x00 (little endian) or MM\x00* (big endian)
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
     (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    validateImageExtension('TIFF');
    return { mimeType: 'image/tiff', category: 'image', extension: '.tiff' };
  }

  // ICO: 00 00 01 00
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    validateImageExtension('ICO');
    return { mimeType: 'image/x-icon', category: 'image', extension: '.ico' };
  }

  // ISOBMFF: ....ftyp (AVIF / HEIC)
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand === 'avif' || brand === 'avis') {
      validateImageExtension('AVIF');
      return { mimeType: 'image/avif', category: 'image', extension: '.avif' };
    }
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) {
      validateImageExtension('HEIC');
      return { mimeType: 'image/heic', category: 'image', extension: '.heic' };
    }
  }

  // Windows DIB (CF_DIB / BITMAPINFOHEADER): starts with header size 40 (0x28), 108 (0x6C), or 124 (0x7C)
  if (
    buffer.length >= 40 &&
    (buffer.readUInt32LE(0) === 40 || buffer.readUInt32LE(0) === 108 || buffer.readUInt32LE(0) === 124) &&
    buffer.readUInt16LE(12) === 1
  ) {
    validateImageExtension('BMP/DIB');
    return { mimeType: 'image/bmp', category: 'image', extension: ext === '.bmp' || ext === '.dib' ? ext : '.bmp' };
  }

  // EMF: recordType=1 (0x00000001) and ' EMF' at offset 40
  if (
    buffer.length >= 44 &&
    buffer.readUInt32LE(0) === 1 &&
    buffer.subarray(40, 44).toString('ascii') === ' EMF'
  ) {
    validateImageExtension('EMF');
    return { mimeType: 'image/emf', category: 'image', extension: ext || '.emf' };
  }

  // WMF: Placeable (0x9ac6cdd7) or Standard (0x00090001)
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xd7 && buffer[1] === 0xcd && buffer[2] === 0xc6 && buffer[3] === 0x9a) ||
     (buffer[0] === 0x01 && buffer[1] === 0x00 && buffer[2] === 0x09 && buffer[3] === 0x00))
  ) {
    validateImageExtension('WMF');
    return { mimeType: 'image/wmf', category: 'image', extension: ext || '.wmf' };
  }

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    if (ext && !['.pdf'].includes(ext)) {
      throw new BadRequestException(`File content is PDF document, but declared extension is ${ext}`);
    }
    return { mimeType: 'application/pdf', category: 'document', extension: '.pdf' };
  }

  // ZIP / DOCX / XLSX / PPTX: PK\x03\x04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const allowedZipExts = new Set(['.docx', '.xlsx', '.pptx', '.zip']);
    if (!allowedZipExts.has(ext)) {
      throw new BadRequestException(`ZIP archive detected, but declared extension is ${ext || 'unspecified'}`);
    }
    const mimeMap: Record<string, string> = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
    };
    return { mimeType: mimeMap[ext] || 'application/zip', category: 'document', extension: ext };
  }

  // OLE2 / Compound File Binary Format (legacy .doc, .xls, .ppt)
  // Magic bytes: D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    const allowedOleExts = new Set(['.doc', '.xls', '.ppt']);
    if (!allowedOleExts.has(ext)) {
      throw new BadRequestException(`Compound binary document detected, but declared extension is ${ext || 'unspecified'}`);
    }
    const oleMimes: Record<string, string> = {
      '.doc': 'application/msword',
      '.xls': 'application/vnd.ms-excel',
      '.ppt': 'application/vnd.ms-powerpoint',
    };
    return { mimeType: oleMimes[ext] || 'application/octet-stream', category: 'document', extension: ext };
  }

  // Audio formats:
  // MP3: ID3 or 0xFF
  if (
    (buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer.length >= 2 && buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    if (ext && !['.mp3'].includes(ext)) {
      throw new BadRequestException(`File content is MP3 audio, but declared extension is ${ext}`);
    }
    return { mimeType: 'audio/mpeg', category: 'audio', extension: '.mp3' };
  }

  // WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    if (ext && !['.wav'].includes(ext)) {
      throw new BadRequestException(`File content is WAV audio, but declared extension is ${ext}`);
    }
    return { mimeType: 'audio/wav', category: 'audio', extension: '.wav' };
  }

  // OGG: OggS
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return { mimeType: 'audio/ogg', category: 'audio', extension: ext || '.ogg' };
  }

  // FLAC: fLaC
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x66 &&
    buffer[1] === 0x4c &&
    buffer[2] === 0x61 &&
    buffer[3] === 0x43
  ) {
    return { mimeType: 'audio/flac', category: 'audio', extension: ext || '.flac' };
  }

  // 3. Text-based files (json, csv, txt, md, log, sql, code, configs, Dockerfile)
  const allowedTextExts = new Set([
    '.txt', '.md', '.csv', '.tsv', '.json', '.jsonl', '.xml',
    '.log', '.sql', '.sh', '.bash', '.zsh', '.py', '.js', '.ts', '.tsx', '.jsx',
    '.yaml', '.yml', '.conf', '.ini', '.env', '.toml', '.properties',
  ]);
  const isDockerfile = declaredFilename.toLowerCase() === 'dockerfile' || declaredFilename.toLowerCase().startsWith('dockerfile.');
  if (allowedTextExts.has(ext) || isDockerfile) {
    // Check if buffer is valid text (no NUL bytes in the first 4KB)
    const checkLen = Math.min(buffer.length, 4096);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0x00) {
        throw new BadRequestException(`Text file ${declaredFilename} contains forbidden binary null bytes`);
      }
    }

    const textHead = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8');
    // Block active script tags in general documents, but allow technical/code files
    const isCodeOrLog = ['.log', '.sql', '.sh', '.bash', '.zsh', '.py', '.js', '.ts', '.tsx', '.jsx', '.yaml', '.yml', '.conf', '.ini', '.env', '.toml', '.properties'].includes(ext) || isDockerfile;
    if (!isCodeOrLog && (/<script\b[^>]*>/i.test(textHead) || /javascript:/i.test(textHead))) {
      throw new BadRequestException(`File ${declaredFilename} contains dangerous active script tags`);
    }

    const textMimes: Record<string, string> = {
      '.json': 'application/json',
      '.jsonl': 'application/x-ndjson',
      '.csv': 'text/csv',
      '.tsv': 'text/tab-separated-values',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.log': 'text/plain',
      '.sql': 'application/sql',
      '.sh': 'text/x-shellscript',
      '.bash': 'text/x-shellscript',
      '.zsh': 'text/x-shellscript',
      '.py': 'text/x-python',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.xml': 'application/xml',
      '.conf': 'text/plain',
      '.ini': 'text/plain',
      '.env': 'text/plain',
      '.toml': 'application/toml',
    };
    const resolvedExt = isDockerfile ? '.dockerfile' : ext;
    return { mimeType: textMimes[ext] || 'text/plain', category: 'text', extension: ext || resolvedExt };
  }

  const previewTextHead = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8');

  // SVG detection (by extension or by <svg> root tag)
  if (ext === '.svg' || /<svg\b/i.test(previewTextHead)) {
    if (!/<svg\b[^>]*>/i.test(previewTextHead)) {
      throw new BadRequestException('Declared SVG does not contain a valid <svg> tag');
    }
    if (/<script\b[^>]*>/i.test(previewTextHead) || /onload\s*=/i.test(previewTextHead) || /javascript:/i.test(previewTextHead)) {
      throw new BadRequestException('SVG files containing executable scripts or onload handlers are prohibited');
    }
    return { mimeType: 'image/svg+xml', category: 'image', extension: ext === '.svg' ? '.svg' : (ext || '.svg') };
  }

  // Base64 data URL or raw base64 encoded image
  if (
    previewTextHead.startsWith('data:image/') ||
    previewTextHead.startsWith('iVBORw0KGgo') ||
    previewTextHead.startsWith('/9j/') ||
    previewTextHead.startsWith('R0lGOD')
  ) {
    const isJpeg = previewTextHead.startsWith('/9j/') || ext === '.jpg' || ext === '.jpeg';
    return {
      mimeType: isJpeg ? 'image/jpeg' : 'image/png',
      category: 'image',
      extension: ext || (isJpeg ? '.jpg' : '.png'),
    };
  }

  // 4. Safe image fallback for legitimate image extensions or image/* MIME types
  if (ALLOWED_IMAGE_EXTS.has(ext) || (_declaredMimeType && _declaredMimeType.toLowerCase().startsWith('image/'))) {
    if (/<script\b[^>]*>/i.test(previewTextHead) || /javascript:/i.test(previewTextHead)) {
      throw new BadRequestException(`File ${declaredFilename} contains dangerous active script tags`);
    }

    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.dib': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.ico': 'image/x-icon',
      '.avif': 'image/avif',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.svg': 'image/svg+xml',
      '.emf': 'image/emf',
      '.wmf': 'image/wmf',
    };
    const resolvedMime =
      _declaredMimeType && _declaredMimeType.toLowerCase().startsWith('image/')
        ? _declaredMimeType
        : (ext && mimeMap[ext]) || 'image/png';
    return {
      mimeType: resolvedMime,
      category: 'image',
      extension: ext || '.png',
    };
  }

  // If unknown/unsupported
  console.warn(
    `[mime-inspector] Unsupported or unrecognized file format: ${declaredFilename} (ext: ${ext || 'none'}, declaredMime: ${_declaredMimeType || 'none'}), len: ${buffer.length}, header: ${buffer.subarray(0, 32).toString('hex')}`
  );
  throw new BadRequestException(
    `Unsupported or unrecognized file format: ${declaredFilename} (extension: ${ext || 'none'})`
  );
}
