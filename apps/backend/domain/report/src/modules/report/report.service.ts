import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import axios from 'axios';
import { TemplateService } from '../template/template.service';
import { GeneratorService } from '../generator/generator.service';
import { AnalyzerService } from '../analyzer/analyzer.service';
import { NotificationService } from '../notification/notification.service';
import { getRedisHost, getSessionBrokerUrl } from '../../config/service-endpoints';
import {
  CreateReportDTO,
  ReportDTO,
  ReportStatus,
  StepResult,
  ValidationResult,
  ReportSection,
  ReportTemplateDTO,
} from '../../interfaces';
import { PrismaService } from '../../prisma/prisma.service';

type ReportRecord = {
  id: string;
  templateId: string;
  sessionId: string;
  status: string;
  resultFile: string | null;
  aiAnalysis: unknown;
  validationResults: unknown;
  notifications: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly redis: Redis;
  private readonly sessionBrokerUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: TemplateService,
    private readonly generatorService: GeneratorService,
    private readonly analyzerService: AnalyzerService,
    private readonly notificationService: NotificationService
  ) {
    this.redis = new Redis({
      host: getRedisHost(),
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    });
    this.sessionBrokerUrl = getSessionBrokerUrl();
  }

  async create(dto: CreateReportDTO): Promise<ReportDTO> {
    this.logger.log(`Creating report for template ${dto.template_id}, session ${dto.session_id}`);

    // Get template
    const template = await this.templateService.findOne(dto.template_id);

    const saved = await this.prisma.report.create({
      data: {
        templateId: dto.template_id,
        sessionId: dto.session_id,
        status: 'pending',
      } satisfies Prisma.ReportUncheckedCreateInput,
    });

    // Start generation process asynchronously
    this.generateReport(saved.id, template, dto.session_id).catch((error) => {
      this.logger.error(`Report generation failed: ${error}`);
      this.updateReportStatus(saved.id, 'failed', error.message);
    });

    return this.toDTO(saved);
  }

  private async generateReport(
    reportId: string,
    template: ReportTemplateDTO,
    sessionId: string
  ): Promise<void> {
    this.logger.log(`Starting report generation for ${reportId}`);

    await this.updateReportStatus(reportId, 'generating');

    try {
      // Get step results from Redis
      const stepResults = await this.getStepResults(sessionId);
      this.logger.log(`Retrieved ${stepResults.length} step results`);

      // Run AI analysis
      const aiAnalysis = await this.analyzerService.analyzeSections(template, stepResults);
      this.logger.log(`AI analysis completed for ${aiAnalysis.length} sections`);

      // Run validations
      const validationResults = this.validateSections(template.sections, stepResults, aiAnalysis);
      this.logger.log(
        `Validation completed: ${validationResults.filter((v) => v.passed).length}/${validationResults.length} passed`
      );

      // Send notifications for failed validations
      const notifications = await this.notificationService.sendNotifications(
        template.sections,
        validationResults,
        sessionId
      );
      this.logger.log(`Notifications sent: ${notifications.filter((n) => n.sent).length}`);

      // Check if we should stop due to validation failures
      const hasStopFailure = template.sections.some(
        (s: ReportSection) =>
          s.validation?.on_fail === 'stop' &&
          validationResults.find((v) => v.section_id === s.id && !v.passed)
      );

      if (hasStopFailure) {
        await this.updateReportStatus(reportId, 'failed', 'Validation failed with stop action');
        return;
      }

      // Generate document
      const filePath = await this.generatorService.generate(template, stepResults, aiAnalysis);
      this.logger.log(`Document generated: ${filePath}`);

      // Update report with results
      await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'completed',
          resultFile: filePath,
          aiAnalysis: aiAnalysis as unknown as Prisma.InputJsonValue,
          validationResults: validationResults as unknown as Prisma.InputJsonValue,
          notifications: notifications as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Report ${reportId} completed successfully`);
    } catch (error) {
      this.logger.error(`Report generation failed: ${error}`);
      await this.updateReportStatus(
        reportId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async getStepResults(sessionId: string): Promise<StepResult[]> {
    this.logger.debug(`Fetching step results for session ${sessionId}`);

    try {
      // Try Redis first - steps are stored as a JSON array under session:{id}:steps
      const stepsKey = `session:${sessionId}:steps`;
      const data = await this.redis.get(stepsKey);

      if (data) {
        const results: StepResult[] = JSON.parse(data);
        this.logger.log(`Found ${results.length} steps in Redis for session ${sessionId}`);
        return results.sort((a, b) => {
          const timeA =
            typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
          const timeB =
            typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
      }

      // Fallback to session broker API
      this.logger.log(`No steps found in Redis, trying session broker API`);
      const response = await axios.get<{ results?: StepResult[] }>(
        `${this.sessionBrokerUrl}/session/${sessionId}/results`
      );
      return response.data.results || [];
    } catch (error) {
      this.logger.error(`Failed to get step results: ${error}`);
      return [];
    }
  }

  private validateSections(
    sections: ReportSection[],
    stepResults: StepResult[],
    aiAnalysis: any[]
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const section of sections) {
      if (!section.validation) {
        results.push({
          section_id: section.id,
          passed: true,
        });
        continue;
      }

      const passed = this.evaluateCondition(
        section.validation.condition,
        section,
        stepResults,
        aiAnalysis
      );

      results.push({
        section_id: section.id,
        passed,
        condition: section.validation.condition,
        message: passed ? 'Validation passed' : 'Validation failed',
      });
    }

    return results;
  }

  private evaluateCondition(
    condition: string,
    section: ReportSection,
    stepResults: StepResult[],
    aiAnalysis: any[]
  ): boolean {
    // Simple condition evaluation
    // Supported conditions:
    // - "success_count >= N"
    // - "failure_count == 0"
    // - "has_text"
    // - "analysis_contains:keyword"

    const filteredSteps = this.filterSteps(section, stepResults);
    const analysis = aiAnalysis.find((a) => a.section_id === section.id);

    try {
      if (condition.startsWith('success_count')) {
        const match = condition.match(/success_count\s*>=\s*(\d+)/);
        if (match) {
          const threshold = parseInt(match[1], 10);
          const successCount = filteredSteps.filter((s) => s.success).length;
          return successCount >= threshold;
        }
      }

      if (condition.startsWith('failure_count')) {
        const match = condition.match(/failure_count\s*==\s*(\d+)/);
        if (match) {
          const threshold = parseInt(match[1], 10);
          const failureCount = filteredSteps.filter((s) => !s.success).length;
          return failureCount === threshold;
        }
      }

      if (condition === 'has_text') {
        return filteredSteps.some((s) => s.text && s.text.length > 0);
      }

      if (condition.startsWith('analysis_contains:')) {
        const keyword = condition.split(':')[1];
        return analysis?.analysis?.toLowerCase().includes(keyword.toLowerCase());
      }

      // Default: return true for unknown conditions
      this.logger.warn(`Unknown condition: ${condition}`);
      return true;
    } catch (error) {
      this.logger.error(`Condition evaluation failed: ${error}`);
      return false;
    }
  }

  private filterSteps(section: ReportSection, stepResults: StepResult[]): StepResult[] {
    let results = stepResults;

    if (section.step_filter) {
      if (section.step_filter.actions) {
        results = results.filter((r) => section.step_filter!.actions!.includes(r.action));
      }
      if (section.step_filter.success_only) {
        results = results.filter((r) => r.success);
      }
    }

    return results;
  }

  private async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    error?: string
  ): Promise<void> {
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        error: error ?? null,
      },
    });
  }

  async findAll(): Promise<ReportDTO[]> {
    const reports = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    return reports.map((report) => this.toDTO(report));
  }

  async findOne(id: string): Promise<ReportDTO> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!report) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return this.toDTO(report);
  }

  async findBySession(sessionId: string): Promise<ReportDTO[]> {
    const reports = await this.prisma.report.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    return reports.map((report) => this.toDTO(report));
  }

  private toDTO(entity: ReportRecord): ReportDTO {
    return {
      id: entity.id,
      template_id: entity.templateId,
      session_id: entity.sessionId,
      status: entity.status as ReportStatus,
      result_file: entity.resultFile || undefined,
      ai_analysis: entity.aiAnalysis as ReportDTO['ai_analysis'],
      validation_results: entity.validationResults as ReportDTO['validation_results'],
      notifications: entity.notifications as ReportDTO['notifications'],
      error: entity.error || undefined,
      created_at: entity.createdAt,
      completed_at: entity.completedAt || undefined,
    };
  }
}
