import { Test, TestingModule } from '@nestjs/testing';
import { ToolCallGuardService } from '../src/modules/llm-operation/runtime/tool-call-guard.service';
import { LlmOperationError } from '../src/modules/llm-operation/registry/errors';

describe('ToolCallGuardService', () => {
  let service: ToolCallGuardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolCallGuardService],
    }).compile();
    service = module.get<ToolCallGuardService>(ToolCallGuardService);
  });

  describe('detect', () => {
    it('should return false for response without tool calls', () => {
      const response = {
        content: 'This is a normal response',
        role: 'assistant',
      };

      const result = service.detect(response);
      expect(result.hasToolCall).toBe(false);
      expect(result.toolCallCount).toBe(0);
      expect(result.toolNames).toEqual([]);
    });

    it('should detect OpenAI-style tool_calls', () => {
      const response = {
        content: null,
        tool_calls: [
          { function: { name: 'search' }, id: 'tc_1' },
          { function: { name: 'lookup' }, id: 'tc_2' },
        ],
      };

      const result = service.detect(response);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallCount).toBe(2);
      expect(result.toolNames).toEqual(['search', 'lookup']);
    });

    it('should detect legacy function_call', () => {
      const response = {
        content: null,
        function_call: { name: 'get_weather', arguments: '{}' },
      };

      const result = service.detect(response);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallCount).toBe(1);
      expect(result.toolNames).toEqual(['get_weather']);
    });

    it('should detect XML-style <tool_use> tags', () => {
      const response = {
        content: 'Here is the result: <tool_use>data</tool_use>',
      };

      const result = service.detect(response);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallCount).toBe(1);
      expect(result.toolNames).toContain('xml_tool_use_detected');
    });
  });

  describe('assertNoToolCall', () => {
    it('should not throw for response without tool calls', () => {
      const response = {
        content: 'Normal response',
        role: 'assistant',
      };

      expect(() => service.assertNoToolCall(response)).not.toThrow();
    });

    it('should throw TOOL_CALL_FORBIDDEN when tool calls detected', () => {
      const response = {
        tool_calls: [{ function: { name: 'search' } }],
      };

      expect(() => service.assertNoToolCall(response)).toThrow(LlmOperationError);
      try {
        service.assertNoToolCall(response);
      } catch (err: any) {
        expect(err.code).toBe('TOOL_CALL_FORBIDDEN');
        expect(err.message).toContain('Tool call detected and forbidden');
        expect(err.details.toolCallCount).toBe(1);
        expect(err.details.toolNames).toContain('search');
      }
    });
  });
});