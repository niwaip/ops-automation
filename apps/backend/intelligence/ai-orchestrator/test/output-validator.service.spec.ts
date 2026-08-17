import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { OutputValidatorService } from '../src/modules/llm-operation/runtime/output-validator.service';
import { LlmOperationError } from '../src/modules/llm-operation/registry/errors';

describe('OutputValidatorService', () => {
  let service: OutputValidatorService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutputValidatorService,
        {
          provide: Logger,
          useValue: {
            debug: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<OutputValidatorService>(OutputValidatorService);
    logger = module.get<Logger>(Logger);
  });

  describe('parseAndValidate', () => {
    it('should parse and validate valid JSON matching schema', () => {
      const rawContent = '{"markdown_content": "Test summary"}';
      const schema = {
        type: 'object',
        required: ['markdown_content'],
        properties: {
          markdown_content: { type: 'string' },
        },
      };

      const result = service.parseAndValidate(rawContent, schema);
      expect(result.data).toEqual({ markdown_content: 'Test summary' });
      expect(result.schemaValidated).toBe(true);
    });

    it('should parse JSON from code blocks', () => {
      const rawContent = '```json\n{"markdown_content": "Test"}\n```';
      const schema = {
        type: 'object',
        required: ['markdown_content'],
        properties: {
          markdown_content: { type: 'string' },
        },
      };

      const result = service.parseAndValidate(rawContent, schema);
      expect(result.data).toEqual({ markdown_content: 'Test' });
      expect(result.schemaValidated).toBe(true);
    });

    it('should throw OUTPUT_PARSE_FAILED for invalid JSON', () => {
      const rawContent = 'Not valid JSON at all';

      expect(() => service.parseAndValidate(rawContent, null)).toThrow(LlmOperationError);
      try {
        service.parseAndValidate(rawContent, null);
      } catch (err: any) {
        expect(err.code).toBe('OUTPUT_PARSE_FAILED');
        expect(err.message).toContain('Failed to parse JSON');
      }
    });

    it('should throw OUTPUT_SCHEMA_VIOLATION for schema mismatch', () => {
      const rawContent = '{"other_field": "value"}';
      const schema = {
        type: 'object',
        required: ['markdown_content'],
        properties: {
          markdown_content: { type: 'string' },
        },
      };

      expect(() => service.parseAndValidate(rawContent, schema)).toThrow(LlmOperationError);
      try {
        service.parseAndValidate(rawContent, schema);
      } catch (err: any) {
        expect(err.code).toBe('OUTPUT_SCHEMA_VIOLATION');
        expect(err.message).toContain('schema validation failed');
      }
    });

    it('should return schemaValidated=false when schema is null (fail-open)', () => {
      const rawContent = '{"any": "json"}';

      const result = service.parseAndValidate(rawContent, null);
      expect(result.data).toEqual({ any: 'json' });
      expect(result.schemaValidated).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith('Output schema is null, skipping validation (fail-open)');
    });
  });

  describe('buildRepairPrompt', () => {
    it('should return repair prompt template', () => {
      const systemTemplate = 'You are a helpful assistant.';
      const previousOutput = '{"invalid": "json"';

      const repairPrompt = service.buildRepairPrompt(systemTemplate, previousOutput);
      expect(repairPrompt).toContain('schema validation');
      expect(repairPrompt).toContain(previousOutput);
      expect(repairPrompt).toContain('valid JSON object');
    });
  });
});