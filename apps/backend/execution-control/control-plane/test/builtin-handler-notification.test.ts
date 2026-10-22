import { BuiltinHandlerRegistryService } from '../src/modules/execution/adapters/builtin-handler-registry.service';

describe('BuiltinHandlerRegistryService internal notification deduplication', () => {
  it('strictly deduplicates attachments by url/downloadUrl in delivered receipt payload', async () => {
    let createdPayload: any = null;
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          username: 'admin',
          organizationId: 'org-test-1',
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb({
          workbenchInboxItem: {
            create: jest.fn().mockImplementation(async (args) => {
              createdPayload = args.data.unifiedPayload;
              return { id: 'inbox-item-1', ...args.data };
            }),
          },
        });
      }),
    };

    const mockOutbox: any = {
      enqueue: jest.fn().mockResolvedValue(true),
    };

    const registry = new BuiltinHandlerRegistryService(
      {} as any,
      {} as any,
      {} as any,
      mockPrisma,
      mockOutbox
    );
    registry.onModuleInit();

    const handler = registry.getHandler('platform.notification.internal-message');
    expect(handler).toBeDefined();

    const pdfUrl = 'http://192.168.100.143:3009/renders/a04b883774de867504519ee10143a71d.pdf';
    await handler!(
      {
        requestId: 'req-1',
        executionId: 'exec-notif-1',
        stepId: 'step-1',
        runtimeType: 'workflow',
        capabilityType: 'builtin',
        action: 'execute',
        skillId: 'platform.notification.internal-message',
        metadata: {},
      input: {
        recipientId: '11111111-1111-1111-1111-111111111111',
        recipientUsername: 'admin',
        title: '[协同回执] 保密协议已终审通过并归档',
        downloadUrl: pdfUrl,
        attachments: [
          {
            id: 'pdf-artifact-1',
            url: pdfUrl,
            downloadUrl: pdfUrl,
            name: 'FLOW_V2.pdf',
            size: 230867,
            sha256: '4d660f89117be2a9a03b584eb51ec5fc31d5a52be05e63a5c9031dca1dadd156',
            metadata: { format: 'pdf', pageCount: 6 },
            mimeType: 'application/pdf',
          },
          {
            url: '/api/attachments/v2.docx',
            name: 'FLOW_V2.docx',
            size: 107509,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          {
            url: pdfUrl,
            name: 'FLOW_V2.pdf',
            size: 230867,
            mimeType: 'application/pdf',
          },
        ],
      },
    }, 'idemp-test-1');

    expect(createdPayload).toBeDefined();
    expect(createdPayload.attachments).toHaveLength(2);
    expect(createdPayload.attachments[0].url).toBe(pdfUrl);
    expect(createdPayload.attachments[0].id).toBe('pdf-artifact-1');
    expect(createdPayload.attachments[0].sha256).toBe(
      '4d660f89117be2a9a03b584eb51ec5fc31d5a52be05e63a5c9031dca1dadd156'
    );
    expect(createdPayload.attachments[0].metadata?.pageCount).toBe(6);
    expect(createdPayload.attachments[1].url).toBe('/api/attachments/v2.docx');
  });
});
