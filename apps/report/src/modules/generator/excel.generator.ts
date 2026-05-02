import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReportTemplateDTO,
  ReportSection,
  AIAnalysisResult,
  StepResult,
  ReportTemplateConfig,
} from '../../interfaces';

@Injectable()
export class ExcelGenerator {
  private readonly logger = new Logger(ExcelGenerator.name);
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
    config?: ReportTemplateConfig,
  ): Promise<string> {
    this.logger.log(`Generating Excel document for template: ${template.name}`);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OPS Report Service';
    workbook.created = new Date();

    // Create summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Report', key: 'report', width: 30 },
      { header: 'Value', key: 'value', width: 50 },
    ];

    summarySheet.addRow({ report: 'Template Name', value: template.name });
    summarySheet.addRow({ report: 'Format', value: template.format });
    summarySheet.addRow({ report: 'Generated At', value: new Date().toISOString() });
    summarySheet.addRow({ report: 'Title', value: config?.title || template.name });

    // Process each section
    for (const section of template.sections) {
      const sheetName = section.name.substring(0, 31); // Excel sheet name limit
      const sheet = workbook.addWorksheet(sheetName);

      if (section.type === 'text') {
        this.addTextSection(sheet, section, stepResults, aiAnalysis);
      } else if (section.type === 'table') {
        this.addTableSection(sheet, section, stepResults, aiAnalysis);
      } else if (section.type === 'image') {
        await this.addImageSection(sheet, section, stepResults);
      }
    }

    // Generate file
    const fileName = `${template.name}_${Date.now()}.xlsx`;
    const filePath = path.join(this.filesDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    this.logger.log(`Excel document generated: ${filePath}`);
    return filePath;
  }

  private addTextSection(
    sheet: ExcelJS.Worksheet,
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[],
  ): void {
    sheet.columns = [{ header: section.format?.title || section.name, key: 'content', width: 80 }];

    const content = this.processSection(section, stepResults, aiAnalysis);
    const lines = content.split('\n');

    for (const line of lines) {
      sheet.addRow({ content: line });
    }

    // Style header
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  }

  private addTableSection(
    sheet: ExcelJS.Worksheet,
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[],
  ): void {
    const columns = section.format?.columns || ['Step', 'Action', 'Result', 'Status'];
    const filteredResults = this.filterStepResults(section, stepResults);

    // Set columns
    sheet.columns = columns.map(col => ({
      header: col,
      key: col.toLowerCase(),
      width: 20,
    }));

    // Add data rows
    for (const result of filteredResults) {
      const rowData = this.getTableRowData(result, columns);
      const row: Record<string, string> = {};
      columns.forEach((col, idx) => {
        row[col.toLowerCase()] = rowData[idx];
      });
      sheet.addRow(row);
    }

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add borders
    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      for (let j = 1; j <= columns.length; j++) {
        const cell = row.getCell(j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    }
  }

  private async addImageSection(
    sheet: ExcelJS.Worksheet,
    section: ReportSection,
    stepResults: StepResult[],
  ): Promise<void> {
    sheet.columns = [{ header: section.format?.title || section.name, key: 'note', width: 50 }];
    sheet.addRow({ note: 'Screenshots from execution:' });

    const filteredResults = this.filterStepResults(section, stepResults);
    let rowNum = 2;

    for (const result of filteredResults) {
      if (result.screenshot) {
        try {
          const screenshotData = result.screenshot;
          if (screenshotData.startsWith('data:image')) {
            const base64Data = screenshotData.split(',')[1];

            const imageId = sheet.workbook.addImage({
              base64: base64Data,
              extension: 'png',
            });

            sheet.addImage(imageId, {
              tl: { col: 0, row: rowNum },
              ext: {
                width: section.format?.width || 400,
                height: section.format?.height || 300,
              },
            });

            rowNum += Math.ceil((section.format?.height || 300) / 15);
          }
        } catch (error) {
          this.logger.error(`Failed to add image to Excel: ${error}`);
          sheet.addRow({ note: `Screenshot for step ${result.step_id} could not be added` });
          rowNum++;
        }
      }
    }
  }

  private processSection(
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[],
  ): string {
    if (section.source === 'static' && section.content) {
      return section.content;
    }

    if (section.source === 'ai_analysis') {
      const analysis = aiAnalysis.find(a => a.section_id === section.id);
      return analysis?.analysis || 'No analysis available';
    }

    if (section.source === 'step_result') {
      const filteredResults = this.filterStepResults(section, stepResults);
      return filteredResults
        .map(r => `Step ${r.step_id}: ${r.text || r.error || 'No content'}`)
        .join('\n');
    }

    return '';
  }

  private filterStepResults(
    section: ReportSection,
    stepResults: StepResult[],
  ): StepResult[] {
    let results = stepResults;

    if (section.step_filter) {
      const filter = section.step_filter;
      if (filter.actions) {
        results = results.filter(r => filter.actions!.includes(r.action));
      }
      if (filter.success_only) {
        results = results.filter(r => r.success);
      }
      if (filter.step_ids) {
        results = results.filter(r => filter.step_ids!.includes(r.step_id));
      }
    }

    return results;
  }

  private getTableRowData(result: StepResult, columns: string[]): string[] {
    const timestamp = typeof result.timestamp === 'number'
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

    return columns.map(col => dataMap[col] || '');
  }
}