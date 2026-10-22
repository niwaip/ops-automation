/**
 * Contract Clause Adaptive Batching Strategy
 * 
 * Provides dynamic and content-aware clause partitioning for batch LLM review.
 * Balances clause count and character/token budget to avoid excessive HTTP round-trips
 * on short clauses while preventing prompt overflow or attention degradation on long clauses.
 */

export interface ClauseBatchItem {
  clause: any;
  index: number;
}

export interface AdaptiveBatchConfig {
  /**
   * Whether adaptive batching is enabled.
   * If false, falls back to fixedBatchSize.
   * Default: true.
   */
  enabled: boolean;
  /**
   * Fixed batch size when adaptive mode is disabled or overridden.
   * Default: 3.
   */
  fixedBatchSize: number;
  /**
   * Minimum number of clauses per batch (floor, unless a single clause is ultra-large).
   * Default: 1.
   */
  minBatchSize: number;
  /**
   * Maximum number of clauses per batch (ceiling to preserve model attention and avoid omissions).
   * Default: 5.
   */
  maxBatchSize: number;
  /**
   * Soft target character budget per batch.
   * When accumulated characters reach this threshold, the batch closes gracefully.
   * Default: 1200 chars.
   */
  targetBatchChars: number;
  /**
   * Hard maximum character budget per batch.
   * If adding the next clause exceeds this limit, the current batch closes immediately.
   * Default: 2400 chars.
   */
  maxBatchChars: number;
  /**
   * Threshold for considering a single clause as "ultra-large".
   * Ultra-large clauses are isolated in their own dedicated single-clause batch.
   * Default: 1000 chars.
   */
  largeClauseThresholdChars: number;
}

/**
 * Resolves adaptive batching configuration from environment variables.
 */
export function getAdaptiveBatchConfigFromEnv(): AdaptiveBatchConfig {
  const envEnabled = process.env.CONTRACT_REVIEW_ADAPTIVE_BATCHING;
  const enabled = envEnabled !== 'false' && envEnabled !== '0';

  const fixedBatchSize = Math.max(1, Number(process.env.CONTRACT_REVIEW_BATCH_SIZE) || 3);
  const minBatchSize = Math.max(1, Number(process.env.CONTRACT_REVIEW_MIN_BATCH_SIZE) || 1);
  const maxBatchSize = Math.max(minBatchSize, Number(process.env.CONTRACT_REVIEW_MAX_BATCH_SIZE) || 5);
  const targetBatchChars = Math.max(200, Number(process.env.CONTRACT_REVIEW_TARGET_BATCH_CHARS) || 1200);
  const maxBatchChars = Math.max(targetBatchChars, Number(process.env.CONTRACT_REVIEW_MAX_BATCH_CHARS) || 2400);
  const largeClauseThresholdChars = Math.max(300, Number(process.env.CONTRACT_REVIEW_LARGE_CLAUSE_CHARS) || 1000);

  return {
    enabled,
    fixedBatchSize,
    minBatchSize,
    maxBatchSize,
    targetBatchChars,
    maxBatchChars,
    largeClauseThresholdChars,
  };
}

/**
 * Estimates prompt-relevant character weight of a single clause.
 * Accounts for original text, title, and candidate rule titles/criteria.
 */
export function estimateClauseCharCount(item: ClauseBatchItem): number {
  if (!item || !item.clause) return 0;
  const content = String(item.clause.originalContent || '');
  const title = String(item.clause.title || item.clause.clauseNumber || '');
  const candidateRules = item.clause.candidateRules || item.clause.matchedRules || [];
  const rulesLength = Array.isArray(candidateRules)
    ? candidateRules.reduce(
        (acc: number, r: any) =>
          acc + String(r?.title || '').length + String(r?.criterion || '').length,
        0
      )
    : 0;
  return content.length + title.length + rulesLength;
}

/**
 * Partitions clauses into batches adaptively based on content size and clause count constraints.
 * Guarantees original order preservation and deterministic behavior.
 */
export function partitionClausesAdaptively(
  items: ClauseBatchItem[],
  customConfig?: Partial<AdaptiveBatchConfig>
): ClauseBatchItem[][] {
  if (!items || items.length === 0) {
    return [];
  }

  const baseConfig = getAdaptiveBatchConfigFromEnv();
  const config: AdaptiveBatchConfig = { ...baseConfig, ...(customConfig || {}) };

  // Fallback to legacy fixed-size batching if disabled
  if (!config.enabled) {
    const size = Math.max(1, config.fixedBatchSize);
    const batches: ClauseBatchItem[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  const batches: ClauseBatchItem[][] = [];
  let currentBatch: ClauseBatchItem[] = [];
  let currentBatchChars = 0;

  for (const item of items) {
    const clauseChars = estimateClauseCharCount(item);
    const isLargeClause = clauseChars >= config.largeClauseThresholdChars;

    // Case 1: Ultra-large clause must be isolated in its own batch
    if (isLargeClause) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchChars = 0;
      }
      batches.push([item]);
      continue;
    }

    // Case 2: Check if current batch should be sealed before appending
    if (currentBatch.length > 0) {
      const willExceedMaxClauses = currentBatch.length >= config.maxBatchSize;
      const willExceedHardChars = currentBatchChars + clauseChars > config.maxBatchChars;
      const alreadyReachedTargetChars = currentBatchChars >= config.targetBatchChars;

      if (willExceedMaxClauses || willExceedHardChars || alreadyReachedTargetChars) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchChars = 0;
      }
    }

    currentBatch.push(item);
    currentBatchChars += clauseChars;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
