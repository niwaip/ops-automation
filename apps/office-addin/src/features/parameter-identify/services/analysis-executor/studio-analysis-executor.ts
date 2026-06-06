import { carboneAPI } from '../../../../api/carbone-api';
import type {
  AnalysisExecutorKind,
  ResolveAnalysisExecutorOptions,
  StructuredAnalysisExecutor,
  StructuredAnalyzeRequest,
} from './types';

export class StudioAnalysisExecutor implements StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind = 'studio';
  supportsThinking = false;

  constructor(
    public readonly requestedKind: AnalysisExecutorKind,
    private readonly options: ResolveAnalysisExecutorOptions,
    public readonly fallbackReason?: string
  ) {}

  async analyze(request: StructuredAnalyzeRequest): Promise<any> {
    carboneAPI.setBaseUrl(this.options.apiBaseUrl);
    return this.options.useMultiStage
      ? await carboneAPI.identifyDocumentMultiStage(request)
      : await carboneAPI.identifyDocumentDirect(request);
  }
}
