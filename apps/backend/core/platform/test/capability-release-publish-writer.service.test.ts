import { CapabilityReleasePublishWriterService } from '../../../registry-release/release-manager/src/publisher/capability-release-publish-writer.service';

describe('CapabilityReleasePublishWriterService', () => {
  it('marks release source status as published when finalizing a published skill', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      skillConfig: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new CapabilityReleasePublishWriterService(prisma as any);

    await service.finalizePublishedSkill(
      'release-1',
      'draft-1',
      'skill-1',
      'approved'
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`SET status = 'published'`),
      'draft-1'
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`source_status = 'published'`),
      'release-1',
      'skill-1',
      'approved'
    );
  });
});
