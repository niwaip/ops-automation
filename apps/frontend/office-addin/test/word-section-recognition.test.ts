import { TemplateFieldCandidate } from '../src/api/carbone-api';
import {
  mergeWordCandidatesBySlotForRecognition,
  takeWordRecognitionBatchForRecognition,
} from '../src/utils/word-section-recognition';

function createCandidate(
  candidateId: string,
  overrides: Partial<TemplateFieldCandidate> = {},
): TemplateFieldCandidate {
  return {
    candidateId,
    sourceBlockId: overrides.sourceBlockId || 'cell-0-0-0',
    anchorText: overrides.anchorText || candidateId,
    localAnchorText: overrides.localAnchorText,
    parameterSlot: overrides.parameterSlot,
    sampleValue: overrides.sampleValue || '',
    segmentText: overrides.segmentText || overrides.anchorText || candidateId,
    sectionId: overrides.sectionId || 'sec-1',
    sectionTitle: overrides.sectionTitle || '附件三',
    fieldTypeHint: overrides.fieldTypeHint,
    generationPolicyHint: overrides.generationPolicyHint,
    confidence: overrides.confidence ?? 0.9,
    fieldIdHint: overrides.fieldIdHint,
    matchText: overrides.matchText,
    matchReason: overrides.matchReason,
    compareMode: overrides.compareMode || 'structure_only',
    sectionMatchScore: overrides.sectionMatchScore ?? 1,
    location: overrides.location || {
      blockType: 'cell',
      tableIndex: 0,
      rowIndex: 0,
      cellIndex: 0,
    },
    languageRelation: overrides.languageRelation,
  };
}

