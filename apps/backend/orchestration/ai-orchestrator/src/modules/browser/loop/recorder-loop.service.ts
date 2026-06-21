import { Injectable } from '@nestjs/common';
import { BrowserCommand } from '../intent/browser-command.service';
import { RecorderLoopExportService } from './recorder-loop-export.service';
import { RecorderLoopLocatorService } from './recorder-loop-locator.service';
import { RecorderLoopStateService } from './recorder-loop-state.service';
import {
  LoopScope,
  RecorderControlTokenStateLike,
  RecorderLoopDraftState,
  RecorderObservationLike,
  RecorderSessionLike,
  TemplateStepLike,
} from './recorder-loop.types';

@Injectable()
export class RecorderLoopService {
  constructor(
    private readonly stateService: RecorderLoopStateService = new RecorderLoopStateService(),
    private readonly locatorService: RecorderLoopLocatorService = new RecorderLoopLocatorService(),
    private readonly exportService: RecorderLoopExportService = new RecorderLoopExportService(
      locatorService
    )
  ) {}

  extractRecorderControlTokens(message: string): RecorderControlTokenStateLike {
    return this.stateService.extractRecorderControlTokens(message);
  }

  mapLoopScopeToken(scopeLabel?: string): LoopScope {
    return this.stateService.mapLoopScopeToken(scopeLabel);
  }

  ensureLoopDraft(session: RecorderSessionLike, fallbackPageUrl?: string): RecorderLoopDraftState {
    return this.stateService.ensureLoopDraft(session, fallbackPageUrl);
  }

  applyRecorderControlTokensBeforeExecution(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike,
    observation?: RecorderObservationLike
  ): void {
    this.stateService.applyRecorderControlTokensBeforeExecution(session, state, observation);
  }

  applyRecorderControlTokensAfterExecution(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): void {
    this.stateService.applyRecorderControlTokensAfterExecution(session, state);
  }

  finalizeLoopIterationCapture(session: RecorderSessionLike): void {
    this.stateService.finalizeLoopIterationCapture(session);
  }

  buildControlTokenAckReply(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): string {
    return this.stateService.buildControlTokenAckReply(session, state);
  }

  buildRecorderControlHints(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): string[] {
    return this.stateService.buildRecorderControlHints(session, state);
  }

  describeLoopScope(scope: LoopScope): string {
    return this.stateService.describeLoopScope(scope);
  }

  normalizeLoopDraft(
    input: RecorderLoopDraftState,
    fallbackPageUrl?: string
  ): RecorderLoopDraftState {
    return this.stateService.normalizeLoopDraft(input, fallbackPageUrl);
  }

  splitRecordedCommandsForExport(
    session: RecorderSessionLike,
    startUrl: string
  ): { preLoopCommands: BrowserCommand[]; iterationCommands: BrowserCommand[] } {
    return this.exportService.splitRecordedCommandsForExport(session, startUrl);
  }

  getLoopCapturedCommandRange(
    loopDraft?: RecorderLoopDraftState
  ): { startIndex: number; endIndex: number } | undefined {
    return this.exportService.getLoopCapturedCommandRange(loopDraft);
  }

  optimizeTemplateStepsForLoopExport(
    templateSteps?: TemplateStepLike[],
    loopDraft?: RecorderLoopDraftState,
    loopPendingKeyword?: string
  ): TemplateStepLike[] | undefined {
    return this.exportService.optimizeTemplateStepsForLoopExport(
      templateSteps,
      loopDraft,
      loopPendingKeyword
    );
  }

  buildExportLoopDraft(
    loopDraft: RecorderLoopDraftState | undefined,
    templateSteps?: TemplateStepLike[],
    loopPendingKeyword?: string
  ): RecorderLoopDraftState | undefined {
    return this.exportService.buildExportLoopDraft(loopDraft, templateSteps, loopPendingKeyword);
  }

  buildExportLoopEachIteration(
    loopDraft: RecorderLoopDraftState,
    templateSteps?: TemplateStepLike[]
  ): RecorderLoopDraftState['eachIteration'] | undefined {
    return this.exportService.buildExportLoopEachIteration(loopDraft, templateSteps);
  }

  deriveLoopIterationStepIds(
    templateSteps: TemplateStepLike[],
    preferredStepCount?: number
  ): string[] {
    return this.exportService.deriveLoopIterationStepIds(templateSteps, preferredStepCount);
  }

  deriveLoopStopWhen(
    templateSteps: TemplateStepLike[] | undefined,
    loopDraft: RecorderLoopDraftState,
    loopPendingKeyword?: string
  ): RecorderLoopDraftState['stopWhen'] | undefined {
    return this.exportService.deriveLoopStopWhen(templateSteps, loopDraft, loopPendingKeyword);
  }

  deriveLoopPendingKeyword(
    session: RecorderSessionLike,
    loopDraft?: RecorderLoopDraftState
  ): string | undefined {
    return this.exportService.deriveLoopPendingKeyword(session, loopDraft);
  }

  extractRecordedLoopFilterKeyword(commands: BrowserCommand[]): string | undefined {
    return this.exportService.extractRecordedLoopFilterKeyword(commands);
  }

  isBulkPendingLoopGoal(session: RecorderSessionLike, userGoal: string): boolean {
    return this.exportService.isBulkPendingLoopGoal(session, userGoal);
  }

  findLoopIterationEndTemplateStepIndex(
    templateSteps: TemplateStepLike[],
    startIndex: number
  ): number {
    return this.exportService.findLoopIterationEndTemplateStepIndex(templateSteps, startIndex);
  }

  isRecordedDetailEntryCommand(command: BrowserCommand): boolean {
    return this.locatorService.isRecordedDetailEntryCommand(command);
  }

  isReturnToListCommand(command: BrowserCommand): boolean {
    return this.locatorService.isReturnToListCommand(command);
  }

  isReturnToListTemplateStep(step: TemplateStepLike): boolean {
    return this.locatorService.isReturnToListTemplateStep(step);
  }

  containsReturnToListCue(source: string): boolean {
    return this.locatorService.containsReturnToListCue(source);
  }

  isLoopRowTemplateStep(step: TemplateStepLike): boolean {
    return this.locatorService.isLoopRowTemplateStep(step);
  }

  toFirstLoopItemLocator(locatorValue: string, loopPendingKeyword?: string): string | undefined {
    return this.locatorService.toFirstLoopItemLocator(locatorValue, loopPendingKeyword);
  }

  toIndexedLoopItemLocator(
    locatorValue: string,
    rowIndexExpr: string,
    loopPendingKeyword?: string
  ): string | undefined {
    return this.locatorService.toIndexedLoopItemLocator(
      locatorValue,
      rowIndexExpr,
      loopPendingKeyword
    );
  }

  toRowScopedActionSelector(selector: string): string {
    return this.locatorService.toRowScopedActionSelector(selector);
  }

  toLoopCollectionLocator(locatorValue: string): string | undefined {
    return this.locatorService.toLoopCollectionLocator(locatorValue);
  }

  toPendingLoopStopLocator(locatorValue: string): string | undefined {
    return this.locatorService.toPendingLoopStopLocator(locatorValue);
  }
}
