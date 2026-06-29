import { Injectable, OnModuleInit } from '@nestjs/common';
import { CapabilityReleaseBuildValidationService } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import { CapabilityReleaseDeploymentService } from '../publisher/capability-release-deployment.service';
import { CapabilityReleasePublishService } from '../publisher/capability-release-publish.service';
import type { CapabilityPublishedSkillRuntimeContext } from '../publisher/release-runtime-binding.service';
import type { CapabilityReleaseRuntimeExecutionOptions } from '../publisher/capability-release-runtime.service';
import { CapabilityReleaseRuntimeService } from '../publisher/capability-release-runtime.service';
import { ReleaseDraftService } from './release-draft.service';
import { ReleaseFacadeContextService } from './release-facade-context.service';
import { ReleaseLifecycleService } from './release-lifecycle.service';
import { ReleaseQueryService } from './release-query.service';
import { CapabilityReleaseManifestService } from './capability-release.manifest.service';
import { CapabilityReleaseSkillDraftService } from '../capability-release-skill-draft.service';
import { CapabilityReleaseAssistService } from '../capability-release-assist.service';
import { CapabilityReleaseAuditService } from '../audit/capability-release-audit.service';
import {
  ApproveCapabilityReleaseDTO,
  AnalyzeFailureDTO,
  AnalyzeFailureResultDTO,
  BridgeRecorderExportDTO,
  BridgeRecorderExportResultDTO,
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilityValidationDTO,
  CreateCapabilityBuildDTO,
  CreateCapabilityReleaseDTO,
  DeployCapabilityReleaseDTO,
  DeploymentRecordDTO,
  ExecuteCapabilityRuntimeDTO,
  ExecuteCapabilityRuntimeResultDTO,
  GenerateSkillDraftDTO,
  PublishSkillDraftDTO,
  ReleaseAuditEventDTO,
  RollbackCapabilityReleaseDTO,
  SkillDraftDTO,
  SuggestReleaseWizardAssistDTO,
  SuggestReleaseWizardAssistResultDTO,
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
  ValidateCapabilityDTO,
} from '../interfaces';
import type { ReleaseManifest } from '@ops/backend-release-manifest';

@Injectable()
export class CapabilityReleaseService implements OnModuleInit {
  constructor(
    private readonly capabilityReleaseBuildValidationService: CapabilityReleaseBuildValidationService,
    private readonly capabilityReleaseDeploymentService: CapabilityReleaseDeploymentService,
    private readonly capabilityReleaseAssistService: CapabilityReleaseAssistService,
    private readonly capabilityReleasePublishService: CapabilityReleasePublishService,
    private readonly capabilityReleaseRuntimeService: CapabilityReleaseRuntimeService,
    private readonly releaseDraftService: ReleaseDraftService,
    private readonly releaseFacadeContextService: ReleaseFacadeContextService,
    private readonly releaseLifecycleService: ReleaseLifecycleService,
    private readonly releaseQueryService: ReleaseQueryService,
    private readonly capabilityReleaseManifestService: CapabilityReleaseManifestService,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService,
    private readonly capabilityReleaseAuditService: CapabilityReleaseAuditService
  ) {}

  async onModuleInit() {
    await this.releaseFacadeContextService.ensureInfrastructure();
  }

  private createQueryAccessors() {
    return this.releaseFacadeContextService.createQueryAccessors();
  }

  private createLifecycleAccessors() {
    return this.releaseFacadeContextService.createLifecycleAccessors();
  }

  private createRuntimeAccessors() {
    return this.releaseFacadeContextService.createRuntimeAccessors();
  }

  private createDraftAccessors() {
    return this.releaseFacadeContextService.createDraftAccessors();
  }

  private createBuildValidationAccessors() {
    return this.releaseFacadeContextService.createBuildValidationAccessors();
  }

  private createPublishAccessors() {
    return this.releaseFacadeContextService.createPublishAccessors();
  }

  private createDeploymentAccessors() {
    return this.releaseFacadeContextService.createDeploymentAccessors();
  }

  private createAssistAccessors() {
    return this.releaseFacadeContextService.createAssistAccessors();
  }

  private queryCapabilityDetail(id: string) {
    return this.releaseQueryService.getCapabilityDetail(id, this.createQueryAccessors());
  }

  private queryPublishedCapabilityDetail(id: string) {
    return this.releaseQueryService.getPublishedCapabilityDetail(id, this.createQueryAccessors());
  }

  private queryCurrentSkillDraft(id: string) {
    return this.releaseQueryService.getCurrentSkillDraft(id, this.createQueryAccessors());
  }

  private executeCapabilityRuntimeFacade(dto: ExecuteCapabilityRuntimeDTO, userId?: string) {
    return this.capabilityReleaseRuntimeService.executeCapabilityRuntime(
      dto,
      userId,
      this.createRuntimeAccessors()
    );
  }

