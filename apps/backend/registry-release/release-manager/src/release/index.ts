export {
  ReleaseAccessorFactoryDeps,
  ReleaseAccessorFactoryService,
  ReleaseAssistAccessorDeps,
  ReleaseBuildValidationAccessorDeps,
  ReleaseDeploymentAccessorDeps,
  ReleaseDraftAccessorDeps,
  ReleaseLifecycleAccessorDeps,
  ReleasePublishAccessorDeps,
  ReleaseQueryAccessorDeps,
  ReleaseRuntimeAccessorDeps,
} from './release-accessor-factory.service';
export {
  ReleaseAccessorDepsService,
  ReleaseManagementAccessorDepsSource,
  ReleaseAccessorDepsSource,
  ReleaseRuntimeAccessorDepsSource,
} from './release-accessor-deps.service';
export { ReleaseAccessorSourceService } from './release-accessor-source.service';
export { ReleaseFacadeAccessorFactoryService } from './release-facade-accessor-factory.service';
export { ReleaseAuditAccessorDepsService } from './release-audit-accessor-deps.service';
export { ReleaseFacadeAccessorsService } from './release-facade-accessors.service';
export { ReleaseManagementAccessorSourceService } from './release-management-accessor-source.service';
export { ReleaseManagementFacadeContextService } from './release-management-facade-context.service';
export { ReleaseManagementFacadeAccessorsService } from './release-management-facade-accessors.service';
export { ReleaseAccessorBindingsService } from './release-accessor-bindings.service';
export { ReleaseFacadeAccessorBindingsService } from './release-facade-accessor-bindings.service';
export { ReleaseRuntimeAccessorFactoryService } from './release-runtime-accessor-factory.service';
export { ReleaseRuntimeAccessorSourceService } from './release-runtime-accessor-source.service';
export { ReleaseRuntimeFacadeContextService } from './release-runtime-facade-context.service';
export { ReleaseRuntimeFacadeAccessorsService } from './release-runtime-facade-accessors.service';
export { ReleaseRuntimeAccessorBindingsService } from './release-runtime-accessor-bindings.service';
export {
  ReleaseDraftQueryBridgeService,
  ReleaseDraftQueryBridgeSource,
} from './release-draft-query-bridge.service';
export { ReleaseDraftQuerySourceService } from './release-draft-query-source.service';
export { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';
export { ReleaseFacadeContextService } from './release-facade-context.service';
export {
  CapabilityReleaseDraftAccessors,
  ReleaseDraftService,
} from './release-draft.service';
export {
  CapabilityReleaseLifecycleAccessors,
  ReleaseLifecycleService,
} from './release-lifecycle.service';
export {
  CapabilityReleaseQueryAccessors,
  ReleaseQueryService,
} from './release-query.service';
export {
  ReleaseSupportService,
} from './release-support.service';
export { CapabilityReleaseController } from './capability-release.controller';
export {
  CapabilityReleaseManifestService,
  mapCapabilityReleaseDetailToManifest,
} from './capability-release.manifest.service';
export { CapabilityReleaseModule } from './capability-release.module';
export { CapabilityReleaseService } from './capability-release.service';
export {
  ReleaseManagerPrismaPort,
  ReleaseManagerTemporalWorkflowPort,
} from '../platform-runtime.ports';
export {
  RELEASE_MANAGER_ACTIVITY_EXECUTION,
  RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE,
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_SKILL_SERVICE,
  RELEASE_MANAGER_TEMPORAL_WORKFLOW,
  RELEASE_MANAGER_TOOL_CATALOG,
} from '../platform-runtime.tokens';
import type { CapabilityReleaseDTO } from '../interfaces';

export function isPublishedCapabilityRelease(
  release: Pick<CapabilityReleaseDTO, 'status'>
): boolean {
  return release.status === 'published';
}
