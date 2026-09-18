import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SubmitCoordinationActionDto,
  CreateCoordinationTaskDto,
  CoordinationAttachmentDto,
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
});
