import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';

const PDF_SIGNATURE = '%PDF-';
export const MAX_PDF_INPUT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class PdfInputDecoderService {
  decode(value: unknown, fieldName = 'fileBase64'): Buffer {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} cannot be empty`);
    }

    const normalized = value.trim().replace(/^data:application\/pdf;base64,/i, '');
    const maxBase64Length = Math.ceil(MAX_PDF_INPUT_BYTES / 3) * 4;
    if (normalized.length > maxBase64Length) {
      throw new PayloadTooLargeException(`${fieldName} exceeds the 10MB PDF limit`);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
      throw new BadRequestException(`${fieldName} is not valid Base64 content`);
    }

    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length === 0 || bytes.toString('ascii', 0, PDF_SIGNATURE.length) !== PDF_SIGNATURE) {
      throw new BadRequestException(`${fieldName} is not a valid PDF document`);
    }
    if (bytes.length > MAX_PDF_INPUT_BYTES) {
      throw new PayloadTooLargeException(`${fieldName} exceeds the 10MB PDF limit`);
    }
    return bytes;
  }
}
