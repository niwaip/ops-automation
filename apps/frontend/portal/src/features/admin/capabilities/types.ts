export type SnapshotDiffStatus = 'same' | 'changed' | 'added' | 'removed';

export interface CapabilityReleaseFilterState {
  search?: string;
  status?: string;
  capabilityType?: string;
}
