import { ParamContextMergeService } from './param-context-merge.service';
import type { RecognizeParamsResponseDTO } from '../../../interfaces';

describe('ParamContextMergeService', () => {
  let service: ParamContextMergeService;

  beforeEach(() => {
    service = new ParamContextMergeService();
  });

  it('allows recognized params to override systemCollected background defaults', () => {
    const recognized: RecognizeParamsResponseDTO = {
      params: {
        contractType: 'nda',
      },
      confidence: 0.9,
      field_confidences: {
        contractType: 0.9,
      },
      uncertain_fields: [],
    };

    const schema = {
      type: 'object',
      properties: {
        contractType: { type: 'string' },
        fileUrl: { type: 'string' },
      },
    };

    const context = {
      system_collected: {
        contractType: 'procurement',
        fileUrl: 'https://example.com/file.docx',
      },
    };

    const merged = service.mergeRecognizedWithCollectedContext(recognized, schema as any, context);

    expect(merged.params.contractType).toBe('nda');
    expect(merged.params.fileUrl).toBe('https://example.com/file.docx');
    expect(merged.field_confidences?.contractType).toBe(0.9);
    expect(merged.field_confidences?.fileUrl).toBe(0.75);
  });

  it('allows waiting_input collectedParams to override both recognized and systemCollected params', () => {
    const recognized: RecognizeParamsResponseDTO = {
      params: {
        contractType: 'procurement',
      },
      confidence: 0.8,
      field_confidences: {
        contractType: 0.8,
      },
      uncertain_fields: ['contractType'],
    };

    const schema = {
      type: 'object',
      properties: {
        contractType: { type: 'string' },
      },
    };

    const context = {
      mode: 'waiting_input_resume',
      already_collected: {
        contractType: 'software_development',
      },
      system_collected: {
        contractType: 'general',
      },
    };

    const merged = service.mergeRecognizedWithCollectedContext(recognized, schema as any, context);

    expect(merged.params.contractType).toBe('software_development');
    expect(merged.field_confidences?.contractType).toBe(1);
    expect(merged.uncertain_fields).toEqual([]);
  });
});
