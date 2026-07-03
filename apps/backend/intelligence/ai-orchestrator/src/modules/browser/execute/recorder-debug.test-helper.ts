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
  '../intent',
  () => ({
    BrowserCommandService: class {},
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

jest.mock(
  '../../redis/redis.service',
  () => ({
    RedisService: class {},
  }),
  { virtual: true }
);

import { RecorderDebugService, RecorderDebugBranchFacade } from './recorder';
import { RecorderDebugObservationFacade } from './observation';
import { RecorderDebugSessionFacade } from './session';
import { BrowserActionValidatorService } from '../intent/atomic-parsers/browser-action-validator.service';
import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderConditionalBranchService, RecorderLoopService } from '../loop';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import {
  RecorderDebugObservationRefreshService,
  RecorderObservationService,
  RecorderSnapshotService,
  RecorderSnapshotReuseService,
  RecorderTargetResolutionReuseService,
  RecorderStructureProbeService,
} from '../observe';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugOutcomeService } from './recorder-debug-outcome.service';
import {
  RecorderDebugSessionCoordinatorService,
  RecorderDebugSessionStoreService,
} from '../session';
import {
  RecorderExportAssemblyService,
  RecorderExportService,
  RecorderScriptExportService,
  RecorderTemplateExportService,
} from '../export';
import { RecorderDisambiguationService } from '../intent/recorder-disambiguation.service';
import { RecorderParameterService } from '../intent/recorder-parameter.service';

