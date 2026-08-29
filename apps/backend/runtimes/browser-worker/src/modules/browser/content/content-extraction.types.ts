import type { CaptureProfileV1 } from '@ops/backend-browser-execution-contract';

export type ExtractedBrowserContent = {
  text: string;
  title?: string;
  excerpt?: string;
  profile: CaptureProfileV1['profile'];
  method: 'readability' | 'semantic-main' | 'density' | 'visible-text' | 'none';
  confidence: number;
  fallbackLevel: number;
  truncated: boolean;
  activeContentRemoved: boolean;
  suspectedPromptInjection: boolean;
};
