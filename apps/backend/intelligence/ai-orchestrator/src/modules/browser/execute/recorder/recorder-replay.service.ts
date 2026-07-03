import { Injectable } from '@nestjs/common';
import type { BrowserCommand } from '../../intent';
import type {
  RecorderDebugObservation,
  RecorderObservedNode,
  RecorderObservedRegion,
} from '../recorder-debug.types';

export type ReplayResolutionMode =
  | 'snapshot-ref'
  | 'semantic-match'
  | 'relative-position'
  | 'visual-fallback-required'
  | 'unresolved';

export interface ReplayResolvedCommand {
  command: BrowserCommand;
  resolvedRef?: string;
  resolutionMode: ReplayResolutionMode;
  matchedNode?: RecorderObservedNode;
  reason?: string;
}

export interface ReplayResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  visualFallbackRequired: number;
}

export interface ReplayResolution {
  resolvedCommands: ReplayResolvedCommand[];
  summary: ReplayResolutionSummary;
}

@Injectable()
export class RecorderReplayService {
  resolveReplayPlan(
    commands: BrowserCommand[],
    observation: RecorderDebugObservation | undefined
  ): ReplayResolution {
    const observedNodes = this.getObservedNodes(observation);
    const observedRegions = observation?.regions || [];

    const resolvedCommands = commands.map((command) =>
      this.resolveCommandTarget(command, observedNodes, observedRegions)
    );

    const summary: ReplayResolutionSummary = {
      total: resolvedCommands.length,
      resolved: resolvedCommands.filter((item) => this.isResolved(item)).length,
      unresolved: resolvedCommands.filter(
        (item) => item.resolutionMode === 'unresolved'
      ).length,
      visualFallbackRequired: resolvedCommands.filter(
        (item) => item.resolutionMode === 'visual-fallback-required'
      ).length,
    };

    return { resolvedCommands, summary };
  }

  private isResolved(item: ReplayResolvedCommand): boolean {
    return (
      item.resolutionMode === 'snapshot-ref' ||
      item.resolutionMode === 'semantic-match' ||
      item.resolutionMode === 'relative-position'
    );
  }

  private resolveCommandTarget(
    command: BrowserCommand,
    observedNodes: RecorderObservedNode[],
    observedRegions: RecorderObservedRegion[]
  ): ReplayResolvedCommand {
    const locator = command.locator;
    const needsTarget = this.commandNeedsTargetResolution(command);
    if (!needsTarget || !locator) {
      return {
        command,
        resolutionMode: 'unresolved',
        reason: 'command does not require target resolution or lacks locator',
      };
    }

    // Step 1: ref direct
    if (locator.ref) {
      const node = this.findNodeByRef(observedNodes, locator.ref);
      if (node?.ref) {
        return {
          command,
          resolvedRef: node.ref,
          resolutionMode: 'snapshot-ref',
          matchedNode: node,
        };
      }
    }

    // Step 2: structure match (role/name/text)
    const structuralNode = this.findNodeByStructure(observedNodes, locator);
    if (structuralNode?.ref) {
      return {
        command,
        resolvedRef: structuralNode.ref,
        resolutionMode: 'semantic-match',
        matchedNode: structuralNode,
      };
    }

    // Step 3: relative region (regionId + name/text/ordinal)
    if (locator.regionId) {
      const regionNode = this.findNodeInRegion(
        observedNodes,
        observedRegions,
        locator.regionId,
        locator
      );
      if (regionNode?.ref) {
        return {
          command,
          resolvedRef: regionNode.ref,
          resolutionMode: 'relative-position',
          matchedNode: regionNode,
        };
      }
    }

    // Step 4: visual fallback (deferred — caller must invoke vision grounding)
    return {
      command,
      resolutionMode: 'visual-fallback-required',
      reason:
        'ref/structure/region all failed; visual grounding is required to resolve target',
    };
  }

  private commandNeedsTargetResolution(command: BrowserCommand): boolean {
    const targetTools = new Set([
      'click',
      'fill',
      'type_text',
      'hover',
      'press_key',
      'drag',
      'screenshot',
      'snapshot',
    ]);
    return targetTools.has(command.tool);
  }

  private getObservedNodes(
    observation: RecorderDebugObservation | undefined
  ): RecorderObservedNode[] {
    if (!observation) {
      return [];
    }
    return [
      ...(observation.interactiveState?.inputs || []),
      ...(observation.interactiveState?.buttons || []),
      ...(observation.interactiveState?.candidates || []),
    ];
  }

  private findNodeByRef(
    nodes: RecorderObservedNode[],
    ref: string
  ): RecorderObservedNode | undefined {
    return nodes.find((node) => node.ref === ref);
  }

  private findNodeByStructure(
    nodes: RecorderObservedNode[],
    locator: NonNullable<BrowserCommand['locator']>
  ): RecorderObservedNode | undefined {
    const targetRole = typeof locator.role === 'string' ? locator.role.trim() : '';
    const targetName = typeof locator.name === 'string' ? locator.name.trim() : '';
    const targetText = typeof locator.value === 'string' ? locator.value.trim() : '';

    if (targetRole && targetName) {
      const roleByName = nodes.find(
        (node) =>
          this.normalize(node.role) === this.normalize(targetRole) &&
          this.matchesName(node, targetName)
      );
      if (roleByName) {
        return roleByName;
      }
    }

    if (targetName) {
      const byName = nodes.find((node) => this.matchesName(node, targetName));
      if (byName) {
        return byName;
      }
    }

    if (targetText) {
      const byText = nodes.find((node) =>
        this.normalize(node.text).includes(this.normalize(targetText))
      );
      if (byText) {
        return byText;
      }
    }

    return undefined;
  }

  private findNodeInRegion(
    nodes: RecorderObservedNode[],
    regions: RecorderObservedRegion[],
    regionId: string,
    locator: NonNullable<BrowserCommand['locator']>
  ): RecorderObservedNode | undefined {
    const region = regions.find((item) => item.regionId === regionId);
    if (!region) {
      return undefined;
    }

    const regionNodeRefs = new Set(region.nodeRefs || []);
    const nodesInRegion = nodes.filter(
      (node) =>
        (node.regionId && node.regionId === regionId) ||
        (node.ref && regionNodeRefs.has(node.ref))
    );
    if (nodesInRegion.length === 0) {
      return undefined;
    }

    const targetName = typeof locator.name === 'string' ? locator.name.trim() : '';
    if (targetName) {
      const byName = nodesInRegion.find((node) => this.matchesName(node, targetName));
      if (byName) {
        return byName;
      }
    }

    const targetText = typeof locator.value === 'string' ? locator.value.trim() : '';
    if (targetText) {
      const byText = nodesInRegion.find((node) =>
        this.normalize(node.text).includes(this.normalize(targetText))
      );
      if (byText) {
        return byText;
      }
    }

    return nodesInRegion[0];
  }

  private matchesName(node: RecorderObservedNode, expectedName: string): boolean {
    const target = this.normalize(expectedName);
    if (!target) {
      return false;
    }
    const nodeName = this.normalize(node.name);
    const nodeText = this.normalize(node.text);
    const nodeContext = this.normalize(node.contextLabel);
    return nodeName === target || nodeText === target || nodeContext === target;
  }

  private normalize(value: string | undefined): string {
    return (value || '').trim().toLowerCase();
  }
}
