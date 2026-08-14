import { Injectable, Logger } from '@nestjs/common';
import type { ValueBindingV1 } from '@ops/backend-deterministic-plan';

@Injectable()
export class NodeOutputBindingResolverService {
  private readonly logger = new Logger(NodeOutputBindingResolverService.name);

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

    // 3. Fallback: single output field on upstream for generic content parameters
    const genericContentParams = ['items', 'content', 'text', 'input', 'body', 'data'];
    if (upstreamKeys.length === 1 && genericContentParams.includes(downstreamParamName)) {
      const upstreamKey = upstreamKeys[0]!;
      const upstreamType = String(upstreamOutputs[upstreamKey] || '').toLowerCase();
      if (downstreamParamName === 'items' && upstreamType === 'json') {
        return {
          source: 'node_output',
          nodeId: upstreamRef,
          path: upstreamKey,
          expectedType: 'news_item_list',
          transform: 'extract_unique_array',
        };
      }
      return {
        source: 'node_output',
        nodeId: upstreamRef,
        path: upstreamKey,
      };
    }

    return null;
  }
}
