import { Injectable, Logger } from '@nestjs/common';
import type { ValueBindingV1 } from '@ops/backend-deterministic-plan';

@Injectable()
export class NodeOutputBindingResolverService {
  private readonly logger = new Logger(NodeOutputBindingResolverService.name);

  private readonly CONTENT_PARAM_NAMES = new Set(['content', 'text', 'input', 'body']);
  private readonly STATUS_OUTPUT_NAMES = new Set([
    'status',
    'success',
    'execution_status',
    'business_status',
    'code',
  ]);

  /**
   * Alias mappings between upstream outputs and downstream inputs.
   */
  private readonly ALIAS_MAP: Array<{ upstreamKey: string; downstreamKey: string }> = [
    { upstreamKey: 'searchResults', downstreamKey: 'items' },
    { upstreamKey: 'results', downstreamKey: 'items' },
    { upstreamKey: 'news_item_list', downstreamKey: 'items' },
    { upstreamKey: 'summary', downstreamKey: 'content' },
    { upstreamKey: 'markdown_content', downstreamKey: 'content' },
    { upstreamKey: 'text', downstreamKey: 'content' },
    { upstreamKey: 'body', downstreamKey: 'content' },
    { upstreamKey: 'summary', downstreamKey: 'text' },
    { upstreamKey: 'markdown_content', downstreamKey: 'text' },
    { upstreamKey: 'content', downstreamKey: 'text' },
    { upstreamKey: 'body', downstreamKey: 'text' },
    { upstreamKey: 'result', downstreamKey: 'content' },
    { upstreamKey: 'result', downstreamKey: 'text' },
  ];

  public resolveNodeOutputBinding(
    upstreamRef: string,
    upstreamOutputs: Record<string, unknown> | undefined,
    downstreamParamName: string,
  ): ValueBindingV1 | null {
    if (!upstreamOutputs || typeof upstreamOutputs !== 'object') {
      return null;
    }

    const upstreamKeys = Object.keys(upstreamOutputs);
    if (upstreamKeys.length === 0) {
      return null;
    }

    // 1. Exact match on parameter name
    if (upstreamKeys.includes(downstreamParamName)) {
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: downstreamParamName,
      };
    }

    // 2. Alias mapping match
    for (const mapping of this.ALIAS_MAP) {
      if (
        mapping.downstreamKey === downstreamParamName &&
        upstreamKeys.includes(mapping.upstreamKey)
      ) {
        return {
          source: 'node_output',
          nodeId: upstreamRef,
          path: mapping.upstreamKey,
        };
      }
    }

    // 3. Contract-compatible projection. Never bind an arbitrary first field:
    // multi-field structured objects require an explicit adapter/LLM Operation.
    if (downstreamParamName === 'items') {
      return this.resolveListBinding(upstreamRef, upstreamOutputs);
    }
    if (this.CONTENT_PARAM_NAMES.has(downstreamParamName)) {
      return this.resolveUniqueTextBinding(upstreamRef, upstreamOutputs);
    }

    return null;
  }

  private resolveListBinding(
    upstreamRef: string,
    upstreamOutputs: Record<string, unknown>,
  ): ValueBindingV1 | null {
    const listCandidates = Object.entries(upstreamOutputs).filter(([, type]) =>
      /^(?:array|list|news_item_list)$|(?:_list|\[\])$/i.test(String(type || '')),
    );
    if (listCandidates.length === 1) {
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: listCandidates[0]![0],
      };
    }

    const entries = Object.entries(upstreamOutputs);
    if (entries.length === 1 && /^json$/i.test(String(entries[0]![1] || ''))) {
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: entries[0]![0],
        expectedType: 'news_item_list',
        transform: 'extract_unique_array',
      };
    }
    return null;
  }

  private resolveUniqueTextBinding(
    upstreamRef: string,
    upstreamOutputs: Record<string, unknown>,
  ): ValueBindingV1 | null {
    const explicitTextCandidates = Object.entries(upstreamOutputs).filter(([key]) => {
      if (this.STATUS_OUTPUT_NAMES.has(key.toLowerCase())) return false;
      return /content|text|summary|markdown|message|body/i.test(key);
    });
    if (explicitTextCandidates.length === 1) {
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: explicitTextCandidates[0]![0],
      };
    }

    const typeTextCandidates = Object.entries(upstreamOutputs).filter(([key, type]) => {
      if (this.STATUS_OUTPUT_NAMES.has(key.toLowerCase())) return false;
      return /^(?:string|text|markdown_content|summary)$/i.test(String(type || ''));
    });
    const nonStatusKeys = Object.keys(upstreamOutputs).filter(
      (k) => !this.STATUS_OUTPUT_NAMES.has(k.toLowerCase())
    );
    if (typeTextCandidates.length === 1 && nonStatusKeys.length === 1) {
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: typeTextCandidates[0]![0],
      };
    }

    return null;
  }
}
