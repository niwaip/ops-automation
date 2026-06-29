import { Injectable, Logger } from '@nestjs/common';
import { WordGenerator } from './word.generator';
import { ExcelGenerator } from './excel.generator';
import { PDFGenerator } from './pdf.generator';
import { ReportTemplateDTO, AIAnalysisResult, StepResult } from '../../contracts';

@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);

  constructor(
    private readonly wordGenerator: WordGenerator,
    private readonly excelGenerator: ExcelGenerator,
    private readonly pdfGenerator: PDFGenerator
  ) {}

  async generate(
    template: ReportTemplateDTO,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[]
  ): Promise<string> {
    this.logger.log(`Generating report for template ${template.id} in format ${template.format}`);

    const config = template.global_config;

    switch (template.format) {
      case 'word':
        return this.wordGenerator.generate(template, stepResults, aiAnalysis, config);
      case 'excel':
        return this.excelGenerator.generate(template, stepResults, aiAnalysis, config);
      case 'pdf':
        return this.pdfGenerator.generate(template, stepResults, aiAnalysis, config);
      default:
        throw new Error(`Unsupported format: ${template.format}`);
    }
  }
}
