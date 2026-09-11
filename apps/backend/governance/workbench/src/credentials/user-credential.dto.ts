import { CredentialPayload, MaskedPreview } from './user-credential.crypto';

export type CredentialCategoryType =
  | 'api_key'
  | 'device_key'
  | 'basic_auth'
  | 'bearer_token'
  | 'custom';

export interface CreateUserCredentialDto {
  name: string;
  category: CredentialCategoryType;
  description?: string;
  payload: CredentialPayload;
  expiresAt?: string;
}

export interface UpdateUserCredentialDto {
  name?: string;
  description?: string;
  payload?: CredentialPayload;
  status?: string;
  expiresAt?: string;
}

export interface BindSkillCredentialDto {
  paramName: string;
  credentialId: string;
}

export interface UserCredentialResponseDto {
  id: string;
  userId: string;
  orgId?: string | null;
  name: string;
  category: CredentialCategoryType;
  description?: string | null;
  maskedPreview: MaskedPreview;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  bindingCount?: number;
}

export interface SkillCredentialFieldRequirement {
  paramName: string;
  title: string;
  description?: string;
  credentialCategory: CredentialCategoryType;
  required: boolean;
  boundCredential?: {
    id: string;
    name: string;
    category: CredentialCategoryType;
    maskedPreview: MaskedPreview;
  } | null;
}

export interface SkillCredentialStatusDto {
  skillId: string;
  skillName: string;
  hasCredentialRequirements: boolean;
  isFullyConfigured: boolean;
  fields: SkillCredentialFieldRequirement[];
}

export interface ResolveRuntimeInputRequestDto {
  userId: string;
  skillId?: string;
  inputJson: Record<string, any>;
}

export interface ResolveRuntimeInputResponseDto {
  resolvedInputJson: Record<string, any>;
  injectedParamNames: string[];
}
