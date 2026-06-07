export interface SkillParamProperty {
  type: "string" | "number" | "date" | "boolean" | "object" | "json";
  description: string;
  required?: boolean;
  default?: string | number | boolean | Record<string, unknown>;
  extractionPrompt?: string;
}

export interface SkillParamsSchema {
  properties: Record<string, SkillParamProperty>;
  required: string[];
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: SkillParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  executionFlowTemplateIds: string[];
  tools: string[];
  effectiveTools?: string[];
  isActive: boolean;
  isPublished: boolean;
  publishedReleaseId?: string | null;
  publishedReleaseVersion?: number | null;
  publishedReleaseStatus?: string | null;
  publishedDeploymentStatus?: string | null;
  publishedSourceType?: string | null;
}