describe('word section recognition helpers', () => {
  it('保留同一单元格中的中日双语候选，不在发给 AI 前合并成一个', () => {
    const zhCandidate = createCandidate('frontend-word-query-zh', {
      anchorText: '法定代表人或授权代表',
      localAnchorText: '法定代表人或授权代表',
      fieldIdHint: 'partyARepresentative',
      languageRelation: {
        mode: 'adjacent_bilingual_block',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-0-0',
        peerLanguageHint: 'ja',
        peerCandidateId: 'frontend-word-query-jp',
        pairOrdinal: 0,
      },
    });
    const jpCandidate = createCandidate('frontend-word-query-jp', {
      anchorText: '法定代表者または授権者',
      localAnchorText: '法定代表者または授権者',
      languageRelation: {
        mode: 'adjacent_bilingual_block',
        currentLanguageHint: 'ja',
        peerBlockId: 'cell-0-0-0',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-query-zh',
        pairOrdinal: 0,
      },
    });

    const merged = mergeWordCandidatesBySlotForRecognition([zhCandidate, jpCandidate]);

    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((candidate) => candidate.candidateId))).toEqual(new Set([
      'frontend-word-query-zh',
      'frontend-word-query-jp',
    ]));
  });

  it('保留同一表格单元格内换行形成的成对候选，不依赖语言提示也不在发给 AI 前合并', () => {
    const zhCandidate = createCandidate('frontend-word-cell-zh', {
      anchorText: '委托方',
      localAnchorText: '委托方',
      sourceBlockId: 'cell-0-0-0',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
      },
      languageRelation: {
        mode: 'same_block_mixed_language',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-0-0',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-cell-jp',
        pairOrdinal: 0,
      },
    });
    const jpCandidate = createCandidate('frontend-word-cell-jp', {
      anchorText: '委託者',
      localAnchorText: '委託者',
      sourceBlockId: 'cell-0-0-0',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 0,
        cellIndex: 0,
      },
      languageRelation: {
        mode: 'same_block_mixed_language',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-0-0',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-cell-zh',
        pairOrdinal: 0,
      },
    });

    const merged = mergeWordCandidatesBySlotForRecognition([zhCandidate, jpCandidate]);

    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((candidate) => candidate.candidateId))).toEqual(new Set([
      'frontend-word-cell-zh',
      'frontend-word-cell-jp',
    ]));
  });

  it('仍会合并非双语的同槽位重复候选，避免普通重复项放大候选数', () => {
    const strongerCandidate = createCandidate('frontend-word-query-1', {
      anchorText: '联系电话',
      localAnchorText: '联系电话',
      fieldIdHint: 'partyAPhone',
      confidence: 0.95,
    });
    const weakerCandidate = createCandidate('frontend-word-query-2', {
      anchorText: '联系电话号码',
      localAnchorText: '联系电话号码',
      confidence: 0.72,
    });

    const merged = mergeWordCandidatesBySlotForRecognition([strongerCandidate, weakerCandidate]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.candidateId).toBe('frontend-word-query-1');
  });

  it('批次构造会在还有空间时优先带上双语 peer，避免 bilingualGroups 在当前轮次丢失', () => {
    const zhCandidate = createCandidate('frontend-word-query-zh', {
      anchorText: '联系地址',
      localAnchorText: '联系地址',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 2,
        cellIndex: 1,
      },
      languageRelation: {
        mode: 'adjacent_bilingual_block',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-2-3',
        peerLanguageHint: 'ja',
        peerCandidateId: 'frontend-word-query-jp',
        pairOrdinal: 0,
      },
    });
    const singleCandidate = createCandidate('frontend-word-query-single', {
      anchorText: '邮政编码',
      localAnchorText: '邮政编码',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 3,
        cellIndex: 1,
      },
    });
    const jpCandidate = createCandidate('frontend-word-query-jp', {
      anchorText: '連絡アドレス',
      localAnchorText: '連絡アドレス',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 2,
        cellIndex: 3,
      },
      languageRelation: {
        mode: 'adjacent_bilingual_block',
        currentLanguageHint: 'ja',
        peerBlockId: 'cell-0-2-1',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-query-zh',
        pairOrdinal: 0,
      },
    });

    const candidateById = new Map([
      [zhCandidate.candidateId, zhCandidate],
      [singleCandidate.candidateId, singleCandidate],
      [jpCandidate.candidateId, jpCandidate],
    ]);

    const batch = takeWordRecognitionBatchForRecognition({
      retryLoopIds: [],
      unsentLoopIds: [],
      retryNormalIds: [],
      unsentNormalIds: [
        zhCandidate.candidateId,
        singleCandidate.candidateId,
        jpCandidate.candidateId,
      ],
      candidateById,
      acceptedIds: new Set<string>(),
    });

    expect(batch.map((candidate) => candidate.candidateId)).toEqual([
      'frontend-word-query-zh',
      'frontend-word-query-jp',
      'frontend-word-query-single',
    ]);
  });

  it('批次构造会优先带上同单元格成对 peer，不依赖语言提示避免表格候选在当前轮次被拆开', () => {
    const zhCandidate = createCandidate('frontend-word-cell-zh', {
      anchorText: '项目名称',
      localAnchorText: '项目名称',
      sourceBlockId: 'cell-0-1-0',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 1,
        cellIndex: 0,
      },
      languageRelation: {
        mode: 'same_block_mixed_language',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-1-0',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-cell-jp',
        pairOrdinal: 0,
      },
    });
    const jpCandidate = createCandidate('frontend-word-cell-jp', {
      anchorText: 'プロジェクト名',
      localAnchorText: 'プロジェクト名',
      sourceBlockId: 'cell-0-1-0',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 1,
        cellIndex: 0,
      },
      languageRelation: {
        mode: 'same_block_mixed_language',
        currentLanguageHint: 'zh',
        peerBlockId: 'cell-0-1-0',
        peerLanguageHint: 'zh',
        peerCandidateId: 'frontend-word-cell-zh',
        pairOrdinal: 0,
      },
    });
    const singleCandidate = createCandidate('frontend-word-cell-single', {
      anchorText: '签订日期',
      localAnchorText: '签订日期',
      location: {
        blockType: 'cell',
        tableIndex: 0,
        rowIndex: 2,
        cellIndex: 0,
      },
    });

    const candidateById = new Map([
      [zhCandidate.candidateId, zhCandidate],
      [singleCandidate.candidateId, singleCandidate],
      [jpCandidate.candidateId, jpCandidate],
    ]);

    const batch = takeWordRecognitionBatchForRecognition({
      retryLoopIds: [],
      unsentLoopIds: [],
      retryNormalIds: [],
      unsentNormalIds: [
        zhCandidate.candidateId,
        singleCandidate.candidateId,
        jpCandidate.candidateId,
      ],
      candidateById,
      acceptedIds: new Set<string>(),
    });

    expect(batch.map((candidate) => candidate.candidateId)).toEqual([
      'frontend-word-cell-zh',
      'frontend-word-cell-jp',
      'frontend-word-cell-single',
    ]);
  });
});
