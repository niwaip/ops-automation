import { Module } from '@nestjs/common';
import { GeneratorService } from './generator.service';
import { WordGenerator } from './word.generator';
import { ExcelGenerator } from './excel.generator';
import { PDFGenerator } from './pdf.generator';

@Module({
  providers: [GeneratorService, WordGenerator, ExcelGenerator, PDFGenerator],
  exports: [GeneratorService],
})
export class GeneratorModule {}
