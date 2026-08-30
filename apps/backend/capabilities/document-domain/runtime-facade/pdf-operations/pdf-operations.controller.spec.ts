import { PdfOperationsController } from './pdf-operations.controller';

describe('PdfOperationsController', () => {
  const artifact = {
    type: 'document',
    id: 'pdf-1',
    name: 'output.pdf',
    url: '/renders/pdf-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    metadata: { format: 'pdf', sha256: 'abc' },
  };
  const dto = {
    executionId: 'execution-1',
    stepId: 'step-1',
    capabilityKey: 'platform.document.pdf-merge',
    definitionVersion: '1.0.0',
    idempotencyKey: 'idem-1',
    input: {},
  };

  it.each([
    ['merge', 'mergeService'],
    ['split', 'splitService'],
    ['create', 'createService'],
  ] as const)('returns standard artifact output for %s', async (method, serviceName) => {
    const output = {
      operation: method,
      artifact,
      artifacts: [artifact],
      pageCount: 1,
    };
    const services = {
      mergeService: { merge: jest.fn().mockResolvedValue(output) },
      splitService: { split: jest.fn().mockResolvedValue(output) },
      createService: { create: jest.fn().mockResolvedValue(output) },
    };
    const controller = new PdfOperationsController(
      services.mergeService as any,
      services.splitService as any,
      services.createService as any
    );

    await expect(controller[method](dto)).resolves.toEqual({
      success: true,
      output,
      artifacts: [artifact],
    });
    expect((services[serviceName] as any)[method]).toHaveBeenCalledWith({}, 'idem-1');
  });
});
