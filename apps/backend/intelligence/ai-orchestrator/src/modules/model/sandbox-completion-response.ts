/** Preserve provider completion semantics at the sandbox proxy boundary. */
export function sandboxCompletion(response: any, model: string, vision: boolean) {
  const content = response.content || '';
  if (vision && !content.trim()) {
    throw new Error(`Vision model [${model}] returned empty content (finish_reason=${response.finishReason || 'unknown'}, reasoning_only=${Boolean(response.reasoningContent)}).`);
  }
  return { content, reasoning: response.reasoningContent, tools: response.tool_calls,
    finishReason: response.finishReason || 'stop', usage: response.usage };
}
