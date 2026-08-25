import { NotFoundException } from '@nestjs/common';
import { ResultRefService } from '../src/modules/execution/result-ref/result-ref.service';

describe('ResultRefService', () => {
  const createService = () => {
    const prisma = {
      execution: { findUnique: jest.fn() },
      executionResultRef: { create: jest.fn(), findFirst: jest.fn() },
    };
    return { service: new ResultRefService(prisma as any), prisma };
  };

  it('stores a small preview and returns a versioned reference', async () => {
    const { service, prisma } = createService();
    prisma.executionResultRef.create.mockImplementation(({ data }: any) => ({
      id: 'ref-1',
      ...data,
      producerStepId: data.producerStepId || null,
    }));
    const ref = await service.create({
      executionId: 'execution-1',
      producerStepId: 'step-1',
      payload: { title: 'Q3', secret: 'must not enter the preview', body: 'x'.repeat(300) },
    });
    expect(ref).toMatchObject({
      schemaVersion: 'result-ref/v1',
      id: 'ref-1',
      executionId: 'execution-1',
    });
    expect(prisma.executionResultRef.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sizeBytes: expect.any(Number),
        previewJson: expect.objectContaining({ secret: '[redacted]' }),
      }),
    });
    const preview = prisma.executionResultRef.create.mock.calls[0][0].data.previewJson;
    expect(preview.body.length).toBeLessThanOrEqual(161);
  });

  it('authorizes by execution owner and projects only requested paths', async () => {
    const { service, prisma } = createService();
    prisma.execution.findUnique.mockResolvedValue({ createdBy: 'user-1' });
    prisma.executionResultRef.findFirst.mockResolvedValue({
      id: 'ref-1',
      executionId: 'execution-1',
      producerStepId: null,
      schemaDigest: 'digest',
      sizeBytes: 20,
      previewJson: { title: 'Q3' },
      payloadJson: { report: { title: 'Q3', secret: 'hidden' } },
    });
    await expect(
      service.project('execution-1', 'ref-1', ['report.title'], { id: 'user-1' })
    ).resolves.toMatchObject({ projection: { 'report.title': 'Q3' } });
    expect(prisma.executionResultRef.findFirst).toHaveBeenCalledWith({
      where: { id: 'ref-1', executionId: 'execution-1' },
    });
  });

  it('does not reveal another user execution', async () => {
    const { service, prisma } = createService();
    prisma.execution.findUnique.mockResolvedValue({ createdBy: 'user-2' });
    await expect(
      service.project('execution-1', 'ref-1', ['title'], { id: 'user-1' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
