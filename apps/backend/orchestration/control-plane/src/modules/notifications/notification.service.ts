import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { ApprovalStatus } from '../execution/contracts/approval-status';
import type { ExecutionStatus } from '../execution/contracts/execution-status';
import { ExecutionService } from '../execution/execution.service';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { getReportServiceUrl } from '../../config/service-endpoints';
import {
  AppNotificationDto,
  NotificationCategory,
  NotificationListQueryDto,
  NotificationListResponseDto,
  NotificationSeverity,
} from './notification.dto';

type NotificationResultArtifact = {
  type?: string;
  name?: string;
  label?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
};

type NotificationNormalizedResult = {
  resultType?: string;
  title?: string;
  summary?: string;
  body?: string;
  detailText?: string;
  artifacts?: NotificationResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;
  hasBusinessResult?: boolean;
};

type RequestUserContext = {
  id: string;
  role?: string;
};

interface ReportNotificationSource {
  id: string;
  template_id: string;
  session_id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  result_file?: string;
  error?: string;
  created_at: string | Date;
  completed_at?: string | Date;
}

@Injectable()
export class NotificationService {
  private readonly reportServiceUrl = getReportServiceUrl();

  constructor(private readonly executionService: ExecutionService) {}

  async list(
    query: NotificationListQueryDto,
    requester?: AuthenticatedRequest['user'] | RequestUserContext
  ): Promise<NotificationListResponseDto> {
    const limit = Math.max(query.limit || 20, 1);
    const shouldIncludeExecution = !query.source || query.source === 'execution';
    const shouldIncludeReport = !query.source || query.source === 'report';

    const [executionItems, reportItems] = await Promise.all([
      shouldIncludeExecution
        ? this.listExecutionNotifications(limit, requester)
        : Promise.resolve([]),
      shouldIncludeReport ? this.listReportNotifications(limit) : Promise.resolve([]),
    ]);

    const items = [...executionItems, ...reportItems].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    );

    const filteredItems = query.requiresActionOnly
      ? items.filter((item) => item.requiresAction)
      : items;

