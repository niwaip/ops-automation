import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SubmitCoordinationActionDto,
  CreateCoordinationTaskDto,
  CoordinationAttachmentDto,
  deduplicateCoordinationAttachments,
} from '@ops/workbench';

describe('WorkbenchCoordinationDto validation & transformation', () => {
  it('should transform plain attachment objects into CoordinationAttachmentDto without stripping properties', async () => {
    const rawPayload = {
      action: 'complete',
      attachments: [
        {
          name: '保密合同_豆包有限公司_v2_20260917.docx',
          url: '/api/workbench-coordination/attachments/att_12345/download',
          size: 1024,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ],
    };

    const dto = plainToInstance(SubmitCoordinationActionDto, rawPayload, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.attachments).toBeDefined();
    expect(dto.attachments?.[0]).toBeInstanceOf(CoordinationAttachmentDto);
    expect(dto.attachments?.[0].name).toBe('保密合同_豆包有限公司_v2_20260917.docx');
    expect(dto.attachments?.[0].url).toBe('/api/workbench-coordination/attachments/att_12345/download');

    // Ensure JSON serialization preserves properties (no [ [] ] regression!)
    const serialized = JSON.parse(JSON.stringify(dto));
    expect(serialized.attachments[0].name).toBe('保密合同_豆包有限公司_v2_20260917.docx');
    expect(serialized.attachments[0].url).toBe('/api/workbench-coordination/attachments/att_12345/download');
  });

  it('should transform attachments on CreateCoordinationTaskDto correctly', async () => {
    const rawPayload = {
      title: '测试协同任务',
      content: '测试任务内容',
      assigneeId: 'u-law01',
      attachments: [
        {
          name: '初稿.docx',
          url: 'http://example.com/draft.docx',
        },
      ],
    };

    const dto = plainToInstance(CreateCoordinationTaskDto, rawPayload, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.attachments?.[0]).toBeInstanceOf(CoordinationAttachmentDto);
    expect(dto.attachments?.[0].name).toBe('初稿.docx');
  });

  describe('deduplicateCoordinationAttachments', () => {
    it('should deduplicate attachments sharing the same URL and preserve rich metadata at front', () => {
      const rawAttachments = [
        {
          id: 'art-full-pdf',
          url: 'http://carbone:3009/renders/v2.pdf',
          downloadUrl: 'http://carbone:3009/renders/v2.pdf',
          name: 'FLOW_V2.pdf',
          size: 230867,
          sha256: 'sha256-full-hash',
          metadata: { pageCount: 6, format: 'pdf' },
          mimeType: 'application/pdf',
        },
        {
          url: '/api/attachments/att_1/download',
          name: 'FLOW_V2.docx',
          size: 107509,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        {
          url: '/api/attachments/att_0/download',
          name: 'FLOW_V1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        {
          url: 'http://carbone:3009/renders/report.html',
          name: 'report.html',
          mimeType: 'text/html',
        },
        {
          url: 'http://carbone:3009/renders/v2.pdf',
          name: 'FLOW_V2.pdf',
          size: 230867,
          mimeType: 'application/pdf',
        },
      ];

      const deduped = deduplicateCoordinationAttachments(rawAttachments);
      expect(deduped.length).toBe(4);
      const urls = deduped.map((a) => a.url);
      expect(new Set(urls).size).toBe(4);
      expect(deduped[0].id).toBe('art-full-pdf');
      expect(deduped[0].sha256).toBe('sha256-full-hash');
      expect(deduped[0].metadata?.pageCount).toBe(6);
    });

    it('should merge extra fields when subsequent occurrence is richer', () => {
      const raw = [
        {
          url: 'http://carbone:3009/renders/v2.pdf',
          name: 'FLOW_V2.pdf',
        },
        {
          url: 'http://carbone:3009/renders/v2.pdf',
          name: 'FLOW_V2.pdf',
          sha256: 'rich-sha256',
          size: 12345,
        },
      ];
      const deduped = deduplicateCoordinationAttachments(raw);
      expect(deduped.length).toBe(1);
      expect(deduped[0].sha256).toBe('rich-sha256');
      expect(deduped[0].size).toBe(12345);
    });
  });
});
