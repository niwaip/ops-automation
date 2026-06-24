import axios from 'axios';
import { McpService } from '../src/modules/mcp/mcp.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpService', () => {
  const prisma = {
    execution: {
      findMany: jest.fn(),
    },
  } as any;

  const executionService = {
    create: jest.fn(),
  } as any;
  const jwtService = {
    verifyAsync: jest.fn(),
  } as any;

  let service: McpService;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: 'employee',
      username: 'alice',
    });
    service = new McpService(prisma, executionService, jwtService);
  });

  it('lists MCP tools from published skills', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        skills: [
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
      },
    } as any);

    const result = await service.listTools({
      authorization: 'Bearer token-1',
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
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
        }),
      ])
    );
  });

  it('creates a real execution when MCP tool is called', async () => {
    executionService.create.mockResolvedValueOnce({
      id: 'exec-1',
      status: 'queued',
      currentStepId: 'step-1',
      requiresApproval: false,
    });

    const result = await service.callTool('skill_skill_123', {
      url: 'https://example.com',
      _meta: {},
    }, {
      authorization: 'Bearer token-1',
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('token-1', expect.any(Object));
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
        authToken: 'Bearer token-1',
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
