import apiClient from './client';

// Types
export type ReportFormat = 'word' | 'excel' | 'pdf';
export type SectionType = 'text' | 'table' | 'image' | 'chart';
export type SectionSource = 'step_result' | 'ai_analysis' | 'static';
export type ValidationFailAction = 'skip' | 'notify' | 'stop';
export type NotificationType = 'email' | 'webhook';
export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface StepFilter {
  actions?: string[];
  success_only?: boolean;
  step_ids?: string[];
}

export interface SectionValidation {
  condition: string;
  on_fail: ValidationFailAction;
  notify_config?: {
    type: NotificationType;
    recipients?: string[];
    webhook_url?: string;
    message_template?: string;
  };
}

export interface SectionFormat {
  title?: string;
  columns?: string[];
  style?: Record<string, any>;
  width?: number;
  height?: number;
}

export interface ReportSection {
  id: string;
  name: string;
  type: SectionType;
  source: SectionSource;
  content?: string;
  step_filter?: StepFilter;
  ai_prompt?: string;
  validation?: SectionValidation;
  format?: SectionFormat;
}

export interface ReportTemplateConfig {
  title?: string;
  header?: string;
  footer?: string;
  page_size?: 'A4' | 'A3' | 'Letter';
  orientation?: 'portrait' | 'landscape';
}

export interface AIConfig {
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface NotificationConfig {
  enabled: boolean;
  type: NotificationType;
  recipients?: string[];
  webhook_url?: string;
  template?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  format: ReportFormat;
  template_file?: string;
  sections: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReportTemplateParams {
  name: string;
  format: ReportFormat;
  template_file?: string;
  sections: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
  created_by?: string;
}

export interface UpdateReportTemplateParams {
  name?: string;
  format?: ReportFormat;
  template_file?: string;
  sections?: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
}

export interface AIAnalysisResult {
  section_id: string;
  analysis: string;
  confidence?: number;
  tokens_used?: number;
}

export interface ValidationResult {
  section_id: string;
  passed: boolean;
  condition?: string;
  message?: string;
}

export interface NotificationResult {
  section_id: string;
  sent: boolean;
  type: NotificationType;
  recipients?: string[];
  error?: string;
}

export interface Report {
  id: string;
  template_id: string;
  session_id: string;
  status: ReportStatus;
  result_file?: string;
  ai_analysis?: AIAnalysisResult[];
  validation_results?: ValidationResult[];
  notifications?: NotificationResult[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface CreateReportParams {
  template_id: string;
  session_id: string;
  params?: Record<string, any>;
}

export interface GenerateReportResponse {
  report_id: string;
  status: ReportStatus;
  message: string;
}

// API functions
export const reportApi = {
  // Report Templates
  async getTemplates(): Promise<{ templates: ReportTemplate[] }> {
    return apiClient.get('/report-templates');
  },

  async getTemplate(id: string): Promise<ReportTemplate> {
    return apiClient.get(`/report-templates/${id}`);
  },

  async createTemplate(params: CreateReportTemplateParams): Promise<ReportTemplate> {
    return apiClient.post('/report-templates', params);
  },

  async updateTemplate(id: string, params: UpdateReportTemplateParams): Promise<ReportTemplate> {
    return apiClient.patch(`/report-templates/${id}`, params);
  },

  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    return apiClient.delete(`/report-templates/${id}`);
  },

  // Reports
  async getReports(): Promise<{ reports: Report[] }> {
    return apiClient.get('/reports');
  },

  async getReport(id: string): Promise<Report> {
    return apiClient.get(`/reports/${id}`);
  },

  async getReportsBySession(sessionId: string): Promise<{ reports: Report[] }> {
    return apiClient.get(`/reports/session/${sessionId}`);
  },

  async createReport(params: CreateReportParams): Promise<GenerateReportResponse> {
    return apiClient.post('/reports', params);
  },

  async getReportStatus(id: string): Promise<{ id: string; status: string; error?: string }> {
    return apiClient.get(`/reports/${id}/status`);
  },

  async getReportDownloadInfo(id: string): Promise<{ file_path: string; file_name: string }> {
    return apiClient.get(`/reports/${id}/download`);
  },
};