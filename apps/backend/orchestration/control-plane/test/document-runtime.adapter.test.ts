import axios from 'axios';
import { DocumentRuntimeAdapter } from '../src/modules/execution';

jest.mock('axios');

describe('DocumentRuntimeAdapter', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts document artifact metadata from runtime result', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        releaseId: 'release-document-1',
        capabilityId: 'document-skill-1',
        publishedSkillId: 'document-skill-1',
        runtime: 'document',
        downloadUrl: 'https://files.example.com/output/quote-1.pdf',
        output: {
          fileName: 'quote-1.pdf',
          format: 'pdf',
          sizeBytes: 1024,
        },
        logs: [],
      },
    } as never);

    const adapter = new DocumentRuntimeAdapter();
    const result = await adapter.invokeStep({
      requestId: 'request-1',
      executionId: 'execution-1',
      stepId: 'step-1',
      runtimeType: 'document',
      capabilityType: 'document.render',
      publishedSkillId: 'document-skill-1',
      action: 'render_document',
      input: {
        templateId: 'tpl-1',
      },
      metadata: {
        capabilityVersion: 'v5',
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3001/capabilities/runtime/execute',
      expect.objectContaining({
        capabilityId: 'document-skill-1',
        capabilityVersion: 'v5',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'document',
        input: {
          templateId: 'tpl-1',
        },
      })
    );
    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      output: {
        fileName: 'quote-1.pdf',
        format: 'pdf',
        sizeBytes: 1024,
      },
      artifacts: [
        {
          type: 'document',
          name: 'quote-1.pdf',
          url: 'https://files.example.com/output/quote-1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
      ],
    });
  });
});