  private getPublishedSkillRuntimeContextFacade(skillId: string) {
    return this.capabilityReleaseRuntimeService.getPublishedSkillRuntimeContext(skillId);
  }

  private executePublishedSkillRuntime(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
    options?: CapabilityReleaseRuntimeExecutionOptions
  ) {
    return this.capabilityReleaseRuntimeService.executePublishedSkill(
      skillId,
      input,
      userId,
      options,
      this.createRuntimeAccessors()
    );
  }

  private createCapabilityDraft(dto: CreateCapabilityReleaseDTO, userId?: string) {
    return this.releaseDraftService.createCapability(dto, userId, this.createDraftAccessors());
  }

  private updateCapabilitySourceDraft(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ) {
    return this.releaseDraftService.updateSource(id, dto, userId, this.createDraftAccessors());
  }

  private buildCapabilityRelease(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId?: string
  ) {
    return this.capabilityReleaseBuildValidationService.build(
      id,
      dto,
      userId,
      this.createBuildValidationAccessors()
    );
  }

  private buildCapabilityReleaseStream(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void
  ) {
    return this.capabilityReleaseBuildValidationService.buildStream(
      id,
      dto,
      userId,
      onEvent,
      this.createBuildValidationAccessors()
    );
  }

  private validateCapabilityReleaseStatic(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string
  ) {
    return this.capabilityReleaseBuildValidationService.validateStatic(
      id,
      dto,
      userId,
      this.createBuildValidationAccessors()
    );
  }

  private validateCapabilityReleaseSandbox(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
    authToken?: string
  ) {
    return this.capabilityReleaseBuildValidationService.validateSandbox(
      id,
      dto,
      userId,
      authToken,
      this.createBuildValidationAccessors()
    );
  }

  private validateCapabilityReleaseSandboxStream(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void
  ) {
    return this.capabilityReleaseBuildValidationService.validateSandboxStream(
      id,
      dto,
      userId,
      onEvent,
      this.createBuildValidationAccessors()
    );
  }

  private generateCapabilitySkillDraft(
    id: string,
    dto: GenerateSkillDraftDTO,
    userId?: string
  ) {
    return this.capabilityReleaseBuildValidationService.generateSkillDraft(
      id,
      dto,
      userId,
      this.createBuildValidationAccessors()
    );
  }

  private publishBridgeRecorderExport(dto: BridgeRecorderExportDTO, userId?: string) {
    return this.capabilityReleasePublishService.bridgeRecorderExport(
      dto,
      userId,
      this.createPublishAccessors()
    );
  }

  private updatePublishedSkillDraft(
    id: string,
    dto: UpdateSkillDraftDTO,
    userId?: string
  ) {
    return this.capabilityReleasePublishService.updateSkillDraft(
      id,
      dto,
      userId,
      this.createPublishAccessors()
    );
  }

  private approveCapabilityReleasePublication(
    id: string,
    dto: ApproveCapabilityReleaseDTO,
    userId?: string
  ) {
    return this.capabilityReleasePublishService.approveRelease(
      id,
      dto,
      userId,
      this.createPublishAccessors()
    );
  }

  private publishCapabilitySkillDraft(
    id: string,
    dto: PublishSkillDraftDTO,
    userId?: string
  ) {
    return this.capabilityReleasePublishService.publishSkill(
      id,
      dto,
      userId,
      this.createPublishAccessors()
    );
  }

  private deployCapabilityRelease(
    id: string,
    dto: DeployCapabilityReleaseDTO,
    userId?: string
  ) {
    return this.capabilityReleaseDeploymentService.deploy(
      id,
      dto,
      userId,
      this.createDeploymentAccessors()
    );
  }

  private listCapabilityDeployments(id: string) {
    return this.capabilityReleaseDeploymentService.getDeployments(
      id,
      this.createDeploymentAccessors()
    );
  }

  private rollbackCapabilityRelease(
    id: string,
    dto: RollbackCapabilityReleaseDTO,
    userId?: string
  ) {
    return this.capabilityReleaseDeploymentService.rollback(
      id,
      dto,
      userId,
      this.createDeploymentAccessors()
    );
  }

  private analyzeCapabilityReleaseFailure(
    id: string,
    dto: AnalyzeFailureDTO,
    userId?: string
  ) {
    return this.capabilityReleaseAssistService.analyzeFailure(
      id,
      dto,
      userId,
      this.createAssistAccessors()
    );
  }

  private suggestCapabilityReleaseWizardAssist(
    id: string,
    dto: SuggestReleaseWizardAssistDTO,
    userId?: string
  ) {
    return this.capabilityReleaseAssistService.suggestWizardAssist(
      id,
      dto,
      userId,
      this.createAssistAccessors()
    );
  }

  async listReleases(): Promise<CapabilityReleaseDTO[]> {
    return this.releaseQueryService.listReleases();
  }

