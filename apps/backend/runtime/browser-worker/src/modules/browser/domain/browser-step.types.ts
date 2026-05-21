export interface BrowserRuntimeLocator {
  strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'text' | 'css' | 'ref';
  type?: 'role' | 'label' | 'placeholder' | 'testid' | 'text' | 'css' | 'ref';
  value: string;
  expression?: string;
  role?: string;
  name?: string;
  exact?: boolean;
  generatedBy?: 'cli' | 'ai' | 'manual' | 'system';
  confidence?: number;
}

export interface BrowserRuntimeParamBinding {
  name: string;
  source: 'literal' | 'user_input' | 'secret' | 'derived' | 'context';
  required: boolean;
  secret?: boolean;
  value?: unknown;
  description?: string;
}

export interface BrowserCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: BrowserRuntimeLocator;
  assertion?: {
    type: string;
    expected?: unknown;
  };
}

export interface BrowserArtifactRef {
  id: string;
  type: 'screenshot' | 'html' | 'text' | 'trace' | 'video' | 'script';
  path?: string;
  mimeType?: string;
  inlineText?: string;
  createdAt: string;
}

export interface BrowserSnapshotRef {
  id: string;
  type: 'yaml' | 'aria' | 'dom' | 'image';
  path?: string;
  url?: string;
  title?: string;
  createdAt: string;
}

export interface BrowserError {
  code: string;
  message: string;
  retryable?: boolean;
  takeoverSuggested?: boolean;
  raw?: Record<string, unknown>;
}

export interface BrowserActionStep {
  id: string;
  source: 'ai' | 'manual' | 'manual_takeover' | 'imported';
  backend: string;
  action: string;
  status: 'pending' | 'success' | 'error';
  intent?: string;
  runtimeTargetRef?: string;
  locator?: BrowserRuntimeLocator;
  params?: Record<string, unknown>;
  paramBindings?: BrowserRuntimeParamBinding[];
  snapshot?: BrowserSnapshotRef | null;
  artifacts?: BrowserArtifactRef[];
  scriptFragment?: string | null;
  parameterizedScriptFragment?: string | null;
  assertionFragment?: string | null;
  replayable?: boolean;
  replaceableParams?: string[];
  error?: BrowserError;
  timestamp: number;
}
