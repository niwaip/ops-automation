import type { ApiClient } from './client.js';
import type {
  CreateReportParams,
  CreateReportTemplateParams,
  GenerateReportResponse,
  Report,
  ReportTemplate,
  UpdateReportTemplateParams,
} from '../types/report.types.js';

export const createReportApi = (client: ApiClient) => ({
  getTemplates: async (): Promise<{ templates: ReportTemplate[] }> =>
    client.get('/report-templates'),
  getTemplate: async (id: string): Promise<ReportTemplate> => client.get(`/report-templates/${id}`),
  createTemplate: async (params: CreateReportTemplateParams): Promise<ReportTemplate> =>
    client.post('/report-templates', params),
  updateTemplate: async (id: string, params: UpdateReportTemplateParams): Promise<ReportTemplate> =>
    client.patch(`/report-templates/${id}`, params),
  deleteTemplate: async (id: string): Promise<{ success: boolean }> =>
    client.delete(`/report-templates/${id}`),
  getReports: async (): Promise<{ reports: Report[] }> => client.get('/reports'),
  getReport: async (id: string): Promise<Report> => client.get(`/reports/${id}`),
  getReportsBySession: async (sessionId: string): Promise<{ reports: Report[] }> =>
    client.get(`/reports/session/${sessionId}`),
  createReport: async (params: CreateReportParams): Promise<GenerateReportResponse> =>
    client.post('/reports', params),
  getReportStatus: async (id: string): Promise<{ id: string; status: string; error?: string }> =>
    client.get(`/reports/${id}/status`),
  getReportDownloadInfo: async (id: string): Promise<{ file_path: string; file_name: string }> =>
    client.get(`/reports/${id}/download`),
});
