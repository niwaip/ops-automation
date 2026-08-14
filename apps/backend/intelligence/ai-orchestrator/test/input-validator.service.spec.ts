import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { InputValidatorService } from '../src/modules/llm-operation/runtime/input-validator.service';
import { LlmOperationError } from '../src/modules/llm-operation/registry/errors';

describe('InputValidatorService', () => {
  let service: InputValidatorService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InputValidatorService,
        {
          provide: Logger,
          useValue: {
            debug: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<InputValidatorService>(InputValidatorService);
    logger = module.get<Logger>(Logger);
  });

  it('should pass validation for valid input', () => {
    const input = { name: 'test', count: 5 };
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
    };

    expect(() => service.validate(input, schema)).not.toThrow();
  });

  it('should throw INPUT_SCHEMA_VIOLATION for missing required field', () => {
    const input = { count: 5 };
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
    };

    expect(() => service.validate(input, schema)).toThrow(LlmOperationError);
    try {
      service.validate(input, schema);
    } catch (err: any) {
      expect(err.code).toBe('INPUT_SCHEMA_VIOLATION');
      expect(err.message).toContain('required');
    }
  });

  it('should throw for type mismatch', () => {
    const input = { name: 123 };
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };

    expect(() => service.validate(input, schema)).toThrow(LlmOperationError);
    try {
      service.validate(input, schema);
    } catch (err: any) {
      expect(err.code).toBe('INPUT_SCHEMA_VIOLATION');
      expect(err.message).toContain('string');
    }
  });

  it('should skip validation when schema is null (fail-open)', () => {
    const input = { anything: 'goes' };

    expect(() => service.validate(input, null)).not.toThrow();
    expect(logger.debug).toHaveBeenCalledWith('Input schema is null, skipping validation (fail-open)');
  });
});