export const createService = (overrides?: {
  browserCommandService?: Record<string, unknown>;
  browserSemanticsClient?: Record<string, unknown>;
  modelService?: Record<string, unknown>;
  redisService?: Record<string, unknown>;
  recorderDebugSessionCoordinatorService?: RecorderDebugSessionCoordinatorService;
  recorderDebugSessionStoreService?: RecorderDebugSessionStoreService;
  recorderDebugSessionFacade?: RecorderDebugSessionFacade;
  recorderDebugBranchFacade?: RecorderDebugBranchFacade;
  recorderDebugObservationFacade?: RecorderDebugObservationFacade;
  executionReconcileService?: Record<string, unknown>;
  branchAnalysisService?: Record<string, unknown>;
  recorderLoopService?: RecorderLoopService;
  recorderExportService?: RecorderExportService;
  recorderExportAssemblyService?: RecorderExportAssemblyService;
  recorderDebugChatExecutionService?: RecorderDebugChatExecutionService;
  recorderDebugChatFlowService?: RecorderDebugChatFlowService;
  recorderDebugChatSupportService?: RecorderDebugChatSupportService;
  recorderConditionalBranchService?: RecorderConditionalBranchService;
  recorderDebugExecutionService?: RecorderDebugExecutionService;
  recorderDebugObservationRefreshService?: RecorderDebugObservationRefreshService;
  recorderDebugResponseService?: RecorderDebugResponseService;
  recorderDisambiguationService?: RecorderDisambiguationService;
  recorderObservationService?: RecorderObservationService;
  recorderSnapshotService?: RecorderSnapshotService;
  recorderStructureProbeService?: RecorderStructureProbeService;
  browserActionValidatorService?: BrowserActionValidatorService;
  recorderParameterService?: RecorderParameterService;
  recorderScriptExportService?: RecorderScriptExportService;
  recorderTemplateExportService?: RecorderTemplateExportService;
}) => {
  const modelService =
    overrides?.modelService ||
    ({
      getPreferredDefaultModel: jest.fn().mockReturnValue(undefined),
      callModel: jest.fn().mockResolvedValue({ content: '' }),
    } as any);
  const recorderLoopService = overrides?.recorderLoopService || new RecorderLoopService();
  const recorderDisambiguationService =
    overrides?.recorderDisambiguationService || new RecorderDisambiguationService();
  const recorderDebugChatSupportService =
    overrides?.recorderDebugChatSupportService ||
    new RecorderDebugChatSupportService(recorderDisambiguationService);
  const browserExecutionControllerService = new BrowserExecutionControllerService(
    recorderDebugChatSupportService,
    {
      createErrorLog: jest.fn().mockResolvedValue(undefined),
    } as any
  );
  const recorderObservationService =
    overrides?.recorderObservationService || new RecorderObservationService();
  const recorderSnapshotService =
    overrides?.recorderSnapshotService || new RecorderSnapshotService();
  const recorderStructureProbeService =
    overrides?.recorderStructureProbeService || new RecorderStructureProbeService();
  const browserActionValidatorService =
    overrides?.browserActionValidatorService || new BrowserActionValidatorService();
  const recorderDebugSessionCoordinatorService =
    overrides?.recorderDebugSessionCoordinatorService ||
    new RecorderDebugSessionCoordinatorService(
      overrides?.recorderDebugSessionStoreService ||
        new RecorderDebugSessionStoreService((overrides?.redisService || {}) as any)
    );
  const recorderDebugObservationRefreshService =
    overrides?.recorderDebugObservationRefreshService || new RecorderDebugObservationRefreshService();
  const recorderDebugObservationFacade =
    overrides?.recorderDebugObservationFacade ||
    new RecorderDebugObservationFacade(
      modelService,
      recorderObservationService
    );
  const recorderDebugOutcomeService = new RecorderDebugOutcomeService();
  const recorderDebugResponseService =
    overrides?.recorderDebugResponseService ||
    new RecorderDebugResponseService(recorderDebugOutcomeService);
  const recorderDebugChatExecutionService =
    overrides?.recorderDebugChatExecutionService
      ? Object.assign(
          new RecorderDebugChatExecutionService(browserExecutionControllerService),
          overrides.recorderDebugChatExecutionService
        )
      : new RecorderDebugChatExecutionService(browserExecutionControllerService);
  const recorderDebugSessionFacade =
    overrides?.recorderDebugSessionFacade ||
    new RecorderDebugSessionFacade(
      recorderDebugSessionCoordinatorService,
      recorderDebugObservationRefreshService,
      recorderLoopService
    );
  const recorderConditionalBranchService =
    overrides?.recorderConditionalBranchService ||
    new RecorderConditionalBranchService((overrides?.branchAnalysisService || {}) as any);
  const recorderDebugBranchFacade =
    overrides?.recorderDebugBranchFacade ||
    new RecorderDebugBranchFacade(
      recorderConditionalBranchService,
      recorderDebugChatExecutionService,
      recorderDebugResponseService,
      recorderDebugSessionFacade
    );

  return new RecorderDebugService(
    (overrides?.browserCommandService || {}) as any,
    (overrides?.browserSemanticsClient ||
      ({
        createErrorLog: jest.fn().mockResolvedValue(undefined),
      } as any)),
    recorderDebugBranchFacade,
    recorderDebugSessionFacade,
    (overrides?.executionReconcileService || {}) as any,
    recorderLoopService,
    overrides?.recorderExportAssemblyService ||
      new RecorderExportAssemblyService(
        modelService,
        recorderLoopService,
        overrides?.recorderExportService || new RecorderExportService(),
        overrides?.recorderParameterService || new RecorderParameterService(),
        overrides?.recorderScriptExportService || new RecorderScriptExportService(),
        overrides?.recorderTemplateExportService ||
          new RecorderTemplateExportService(
            (overrides?.branchAnalysisService || {}) as any,
            recorderLoopService
          )
      ),
    recorderDebugChatSupportService,
    overrides?.recorderDebugChatFlowService ||
      new RecorderDebugChatFlowService(
        recorderDebugChatSupportService,
        browserActionValidatorService
      ),
    recorderDebugChatExecutionService,
    overrides?.recorderDebugExecutionService ||
      new RecorderDebugExecutionService(
        browserActionValidatorService,
        recorderDebugChatSupportService,
        recorderObservationService,
        recorderSnapshotService,
        new RecorderSnapshotReuseService(),
        new RecorderTargetResolutionReuseService(),
        recorderStructureProbeService
      ),
    recorderDebugResponseService,
    recorderDebugObservationFacade,
    recorderObservationService
  );
};

export const resetRecorderDebugTestEnv = () => {
  jest.clearAllMocks();
  delete process.env.CARBONE_SERVICE_URL;
  delete process.env.CARBONE_EXTERNAL_URL;
  delete process.env.DOCKER_ENV;
  delete process.env.NODE_ENV;
  delete process.env.HOST_IP;
  delete process.env.EXTERNAL_HOST;
};
