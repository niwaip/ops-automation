import { Injectable, Logger } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} from 'docx';
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
export class WordGenerator {
  private readonly logger = new Logger(WordGenerator.name);
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
    this.logger.log(`Generating Word document for template: ${template.name}`);

    const sections: (Paragraph | Table)[] = [];

    // Add title
    const title = config?.title || template.name;
    sections.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );

    // Add header if configured
    if (config?.header) {
      sections.push(
        new Paragraph({
          text: config.header,
          spacing: { after: 200 },
        }),
      );
    }

    // Process each section
    for (const section of template.sections) {
      const content = this.processSection(section, stepResults, aiAnalysis);

      if (section.type === 'text') {
        sections.push(
          new Paragraph({
            text: section.format?.title || section.name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
        );
        sections.push(
          new Paragraph({
            text: content,
            spacing: { after: 200 },
          }),
        );
      } else if (section.type === 'table') {
        sections.push(
          new Paragraph({
            text: section.format?.title || section.name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
        );
        const table = this.createTable(section, stepResults, aiAnalysis);
        if (table) {
          sections.push(table);
        }
      } else if (section.type === 'image') {
        sections.push(
          new Paragraph({
            text: section.format?.title || section.name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
        );
        const imageParagraph = await this.createImageParagraph(section, stepResults);
        if (imageParagraph) {
          sections.push(imageParagraph);
        }
      }
    }

    // Add footer if configured
    if (config?.footer) {
      sections.push(
        new Paragraph({
          text: config.footer,
          spacing: { before: 400 },
        }),
      );
    }

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: sections,
        },
      ],
    });

    // Generate file
    const fileName = `${template.name}_${Date.now()}.docx`;
    const filePath = path.join(this.filesDir, fileName);

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);

    this.logger.log(`Word document generated: ${filePath}`);
    return filePath;
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
        .map(r => r.text || r.error || 'No content')
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

  private createTable(
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: AIAnalysisResult[],
  ): Table | null {
    const columns = section.format?.columns || ['Step', 'Action', 'Result', 'Status'];
    const filteredResults = this.filterStepResults(section, stepResults);

    if (filteredResults.length === 0) {
      return null;
    }

    const rows: TableRow[] = [];

    // Header row
    rows.push(
      new TableRow({
        children: columns.map(
          col =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: col,
                      bold: true,
                    }),
                  ],
                }),
              ],
              width: { size: 100 / columns.length, type: WidthType.PERCENTAGE },
            }),
        ),
      }),
    );

    // Data rows
    for (const result of filteredResults) {
      const rowData = this.getTableRowData(result, columns);
      rows.push(
        new TableRow({
          children: rowData.map(
            data =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: data })],
                  }),
                ],
                width: { size: 100 / columns.length, type: WidthType.PERCENTAGE },
              }),
          ),
        }),
      );
    }

    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
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

  private async createImageParagraph(
    section: ReportSection,
    stepResults: StepResult[],
  ): Promise<Paragraph | null> {
    const filteredResults = this.filterStepResults(section, stepResults);
    const resultWithScreenshot = filteredResults.find(r => r.screenshot);

    if (!resultWithScreenshot?.screenshot) {
      return null;
    }

    try {
      // Handle base64 screenshot
      const screenshotData = resultWithScreenshot.screenshot;
      if (screenshotData.startsWith('data:image')) {
        const base64Data = screenshotData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        return new Paragraph({
          children: [
            new ImageRun({
              data: buffer,
              transformation: {
                width: section.format?.width || 400,
                height: section.format?.height || 300,
              },
            }),
          ],
        });
      }
    } catch (error) {
      this.logger.error(`Failed to add image: ${error}`);
    }

    return null;
  }
}