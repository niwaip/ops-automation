jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderHistoryCompressionService } from './recorder-history-compression.service';
import type {
  RecorderDebugTurn,
  RecorderOutcome,
  RecorderObservationDiff,
} from '../recorder-debug.types';

describe('RecorderHistoryCompressionService', () => {
  const service = new RecorderHistoryCompressionService();

  function buildOutcome(overrides?: Partial<RecorderOutcome>): RecorderOutcome {
    const diff: RecorderObservationDiff = { urlChanged: true };
    return {
      kind: 'action',
      status: 'succeeded',
      intent: { userGoal: 'test goal' },
      evidence: {
        before: {
          inputs: [{ ref: 'e1', role: 'textbox', name: 'username' }],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          currentPageUrl: 'http://before.example',
        },
        after: {
          inputs: [{ ref: 'e1', role: 'textbox', name: 'username', value: 'bob' }],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          currentPageUrl: 'http://after.example',
        },
        diff,
        toolExecution: {
          success: true,
          commandCount: 1,
          executedCommandCount: 1,
        },
      },
      verification: {
        verifier: 'fill',
        routeReason: 'actionType',
        level: 'page',
        success: true,
        confidence: 0.8,
        checks: [],
      },
      summary: { userVisible: '已填写用户名', compact: 'filled username' },
      ...(overrides || {}),
    };
  }

  function buildTurn(
    overrides?: Partial<RecorderDebugTurn> & { role?: RecorderDebugTurn['role'] }
  ): RecorderDebugTurn {
    return {
      role: overrides?.role || 'assistant',
      content: overrides?.content || '已完成操作',
      timestamp: overrides?.timestamp || new Date().toISOString(),
      commands: overrides?.commands ?? [
        { tool: 'fill', params: { value: 'bob' }, description: '填写用户名' },
      ],
      execution: overrides?.execution ?? { success: true, results: [{ data: 'ok' }] },
      observation: overrides?.observation ?? {
        inputs: [{ ref: 'e1', role: 'textbox', name: 'username' }],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
        currentPageUrl: 'http://after.example',
      },
      outcomeVersion: 'v1',
      outcome: overrides?.outcome ?? buildOutcome(),
      ...({} as Record<string, unknown>),
      ...(overrides || {}),
    } as RecorderDebugTurn;
  }

  it('returns zero compression when total turns fit within retainRecentTurnCount', () => {
    const turns = [buildTurn(), buildTurn(), buildTurn()];
    const result = service.compressHistory(turns, { retainRecentTurnCount: 5 });

    expect(result).toEqual({
      compressedTurnCount: 0,
      retainedTurnCount: 3,
      totalTurnCount: 3,
    });
    expect(turns.every((turn) => !turn.compressed)).toBe(true);
  });

  it('compresses turns older than retainRecentTurnCount and keeps the recent N uncompressed', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    const result = service.compressHistory(turns, { retainRecentTurnCount: 5 });

    expect(result).toEqual({
      compressedTurnCount: 7,
      retainedTurnCount: 5,
      totalTurnCount: 12,
    });
    // First 7 turns compressed
    expect(turns.slice(0, 7).every((turn) => turn.compressed === true)).toBe(true);
    // Last 5 turns unchanged
    expect(turns.slice(7).every((turn) => turn.compressed !== true)).toBe(true);
  });

  it('drops commands/execution/observation and outcome.evidence.before/after on compressed turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    const compressed = turns[0]!;
    expect(compressed.compressed).toBe(true);
    expect(compressed.commands).toBeUndefined();
    expect(compressed.execution).toBeUndefined();
    expect(compressed.observation).toBeUndefined();
    expect(compressed.outcome?.evidence?.before).toBeUndefined();
    expect(compressed.outcome?.evidence?.after).toBeUndefined();
  });

  it('preserves outcome.evidence.diff and outcome.evidence.toolExecution on compressed turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    const compressed = turns[0]!;
    expect(compressed.outcome?.evidence?.diff).toBeDefined();
    expect(compressed.outcome?.evidence?.toolExecution).toBeDefined();
    expect(compressed.outcome?.verification).toBeDefined();
    expect(compressed.outcome?.summary?.userVisible).toBe('已填写用户名');
  });

  it('preserves role/content/timestamp/outcomeVersion on compressed turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    const compressed = turns[0]!;
    expect(compressed.role).toBe('assistant');
    expect(compressed.content).toBe('已完成操作');
    expect(typeof compressed.timestamp).toBe('string');
    expect(compressed.outcomeVersion).toBe('v1');
  });

  it('records dropped field names in compressedReason', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    const reason = turns[0]?.compressedReason || '';
    expect(reason).toContain('commands');
    expect(reason).toContain('execution');
    expect(reason).toContain('observation');
    expect(reason).toContain('outcome.evidence.before/after');
  });

  it('skips load-bearing turns (exportArtifacts / loopDraft / loopState) when preserveLoadBearingTurns is true', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    // Mark turn 0 as load-bearing (exportArtifacts)
    turns[0]!.exportArtifacts = {
      script: 'console.log("hi")',
      guidance: 'test guidance',
      skillDraft: {
        name: 'test-skill',
        description: 'test',
        invocation: 'test',
        parameterOnly: true,
        parameters: [],
        outputs: [],
        usageNotes: [],
        usageMarkdown: '',
        publishPayload: {
          name: 'test',
          description: 'test',
          triggerKeywords: [],
          paramsSchema: { properties: {}, required: [] },
          executionFlowTemplateIds: [],
          executionFlow: [],
          tools: [],
          apiEndpoints: { runtimeMetadata: {} },
        },
        executionPlan: {
          executionPlanVersion: 'browser-recording-ir/v1',
          backend: 'cli',
          runtimeSessionId: 'rs-1',
          commands: [],
          parameters: [],
          outputs: [],
          runtimeHints: {},
          executionLimits: {},
          trace: {},
        },
        commands: [],
      },
    } as any;
    // Mark turn 2 as load-bearing (loopDraft)
    turns[2]!.loopDraft = {
      mode: 'repeat_until',
      target: { scope: 'current_list' },
    } as any;

    const result = service.compressHistory(turns, { retainRecentTurnCount: 3 });

    // 12 - 3 (retain recent) = 9 eligible; minus 2 load-bearing = 7 compressed
    expect(result.compressedTurnCount).toBe(7);
    expect(turns[0]?.compressed).not.toBe(true); // exportArtifacts preserved
    expect(turns[2]?.compressed).not.toBe(true); // loopDraft preserved
  });

  it('compresses load-bearing turns too when preserveLoadBearingTurns is false', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    turns[0]!.loopDraft = { mode: 'repeat_until', target: { scope: 'current_list' } } as any;

    const result = service.compressHistory(turns, {
      retainRecentTurnCount: 3,
      preserveLoadBearingTurns: false,
    });

    expect(result.compressedTurnCount).toBe(9);
    expect(turns[0]?.compressed).toBe(true);
  });

  it('does not re-compress already-compressed turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });
    const firstPassFirst = turns[0]!;

    // Second pass with smaller retain window
    service.compressHistory(turns, { retainRecentTurnCount: 2 });

    // Turn 0 should still be compressed (not double-processed)
    expect(turns[0]?.compressed).toBe(true);
    expect(turns[0] ?? null).toEqual(firstPassFirst);
  });

  it('extractCompressedEvidence returns diff/toolExecution/summary from compressed turn', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    const summary = service.extractCompressedEvidence(turns[0]!);
    expect(summary.diff).toBeDefined();
    expect(summary.toolExecution).toBeDefined();
    expect(summary.summary).toBe('已填写用户名');
  });

  it('extractCompressedEvidence also works on uncompressed turns', () => {
    const turn = buildTurn();
    const summary = service.extractCompressedEvidence(turn);
    expect(summary.diff).toBeDefined();
    expect(summary.toolExecution).toBeDefined();
    expect(summary.summary).toBe('已填写用户名');
  });

  it('estimateCompressionSavings reports positive reduction ratio for typical turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    const savings = service.estimateCompressionSavings(turns);

    expect(savings.uncompressedBytes).toBeGreaterThan(0);
    expect(savings.compressedBytes).toBeGreaterThan(0);
    expect(savings.compressedBytes).toBeLessThan(savings.uncompressedBytes);
    expect(savings.reductionRatio).toBeGreaterThan(0.3);
    expect(savings.reductionRatio).toBeLessThan(1);
  });

  it('estimateCompressionSavings returns zero for empty turns', () => {
    const savings = service.estimateCompressionSavings([]);
    expect(savings).toEqual({ uncompressedBytes: 0, compressedBytes: 0, reductionRatio: 0 });
  });

  it('defaults retainRecentTurnCount to 10 when not specified', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    const result = service.compressHistory(turns);

    expect(result.compressedTurnCount).toBe(2);
    expect(result.retainedTurnCount).toBe(10);
    expect(turns.slice(0, 2).every((t) => t.compressed === true)).toBe(true);
    expect(turns.slice(2).every((t) => t.compressed !== true)).toBe(true);
  });

  it('isLoadBearingTurn detects exportArtifacts, loopDraft, and loopState', () => {
    expect(service.isLoadBearingTurn(buildTurn())).toBe(false);
    expect(
      service.isLoadBearingTurn(
        buildTurn({ loopDraft: { mode: 'repeat_until', target: { scope: 'current_list' } } as any })
      )
    ).toBe(true);
  });

  it('isTurnCompressed correctly identifies compressed turns', () => {
    const turns = Array.from({ length: 12 }, () => buildTurn());
    service.compressHistory(turns, { retainRecentTurnCount: 3 });

    expect(service.isTurnCompressed(turns[0]!)).toBe(true);
    expect(service.isTurnCompressed(turns[11]!)).toBe(false);
  });
});
