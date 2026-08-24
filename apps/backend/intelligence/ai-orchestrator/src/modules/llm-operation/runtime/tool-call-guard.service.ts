import { Injectable } from '@nestjs/common';
import { LlmOperationError } from '../registry/errors';

export const TOOL_CALL_FORBIDDEN = 'TOOL_CALL_FORBIDDEN';

@Injectable()
export class ToolCallGuardService {
  public detect(response: unknown): { hasToolCall: boolean; toolCallCount: number; toolNames: string[] } {
    if (!response || typeof response !== 'object') {
      return { hasToolCall: false, toolCallCount: 0, toolNames: [] };
    }

    const resp = response as Record<string, unknown>;
    const toolNames: string[] = [];

    // Check OpenAI-style tool_calls
    const toolCalls = (resp as any).tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        if (tc?.function?.name) {
          toolNames.push(tc.function.name);
        }
      }
    }

    // Check legacy function_call
    const functionCall = (resp as any).function_call;
    if (functionCall && typeof functionCall === 'object' && functionCall.name) {
      toolNames.push(functionCall.name);
    }

    // Check XML-style <tool_use> tags in content
    const content = (resp as any).content;
    if (typeof content === 'string' && content.includes('<tool_use')) {
      toolNames.push('xml_tool_use_detected');
    }

    return {
      hasToolCall: toolNames.length > 0,
      toolCallCount: toolNames.length,
      toolNames,
    };
  }

  public assertNoToolCall(response: unknown): void {
    const detection = this.detect(response);
    if (detection.hasToolCall) {
      const summary = detection.toolNames.slice(0, 3).join(', ');
      const count = detection.toolCallCount;
      throw new LlmOperationError(
        TOOL_CALL_FORBIDDEN,
        `Tool call detected and forbidden (count: ${count}, names: ${summary})`,
        { toolCallCount: count, toolNames: detection.toolNames },
      );
    }
  }
}
