import { skillApi } from './index';

export type CapabilitySourceType =
  | 'execution_flow_template'
  | 'temporal_workflow'
  | 'browser_recording';

export interface CapabilityRelease {
  id: string;
  sourceType: CapabilitySourceType;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceStatus: string;
  releaseVersion: number;
  status: string;
  approvalStatus: string;
  deploymentStatus: string;
  publishedSkillId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SOURCE_TYPE: CapabilitySourceType = 'execution_flow_template';

export const capabilityReleaseApi = {
  listReleaseCenter: async (): Promise<{ releases: CapabilityRelease[] }> => {
    const response = await skillApi.list();
    const releases = (response.skills || [])
      .filter((skill) => skill.isPublished)
      .map((skill) => ({
        id: skill.publishedReleaseId || skill.id,
        sourceType: DEFAULT_SOURCE_TYPE,
        sourceId: skill.id,
        sourceName: skill.name,
        sourceStatus: skill.isActive ? 'active' : 'inactive',
        releaseVersion: skill.publishedReleaseVersion || 1,
        status: skill.publishedReleaseStatus || 'published',
        approvalStatus: 'approved',
        deploymentStatus: skill.publishedDeploymentStatus || 'succeeded',
        publishedSkillId: skill.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    return { releases };
  },
};
