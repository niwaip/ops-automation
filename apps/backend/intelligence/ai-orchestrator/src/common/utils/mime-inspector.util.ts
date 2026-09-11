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
  declaredMimeType?: string
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

  // 2. Magic byte checks for known formats
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
    if (ext && !['.png'].includes(ext)) {
      throw new BadRequestException(`File content is PNG image, but declared extension is ${ext}`);
    }
    return { mimeType: 'image/png', category: 'image', extension: '.png' };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    if (ext && !['.jpg', '.jpeg'].includes(ext)) {
      throw new BadRequestException(`File content is JPEG image, but declared extension is ${ext}`);
    }
    return { mimeType: 'image/jpeg', category: 'image', extension: '.jpg' };
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
    if (ext && !['.gif'].includes(ext)) {
      throw new BadRequestException(`File content is GIF image, but declared extension is ${ext}`);
    }
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
    if (ext && !['.webp'].includes(ext)) {
      throw new BadRequestException(`File content is WebP image, but declared extension is ${ext}`);
    }
    return { mimeType: 'image/webp', category: 'image', extension: '.webp' };
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

  // ZIP / DOCX / XLSX: PK\x03\x04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const allowedZipExts = new Set(['.docx', '.xlsx', '.zip']);
    if (!allowedZipExts.has(ext)) {
      throw new BadRequestException(`ZIP archive detected, but declared extension is ${ext || 'unspecified'}`);
    }
    const mimeMap: Record<string, string> = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
    };
    return { mimeType: mimeMap[ext] || 'application/zip', category: 'document', extension: ext };
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

  // 3. Text-based files (json, csv, txt, md)
  const allowedTextExts = new Set(['.txt', '.md', '.csv', '.json']);
  if (allowedTextExts.has(ext)) {
    // Check if buffer is valid text (no NUL bytes in the first 4KB)
    const checkLen = Math.min(buffer.length, 4096);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0x00) {
        throw new BadRequestException(`Text file ${declaredFilename} contains forbidden binary null bytes`);
      }
    }

    const textHead = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8');
    // Block script tags in text files to prevent XSS
    if (/<script\b[^>]*>/i.test(textHead) || /javascript:/i.test(textHead)) {
      throw new BadRequestException(`File ${declaredFilename} contains dangerous active script tags`);
    }

    const textMimes: Record<string, string> = {
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
    };
    return { mimeType: textMimes[ext] || 'text/plain', category: 'text', extension: ext };
  }

  // If SVG was claimed:
  if (ext === '.svg') {
    const textHead = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8');
    if (!/<svg\b[^>]*>/i.test(textHead)) {
      throw new BadRequestException('Declared SVG does not contain a valid <svg> tag');
    }
    if (/<script\b[^>]*>/i.test(textHead) || /onload\s*=/i.test(textHead) || /javascript:/i.test(textHead)) {
      throw new BadRequestException('SVG files containing executable scripts or onload handlers are prohibited');
    }
    return { mimeType: 'image/svg+xml', category: 'image', extension: '.svg' };
  }

  // If unknown/unsupported
  throw new BadRequestException(
    `Unsupported or unrecognized file format: ${declaredFilename} (extension: ${ext || 'none'})`
  );
}
