import axios from 'axios';
import { McpService } from '../src/modules/mcp/mcp.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    execution: {
      findMany: jest.fn(),
    },
  } as any;

  const executionService = {
    create: jest.fn(),
  } as any;

  let service: McpService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new McpService(prisma, executionService);
  });

  it('lists MCP tools from published skills', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        {
          id: 'skill-123',
          name: 'Demo Skill',
          description: 'Demo description',
          config: {
            paramsSchema: {
              properties: {
                url: {
                  type: 'string',
                  description: 'Target URL',
                },
              },
              required: ['url'],
            },
          },
        },
      ],
    } as any);

    const result = await service.listTools();

    expect(result).toEqual([
      {
        name: 'skill_skill_123',
        description: 'Demo description',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Target URL',
            },
          },
          required: ['url'],
        },
      },
    ]);
  });

  it('creates a real execution when MCP tool is called', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'employee',
      username: 'alice',
    });
    executionService.create.mockResolvedValueOnce({
      id: 'exec-1',
      status: 'queued',
      currentStepId: 'step-1',
      requiresApproval: false,
    });

    const result = await service.callTool('skill_skill_123', {
      url: 'https://example.com',
      _meta: {
        userId: 'user-1',
        runtimeType: 'browser',
      },
    });

    expect(executionService.create).toHaveBeenCalledWith(
      'user-1',
      {
        skillId: 'skill-123',
        capabilityId: 'skill-123',
        runtimeType: 'browser',
        input: {
          url: 'https://example.com',
        },
      },
      {
        authToken: undefined,
      }
    );
    expect(result).toMatchObject({
      structuredContent: {
        executionId: 'exec-1',
        status: 'queued',
        skillId: 'skill-123',
        createdBy: 'alice',
      },
    });
  });
});
