// Report Template Types
export type ReportFormat = 'word' | 'excel' | 'pdf';
export type SectionType = 'text' | 'table' | 'image' | 'chart';
export type SectionSource = 'step_result' | 'ai_analysis' | 'static';
export type ValidationFailAction = 'skip' | 'notify' | 'stop';
export type NotificationType = 'email' | 'webhook';
export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

// Section Definition
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

export interface StepFilter {
  actions?: string[];
  success_only?: boolean;
  step_ids?: string[];
}

export interface ReportSection {
  id: string;
  name: string;
  type: SectionType;
  source: SectionSource;
  content?: string; // static content
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

// DTOs
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

export interface CreateReportTemplateDTO {
  name: string;
  format: ReportFormat;
  template_file?: string;
  sections: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
  created_by?: string;
}

export interface UpdateReportTemplateDTO {
  name?: string;
  format?: ReportFormat;
  template_file?: string;
  sections?: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
}

export interface ReportTemplateDTO {
  id: string;
  name: string;
  format: ReportFormat;
  template_file?: string;
  sections: ReportSection[];
  global_config?: ReportTemplateConfig;
  ai_config?: AIConfig;
  notification_config?: NotificationConfig;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

// Report DTOs
export interface CreateReportDTO {
  template_id: string;
  session_id: string;
  params?: Record<string, any>;
}

export interface StepResult {
  step_id: string;
  step_index?: number;
  action: string;
  success: boolean;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
  error?: string;
  timestamp: Date | number;
  metadata?: Record<string, any>;
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

export interface ReportDTO {
  id: string;
  template_id: string;
  session_id: string;
  status: ReportStatus;
  result_file?: string;
  ai_analysis?: AIAnalysisResult[];
  validation_results?: ValidationResult[];
  notifications?: NotificationResult[];
  error?: string;
  created_at: Date;
  completed_at?: Date;
}

export interface GenerateReportResponse {
  report_id: string;
  status: ReportStatus;
  message: string;
}