  async listPublishedCapabilities(): Promise<CapabilityReleaseDTO[]> {
    return this.releaseQueryService.listPublishedCapabilities();
  }

  async getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.queryCapabilityDetail(id);
  }

  async getPublishedCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.queryPublishedCapabilityDetail(id);
  }

  async getReleaseManifest(id: string): Promise<ReleaseManifest> {
    const detail = await this.queryPublishedCapabilityDetail(id);
    return this.capabilityReleaseManifestService.buildManifest(detail);
  }

  async archiveCapability(
    id: string,
    userId?: string
  ): Promise<{ success: true; archivedId: string }> {
    return this.releaseLifecycleService.archiveCapability(
      id,
      userId,
      this.createLifecycleAccessors()
    );
  }

  async executeCapabilityRuntime(
    dto: ExecuteCapabilityRuntimeDTO,
    userId?: string
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    return this.executeCapabilityRuntimeFacade(dto, userId);
  }

  async getPublishedSkillRuntimeContext(
    skillId: string
  ): Promise<CapabilityPublishedSkillRuntimeContext> {
    return this.getPublishedSkillRuntimeContextFacade(skillId);
  }

  async executePublishedSkill(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
    options?: CapabilityReleaseRuntimeExecutionOptions
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    return this.executePublishedSkillRuntime(skillId, input, userId, options);
  }

  async createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.createCapabilityDraft(dto, userId);
  }

  async bridgeRecorderExport(
    dto: BridgeRecorderExportDTO,
    userId?: string
  ): Promise<BridgeRecorderExportResultDTO> {
    return this.publishBridgeRecorderExport(dto, userId);
  }

  async updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.updateCapabilitySourceDraft(id, dto, userId);
  }

  async build(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId?: string
  ): Promise<{ release: CapabilityReleaseDTO; build: CapabilityBuildDTO }> {
    return this.buildCapabilityRelease(id, dto, userId);
  }

  async buildStream(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void
  ): Promise<void> {
    return this.buildCapabilityReleaseStream(id, dto, userId, onEvent);
  }

  async validateStatic(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    return this.validateCapabilityReleaseStatic(id, dto, userId);
  }

  async validateSandbox(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
    authToken?: string
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    return this.validateCapabilityReleaseSandbox(id, dto, userId, authToken);
  }

  async validateSandboxStream(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    _authToken: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void
  ): Promise<void> {
    return this.validateCapabilityReleaseSandboxStream(id, dto, userId, onEvent);
  }

  async generateSkillDraft(
    id: string,
    dto: GenerateSkillDraftDTO,
    userId?: string
  ): Promise<{ release: CapabilityReleaseDTO; skillDraft: SkillDraftDTO }> {
    return this.generateCapabilitySkillDraft(id, dto, userId);
  }

  async getCurrentSkillDraft(id: string): Promise<SkillDraftDTO> {
    return this.queryCurrentSkillDraft(id);
  }

  async updateSkillDraft(
    id: string,
    dto: UpdateSkillDraftDTO,
    userId?: string
  ): Promise<SkillDraftDTO> {
    return this.updatePublishedSkillDraft(id, dto, userId);
  }

  async approveRelease(
    id: string,
    dto: ApproveCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.approveCapabilityReleasePublication(id, dto, userId);
  }

  async publishSkill(
    id: string,
    dto: PublishSkillDraftDTO,
    userId?: string
  ): Promise<{ release: CapabilityReleaseDTO; publishedSkillId: string }> {
    return this.publishCapabilitySkillDraft(id, dto, userId);
  }

  async deploy(
    id: string,
    dto: DeployCapabilityReleaseDTO,
    userId?: string
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO }> {
    return this.deployCapabilityRelease(id, dto, userId);
  }

  async getDeployments(id: string): Promise<DeploymentRecordDTO[]> {
    return this.listCapabilityDeployments(id);
  }

  async getAuditEvents(id: string): Promise<ReleaseAuditEventDTO[]> {
    await this.releaseFacadeContextService.getReleaseOrThrow(id);
    return this.capabilityReleaseAuditService.getAuditEvents(id);
  }

  async rollback(
    id: string,
    dto: RollbackCapabilityReleaseDTO,
    userId?: string
  ): Promise<{
    release: CapabilityReleaseDTO;
    deployment: DeploymentRecordDTO;
    targetReleaseId: string;
  }> {
    return this.rollbackCapabilityRelease(id, dto, userId);
  }

  async analyzeFailure(
    id: string,
    dto: AnalyzeFailureDTO,
    userId?: string
  ): Promise<AnalyzeFailureResultDTO> {
    return this.analyzeCapabilityReleaseFailure(id, dto, userId);
  }

  async suggestWizardAssist(
    id: string,
    dto: SuggestReleaseWizardAssistDTO,
    userId?: string
  ): Promise<SuggestReleaseWizardAssistResultDTO> {
    return this.suggestCapabilityReleaseWizardAssist(id, dto, userId);
  }
}
