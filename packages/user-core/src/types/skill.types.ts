export interface SkillParamProperty {
  type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'json';
  description: string;
  required?: boolean;
  default?: string | number | boolean | Record<string, unknown>;
  enum?: Array<string | number>;
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

export type SkillAccessStatus = 'authorized' | 'requested' | 'unauthorized';

export interface SkillAccessRequest {
  id: string;
  skillId: string;
  requesterUserId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  responseNote?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedSkillCatalogItem extends SkillConfig {
  accessStatus: SkillAccessStatus;
  accessRequest?: SkillAccessRequest | null;
}
