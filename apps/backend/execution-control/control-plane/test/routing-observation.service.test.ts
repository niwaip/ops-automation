import { RoutingObservationService } from '../src/modules/experience-learning/routing-observation.service';

describe('RoutingObservationService', () => {
  it('persists the routing policy version and digest with the route decision', async () => {
    const createdAt = new Date('2026-08-23T10:00:00.000Z');
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { id: '00000000-0000-4000-8000-000000000001', createdAt },
      ]),
    };
    const service = new RoutingObservationService(prisma as never);

    await expect(
      service.record('00000000-0000-4000-8000-000000000002', {
        requestFingerprint: 'a'.repeat(64),
        routeSource: 'saved_workflow',
        matchMethod: 'alias',
        selectedSourceId: '00000000-0000-4000-8000-000000000003',
        selectedVersion: '4',
        candidateCount: 1,
        matchScore: 0.99,
        plannerInvoked: false,
        routingPolicyVersion: 'admin-approved-7',
        routingPolicyDigest: 'b'.repeat(64),
      }),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: createdAt.toISOString(),
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('routing_policy_version, routing_policy_digest'),
      expect.any(String),
      '00000000-0000-4000-8000-000000000002',
      'a'.repeat(64),
      'saved_workflow',
      'alias',
      '00000000-0000-4000-8000-000000000003',
      '4',
      1,
      0.99,
      false,
      null,
      null,
      null,
      null,
      'admin-approved-7',
      'b'.repeat(64),
    );
  });
});
