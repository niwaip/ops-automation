/**
 * observation -> browser-domain/observation
 *
 * This logical view groups recorder-facing observation facades and lower-level
 * page snapshot/structure probing services during the transition period.
 */
export { RecorderDebugObservationFacade } from '../execute/recorder-debug-observation.facade';
export { RecorderDebugObservationRefreshService } from '../observe/recorder-debug-observation-refresh.service';
export { RecorderObservationService } from '../observe/recorder-observation.service';
export { RecorderSnapshotService } from '../observe/recorder-snapshot.service';
export { RecorderStructureProbeService } from '../observe/recorder-structure-probe.service';
