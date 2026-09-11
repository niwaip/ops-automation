import { inspectBinaryMimeType } from '../src/common/utils/mime-inspector.util';
import { BadRequestException } from '@nestjs/common';

describe('inspectBinaryMimeType', () => {
  it('should correctly identify PNG image', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const result = inspectBinaryMimeType(pngHeader, 'image.png', 'image/png');
    expect(result.mimeType).toBe('image/png');
    expect(result.category).toBe('image');
  });

  it('should correctly identify JPEG image', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = inspectBinaryMimeType(jpegHeader, 'photo.jpg', 'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('should correctly identify PDF document', () => {
    const pdfHeader = Buffer.from('%PDF-1.7 mock content');
    const result = inspectBinaryMimeType(pdfHeader, 'doc.pdf', 'application/pdf');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('should reject ELF binary disguised as png', () => {
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    expect(() => inspectBinaryMimeType(elfHeader, 'disguised.png', 'image/png')).toThrow(
      BadRequestException
    );
  });

  it('should reject PE EXE disguised as pdf', () => {
    const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => inspectBinaryMimeType(peHeader, 'disguised.pdf', 'application/pdf')).toThrow(
      BadRequestException
    );
  });

  it('should reject file extension mismatch (e.g. PDF pretending to be PNG)', () => {
    const pdfHeader = Buffer.from('%PDF-1.7 mock content');
    expect(() => inspectBinaryMimeType(pdfHeader, 'actually_pdf.png', 'image/png')).toThrow(
      BadRequestException
    );
  });

  it('should allow valid UTF-8 JSON', () => {
    const jsonBuf = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf-8');
    const result = inspectBinaryMimeType(jsonBuf, 'data.json', 'application/json');
    expect(result.mimeType).toBe('application/json');
  });

  it('should reject text file with binary null bytes', () => {
    const badText = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f]);
    expect(() => inspectBinaryMimeType(badText, 'corrupt.txt', 'text/plain')).toThrow(
      BadRequestException
    );
  });

  it('should reject text file with XSS script tags', () => {
    const xssText = Buffer.from('<script>alert(1)</script>', 'utf-8');
    expect(() => inspectBinaryMimeType(xssText, 'page.txt', 'text/plain')).toThrow(
      BadRequestException
    );
  });
});
