import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReportTemplateDTO,
  ReportSection,
  AIAnalysisResult,
  StepResult,
  ReportTemplateConfig,
} from '../../contracts';

@Injectable()
export class PDFGenerator {
  private readonly logger = new Logger(PDFGenerator.name);
  private readonly filesDir: string;

  constructor() {
    this.filesDir = process.env.FILES_DIR || '/app/files';
    if (!fs.existsSync(this.filesDir)) {
      fs.mkdirSync(this.filesDir, { recursive: true });
    }
  }

  async generate(
    template: ReportTemplateDTO,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[],
    config?: ReportTemplateConfig
  ): Promise<string> {
    this.logger.log(`Generating PDF document for template: ${template.name}`);

    const fileName = `${template.name}_${Date.now()}.pdf`;
    const filePath = path.join(this.filesDir, fileName);

    const pageSize = config?.page_size || 'A4';
    const orientation = config?.orientation || 'portrait';

    const doc = new PDFDocument({
      size: pageSize,
      layout: orientation,
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
      },
    });

    doc.pipe(fs.createWriteStream(filePath));

    // Add title
    const title = config?.title || template.name;
    doc.fontSize(24).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(2);

    // Add header if configured
    if (config?.header) {
      doc.fontSize(12).font('Helvetica').text(config.header);
      doc.moveDown(1);
    }

    // Process each section
    for (const section of template.sections) {
      doc
        .addPage()
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(section.format?.title || section.name);
      doc.moveDown(1);

      if (section.type === 'text') {
        const content = this.processSection(section, stepResults, aiAnalysis);
        doc.fontSize(12).font('Helvetica').text(content);
      } else if (section.type === 'table') {
        this.addTable(doc, section, stepResults, aiAnalysis);
      } else if (section.type === 'image') {
        await this.addImage(doc, section, stepResults);
      }

      doc.moveDown(2);
    }

    // Add footer if configured
    if (config?.footer) {
      doc.fontSize(10).font('Helvetica').text(config.footer, { align: 'center' });
    }

    doc.end();

    this.logger.log(`PDF document generated: ${filePath}`);
    return filePath;
  }

  private processSection(
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[]
  ): string {
    if (section.source === 'static' && section.content) {
      return section.content;
    }

    if (section.source === 'ai_analysis') {
      const analysis = aiAnalysis.find((a) => a.section_id === section.id);
      return analysis?.analysis || 'No analysis available';
    }

    if (section.source === 'step_result') {
      const filteredResults = this.filterStepResults(section, stepResults);
      return filteredResults.map((r) => r.text || r.error || 'No content').join('\n\n');
    }

    return '';
  }

  private filterStepResults(section: ReportSection, stepResults: StepResult[]): StepResult[] {
    let results = stepResults;

    if (section.step_filter) {
      const filter = section.step_filter;
      if (filter.actions) {
        results = results.filter((r) => filter.actions!.includes(r.action));
      }
      if (filter.success_only) {
        results = results.filter((r) => r.success);
      }
      if (filter.step_ids) {
        results = results.filter((r) => filter.step_ids!.includes(r.step_id));
      }
    }

    return results;
  }

  private addTable(
    doc: PDFKit.PDFDocument,
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[]
  ): void {
    const columns = section.format?.columns || ['Step', 'Action', 'Result', 'Status'];
    const filteredResults = this.filterStepResults(section, stepResults);

    if (filteredResults.length === 0) {
      doc.fontSize(12).text('No data available');
      return;
    }

    const colWidth = (doc.page.width - 100) / columns.length;

    // Header row
    doc.fontSize(10).font('Helvetica-Bold');
    let x = 50;
    for (const col of columns) {
      doc.text(col, x, doc.y, { width: colWidth });
      x += colWidth;
    }
    doc.moveDown(0.5);

    // Draw header underline
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke();
    doc.moveDown(0.5);

    // Data rows
    doc.font('Helvetica');
    for (const result of filteredResults) {
      const rowData = this.getTableRowData(result, columns);
      x = 50;
      const startY = doc.y;
      for (const data of rowData) {
        doc.text(data, x, startY, { width: colWidth });
        x += colWidth;
      }
      doc.moveDown(0.5);
    }
  }

  private async addImage(
    doc: PDFKit.PDFDocument,
    section: ReportSection,
    stepResults: StepResult[]
  ): Promise<void> {
    const filteredResults = this.filterStepResults(section, stepResults);

    for (const result of filteredResults) {
      if (result.screenshot) {
        try {
          const screenshotData = result.screenshot;
          if (screenshotData.startsWith('data:image')) {
            const base64Data = screenshotData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            const width = section.format?.width || 400;
            const height = section.format?.height || 300;

            doc.image(buffer, {
              width,
              height,
              align: 'center',
            });
            doc.moveDown(1);
          }
        } catch (error) {
          this.logger.error(`Failed to add image to PDF: ${error}`);
          doc.fontSize(12).text(`Screenshot for step ${result.step_id} could not be added`);
        }
      }
    }
  }

  private getTableRowData(result: StepResult, columns: string[]): string[] {
    const timestamp =
      typeof result.timestamp === 'number'
        ? new Date(result.timestamp).toISOString()
        : result.timestamp.toISOString();

    const dataMap: Record<string, string> = {
      Step: result.step_id,
      Action: result.action,
      Result: result.text || result.message || result.error || '',
      Status: result.success ? 'Success' : 'Failed',
      Timestamp: timestamp,
      Error: result.error || '',
    };

    return columns.map((col) => dataMap[col] || '');
  }
}
