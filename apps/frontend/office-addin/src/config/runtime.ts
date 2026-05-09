/// <reference types="vite/client" />

import {
  DEFAULT_OFFICE_ADDIN_API_BASE_URL,
  DEFAULT_OFFICE_ADDIN_BASE_URL,
} from './defaults';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const officeAddinRuntimeConfig = {
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_OFFICE_ADDIN_API_BASE_URL),
  addinBaseUrl: trimTrailingSlash(import.meta.env.VITE_ADDIN_BASE_URL || DEFAULT_OFFICE_ADDIN_BASE_URL),
};
