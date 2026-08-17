import { BadRequestException } from '@nestjs/common';
import { gunzipSync, gzipSync } from 'zlib';

const TAR_BLOCK_SIZE = 512;
const TAR_END_BLOCKS = 2;

export const MAX_WORKFLOW_BUNDLE_COMPRESSED_BYTES = 10 * 1024 * 1024;
export const MAX_WORKFLOW_BUNDLE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_WORKFLOW_BUNDLE_ENTRY_COUNT = 64;

export interface WorkflowBundleTarEntry {
  path: string;
  content: Buffer;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.length > length) {
    throw new Error(`tar entry field is too long: ${value}`);
  }
  encoded.copy(buffer, offset);
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const octal = Math.max(0, Math.floor(value))
    .toString(8)
    .padStart(length - 1, '0');
  if (octal.length > length - 1) {
    throw new Error(`tar numeric field is too large: ${value}`);
  }
  writeString(buffer, offset, length, `${octal}\0`);
}

function buildTarHeader(path: string, size: number, modifiedAtSeconds: number): Buffer {
  assertSafeBundlePath(path);
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  writeString(header, 0, 100, path);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, modifiedAtSeconds);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'ops');
  writeString(header, 297, 32, 'ops');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 8, `${checksumText}\0 `);
  return header;
}

function parseString(buffer: Buffer, offset: number, length: number): string {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field
    .subarray(0, end >= 0 ? end : field.length)
    .toString('utf8')
    .trim();
}

function parseOctal(buffer: Buffer, offset: number, length: number, fieldName: string): number {
  const value = parseString(buffer, offset, length).trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) {
    throw new BadRequestException(`工作流包 tar 字段 ${fieldName} 不是合法八进制数`);
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BadRequestException(`工作流包 tar 字段 ${fieldName} 超出允许范围`);
  }
  return parsed;
}

function assertTarChecksum(header: Buffer, path: string): void {
  const expected = parseOctal(header, 148, 8, 'checksum');
  const checksumHeader = Buffer.from(header);
  checksumHeader.fill(0x20, 148, 156);
  const actual = checksumHeader.reduce((sum, byte) => sum + byte, 0);
  if (actual !== expected) {
    throw new BadRequestException(`工作流包 tar 校验和不匹配: ${path || '<unknown>'}`);
  }
}

export function assertSafeBundlePath(path: string): void {
  if (
    !path ||
    path.length > 100 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new BadRequestException(`工作流包包含不安全路径: ${path || '<empty>'}`);
  }
}

export function createTarGzip(entries: WorkflowBundleTarEntry[], modifiedAt = new Date()): Buffer {
  if (entries.length === 0 || entries.length > MAX_WORKFLOW_BUNDLE_ENTRY_COUNT) {
    throw new Error(`tar entry count must be between 1 and ${MAX_WORKFLOW_BUNDLE_ENTRY_COUNT}`);
  }
  const seen = new Set<string>();
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const modifiedAtSeconds = Math.floor(modifiedAt.getTime() / 1000);

  for (const entry of entries) {
    assertSafeBundlePath(entry.path);
    if (seen.has(entry.path)) {
      throw new Error(`duplicate tar entry: ${entry.path}`);
    }
    seen.add(entry.path);
    totalSize += entry.content.length;
    if (totalSize > MAX_WORKFLOW_BUNDLE_UNCOMPRESSED_BYTES) {
      throw new Error('workflow bundle exceeds uncompressed size limit');
    }
    chunks.push(buildTarHeader(entry.path, entry.content.length, modifiedAtSeconds));
    chunks.push(entry.content);
    const padding = (TAR_BLOCK_SIZE - (entry.content.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding, 0));
  }

  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * TAR_END_BLOCKS, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

export function extractTarGzip(archive: Buffer): Map<string, Buffer> {
  if (!archive?.length) {
    throw new BadRequestException('未提供工作流包文件');
  }
  if (archive.length > MAX_WORKFLOW_BUNDLE_COMPRESSED_BYTES) {
    throw new BadRequestException('工作流包超过 10 MB 压缩大小限制');
  }
  if (archive[0] !== 0x1f || archive[1] !== 0x8b) {
    throw new BadRequestException('工作流包必须是 gzip 压缩的 tar 文件（.tar.gz）');
  }

  let tar: Buffer;
  try {
    tar = gunzipSync(archive, {
      maxOutputLength: MAX_WORKFLOW_BUNDLE_UNCOMPRESSED_BYTES,
    });
  } catch (error: unknown) {
    throw new BadRequestException(`无法解压工作流包: ${errorMessage(error)}`);
  }

  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    offset += TAR_BLOCK_SIZE;
    if (header.every((byte) => byte === 0)) break;

    const name = parseString(header, 0, 100);
    const prefix = parseString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    assertSafeBundlePath(path);
    assertTarChecksum(header, path);
    const type = header[156];
    if (type !== 0 && type !== '0'.charCodeAt(0)) {
      throw new BadRequestException(`工作流包只允许普通文件: ${path}`);
    }
    const size = parseOctal(header, 124, 12, 'size');
    if (size > MAX_WORKFLOW_BUNDLE_UNCOMPRESSED_BYTES || offset + size > tar.length) {
      throw new BadRequestException(`工作流包文件大小非法或内容被截断: ${path}`);
    }
    if (entries.has(path)) {
      throw new BadRequestException(`工作流包包含重复文件: ${path}`);
    }
    entries.set(path, Buffer.from(tar.subarray(offset, offset + size)));
    if (entries.size > MAX_WORKFLOW_BUNDLE_ENTRY_COUNT) {
      throw new BadRequestException(`工作流包文件数量超过 ${MAX_WORKFLOW_BUNDLE_ENTRY_COUNT}`);
    }
    offset += size;
    offset += (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
  }

  if (entries.size === 0) {
    throw new BadRequestException('工作流包中没有文件');
  }
  return entries;
}
