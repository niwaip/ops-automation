jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Logger: class {
      log() {}
      warn() {}
      error() {}
      debug() {}
    },
  }),
  { virtual: true }
);

jest.mock(
  '../../model/model.service',
  () => ({
    ModelService: class {},
  }),
  { virtual: true }
);

import { BrowserCommandService } from './browser-command.service';
import { BrowserCommandLoginService } from './profiles/browser-command-login.service';
import { BrowserCommandNavigationService } from './profiles/browser-command-navigation.service';
import { BrowserCommandReadService } from './profiles/browser-command-read.service';
import { BrowserCommandActionService } from './profiles/browser-command-action.service';
import { BrowserCommandSearchService } from './profiles/browser-command-search.service';
import { BrowserCommandFieldFillService } from './profiles/browser-command-field-fill.service';
import { TableRegionResolverService } from './atomic-parsers/table-region-resolver.service';
import { BrowserCommandAtomicService } from './atomic-parsers/browser-command-atomic.service';

import { BrowserCommandSequentialService } from './atomic-parsers/browser-command-sequential.service';
import { BrowserCommandSemanticLogService } from './browser-command-semantic-log.service';
import { BrowserCommandSemanticRuntimeService } from './browser-command-semantic-runtime.service';
import { BrowserCommandContextNormalizerService } from './atomic-parsers/browser-command-context-normalizer.service';
import { BrowserCommandClickContextService } from './atomic-parsers/browser-command-click-context.service';
import { BrowserCandidateContextFormatter } from './browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './ai-planner/browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './ai-planner/browser-planner-response.parser';
import { BrowserExecutionPlannerService } from './ai-planner/browser-execution-planner.service';
import type { BrowserSemanticsClient } from '../../../client/browser-semantics.client';

type ModelOverrides = Partial<{ listModels: jest.Mock; callModel: jest.Mock }>;
type CreateServiceOptions = {
  modelOverrides?: ModelOverrides;
  browserSemanticsOverrides?: Partial<{
    resolveRuntimeRuleSet: jest.Mock;
    createHitLog: jest.Mock;
    createErrorLog: jest.Mock;
  }>;
};
export const createService = (optionsOrModelOverrides?: ModelOverrides | CreateServiceOptions) => {
  const options: CreateServiceOptions =
    optionsOrModelOverrides &&
    ('modelOverrides' in optionsOrModelOverrides ||
      'browserSemanticsOverrides' in optionsOrModelOverrides)
      ? (optionsOrModelOverrides as CreateServiceOptions)
      : { modelOverrides: optionsOrModelOverrides as ModelOverrides | undefined };
  const modelService = {
    getPreferredDefaultModel: jest.fn().mockReturnValue(null),
    getDefaultModel: jest.fn().mockReturnValue(null),
    listModels: options?.modelOverrides?.listModels || jest.fn().mockResolvedValue([]),
    callModel: options?.modelOverrides?.callModel || jest.fn(),
  } as any;
  const candidateFormatter = new BrowserCandidateContextFormatter();
  const promptBuilder = new BrowserPlannerPromptBuilder(candidateFormatter);
  const responseParser = new BrowserPlannerResponseParser();
  const plannerService = new BrowserExecutionPlannerService(
    modelService,
    promptBuilder,
    responseParser
  );
  const browserSemanticsClient = {
    resolveRuntimeRuleSet:
      options?.browserSemanticsOverrides?.resolveRuntimeRuleSet ||
      jest.fn().mockResolvedValue(null),
    createHitLog:
      options?.browserSemanticsOverrides?.createHitLog || jest.fn().mockResolvedValue(undefined),
    createErrorLog:
      options?.browserSemanticsOverrides?.createErrorLog || jest.fn().mockResolvedValue(undefined),
  } as unknown as BrowserSemanticsClient;
  const browserCommandSemanticLogService = new BrowserCommandSemanticLogService(
    browserSemanticsClient
  );
  const browserCommandSemanticRuntimeService = new BrowserCommandSemanticRuntimeService(
    browserSemanticsClient
  );
  const browserCommandContextNormalizerService = new BrowserCommandContextNormalizerService();
  const browserCommandClickContextService = new BrowserCommandClickContextService(
    browserCommandContextNormalizerService,
    new TableRegionResolverService(modelService)
  );

  return new BrowserCommandService(
    plannerService,
    new BrowserCommandLoginService(),
    new BrowserCommandNavigationService(),
    new BrowserCommandReadService(),
    new BrowserCommandActionService(),
    new BrowserCommandSearchService(),
    new BrowserCommandFieldFillService(),
    new BrowserCommandAtomicService(),
    new BrowserCommandSequentialService(
      new BrowserCommandNavigationService(),
      new BrowserCommandSearchService()
    ),
    browserCommandSemanticLogService,
    browserCommandSemanticRuntimeService,
    browserCommandContextNormalizerService,
    browserCommandClickContextService
  );
};
