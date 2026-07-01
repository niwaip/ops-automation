import { SemanticRuleErrorLogService } from '../error-log/semantic-rule-error-log.service';

describe('SemanticRuleErrorLogService', () => {
  it('filters logs by navigation status and reason', async () => {
    const prisma = {
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-navigation-profile',
            normalizedSemantic: {
              parser_metadata: {
                navigation: {
                  status: 'success',
                  reason: 'navigation-runtime-path',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-navigation-default',
            normalizedSemantic: {
              parser_metadata: {
                navigation: {
                  status: 'success',
                  reason: 'navigation-direct-url',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-login',
            normalizedSemantic: {
              parser_metadata: {
                login: {
                  status: 'partial',
                  reason: 'login-partial-step',
                },
              },
            },
            parserOutput: null,
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleErrorLogService(prisma);

    const result = await service.list({
      domain_code: 'browser_recorder',
      navigation_status: 'success',
      navigation_reason: 'navigation-runtime-path',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('error-navigation-profile');
    expect(prisma.semanticRuleErrorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        orderBy: [{ createdAt: 'desc' }],
      })
    );
  });

  it('filters logs by field fill status and reason', async () => {
    const prisma = {
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-field-fill-runtime',
            normalizedSemantic: {
              parser_metadata: {
                fieldFill: {
                  status: 'success',
                  reason: 'field-fill-runtime-field-region',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-field-fill-default',
            normalizedSemantic: {
              parser_metadata: {
                fieldFill: {
                  status: 'success',
                  reason: 'field-fill-default-candidate',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-navigation',
            normalizedSemantic: {
              parser_metadata: {
                navigation: {
                  status: 'success',
                  reason: 'navigation-runtime-path',
                },
              },
            },
            parserOutput: null,
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleErrorLogService(prisma);

    const result = await service.list({
      domain_code: 'browser_recorder',
      field_fill_status: 'success',
      field_fill_reason: 'field-fill-runtime-field-region',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('error-field-fill-runtime');
  });

  it('filters logs by action status and reason', async () => {
    const prisma = {
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-action-runtime',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-row',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-action-default',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-default-candidate',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-field-fill',
            normalizedSemantic: {
              parser_metadata: {
                fieldFill: {
                  status: 'success',
                  reason: 'field-fill-runtime-field-region',
                },
              },
            },
            parserOutput: null,
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleErrorLogService(prisma);

    const result = await service.list({
      domain_code: 'browser_recorder',
      action_status: 'success',
      action_reason: 'action-runtime-row',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('error-action-runtime');
  });

  it('filters logs by read status and reason', async () => {
    const prisma = {
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-read-runtime',
            normalizedSemantic: {
              parser_metadata: {
                read: {
                  status: 'success',
                  reason: 'read-runtime-field-region',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-read-default',
            normalizedSemantic: {
              parser_metadata: {
                read: {
                  status: 'success',
                  reason: 'read-default-candidate',
                },
              },
            },
            parserOutput: null,
          },
          {
            id: 'error-action',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-row',
                },
              },
            },
            parserOutput: null,
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleErrorLogService(prisma);

    const result = await service.list({
      domain_code: 'browser_recorder',
      read_status: 'success',
      read_reason: 'read-runtime-field-region',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('error-read-runtime');
  });
});
