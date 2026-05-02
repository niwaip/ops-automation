import { ChatMessage, DecisionContext, ReActState, RoutingMeta } from './interfaces';
import {
  formatPromptAssemblyDecisionTrace,
  formatRoutingDecisionTrace,
} from './decision-context-summary';

const MAX_OBSERVATION_CHARS = Number(process.env.REACT_MAX_OBSERVATION_CHARS || 1200);
const MAX_REACT_TRACE_MESSAGES = Number(process.env.REACT_MAX_TRACE_MESSAGES || 12);
const SUMMARY_SOURCE_LIMIT = Number(process.env.REACT_SUMMARY_SOURCE_LIMIT || 8);

const clipText = (value: string, maxChars: number): { text: string; truncated: boolean } => {
  if (!value || value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  const head = value.slice(0, Math.floor(maxChars * 0.65));
  const tail = value.slice(-(Math.floor(maxChars * 0.25)));
  return {
    text: `${head}\n...\n[truncated ${value.length - head.length - tail.length} chars]\n...\n${tail}`,
    truncated: true,
  };
};

const summarizeTraceMessages = (messages: ChatMessage[]): string => {
  const recent = messages.slice(-SUMMARY_SOURCE_LIMIT);
  if (recent.length === 0) {
    return '';
  }

  return recent.map((message) => {
    const content = typeof message.content === 'string' ? message.content.replace(/\s+/g, ' ').trim() : '';
    const clipped = clipText(content, 180).text;
    const iteration = message.metadata?.iteration ? `#${String(message.metadata.iteration)}` : '-';
    const decisionContext = message.metadata?.decisionContext as DecisionContext | undefined;
    const routing = formatRoutingDecisionTrace(
      decisionContext?.routing || (message.metadata?.routing as RoutingMeta | undefined),
    );
    const promptAssembly = formatPromptAssemblyDecisionTrace(decisionContext?.promptAssembly);
    const lines = [`${message.role}@${iteration}`];

    if (routing) {
      lines.push(`decision.routing: ${routing}`);
    }
    if (promptAssembly) {
      lines.push(`decision.prompt_assembly: ${promptAssembly}`);
    }
    lines.push(`content: ${clipped}`);

    return lines.join('\n');
  }).join('\n\n');
};

export class ContextWindowManager {
  buildObservationRecord(observation: string): {
    content: string;
    meta: { truncated?: boolean; originalLength?: number };
  } {
    const clipped = clipText(observation, MAX_OBSERVATION_CHARS);
    return {
      content: `Observation: ${clipped.text}`,
      meta: clipped.truncated
        ? { truncated: true, originalLength: observation.length }
        : {},
    };
  }

  compactReActHistory(
    state: ReActState,
    history: ChatMessage[],
  ): ChatMessage[] {
    const reActHistory = history.filter((message) => message.metadata?.isReAct);
    if (reActHistory.length <= MAX_REACT_TRACE_MESSAGES) {
      return history;
    }

    const overflowCount = reActHistory.length - MAX_REACT_TRACE_MESSAGES;
    const overflowMessages = reActHistory.slice(0, overflowCount);
    const retainedTrace = reActHistory.slice(overflowCount);
    const nonReActHistory = history.filter((message) => !message.metadata?.isReAct);

    const summaryBody = summarizeTraceMessages(overflowMessages);
    const previousSummary = state.contextSummary ? `${state.contextSummary}\n` : '';
    state.contextSummary = `${previousSummary}${summaryBody}`.trim();

    return [...nonReActHistory, ...retainedTrace];
  }
}
