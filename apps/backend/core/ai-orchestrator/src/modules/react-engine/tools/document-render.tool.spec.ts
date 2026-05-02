import axios from 'axios';
import { DocumentRenderTool } from './document-render.tool';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocumentRenderTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks rendering when template is not visible in capability snapshot', async () => {
    const tool = new DocumentRenderTool();

    const result = await tool.execute(
      {
        templateId: 'tpl-hidden',
        data: { partyA: '甲方' },
      },
      {
        capabilitySnapshot: {
          userId: 'u-1',
          sessionId: 's-1',
          roles: ['admin'],
          mode: 'task',
          visibleTools: [],
          visibleSkills: [
            {
              skillId: 'skill-1',
              skillName: '公开模板',
              triggerKeywords: ['公开'],
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
            requireConfirmToolNames: ['document_render'],
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

  it('returns standardized success envelope for locked visible template', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: '/studio/download/doc-123',
        fileName: 'test.docx',
        format: 'docx',
      },
    } as any);

    const tool = new DocumentRenderTool();
    const result = await tool.execute(
      {
        data: { partyA: '甲方' },
      },
      {
        capabilitySnapshot: {
          userId: 'u-1',
          sessionId: 's-1',
          roles: ['admin'],
          mode: 'task',
          visibleTools: [],
          visibleSkills: [
            {
              skillId: 'skill-1',
              skillName: '锁定模板',
              triggerKeywords: [],
              paramsSchema: { properties: {}, required: [] },
              executionType: 'document',
              carboneTemplateId: 'tpl-locked',
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
            requireConfirmToolNames: ['document_render'],
            requireHumanReviewOnWrite: true,
            documentTemplateClarificationEnabled: true,
          },
          generatedAt: new Date().toISOString(),
          version: 'v1',
        },
        documentContext: {
          selectedTemplateId: 'tpl-locked',
        },
      } as any,
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe('document_render_completed');
    expect(result.meta?.selectedTemplateId).toBe('tpl-locked');
    expect(String(result.data?.downloadUrl)).toContain('/studio/download/doc-123');
  });

  it('classifies validation-like render service failures as param_validation_failed', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('validation failed: missing required field signedAt'));

    const tool = new DocumentRenderTool();
    const result = await tool.execute(
      {
        templateId: 'tpl-visible',
        data: { partyA: '甲方' },
      },
      {
        capabilitySnapshot: {
          userId: 'u-1',
          sessionId: 's-1',
          roles: ['admin'],
          mode: 'task',
          visibleTools: [],
          visibleSkills: [
            {
              skillId: 'skill-1',
              skillName: '公开模板',
              triggerKeywords: ['公开'],
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
            requireConfirmToolNames: ['document_render'],
            requireHumanReviewOnWrite: true,
            documentTemplateClarificationEnabled: true,
          },
          generatedAt: new Date().toISOString(),
          version: 'v1',
        },
      } as any,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('param_validation_failed');
    expect(result.data?.parameterIssue).toBe(true);
  });
});
