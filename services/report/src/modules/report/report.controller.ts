import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportService } from './report.service';
import { CreateReportDTOClass } from './report.dto';
import { ReportDTO, GenerateReportResponse } from '../../interfaces';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Reports')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @ApiOperation({ summary: 'List all reports' })
  @ApiResponse({ status: 200, description: 'Returns list of reports' })
  async findAll(): Promise<{ reports: ReportDTO[] }> {
    const reports = await this.reportService.findAll();
    return { reports };
  }

  @Post()
  @ApiOperation({ summary: 'Generate a new report' })
  @ApiResponse({ status: 201, description: 'Report generation started' })
  async create(@Body() dto: CreateReportDTOClass): Promise<GenerateReportResponse> {
    const report = await this.reportService.create(dto);
    return {
      report_id: report.id,
      status: report.status,
      message: 'Report generation started',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific report' })
  @ApiResponse({ status: 200, description: 'Returns report details' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async findOne(@Param('id') id: string): Promise<ReportDTO> {
    return this.reportService.findOne(id);
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get reports by session ID' })
  @ApiResponse({ status: 200, description: 'Returns list of reports for session' })
  async findBySession(@Param('sessionId') sessionId: string): Promise<{ reports: ReportDTO[] }> {
    const reports = await this.reportService.findBySession(sessionId);
    return { reports };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the generated report file' })
  @ApiResponse({ status: 200, description: 'Returns the file' })
  @ApiResponse({ status: 404, description: 'Report or file not found' })
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const report = await this.reportService.findOne(id);

    if (report.status !== 'completed') {
      throw new HttpException('Report not yet completed', HttpStatus.BAD_REQUEST);
    }

    if (!report.result_file) {
      throw new HttpException('No file available', HttpStatus.NOT_FOUND);
    }

    // Check if file exists
    if (!fs.existsSync(report.result_file)) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }

    const fileName = path.basename(report.result_file);
    const fileExtension = path.extname(fileName).toLowerCase();

    // Set content type based on file extension
    const contentTypes: Record<string, string> = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pdf': 'application/pdf',
    };

    const contentType = contentTypes[fileExtension] || 'application/octet-stream';

    // Set headers for file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Stream the file
    const fileStream = fs.createReadStream(report.result_file);
    fileStream.pipe(res);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get report generation status' })
  @ApiResponse({ status: 200, description: 'Returns report status' })
  async getStatus(@Param('id') id: string): Promise<{ id: string; status: string; error?: string }> {
    const report = await this.reportService.findOne(id);
    return {
      id: report.id,
      status: report.status,
      error: report.error,
    };
  }
}