    return {
      items: filteredItems.slice(0, limit),
      total: filteredItems.length,
    };
  }

  private async listExecutionNotifications(
    limit: number,
    requester?: AuthenticatedRequest['user'] | RequestUserContext
  ): Promise<AppNotificationDto[]> {
    const result = await this.executionService.list(
      {
        page: 1,
        pageSize: Math.max(limit * 5, 100),
      },
      requester
    );

    return result.data
      .filter((execution) => this.isRelevantExecutionStatus(execution.status))
      .map((execution) => {
        const category = this.resolveExecutionCategory(execution.status);
        const severity = this.resolveExecutionSeverity(execution.status);
        const timestamp =
          execution.endedAt || execution.updatedAt || execution.startedAt || execution.createdAt;

        return {
          id: `execution:${execution.id}`,
          dedupeKey: `execution:${execution.id}`,
          source: 'execution',
          sourceId: execution.id,
          sourceName: execution.skillId,
          severity,
          category,
          status: execution.status,
          stateKey: execution.status,
          timestamp,
          unread: false,
          requiresAction: this.isExecutionActionRequired(execution.status),
          actionUrl: `/executions?executionId=${encodeURIComponent(execution.id)}`,
          metadata: {
            executionId: execution.id,
            skillId: execution.skillId,
            failureReason: execution.failureReason || undefined,
            takeoverReason: execution.takeoverReason || undefined,
            approvalStatus: execution.approvalStatus as ApprovalStatus | undefined,
            resultTitle: execution.normalizedResult?.title || undefined,
            resultSummary:
              execution.normalizedResult?.envelope?.presentation?.notificationSummary ||
              execution.normalizedResult?.detailText ||
              execution.normalizedResult?.summary ||
              execution.normalizedResult?.body ||
              undefined,
            downloadUrl: execution.normalizedResult?.downloadUrl || undefined,
            temporalLink: execution.normalizedResult?.temporalLink || undefined,
            hasBusinessResult: execution.normalizedResult?.hasBusinessResult || undefined,
            normalizedResult: this.pickNotificationNormalizedResult(
              execution.normalizedResult || undefined
            ),
          },
        } satisfies AppNotificationDto;
      })
      .sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
  }

  private pickNotificationNormalizedResult(
    result?: {
      resultType?: string;
      title?: string;
      summary?: string;
      body?: string;
      detailText?: string;
      envelope?: {
        presentation?: {
          notificationSummary?: string;
        };
      };
      artifacts?: Array<{
        type?: string;
        name?: string;
        label?: string;
        downloadUrl?: string;
        url?: string;
        path?: string;
        mimeType?: string;
      }>;
      downloadUrl?: string;
      temporalLink?: string;
      hasBusinessResult?: boolean;
    } | null
  ): NotificationNormalizedResult | undefined {
    if (!result) {
      return undefined;
    }

    const artifacts = (result.artifacts || [])
      .slice(0, 3)
      .map((artifact) => ({
        type: artifact.type,
        name: artifact.name,
        label: artifact.label,
        downloadUrl: artifact.downloadUrl,
        url: artifact.url,
        path: artifact.path,
        mimeType: artifact.mimeType,
      }))
      .filter(
        (artifact) => artifact.downloadUrl || artifact.url || artifact.name || artifact.label
      );

    const normalizedResult: NotificationNormalizedResult = {
      resultType: result.resultType || undefined,
      title: result.title || undefined,
      summary: result.envelope?.presentation?.notificationSummary || result.summary || undefined,
      body: result.body || undefined,
      detailText: result.detailText || undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      downloadUrl: result.downloadUrl || undefined,
      temporalLink: result.temporalLink || undefined,
      hasBusinessResult: result.hasBusinessResult || undefined,
    };

    return Object.values(normalizedResult).some((value) => value !== undefined)
      ? normalizedResult
      : undefined;
  }

  private async listReportNotifications(limit: number): Promise<AppNotificationDto[]> {
    const response = await axios.get<{ reports: ReportNotificationSource[] }>(
      `${this.reportServiceUrl}/reports`,
      {
        timeout: 30000,
      }
    );

    return (response.data.reports || [])
      .filter((report) => ['completed', 'failed'].includes(report.status))
      .map((report) => {
        const timestampSource = report.completed_at || report.created_at;
        const timestamp = new Date(timestampSource).toISOString();

        return {
          id: `report:${report.id}`,
          dedupeKey: `report:${report.id}`,
          source: 'report',
          sourceId: report.id,
          sourceName: report.template_id,
          severity: report.status === 'completed' ? 'success' : 'error',
          category: report.status === 'completed' ? 'completed' : 'failed',
          status: report.status,
          stateKey: report.status,
          timestamp,
          unread: false,
          requiresAction: false,
          actionUrl: `/reports/${encodeURIComponent(report.id)}`,
          metadata: {
            reportId: report.id,
            templateId: report.template_id,
            sessionId: report.session_id,
            resultFile: report.result_file,
            error: report.error,
          },
        } satisfies AppNotificationDto;
      })
      .sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      )
      .slice(0, Math.max(limit * 2, 20));
  }

  private isRelevantExecutionStatus(status: ExecutionStatus): boolean {
    return [
      'waiting_input',
      'pending_approval',
      'human_control',
      'succeeded',
      'failed',
      'cancelled',
    ].includes(status);
  }

  private isExecutionActionRequired(status: ExecutionStatus): boolean {
    return ['waiting_input', 'pending_approval', 'human_control'].includes(status);
  }

  private resolveExecutionCategory(status: ExecutionStatus): NotificationCategory {
    switch (status) {
      case 'succeeded':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'waiting_input':
        return 'waiting_input';
      case 'pending_approval':
        return 'pending_approval';
      case 'human_control':
        return 'human_control';
      default:
        return 'status_update';
    }
  }

  private resolveExecutionSeverity(status: ExecutionStatus): NotificationSeverity {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
      case 'human_control':
        return 'error';
      case 'cancelled':
      case 'waiting_input':
      case 'pending_approval':
        return 'warning';
      default:
        return 'info';
    }
  }
}
