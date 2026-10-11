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

  it('should correctly identify PPTX document', () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const result = inspectBinaryMimeType(
      zipHeader,
      'presentation.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(result.category).toBe('document');
  });

  it('should correctly identify legacy OLE documents (.doc, .xls, .ppt)', () => {
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const pptResult = inspectBinaryMimeType(oleHeader, 'slides.ppt');
    expect(pptResult.mimeType).toBe('application/vnd.ms-powerpoint');
    const docResult = inspectBinaryMimeType(oleHeader, 'document.doc');
    expect(docResult.mimeType).toBe('application/msword');
    const xlsResult = inspectBinaryMimeType(oleHeader, 'sheet.xls');
    expect(xlsResult.mimeType).toBe('application/vnd.ms-excel');
  });

  it('should reject text file with XSS script tags', () => {
    const xssText = Buffer.from('<script>alert(1)</script>', 'utf-8');
    expect(() => inspectBinaryMimeType(xssText, 'page.txt', 'text/plain')).toThrow(
      BadRequestException
    );
  });

  it('should accept JPEG image declared as image001.png without rejection (cross-image tolerance)', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = inspectBinaryMimeType(jpegHeader, 'image001.png', 'image/png');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.category).toBe('image');
  });

  it('should identify BMP image and allow .bmp or .png extension', () => {
    const bmpHeader = Buffer.from([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]);
    const bmpResult = inspectBinaryMimeType(bmpHeader, 'chart.bmp');
    expect(bmpResult.mimeType).toBe('image/bmp');
    expect(bmpResult.category).toBe('image');

    const pngNamedResult = inspectBinaryMimeType(bmpHeader, 'image001.png');
    expect(pngNamedResult.mimeType).toBe('image/bmp');
    expect(pngNamedResult.category).toBe('image');
  });

  it('should identify TIFF image', () => {
    const tiffLe = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
    const result = inspectBinaryMimeType(tiffLe, 'scan.tiff');
    expect(result.mimeType).toBe('image/tiff');
    expect(result.category).toBe('image');
  });

  it('should identify ICO image', () => {
    const icoHeader = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    const result = inspectBinaryMimeType(icoHeader, 'favicon.ico');
    expect(result.mimeType).toBe('image/x-icon');
    expect(result.category).toBe('image');
  });

  it('should identify AVIF and HEIC images via ISOBMFF ftyp box', () => {
    const avifHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, // size + 'ftyp'
      0x61, 0x76, 0x69, 0x66,                         // 'avif'
    ]);
    const avifResult = inspectBinaryMimeType(avifHeader, 'photo.avif');
    expect(avifResult.mimeType).toBe('image/avif');

    const heicHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, // size + 'ftyp'
      0x68, 0x65, 0x69, 0x63,                         // 'heic'
    ]);
    const heicResult = inspectBinaryMimeType(heicHeader, 'iphone_photo.heic');
    expect(heicResult.mimeType).toBe('image/heic');
  });

  it('should reject image content disguised as non-image document extension', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(() => inspectBinaryMimeType(jpegHeader, 'report.pdf', 'application/pdf')).toThrow(
      BadRequestException
    );
  });

  it('should identify Windows DIB image from clipboard', () => {
    const dibHeader = Buffer.alloc(40);
    dibHeader.writeUInt32LE(40, 0); // biSize
    dibHeader.writeInt32LE(100, 4); // biWidth
    dibHeader.writeInt32LE(100, 8); // biHeight
    dibHeader.writeUInt16LE(1, 12); // biPlanes
    dibHeader.writeUInt16LE(24, 14); // biBitCount
    const result = inspectBinaryMimeType(dibHeader, 'image001.png');
    expect(result.mimeType).toBe('image/bmp');
    expect(result.category).toBe('image');
  });

  it('should identify EMF vector diagram from Office', () => {
    const emfHeader = Buffer.alloc(44);
    emfHeader.writeUInt32LE(1, 0); // recordType = 1 (EMR_HEADER)
    emfHeader.write(' EMF', 40, 'ascii'); // signature
    const result = inspectBinaryMimeType(emfHeader, 'image001.png');
    expect(result.mimeType).toBe('image/emf');
    expect(result.category).toBe('image');
  });

  it('should identify WMF vector diagram from Office', () => {
    const wmfHeader = Buffer.from([0xd7, 0xcd, 0xc6, 0x9a, 0x00, 0x00]);
    const result = inspectBinaryMimeType(wmfHeader, 'image001.png');
    expect(result.mimeType).toBe('image/wmf');
    expect(result.category).toBe('image');
  });

  it('should identify SVG image even when declared as image001.png', () => {
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>', 'utf-8');
    const result = inspectBinaryMimeType(svgContent, 'image001.png');
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.category).toBe('image');
  });

  it('should identify base64 data url image', () => {
    const b64Content = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'utf-8');
    const result = inspectBinaryMimeType(b64Content, 'image001.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.category).toBe('image');
  });

  it('should accept non-executable image payload named image001.png via safe fallback', () => {
    const customImageBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const result = inspectBinaryMimeType(customImageBytes, 'image001.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.category).toBe('image');
  });

  it('should strictly reject executable script files disguised as image001.png', () => {
    const shebangScript = Buffer.from('#!/bin/bash\nrm -rf /', 'utf-8');
    expect(() => inspectBinaryMimeType(shebangScript, 'image001.png')).toThrow(
      BadRequestException
    );
  });
});
