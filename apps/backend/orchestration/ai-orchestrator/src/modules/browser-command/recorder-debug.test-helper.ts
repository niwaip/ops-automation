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
  './browser-command.service',
  () => ({
    BrowserCommandService: class {},
  }),
  { virtual: true }
);

jest.mock(
  '../model/model.service',
  () => ({
    ModelService: class {},
  }),
  { virtual: true }
);

jest.mock(
  '../redis/redis.service',
  () => ({
    RedisService: class {},
  }),
  { virtual: true }
);

import { RecorderDebugService } from './recorder-debug.service';
import { BrowserActionValidatorService } from './browser-action-validator.service';
import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderConditionalBranchService } from './recorder-conditional-branch.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import { RecorderDebugObservationRefreshService } from './recorder-debug-observation-refresh.service';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugSessionCoordinatorService } from './recorder-debug-session-coordinator.service';
import { RecorderDebugSessionStoreService } from './recorder-debug-session-store.service';
import { RecorderExportAssemblyService } from './recorder-export-assembly.service';
import { RecorderDisambiguationService } from './recorder-disambiguation.service';
import { RecorderExportService } from './recorder-export.service';
import { RecorderLoopService } from './recorder-loop.service';
import { RecorderObservationService } from './recorder-observation.service';
import { RecorderParameterService } from './recorder-parameter.service';
import { RecorderScriptExportService } from './recorder-script-export.service';
import { RecorderSnapshotService } from './recorder-snapshot.service';
import { RecorderStructureProbeService } from './recorder-structure-probe.service';
import { RecorderTemplateExportService } from './recorder-template-export.service';

export const createService = (overrides?: {
  browserCommandService?: Record<string, unknown>;
  modelService?: Record<string, unknown>;
  redisService?: Record<string, unknown>;
  recorderDebugSessionCoordinatorService?: RecorderDebugSessionCoordinatorService;
  recorderDebugSessionStoreService?: RecorderDebugSessionStoreService;
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
  const recorderLoopService = overrides?.recorderLoopService || new RecorderLoopService();
  const recorderDisambiguationService =
    overrides?.recorderDisambiguationService || new RecorderDisambiguationService();
  const recorderDebugChatSupportService =
    overrides?.recorderDebugChatSupportService ||
    new RecorderDebugChatSupportService(recorderDisambiguationService);
  const browserExecutionControllerService = new BrowserExecutionControllerService(
    recorderDebugChatSupportService
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

  return new RecorderDebugService(
    (overrides?.browserCommandService || {}) as any,
    (overrides?.modelService || {}) as any,
    overrides?.recorderConditionalBranchService ||
      new RecorderConditionalBranchService((overrides?.branchAnalysisService || {}) as any),
    recorderDebugSessionCoordinatorService,
    (overrides?.executionReconcileService || {}) as any,
    recorderLoopService,
    overrides?.recorderExportAssemblyService ||
      new RecorderExportAssemblyService(
        (overrides?.modelService || {}) as any,
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
    overrides?.recorderDebugChatExecutionService ||
      new RecorderDebugChatExecutionService(browserExecutionControllerService),
    overrides?.recorderDebugExecutionService ||
      new RecorderDebugExecutionService(
        browserActionValidatorService,
        recorderDebugChatSupportService,
        recorderObservationService,
        recorderSnapshotService,
        recorderStructureProbeService
      ),
    overrides?.recorderDebugObservationRefreshService ||
      new RecorderDebugObservationRefreshService(),
    overrides?.recorderDebugResponseService || new RecorderDebugResponseService(),
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
