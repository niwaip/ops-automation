export class RenderResolvedDto {
  templateId?: string;
  skillId?: string;
  publishedSkillId?: string;
  data!: Record<string, any>;
  workflowInputParams?: Record<string, unknown>;
  workflowInputPolicy?: Record<string, unknown>;
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
  outputName?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  prepareLocalizedRenderData?: boolean;
}

export class GenerateRenderDataWithSkillDto {
  templateId?: string;
  skillId?: string;
  skill?: Record<string, unknown>;
  simulatedData?: Record<string, unknown>;
  publishedSkillId?: string;
  workflowInputParams?: Record<string, unknown>;
  workflowInputPolicy?: Record<string, unknown>;
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
  outputName?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  prepareLocalizedRenderData?: boolean;
}
