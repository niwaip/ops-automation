import axios from 'axios';
import { DocumentParamRecoverTool } from './document-param-recover.tool';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocumentParamRecoverTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks parameter recovery when locked template is not visible in capability snapshot', async () => {
    const tool = new DocumentParamRecoverTool();

    const result = await tool.execute(
      {
        errorMessage: 'field missing',
        userInput: '生成合同',
      },
      {
        skill: {
          skillId: 'skill-1',
          skillName: '合同生成',
          matchedKeywords: [],
          confidence: 1,
          collectedParams: {},
          missingParams: [],
          paramsSchema: { properties: {}, required: [] },
          carboneSkillId: 'carbone-skill-1',
          carboneTemplateId: 'tpl-hidden',
        },
        capabilitySnapshot: {
          userId: 'u-1',
          sessionId: 's-1',
          roles: ['admin'],
          mode: 'task',
          visibleTools: [],
          visibleSkills: [
            {
              skillId: 'skill-visible',
              skillName: '可见模板',
              triggerKeywords: [],
              paramsSchema: { properties: {}, required: [] },
              executionType: 'document',
              carboneTemplateId: 'tpl-visible',
            },
          ],
          constraints: {
            disallowToolNames: [],
            disallowSkillIds: [],
            forceSkillBoundExecution: true,
            forbidExternalApiInTaskMode: true,
            maxVisibleSkills: 20,
          },
          policies: {
            requireConfirmToolNames: [],
            requireHumanReviewOnWrite: true,
            documentTemplateClarificationEnabled: true,
          },
          generatedAt: new Date().toISOString(),
          version: 'v1',
        },
      } as any,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('template_not_visible_in_capability_snapshot');
    expect(result.meta?.selectedTemplateId).toBe('tpl-hidden');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
