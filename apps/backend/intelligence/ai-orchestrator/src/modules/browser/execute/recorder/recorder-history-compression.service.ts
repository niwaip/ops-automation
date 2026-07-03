import { Injectable } from '@nestjs/common';
import type {
  RecorderDebugTurn,
  RecorderEvidence,
  RecorderOutcome,
} from '../recorder-debug.types';

export interface RecorderHistoryCompressionOptions {
  /**
   * Number of most-recent turns to preserve uncompressed. Older turns are
   * eligible for compression. Defaults to 10.
   */
  retainRecentTurnCount?: number;
  /**
   * Skip compression for turns that carry exportArtifacts or loopDraft —
   * these are load-bearing for export/replay and must stay intact.
   * Defaults to true.
   */
  preserveLoadBearingTurns?: boolean;
}

export interface RecorderHistoryCompressionResult {
  compressedTurnCount: number;
  retainedTurnCount: number;
  totalTurnCount: number;
}

export interface CompressedEvidenceSummary {
  diff?: RecorderEvidence['diff'];
  toolExecution?: RecorderEvidence['toolExecution'];
  summary?: string;
}

@Injectable()
export class RecorderHistoryCompressionService {
  compressHistory(
    turns: RecorderDebugTurn[],
    options?: RecorderHistoryCompressionOptions
  ): RecorderHistoryCompressionResult {
    const retainRecent = Math.max(0, options?.retainRecentTurnCount ?? 10);
    const preserveLoadBearing = options?.preserveLoadBearingTurns ?? true;
    const totalTurnCount = turns.length;

    if (totalTurnCount <= retainRecent) {
      return {
        compressedTurnCount: 0,
        retainedTurnCount: totalTurnCount,
        totalTurnCount,
      };
    }

    const compressibleEndIndex = totalTurnCount - retainRecent;
    let compressedTurnCount = 0;

    for (let index = 0; index < compressibleEndIndex; index += 1) {
      const turn = turns[index];
      if (!turn || turn.compressed) {
        continue;
      }
      if (preserveLoadBearing && this.isLoadBearingTurn(turn)) {
        continue;
      }
      const compressed = this.compressTurn(turn);
      turns[index] = compressed;
      compressedTurnCount += 1;
    }

    return {
      compressedTurnCount,
      retainedTurnCount: totalTurnCount - compressedTurnCount,
      totalTurnCount,
    };
  }

  isTurnCompressed(turn: RecorderDebugTurn): boolean {
    return Boolean(turn.compressed);
  }

  isLoadBearingTurn(turn: RecorderDebugTurn): boolean {
    return Boolean(turn.exportArtifacts || turn.loopDraft || turn.loopState);
  }

  extractCompressedEvidence(turn: RecorderDebugTurn): CompressedEvidenceSummary {
    const evidence = turn.outcome?.evidence;
    return {
      ...(evidence?.diff ? { diff: evidence.diff } : {}),
      ...(evidence?.toolExecution ? { toolExecution: evidence.toolExecution } : {}),
      ...(turn.outcome?.summary?.userVisible
        ? { summary: turn.outcome.summary.userVisible }
        : {}),
    };
  }

  estimateCompressionSavings(turns: RecorderDebugTurn[]): {
    uncompressedBytes: number;
    compressedBytes: number;
    reductionRatio: number;
  } {
    if (turns.length === 0) {
      return { uncompressedBytes: 0, compressedBytes: 0, reductionRatio: 0 };
    }
    const uncompressedBytes = JSON.stringify(turns).length;
    const compressed = turns.map((turn) =>
      turn.compressed ? turn : this.compressTurn(turn)
    );
    const compressedBytes = JSON.stringify(compressed).length;
    const reductionRatio =
      uncompressedBytes > 0
        ? Number((1 - compressedBytes / uncompressedBytes).toFixed(3))
        : 0;
    return { uncompressedBytes, compressedBytes, reductionRatio };
  }

  private compressTurn(turn: RecorderDebugTurn): RecorderDebugTurn {
    const droppedFields = this.collectDroppedFieldNames(turn);
    return {
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
      ...(turn.outcomeVersion ? { outcomeVersion: turn.outcomeVersion } : {}),
      ...(turn.outcome ? { outcome: this.compressOutcome(turn.outcome) } : {}),
      compressed: true,
      compressedReason: `compressed to retain outcome summary; dropped: ${droppedFields.join(', ') || 'none'}`,
    };
  }

  private compressOutcome(outcome: RecorderOutcome): RecorderOutcome {
    const evidence = outcome.evidence;
    if (!evidence) {
      return outcome;
    }

    const compressedEvidence: RecorderEvidence = {
      ...(evidence.diff ? { diff: evidence.diff } : {}),
      ...(evidence.toolExecution ? { toolExecution: evidence.toolExecution } : {}),
    };

    return {
      ...outcome,
      evidence: compressedEvidence,
    };
  }

  private collectDroppedFieldNames(turn: RecorderDebugTurn): string[] {
    const dropped: string[] = [];
    if (turn.commands?.length) {
      dropped.push('commands');
    }
    if (turn.execution) {
      dropped.push('execution');
    }
    if (turn.observation) {
      dropped.push('observation');
    }
    if (turn.outcome?.evidence?.before || turn.outcome?.evidence?.after) {
      dropped.push('outcome.evidence.before/after');
    }
    return dropped;
  }
}

