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
      const rawContent = '{"first": "value", "second": "ambiguous"}';
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

    it('normalizes a single model text field to primaryOutput and copies metadata from input', () => {
      const schema = {
        type: 'object',
        required: ['content', 'format'],
        primaryOutput: 'content',
        properties: {
          content: { type: 'string' },
          format: {
            type: 'string',
            enum: ['text', 'markdown'],
            'x-ops-copy-from-input': 'output_format',
          },
        },
        additionalProperties: false,
      };

      const result = service.parseAndValidate('{"answer":"日本語の翻訳本文"}', schema, {
        output_format: 'text',
      });

      expect(result).toEqual({
        data: { content: '日本語の翻訳本文', format: 'text' },
        schemaValidated: true,
      });
    });

    it('wraps bare model text when a primaryOutput is declared', () => {
      const schema = {
        type: 'object',
        required: ['content', 'format'],
        primaryOutput: 'content',
        properties: {
          content: { type: 'string' },
          format: {
            type: 'string',
            enum: ['text', 'markdown'],
            'x-ops-copy-from-input': 'output_format',
          },
        },
      };

      expect(
        service.parseAndValidate('日本語の翻訳本文', schema, { output_format: 'text' }).data
      ).toEqual({ content: '日本語の翻訳本文', format: 'text' });
    });

    it('does not misclassify malformed JSON as plain business text', () => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(() => service.parseAndValidate('{"summary":"未闭合的模型输出', schema)).toThrow(
        LlmOperationError
      );
    });

    it('normalizes a JSON string response', () => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(service.parseAndValidate('"日本語の翻訳本文"', schema).data).toEqual({
        content: '日本語の翻訳本文',
      });
    });

    it('selects an answer while ignoring provider reasoning metadata', () => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(
        service.parseAndValidate('{"answer":"业务正文","reasoning":"内部推理"}', schema).data
      ).toEqual({ content: '业务正文' });
    });

    it.each([
      ['nested answer', '{"data":{"answer":"业务正文"}}'],
      ['nested result text', '{"result":{"text":"业务正文"}}'],
      [
        'OpenAI-compatible message',
        '{"choices":[{"message":{"role":"assistant","content":"业务正文"}}]}',
      ],
      ['typed content block', '{"content":[{"type":"text","text":"业务正文"}]}'],
    ])('normalizes %s provider output', (_label, rawContent) => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(service.parseAndValidate(rawContent, schema).data).toEqual({
        content: '业务正文',
      });
    });

    it('prefers the declared output key over aliases', () => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(
        service.parseAndValidate('{"content":"正式正文","answer":"候选正文"}', schema).data
      ).toEqual({ content: '正式正文' });
    });

    it('does not guess between equally plausible business-text fields', () => {
      const schema = {
        type: 'object',
        required: ['content'],
        primaryOutput: 'content',
        properties: { content: { type: 'string' } },
      };

      expect(() => service.parseAndValidate('{"foo":"A","bar":"B"}', schema)).toThrow(
        LlmOperationError
      );
    });

    it('should return schemaValidated=false when schema is null (fail-open)', () => {
      const rawContent = '{"any": "json"}';

      const result = service.parseAndValidate(rawContent, null);
      expect(result.data).toEqual({ any: 'json' });
      expect(result.schemaValidated).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        'Output schema is null, skipping validation (fail-open)'
      );
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

    it('keeps text-mode repair free of JSON protocol glue', () => {
      const repairPrompt = service.buildRepairPrompt(
        'Only return a concise summary.',
        'unfinished summary',
        'text'
      );

      expect(repairPrompt).toContain('corrected business text');
      expect(repairPrompt).toContain('Only return a concise summary.');
      expect(repairPrompt).not.toContain('valid JSON object');
    });
  });
});
