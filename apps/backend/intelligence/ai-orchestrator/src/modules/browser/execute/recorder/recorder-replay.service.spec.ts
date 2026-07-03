jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderReplayService } from './recorder-replay.service';
import type { BrowserCommand } from '../../intent';
import type { RecorderDebugObservation, RecorderObservedNode } from '../recorder-debug.types';

describe('RecorderReplayService', () => {
  const service = new RecorderReplayService();

  type SimpleNode = Pick<
    RecorderObservedNode,
    'ref' | 'role' | 'name' | 'text' | 'regionId' | 'contextLabel'
  >;

  function buildObservation(nodes: SimpleNode[]): RecorderDebugObservation {
    return {
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      interactiveState: {
        inputs: nodes.filter((n) => n.role === 'textbox') as RecorderObservedNode[],
        buttons: nodes.filter((n) => n.role !== 'textbox') as RecorderObservedNode[],
        candidates: [],
      },
      regions: [],
    };
  }

  it('resolves by ref direct when the ref still exists in the fresh snapshot', () => {
    const command: BrowserCommand = {
      tool: 'click',
      params: {},
      description: '点击 gross-margin 详情',
      locator: {
        strategy: 'role',
        value: 'button',
        role: 'button',
        name: 'gross-margin',
        ref: 'e42',
        contextLabel: 'margin-row-3',
        regionId: 'gross-margin-panel',
      },
    };
    const observation = buildObservation([
      { ref: 'e10', role: 'button', name: 'other-btn' },
      { ref: 'e42', role: 'button', name: 'gross-margin' },
    ]);

    const result = service.resolveReplayPlan([command], observation);

    expect(result.summary).toEqual({
      total: 1,
      resolved: 1,
      unresolved: 0,
      visualFallbackRequired: 0,
    });
    expect(result.resolvedCommands[0]).toEqual(
      expect.objectContaining({
        resolvedRef: 'e42',
        resolutionMode: 'snapshot-ref',
      })
    );
  });

  it('falls back to semantic-match (role+name) when ref has drifted', () => {
    const command: BrowserCommand = {
      tool: 'click',
      params: {},
      description: '点击 gross-margin 详情',
      locator: {
        strategy: 'role',
        value: 'button',
        role: 'button',
        name: 'gross-margin',
        ref: 'e42',
      },
    };
    // Fresh snapshot no longer has e42, but role+name still matches a new node e99
    const observation = buildObservation([
      { ref: 'e10', role: 'button', name: 'other-btn' },
      { ref: 'e99', role: 'button', name: 'gross-margin' },
    ]);

    const result = service.resolveReplayPlan([command], observation);

    expect(result.summary.resolved).toBe(1);
    expect(result.resolvedCommands[0]).toEqual(
      expect.objectContaining({
        resolvedRef: 'e99',
        resolutionMode: 'semantic-match',
      })
    );
  });

  it('falls back to relative-position (regionId) when ref and structure both fail', () => {
    const command: BrowserCommand = {
      tool: 'click',
      params: {},
      description: '点击 action 按钮',
      locator: {
        strategy: 'css',
        value: 'button.action-btn',
        role: 'button',
        name: 'action',
        ref: 'e77',
        regionId: 'action-region',
      },
    };
    // Fresh snapshot: ref e77 gone, no node named 'action', but region still has a button
    const observation: RecorderDebugObservation = {
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      interactiveState: {
        inputs: [],
        buttons: [{ ref: 'e200', role: 'button', name: 'submit', regionId: 'action-region' }],
        candidates: [],
      },
      regions: [{ regionId: 'action-region', nodeRefs: ['e200'], label: 'action-bar' }],
    };

    const result = service.resolveReplayPlan([command], observation);

    expect(result.summary.resolved).toBe(1);
    expect(result.resolvedCommands[0]).toEqual(
      expect.objectContaining({
        resolvedRef: 'e200',
        resolutionMode: 'relative-position',
      })
    );
  });

  it('returns visual-fallback-required when ref, structure, and region all fail', () => {
    const command: BrowserCommand = {
      tool: 'click',
      params: {},
      description: '点击 canvas 按钮',
      locator: {
        strategy: 'css',
        value: 'canvas.btn',
        ref: 'e88',
        regionId: 'canvas-region',
      },
    };
    const observation = buildObservation([
      { ref: 'e10', role: 'button', name: 'unrelated' },
    ]);

    const result = service.resolveReplayPlan([command], observation);

    expect(result.summary).toEqual({
      total: 1,
      resolved: 0,
      unresolved: 0,
      visualFallbackRequired: 1,
    });
    expect(result.resolvedCommands[0]?.resolutionMode).toBe('visual-fallback-required');
    expect(result.resolvedCommands[0]?.resolvedRef).toBeUndefined();
  });

  it('skips resolution for commands that do not need target (navigate, wait, scroll)', () => {
    const commands: BrowserCommand[] = [
      { tool: 'navigate', params: { url: 'http://example.com' } },
      { tool: 'wait', params: { duration: 1000 } },
      { tool: 'scroll', params: { direction: 'down' } },
    ];

    const result = service.resolveReplayPlan(commands, undefined);

    expect(result.summary.total).toBe(3);
    expect(result.summary.resolved).toBe(0);
    expect(result.summary.unresolved).toBe(3);
    expect(result.resolvedCommands.every((item) => item.resolutionMode === 'unresolved')).toBe(true);
  });

  it('aggregates summary across mixed resolution outcomes', () => {
    const commands: BrowserCommand[] = [
      {
        tool: 'click',
        params: {},
        locator: { strategy: 'role', value: 'button', role: 'button', name: 'a', ref: 'e1' },
      },
      {
        tool: 'click',
        params: {},
        locator: { strategy: 'role', value: 'button', role: 'button', name: 'b', ref: 'e2' },
      },
      {
        tool: 'click',
        params: {},
        locator: { strategy: 'css', value: 'canvas.x', ref: 'e3', regionId: 'canvas' },
      },
      { tool: 'navigate', params: { url: 'http://x.com' } },
    ];
    const observation: RecorderDebugObservation = {
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      interactiveState: {
        inputs: [],
        buttons: [
          { ref: 'e1', role: 'button', name: 'a' },
          { ref: 'e50', role: 'button', name: 'b-renamed' },
        ],
        candidates: [],
      },
      regions: [],
    };

    const result = service.resolveReplayPlan(commands, observation);

    expect(result.summary).toEqual({
      total: 4,
      resolved: 1,
      unresolved: 1,
      visualFallbackRequired: 2,
    });
    // navigate command is 'unresolved' (doesn't need target)
    // e1 resolves by snapshot-ref
    // e2 falls through to visual-fallback (ref gone, name 'b' doesn't match 'b-renamed', no regionId)
    expect(result.resolvedCommands[0]?.resolutionMode).toBe('snapshot-ref');
    expect(result.resolvedCommands[1]?.resolutionMode).toBe('visual-fallback-required');
    expect(result.resolvedCommands[2]?.resolutionMode).toBe('visual-fallback-required');
    expect(result.resolvedCommands[3]?.resolutionMode).toBe('unresolved');
  });
});
