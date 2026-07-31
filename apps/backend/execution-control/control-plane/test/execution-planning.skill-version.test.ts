import axios from 'axios';
import { ExecutionPlanningService } from '../src/modules/execution/step-runner/planning/execution-planning.service';

jest.mock('axios');

describe('ExecutionPlanningService skill publication verification', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns normalized published executable metadata for a visible Skill', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 'skill-search',
        publishedReleaseVersion: 12,
        publishedReleaseStatus: 'PUBLISHED',
        publishedDeploymentStatus: 'DEPLOYED',
      },
    } as any);

    const service = new ExecutionPlanningService({} as any, {} as any);
    const result = await service.assertSkillAccessibleByUser('skill-search', undefined, 'Bearer token');

    expect(result).toEqual({
      id: 'skill-search',
      publishedReleaseVersion: '12',
      publishedReleaseStatus: 'published',
      publishedDeploymentStatus: 'deployed',
    });
  });
});
