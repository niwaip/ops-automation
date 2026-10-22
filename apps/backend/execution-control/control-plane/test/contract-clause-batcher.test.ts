import {
  partitionClausesAdaptively,
  estimateClauseCharCount,
  getAdaptiveBatchConfigFromEnv,
  ClauseBatchItem,
} from '../src/modules/execution/adapters/contract/contract-clause-batcher';

describe('ContractClauseBatcher (Adaptive Batching)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createItem(index: number, content: string, title = `第 ${index + 1} 条`): ClauseBatchItem {
    return {
      index,
      clause: {
        clauseIndex: index,
        clauseNumber: `第 ${index + 1} 条`,
        title,
        originalContent: content,
        candidateRules: [],
      },
    };
  }

  it('returns empty array when items list is empty', () => {
    expect(partitionClausesAdaptively([])).toEqual([]);
  });

  it('packs multiple short clauses up to maxBatchSize (default 5)', () => {
    const items: ClauseBatchItem[] = [
      createItem(0, '简短条款 1 (50字左右的内容，说明双方达成一致)'),
      createItem(1, '简短条款 2 (50字左右的内容，说明双方达成一致)'),
      createItem(2, '简短条款 3 (50字左右的内容，说明双方达成一致)'),
      createItem(3, '简短条款 4 (50字左右的内容，说明双方达成一致)'),
      createItem(4, '简短条款 5 (50字左右的内容，说明双方达成一致)'),
      createItem(5, '简短条款 6 (50字左右的内容，说明双方达成一致)'),
      createItem(6, '简短条款 7 (50字左右的内容，说明双方达成一致)'),
    ];

    const batches = partitionClausesAdaptively(items, {
      maxBatchSize: 5,
      targetBatchChars: 1200,
    });

    // 7 个短条款：前 5 个打包成第 1 批，后 2 个打包成第 2 批
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(5);
    expect(batches[1].length).toBe(2);

    // 顺序验证
    expect(batches[0].map((b) => b.index)).toEqual([0, 1, 2, 3, 4]);
    expect(batches[1].map((b) => b.index)).toEqual([5, 6]);
  });

  it('isolates ultra-large clause in its own dedicated batch', () => {
    const ultraLongText = '超长知识产权与独家许可协议内容。'.repeat(60); // > 1000 字符
    const items: ClauseBatchItem[] = [
      createItem(0, '普通前言 100 字左右'),
      createItem(1, '第二条常规付款约定'),
      createItem(2, ultraLongText, '核心超大知识产权条款'),
      createItem(3, '第四条保密条款 100 字'),
      createItem(4, '第五条争议解决 100 字'),
    ];

    const batches = partitionClausesAdaptively(items, {
      largeClauseThresholdChars: 800,
      maxBatchSize: 5,
    });

    // 结构预期：[0, 1] 批次，[2] 独立批次，[3, 4] 批次
    expect(batches.length).toBe(3);
    expect(batches[0].map((b) => b.index)).toEqual([0, 1]);
    expect(batches[1].map((b) => b.index)).toEqual([2]);
    expect(batches[2].map((b) => b.index)).toEqual([3, 4]);
  });

  it('splits batch when targetBatchChars threshold is met', () => {
    // 构造每条 500 字符的中等条款
    const midText = '商业履约及服务交付验收技术标准细则。'.repeat(25); // ~475 字符
    const items: ClauseBatchItem[] = [
      createItem(0, midText), // ~500 chars
      createItem(1, midText), // ~500 chars (accumulated ~1000 chars >= targetBatchChars 900)
      createItem(2, midText), // should trigger new batch
    ];

    const batches = partitionClausesAdaptively(items, {
      targetBatchChars: 900,
      maxBatchChars: 2000,
      maxBatchSize: 5,
      largeClauseThresholdChars: 2000,
    });

    // 条款 0 和 1 累计 ~1000 字符，达到 target 900，因此条款 2 放入新批次
    expect(batches.length).toBe(2);
    expect(batches[0].map((b) => b.index)).toEqual([0, 1]);
    expect(batches[1].map((b) => b.index)).toEqual([2]);
  });

  it('falls back to legacy fixed batch size when disabled in config or env', () => {
    const items: ClauseBatchItem[] = [
      createItem(0, '1'),
      createItem(1, '2'),
      createItem(2, '3'),
      createItem(3, '4'),
      createItem(4, '5'),
    ];

    const batches = partitionClausesAdaptively(items, {
      enabled: false,
      fixedBatchSize: 2,
    });

    expect(batches.length).toBe(3);
    expect(batches[0].map((b) => b.index)).toEqual([0, 1]);
    expect(batches[1].map((b) => b.index)).toEqual([2, 3]);
    expect(batches[2].map((b) => b.index)).toEqual([4]);
  });

  it('reads configuration correctly from environment variables', () => {
    process.env.CONTRACT_REVIEW_ADAPTIVE_BATCHING = 'true';
    process.env.CONTRACT_REVIEW_MAX_BATCH_SIZE = '4';
    process.env.CONTRACT_REVIEW_TARGET_BATCH_CHARS = '1500';
    process.env.CONTRACT_REVIEW_MAX_BATCH_CHARS = '3000';
    process.env.CONTRACT_REVIEW_LARGE_CLAUSE_CHARS = '1200';

    const cfg = getAdaptiveBatchConfigFromEnv();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxBatchSize).toBe(4);
    expect(cfg.targetBatchChars).toBe(1500);
    expect(cfg.maxBatchChars).toBe(3000);
    expect(cfg.largeClauseThresholdChars).toBe(1200);
  });

  it('correctly calculates character count including candidate rules', () => {
    const item: ClauseBatchItem = {
      index: 0,
      clause: {
        title: '付款条款',
        originalContent: '甲方应于30日内付款。',
        candidateRules: [
          { title: '付款逾期违约金审查', criterion: '违约金日千分之一' },
        ],
      },
    };

    const count = estimateClauseCharCount(item);
    // '付款条款'(4) + '甲方应于30日内付款。'(11) + '付款逾期违约金审查'(9) + '违约金日千分之一'(8) = 32
    expect(count).toBe(32);
  });
});
