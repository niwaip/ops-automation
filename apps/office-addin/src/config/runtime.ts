/// <reference types="vite/client" />

import {
  DEFAULT_OFFICE_ADDIN_API_BASE_URL,
  DEFAULT_OFFICE_ADDIN_AI_ORCHESTRATOR_BASE_URL,
  DEFAULT_OFFICE_ADDIN_BASE_URL,
} from './defaults';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const defaultAddinBaseUrl = trimTrailingSlash(import.meta.env.VITE_ADDIN_BASE_URL || DEFAULT_OFFICE_ADDIN_BASE_URL);
const defaultAiOrchestratorBaseUrl = `${defaultAddinBaseUrl}/proxy/ai-orchestrator`;

export const officeAddinRuntimeConfig = {
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_OFFICE_ADDIN_API_BASE_URL),
  addinBaseUrl: defaultAddinBaseUrl,
  aiOrchestratorBaseUrl: trimTrailingSlash(
    import.meta.env.VITE_AI_ORCHESTRATOR_URL
      || defaultAiOrchestratorBaseUrl
      || DEFAULT_OFFICE_ADDIN_AI_ORCHESTRATOR_BASE_URL
  ),
};
