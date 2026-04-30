import axios from 'axios';
import { DocumentGenTool } from './document-gen.tool';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocumentGenTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses carboneTemplateId from context and returns standardized success envelope', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: 'http://download/doc-123',
        fileName: 'contract.docx',
        format: 'docx',
      },
    } as any);

    const tool = new DocumentGenTool('http://carbone-test');
    const result = await tool.execute(
      {
        skillId: 'skill-1',
        params: { partyA: '甲方' },
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
          carboneTemplateId: 'tpl-carbone',
        },
        capabilitySnapshot: {
          userId: 'u-1',
          sessionId: 's-1',
          roles: ['admin'],
          mode: 'task',
          visibleTools: [],
          visibleSkills: [
            {
              skillId: 'skill-1',
              skillName: '合同生成',
              triggerKeywords: [],
              paramsSchema: { properties: {}, required: [] },
              executionType: 'document',
              carboneTemplateId: 'tpl-carbone',
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

    expect(result.success).toBe(true);
    expect(result.code).toBe('document_generate_completed');
    expect(result.meta?.selectedTemplateId).toBe('tpl-carbone');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://carbone-test/studio/render',
      expect.objectContaining({
        templateId: 'tpl-carbone',
      }),
      expect.any(Object),
    );
  });
});
