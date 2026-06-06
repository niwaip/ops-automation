import axios from 'axios';
import {
  TemplateWorkflowService,
  WorkflowDocumentIR,
  WorkflowTemplateFieldSpec,
  WorkflowTermAssets,
} from './template-workflow.service';
import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_ASSET_MANIFEST_VERSION,
  TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
} from './studio.types';

describe('TemplateWorkflowService', () => {
  let service: TemplateWorkflowService;

  beforeEach(() => {
    service = new TemplateWorkflowService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('discovers template fields from document IR anchors', () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };

    const result = service.analyzeTemplate(documentIr, undefined, 'zh', ['ja']);

    expect(result.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(['partyAName', 'projectName'])
    );
  });

  it('infers japanese as the only target language when document contains japanese text', () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '委託者（イタクシャ）：______________',
        },
      ],
      anchors: [],
    };

    const result = service.analyzeTemplate(documentIr, undefined, 'zh', []);

    expect(result.languageProfile).toEqual({
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      documentMode: 'single_or_bilingual',
    });
  });

  it('infers english as the target language when document contains english without japanese', () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '项目名称：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: 'Project Name: ____________',
        },
      ],
      anchors: [],
    };

    const result = service.analyzeTemplate(documentIr, undefined, 'zh', []);

    expect(result.languageProfile).toEqual({
      sourceLanguage: 'zh',
      targetLanguages: ['en'],
      documentMode: 'single_or_bilingual',
    });
  });

  it('prefers japanese over english when both appear in the document', () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '项目名称：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: 'Project Name: ____________',
        },
        {
          id: 'p-3',
          type: 'paragraph',
          text: '案件名（アンケンメイ）：______________',
        },
      ],
      anchors: [],
    };

    const result = service.analyzeTemplate(documentIr, undefined, 'zh', ['en']);

    expect(result.languageProfile).toEqual({
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      documentMode: 'single_or_bilingual',
    });
  });

  it('builds compare candidates before understanding and recognition', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };

    const result = await service.compareTemplate(documentIr, undefined, 'zh', ['ja']);

    expect(result.workflowId).toMatch(/^wf_/);
    expect(result.compareId).toMatch(/^cmp_/);
    expect(result.candidateFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceBlockId: 'p-1',
          anchorText: '委托方：',
          fieldIdHint: 'partyAName',
          fieldTypeHint: 'legal_entity_name',
          matchReason: expect.any(String),
        }),
        expect.objectContaining({
          sourceBlockId: 'p-2',
          anchorText: '项目名称：',
          fieldIdHint: 'projectName',
          fieldTypeHint: 'project_name',
          matchReason: expect.any(String),
        }),
      ])
    );
    expect(result.compareSummary).toEqual(
      expect.objectContaining({
        candidateCount: 2,
        sectionCount: 2,
        sections: expect.arrayContaining([
          expect.objectContaining({
            sectionTitle: '委托方：______________',
            candidateCount: 1,
          }),
          expect.objectContaining({
            sectionTitle: '项目名称：______________',
            candidateCount: 1,
          }),
        ]),
      })
    );
  });

  it('prefers section-scoped loose compare results when sample content is provided', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 合同主体',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'sec-2',
          type: 'paragraph',
          text: '第二条 项目信息',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第一条 合同主体\n委托方：广州日产通商贸易有限公司\n\n第二条 项目信息\n项目名称：无线网络设备更新'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', ['ja']);
    const sectionSummaries = result.compareSummary.sections;

    expect(result.candidateFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceBlockId: 'p-1',
          matchText: expect.stringContaining('委托方：广州日产通商贸易有限公司'),
          matchReason: expect.stringContaining('章节文本宽松命中'),
        }),
        expect.objectContaining({
          sourceBlockId: 'p-2',
          matchText: expect.stringContaining('项目名称：无线网络设备更新'),
          matchReason: expect.stringContaining('章节文本宽松命中'),
        }),
      ])
    );
    expect(sectionSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: 'sec-1',
          compareStatus: 'aligned',
          compareMode: 'section_loose_compare',
          matchedCandidateCount: 1,
          unmatchedCandidateCount: 0,
          samplePreview: expect.stringContaining('委托方：广州日产通商贸易有限公司'),
        }),
        expect.objectContaining({
          sectionId: 'sec-2',
          compareStatus: 'aligned',
          compareMode: 'section_loose_compare',
          matchedCandidateCount: 1,
          unmatchedCandidateCount: 0,
          samplePreview: expect.stringContaining('项目名称：无线网络设备更新'),
        }),
      ])
    );
    expect(sectionSummaries.every((section) => section.looseMatchScore > 0)).toBe(true);
  });

  it('keeps loose text candidates without forcing dictionary-style field naming', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第三条 交付信息',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '交付地址：______________',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第三条 交付信息\n交付地址：广州市天河区软件路 8 号'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const addressCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');

    expect(addressCandidate).toEqual(
      expect.objectContaining({
        anchorText: '交付地址：',
        matchText: expect.stringContaining('交付地址：广州市天河区软件路 8 号'),
        matchReason: '章节文本宽松命中',
        compareMode: 'section_loose_compare',
      })
    );
    expect(addressCandidate?.fieldIdHint).toBeUndefined();
    expect(addressCandidate?.fieldTypeHint).toBeUndefined();
    expect(addressCandidate?.generationPolicyHint).toBe('section_text_compare_first');
  });

  it('groups paragraphs under first-level headings like 一、...： and keeps section-scoped matches', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '一、 技术服务内容、方式：',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '签订日期：',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '签订地点：',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '一、 技术服务内容、方式：\n签订日期：2024年10月10日\n签订地点：上海市浦东新区'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const signingDateCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');
    const signingPlaceCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-2');

    expect(signingDateCandidate).toEqual(
      expect.objectContaining({
        sectionId: 'sec-1',
        sectionTitle: '一、 技术服务内容、方式：',
        anchorText: '签订日期：',
        sampleValue: '2024年10月10日',
        matchText: '签订日期：2024年10月10日',
        compareMode: 'section_loose_compare',
      })
    );
    expect(signingPlaceCandidate).toEqual(
      expect.objectContaining({
        sectionId: 'sec-1',
        sectionTitle: '一、 技术服务内容、方式：',
        anchorText: '签订地点：',
        sampleValue: '上海市浦东新区',
      })
    );
    expect(result.compareSummary.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: 'sec-1',
          sectionTitle: '一、 技术服务内容、方式：',
          matchedCandidateCount: 2,
        }),
      ])
    );
  });

  it('keeps document title as the first section and does not treat address lines as headings', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'title-1',
          type: 'paragraph',
          text: '技术服务合同',
          hostData: {
            index: 0,
            format: {
              isTitle: true,
              alignment: 'center',
              fontSize: 16,
            },
          },
        },
        {
          id: 'addr-1',
          type: 'paragraph',
          text: '1000号恒生銀行ビル19階012室',
          hostData: {
            index: 1,
            format: {
              alignment: 'left',
              fontSize: 11,
            },
          },
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '合同编号：',
          hostData: {
            index: 2,
            format: {
              alignment: 'left',
              fontSize: 11,
            },
          },
        },
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '一、 技术服务内容、方式：',
          hostData: {
            index: 3,
            format: {
              alignment: 'left',
              fontSize: 12,
            },
          },
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '签订日期：',
          hostData: {
            index: 4,
            format: {
              alignment: 'left',
              fontSize: 11,
            },
          },
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '技术服务合同\n1000号恒生銀行ビル19階012室\n合同编号：SJ6113\n一、 技术服务内容、方式：\n签订日期：2024年10月10日'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const contractNoCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');
    const signingDateCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-2');

    expect(contractNoCandidate).toEqual(
      expect.objectContaining({
        sectionId: 'title-1',
        sectionTitle: '技术服务合同',
        anchorText: '合同编号：',
        sampleValue: 'SJ6113',
      })
    );
    expect(signingDateCandidate).toEqual(
      expect.objectContaining({
        sectionId: 'sec-1',
        sectionTitle: '一、 技术服务内容、方式：',
        anchorText: '签订日期：',
        sampleValue: '2024年10月10日',
      })
    );
    expect(result.compareSummary.sections.slice(0, 2).map((section) => section.sectionTitle)).toEqual([
      '技术服务合同',
      '一、 技术服务内容、方式：',
    ]);
  });

  it('extracts candidate value by comparing placeholder narrative text with real sample content', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '一、 技术服务内容、方式：',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '本合同甲方委托乙方就                    项目进行专项技术服务，并支付相应的技术服务报酬。',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '一、 技术服务内容、方式：\n本合同甲方委托乙方就无线网络设备更新项目进行专项技术服务，并支付相应的技术服务报酬。'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const candidate = result.candidateFields.find((item) => item.sourceBlockId === 'p-1');

    expect(candidate).toEqual(
      expect.objectContaining({
        sectionId: 'sec-1',
        sectionTitle: '一、 技术服务内容、方式：',
        sampleValue: '无线网络设备更新',
        matchText: '本合同甲方委托乙方就无线网络设备更新项目进行专项技术服务，并支付相应的技术服务报酬。',
        fieldIdHint: undefined,
        compareMode: 'section_loose_compare',
      })
    );
  });

  it('returns compare candidate location and adjacent language relation metadata', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第四条 项目说明',
          hostData: { index: 0 },
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '项目名称：______________',
          hostData: { index: 1 },
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: 'Project Name: Wireless Network Upgrade',
          hostData: { index: 2 },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphIndex: 1,
            start: 5,
            end: 19,
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第四条 项目说明\n项目名称：无线网络设备更新\nProject Name: Wireless Network Upgrade'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', ['en']);
    const candidate = result.candidateFields.find((item) => item.sourceBlockId === 'p-1');

    expect(candidate).toEqual(
      expect.objectContaining({
        location: expect.objectContaining({
          blockType: 'paragraph',
          paragraphIndex: 1,
          anchorStart: 5,
          anchorEnd: 19,
        }),
        languageRelation: expect.objectContaining({
          mode: 'adjacent_bilingual_block',
          currentLanguageHint: 'zh',
          peerBlockId: 'p-2',
          peerLanguageHint: 'en',
        }),
      })
    );
  });

  it('groups multiple same-line parameters into one compare candidate even when sample order differs', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '甲方：______________，乙方：______________，签订日期：______________',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第一条 基本信息\n签订日期：2024年10月10日，乙方：深圳智联科技有限公司，甲方：广州日产通商贸易有限公司'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const groupedCandidates = result.candidateFields.filter((candidate) => candidate.sourceBlockId === 'p-1');

    expect(groupedCandidates).toHaveLength(1);
    expect(groupedCandidates[0]).toEqual(
      expect.objectContaining({
        anchorText: '甲方：',
        fieldIdHint: undefined,
        compareMode: 'section_loose_compare',
        segmentText: expect.stringContaining('甲方：______________，乙方：______________，签订日期：______________'),
        matchText: expect.stringContaining('签订日期：2024年10月10日'),
      })
    );
    expect(groupedCandidates[0]?.matchText).toContain('乙方：深圳智联科技有限公司');
    expect(groupedCandidates[0]?.matchText).toContain('甲方：广州日产通商贸易有限公司');
  });

  it('uses adjacent japanese blocks as compare context for chinese parameter groups', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '甲方：______________，乙方：______________，签订日期：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '甲：______________、乙：______________、締結日（テイケツビ）：______________',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第一条 基本信息\n締結日（テイケツビ）：2024年10月10日、乙：深圳智联科技有限公司、甲：広州日産通商貿易有限公司'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', ['ja']);
    const chineseGroupedCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');

    expect(chineseGroupedCandidate).toEqual(
      expect.objectContaining({
        anchorText: '甲方：',
        fieldIdHint: undefined,
        compareMode: 'section_loose_compare',
        matchText: expect.stringContaining('締結日（テイケツビ）：2024年10月10日'),
        languageRelation: expect.objectContaining({
          mode: 'adjacent_bilingual_block',
          peerBlockId: 'p-2',
          peerLanguageHint: 'ja',
        }),
      })
    );
  });

  it('does not borrow adjacent bilingual compare context for single-label colon blocks', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: '合同号：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '契約番号（ケイヤクバンゴウ）：______________',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第一条 基本信息\n契約番号（ケイヤクバンゴウ）：A-2026-001'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', ['ja']);
    const chineseCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');

    expect(chineseCandidate).toEqual(
      expect.objectContaining({
        anchorText: '合同号：',
        languageRelation: expect.objectContaining({
          mode: 'adjacent_bilingual_block',
          peerBlockId: 'p-2',
          peerLanguageHint: 'ja',
        }),
      })
    );
    expect(chineseCandidate?.matchText).toBeUndefined();
  });

  it('does not treat adjacent english and japanese blocks as a supported bilingual pair', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 Basic Information',
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: 'Project Name: ____________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '案件名（アンケンメイ）：______________',
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from(
        '第一条 Basic Information\n案件名（アンケンメイ）：無線ネットワーク設備更新'
      ).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const englishCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'p-1');

    expect(englishCandidate?.languageRelation).toEqual(
      expect.objectContaining({
        mode: 'single_language',
        currentLanguageHint: 'en',
      })
    );
  });

  it('uses the right-side table cell as the sample value in key-value rows', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '签订日期',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-1-0',
          type: 'cell',
          text: '签订地点',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-1-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 基本信息</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>签订日期</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2024年10月10日</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>签订地点</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>上海市浦东新区</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const signingDateCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-0-1');
    const signingPlaceCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-1-1');

    expect(signingDateCandidate).toEqual(
      expect.objectContaining({
        anchorText: '签订日期',
        sampleValue: '2024年10月10日',
        matchText: '签订日期\t2024年10月10日',
        fieldIdHint: 'signingDate',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 1,
        }),
      })
    );
    expect(signingPlaceCandidate).toEqual(
      expect.objectContaining({
        anchorText: '签订地点',
        sampleValue: '上海市浦东新区',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 1,
          cellIndex: 1,
        }),
      })
    );
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-0-0')).toBe(false);
  });

  it('uses the first table row as column titles for grid-style tables', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第二条 项目清单',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '项目名称',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '数量',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-1-0',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-1-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第二条 项目清单</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>项目名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数量</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>无线网络设备更新</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>20台</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const projectNameCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-1-0');
    const amountCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-1-1');

    expect(projectNameCandidate).toEqual(
      expect.objectContaining({
        anchorText: '项目名称',
        sampleValue: '无线网络设备更新',
        matchText: '无线网络设备更新\t20台',
        fieldIdHint: 'projectName',
      })
    );
    expect(amountCandidate).toEqual(
      expect.objectContaining({
        anchorText: '数量',
        sampleValue: '20台',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 1,
          cellIndex: 1,
        }),
      })
    );
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-0-0')).toBe(false);
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-0-1')).toBe(false);
  });

  it('treats first-row headers plus blank body rows as loop candidates and highlights the second row', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第二条 费用清单',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '费用名称',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '金额',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-1-0',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-1-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-2-0',
          type: 'cell',
          text: '',
          hostData: {
            tableIndex: 0,
            rowIndex: 2,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-2-1',
          type: 'cell',
          text: '',
          hostData: {
            tableIndex: 0,
            rowIndex: 2,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第二条 费用清单</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>费用名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>金额</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>实施服务费</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10000元</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const nameCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-1-0');
    const amountCandidate = result.candidateFields.find((candidate) => candidate.sourceBlockId === 'cell-0-1-1');

    expect(nameCandidate).toEqual(
      expect.objectContaining({
        anchorText: '费用名称',
        sampleValue: '实施服务费',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 1,
          cellIndex: 0,
        }),
      })
    );
    expect(amountCandidate).toEqual(
      expect.objectContaining({
        anchorText: '金额',
        sampleValue: '10000元',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 1,
          cellIndex: 1,
        }),
      })
    );
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-2-0')).toBe(false);
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-2-1')).toBe(false);
  });

  it('reads blank-cell parameters from the right-side cell and splits multiline titles', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 参与方',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '甲方\n乙方',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 参与方</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc>',
        '<w:p><w:r><w:t>广州日产通商贸易有限公司</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>深圳智联科技有限公司</w:t></w:r></w:p>',
        '</w:tc>',
        '<w:tc>',
        '<w:p><w:r><w:t>甲方</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>乙方</w:t></w:r></w:p>',
        '</w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const partyACandidate = result.candidateFields.find((candidate) =>
      candidate.sourceBlockId === 'cell-0-0-0' && candidate.anchorText === '甲方'
    );
    const partyBCandidate = result.candidateFields.find((candidate) =>
      candidate.sourceBlockId === 'cell-0-0-0' && candidate.anchorText === '乙方'
    );

    expect(partyACandidate).toEqual(
      expect.objectContaining({
        anchorText: '甲方',
        sampleValue: '广州日产通商贸易有限公司',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 0,
        }),
      })
    );
    expect(partyBCandidate).toEqual(
      expect.objectContaining({
        anchorText: '乙方',
        sampleValue: '深圳智联科技有限公司',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 0,
        }),
      })
    );
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-0-1')).toBe(false);
  });

  it('splits bilingual loop headers from the same cell and keeps duplicated labels as separate candidates', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第二条 项目清单',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '项目\nプロジェクト',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '品名\n品名',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-1-0',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-1-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 0,
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 1,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第二条 项目清单</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p><w:p><w:r><w:t>プロジェクト</w:t></w:r></w:p></w:tc>',
        '<w:tc><w:p><w:r><w:t>品名</w:t></w:r></w:p><w:p><w:r><w:t>品名</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>无线网络设备更新</w:t></w:r></w:p></w:tc>',
        '<w:tc><w:p><w:r><w:t>AP-001</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', ['ja']);
    const projectCandidates = result.candidateFields.filter((candidate) => candidate.sourceBlockId === 'cell-0-1-0');
    const itemNameCandidates = result.candidateFields.filter((candidate) => candidate.sourceBlockId === 'cell-0-1-1');

    expect(projectCandidates).toHaveLength(2);
    expect(projectCandidates.map((candidate) => candidate.anchorText)).toEqual(['项目', 'プロジェクト']);
    expect(projectCandidates.map((candidate) => candidate.sampleValue)).toEqual([
      '无线网络设备更新',
      '无线网络设备更新',
    ]);

    expect(itemNameCandidates).toHaveLength(2);
    expect(itemNameCandidates.map((candidate) => candidate.anchorText)).toEqual(['品名', '品名']);
    expect(itemNameCandidates.map((candidate) => candidate.sampleValue)).toEqual(['AP-001', 'AP-001']);
  });

  it('extracts multiple parameters from a non-loop table cell without dropping the first one', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 合同主体',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '甲方：______________\n乙方：______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 合同主体</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc>',
        '<w:p><w:r><w:t>甲方：广州日产通商贸易有限公司</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>乙方：深圳智联科技有限公司</w:t></w:r></w:p>',
        '</w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const partyACandidate = result.candidateFields.find((candidate) =>
      candidate.sourceBlockId === 'cell-0-0-0' && candidate.anchorText === '甲方：'
    );
    const partyBCandidate = result.candidateFields.find((candidate) =>
      candidate.sourceBlockId === 'cell-0-0-0' && candidate.anchorText === '乙方：'
    );

    expect(partyACandidate).toEqual(
      expect.objectContaining({
        anchorText: '甲方：',
        sampleValue: '广州日产通商贸易有限公司',
      })
    );
    expect(partyBCandidate).toEqual(
      expect.objectContaining({
        anchorText: '乙方：',
        sampleValue: '深圳智联科技有限公司',
      })
    );
  });

  it('prefers the left-side label when a blank cell has values on both sides', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '签订地点',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
        {
          id: 'cell-0-0-2',
          type: 'cell',
          text: '备用标题',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 2,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 基本信息</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>签订地点</w:t></w:r></w:p></w:tc>',
        '<w:tc><w:p><w:r><w:t>上海市浦东新区</w:t></w:r></w:p></w:tc>',
        '<w:tc><w:p><w:r><w:t>备用标题</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const candidate = result.candidateFields.find((item) => item.sourceBlockId === 'cell-0-0-1');

    expect(candidate).toEqual(
      expect.objectContaining({
        anchorText: '签订地点',
        sampleValue: '上海市浦东新区',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 1,
        }),
      })
    );
  });

  it('skips key-value table cells when the right side already contains a concrete value', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 基本信息',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '签订地点',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '上海市浦东新区',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
      ],
      anchors: [],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 基本信息</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>签订地点</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>上海市浦东新区</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);

    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'cell-0-0-1')).toBe(false);
  });

  it('prefers table-cell candidates and skips duplicated table label paragraphs', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 合同主体',
        },
        {
          id: 'p-duplicate-label',
          type: 'paragraph',
          text: '甲方：',
        },
        {
          id: 'cell-0-0-0',
          type: 'cell',
          text: '甲方：',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 0,
          },
        },
        {
          id: 'cell-0-0-1',
          type: 'cell',
          text: '______________',
          hostData: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            tableIndex: 0,
            rowIndex: 0,
            cellIndex: 1,
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from([
        '<w:document><w:body>',
        '<w:p><w:r><w:t>第一条 合同主体</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>甲方：</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>广州日产通商贸易有限公司</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join('')).toString('base64'),
    };

    const result = await service.compareTemplate(documentIr, sampleDocument, 'zh', []);
    const partyCandidate = result.candidateFields.find((candidate) => candidate.anchorText === '甲方：');

    expect(partyCandidate).toEqual(
      expect.objectContaining({
        sourceBlockId: 'cell-0-0-1',
        location: expect.objectContaining({
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 1,
        }),
      })
    );
    expect(result.candidateFields.some((candidate) => candidate.sourceBlockId === 'p-duplicate-label')).toBe(false);
  });

  it('compiles scalar fields into Carbone binding plan', () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'partyAName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'paymentMode',
        type: 'enum',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'enum_mapping',
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);

    expect(bindingPlan.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variablePath: 'partyAName_zh', valueSelector: 'partyAName.zh' }),
        expect.objectContaining({ variablePath: 'partyAName_ja', valueSelector: 'partyAName.ja' }),
        expect.objectContaining({ variablePath: 'paymentMode_code', valueSelector: 'paymentMode.code' }),
      ])
    );
  });

  it('does not re-expand template-authored language fields in binding plan', () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'contractPartyAName_cn',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'contractPartyAName_jp',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'paymentFirstDays',
        type: 'number',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'format_only',
        required: true,
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);

    expect(bindingPlan.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variablePath: 'contractPartyAName_cn',
          valueSelector: 'contractPartyAName_cn.zh',
          language: 'zh',
        }),
        expect.objectContaining({
          variablePath: 'contractPartyAName_jp',
          valueSelector: 'contractPartyAName_jp.ja',
          language: 'ja',
        }),
        expect.objectContaining({
          variablePath: 'paymentFirstDays_zh',
          valueSelector: 'paymentFirstDays.zh',
          language: 'zh',
        }),
        expect.objectContaining({
          variablePath: 'paymentFirstDays_ja',
          valueSelector: 'paymentFirstDays.ja',
          language: 'ja',
        }),
      ])
    );
    expect(bindingPlan.bindings).toHaveLength(4);
  });

  it('generates render data with dictionary, enum and format rules', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'partyAName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'projectName',
        type: 'project_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'paymentMode',
        type: 'enum',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'enum_mapping',
        required: true,
      },
      {
        fieldId: 'serviceFeeTotal',
        type: 'currency_amount',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'format_only',
        required: true,
      },
    ];
    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);

    const result = await service.renderData(
      '甲方是广州日产通商贸易有限公司，项目是无线网络设备更新，技术服务费总额为人民币137,000元，付款方式是一次支付。',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        partyAName_zh: '广州日产通商贸易有限公司',
        partyAName_ja: '広州日産通商貿易有限公司',
        projectName_ja: '無線ネットワーク設備更新',
        paymentMode_code: 'one_time',
        paymentMode_ja: '一回払い',
        serviceFeeTotal_zh: '人民币137,000.00元',
        serviceFeeTotal_ja: '人民元137,000.00元',
      })
    );
    expect(result.missingFields).toHaveLength(0);
    expect(result.needsReviewFields).toHaveLength(0);
  });

  it('generates render data for dotted field ids with runtime compat selectors', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'contract.partyA.name',
        type: 'string',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        required: true,
      },
    ];

    const result = await service.renderData(
      '',
      fieldSpecs,
      {
        templateId: 'tpl_runtime_compat',
        version: 1,
        bindings: [
          {
            fieldId: 'contract.partyA.name',
            variablePath: 'contract.partyA.name_cn',
            valueSelector: 'contract.partyA.name.zh',
            language: 'zh',
            transform: 'identity',
            required: true,
          },
          {
            fieldId: 'contract.partyA.name',
            variablePath: 'contract.partyA.name_jp',
            valueSelector: 'contract.partyA.name.ja',
            language: 'ja',
            transform: 'identity',
            required: true,
          },
        ],
      },
      'zh',
      ['ja'],
      {
        'contract.partyA.name': {
          zh: '上海云章科技有限公司',
          ja: '上海云章科技有限公司（日本語）',
        },
      },
    );

    expect(result.data).toEqual({
      'contract.partyA.name_cn': '上海云章科技有限公司',
      'contract.partyA.name_jp': '上海云章科技有限公司（日本語）',
    });
    expect(result.missingFields).toHaveLength(0);
  });

  it('preserves list values in binding plan and render data', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'lineItems',
        valueMode: 'list',
        type: 'table_row',
        required: true,
        itemSchema: ['name', 'amount'],
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', []);
    const result = await service.renderData(
      '',
      fieldSpecs,
      bindingPlan,
      'zh',
      [],
      {
        lineItems: [
          { name: '实施服务费', amount: '10000元' },
          { name: '维护服务费', amount: '3000元' },
        ],
      },
    );

    expect(bindingPlan.bindings).toEqual([
      expect.objectContaining({
        fieldId: 'lineItems',
        variablePath: 'lineItems',
        valueSelector: 'lineItems.value',
      }),
    ]);
    expect(result.data.lineItems).toEqual([
      { name: '实施服务费', amount: '10000元' },
      { name: '维护服务费', amount: '3000元' },
    ]);
    expect(result.missingFields).toHaveLength(0);
  });

  it('parses bilingual tabular text into list values for loop rendering', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'lineItems',
        valueMode: 'list',
        type: 'table_row',
        required: true,
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        itemSchema: ['projectName', 'itemName', 'quantity', 'maintenanceFee'],
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);
    const result = await service.renderData(
      [
        '项目\t品名\t数量\t维护费',
        'プロジェクト\t品名\t数量\tメンテ料',
        '企业信息化系统升级\t系统开发服务\t1\t¥50,000/年',
        '企業情報化システムアップグレード\tシステム開発サービス\t1\t¥50,000/年',
        '企业信息化系统升级\t系统集成服务\t1\t',
        '企業情報化システムアップグレード\tシステムインテグレーションサービス\t1\t',
      ].join('\n'),
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
    );

    expect(result.data.lineItems).toEqual([
      {
        projectName: '企业信息化系统升级\n企業情報化システムアップグレード',
        projectName_zh: '企业信息化系统升级',
        projectName_ja: '企業情報化システムアップグレード',
        itemName: '系统开发服务\nシステム開発サービス',
        itemName_zh: '系统开发服务',
        itemName_ja: 'システム開発サービス',
        quantity: '1',
        quantity_zh: '1',
        quantity_ja: '1',
        maintenanceFee: '¥50,000/年',
        maintenanceFee_zh: '¥50,000/年',
        maintenanceFee_ja: '¥50,000/年',
      },
      {
        projectName: '企业信息化系统升级\n企業情報化システムアップグレード',
        projectName_zh: '企业信息化系统升级',
        projectName_ja: '企業情報化システムアップグレード',
        itemName: '系统集成服务\nシステムインテグレーションサービス',
        itemName_zh: '系统集成服务',
        itemName_ja: 'システムインテグレーションサービス',
        quantity: '1',
        quantity_zh: '1',
        quantity_ja: '1',
        maintenanceFee: '',
        maintenanceFee_zh: '',
        maintenanceFee_ja: '',
      },
    ]);
    expect(result.missingFields).toHaveLength(0);
    expect(result.sourceTrace.lineItems).toEqual(
      expect.objectContaining({
        resolution: 'tabular_text_parse',
        valueMode: 'list',
        rowCount: 2,
      }),
    );
  });

  it('keeps single-language tabular rows unchanged for loop rendering', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'lineItems',
        valueMode: 'list',
        type: 'table_row',
        required: true,
        itemSchema: ['projectName', 'itemName', 'quantity', 'maintenanceFee'],
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', []);
    const result = await service.renderData(
      [
        '项目\t品名\t数量\t维护费',
        '企业信息化系统升级\t系统开发服务\t1\t¥50,000/年',
        '企业信息化系统升级\t系统集成服务\t1\t',
      ].join('\n'),
      fieldSpecs,
      bindingPlan,
      'zh',
      [],
    );

    expect(result.data.lineItems).toEqual([
      {
        projectName: '企业信息化系统升级',
        itemName: '系统开发服务',
        quantity: '1',
        maintenanceFee: '¥50,000/年',
      },
      {
        projectName: '企业信息化系统升级',
        itemName: '系统集成服务',
        quantity: '1',
        maintenanceFee: '',
      },
    ]);
  });

  it('normalizes bilingual table overrides for multi-parameter cells', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'lineItems',
        valueMode: 'list',
        type: 'table_row',
        required: true,
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        itemSchema: ['projectName', 'itemName', 'quantity', 'maintenanceFee'],
      },
    ];

    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);
    const result = await service.renderData(
      '',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
      {
        lineItems: [
          {
            projectName_zh: '企业信息化系统升级',
            projectName_ja: '企業情報化システムアップグレード',
            itemName_zh: '系统开发服务',
            itemName_ja: 'システム開発サービス',
            quantity: '1',
            maintenanceFee: '¥50,000/年',
          },
        ],
      },
    );

    expect(result.data.lineItems).toEqual([
      {
        projectName: '企业信息化系统升级\n企業情報化システムアップグレード',
        projectName_zh: '企业信息化系统升级',
        projectName_ja: '企業情報化システムアップグレード',
        itemName: '系统开发服务\nシステム開発サービス',
        itemName_zh: '系统开发服务',
        itemName_ja: 'システム開発サービス',
        quantity: '1',
        quantity_zh: '1',
        quantity_ja: '1',
        maintenanceFee: '¥50,000/年',
        maintenanceFee_zh: '¥50,000/年',
        maintenanceFee_ja: '¥50,000/年',
      },
    ]);
  });

  it('prefers template scoped assets over tenant and global defaults', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'projectName',
        type: 'project_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
      {
        fieldId: 'paymentMode',
        type: 'enum',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'enum_mapping',
        required: true,
      },
    ];
    const termAssets: WorkflowTermAssets = {
      termbase: [
        {
          termId: 'tb_tpl_2001',
          applicableFieldIds: ['projectName'],
          sourceLanguage: 'zh',
          sourceValue: '无线网络设备更新',
          normalizedSourceValue: '无线网络设备更新',
          translations: {
            zh: '无线网络设备更新',
            ja: 'テンプレート専用設備更新',
          },
          scope: 'template',
          status: 'approved',
          version: 2,
        },
      ],
      enumMappings: {
        paymentMode: [
          {
            code: 'one_time_tpl',
            labels: {
              zh: '一次支付',
              ja: 'テンプレート一括払い',
            },
            aliases: ['一次支付', '一次付款'],
            scope: 'template',
            status: 'active',
            version: 2,
          },
        ],
      },
    };
    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);

    const result = await service.renderData(
      '项目是无线网络设备更新，付款方式是一次支付。',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
      undefined,
      termAssets,
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        projectName_ja: 'テンプレート専用設備更新',
        paymentMode_code: 'one_time_tpl',
        paymentMode_ja: 'テンプレート一括払い',
      })
    );
    expect(result.sourceTrace.projectName).toEqual(
      expect.objectContaining({
        resolution: 'dictionary_hit',
        scope: 'template',
        termVersion: 2,
      })
    );
    expect(result.sourceTrace.paymentMode).toEqual(
      expect.objectContaining({
        resolution: 'enum_hit',
        scope: 'template',
        enumVersion: 2,
      })
    );
  });

  it('batch translates scalar text fields once and skips non-text fields', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'contractPartyAName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'llm_translate',
        required: true,
      },
      {
        fieldId: 'paymentDays',
        type: 'number',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'format_only',
        required: true,
      },
      {
        fieldId: 'signingDate',
        type: 'date',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'format_only',
        required: true,
      },
    ];
    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        response: JSON.stringify({
          contractPartyAName: '上海クラウドドキュメント科技有限公司',
        }),
      },
    } as any);

    const result = await service.renderData(
      '',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
      {
        contractPartyAName: '上海云章科技有限公司',
        paymentDays: '30',
        signingDate: '2026-06-01',
      },
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(
      expect.objectContaining({
        contractPartyAName_zh: '上海云章科技有限公司',
        contractPartyAName_ja: '上海クラウドドキュメント科技有限公司',
        paymentDays_zh: '30',
        paymentDays_ja: '30',
        signingDate_zh: '2026年06月01日',
        signingDate_ja: '2026年06月01日',
      }),
    );
    expect(result.sourceTrace.contractPartyAName).toEqual(
      expect.objectContaining({
        resolution: 'llm_translated',
        translationMode: 'batch',
        translatedTargets: ['ja'],
      }),
    );
  });

  it('accepts cn/jp localized overrides and reuses aliases without extra translation', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'contractPartyAName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'llm_translate',
        required: true,
      },
    ];
    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);
    const postSpy = jest.spyOn(axios, 'post');

    const result = await service.renderData(
      '',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
      {
        contractPartyAName: {
          cn: '上海云章科技有限公司',
          jp: '上海クラウドドキュメント科技有限公司',
        },
      },
    );

    expect(postSpy).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        contractPartyAName_zh: '上海云章科技有限公司',
        contractPartyAName_ja: '上海クラウドドキュメント科技有限公司',
        contractPartyAName_cn: '上海云章科技有限公司',
        contractPartyAName_jp: '上海クラウドドキュメント科技有限公司',
      }),
    );
    expect(result.sourceTrace.contractPartyAName).toEqual(
      expect.objectContaining({
        resolution: 'localized_override',
      }),
    );
  });

  it('accepts flat localized sibling overrides produced by workflow render bindings', async () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'companyName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'llm_translate',
        required: true,
      },
    ];
    const bindingPlan = service.compileBindingPlan('tpl_demo', 1, fieldSpecs, 'zh', ['ja']);
    const postSpy = jest.spyOn(axios, 'post');

    const result = await service.renderData(
      '',
      fieldSpecs,
      bindingPlan,
      'zh',
      ['ja'],
      {
        companyName_zh: '上海云章科技有限公司',
        companyName_ja: '上海クラウドドキュメント科技有限公司',
      },
    );

    expect(postSpy).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        companyName_zh: '上海云章科技有限公司',
        companyName_ja: '上海クラウドドキュメント科技有限公司',
        companyName_cn: '上海云章科技有限公司',
        companyName_jp: '上海クラウドドキュメント科技有限公司',
      }),
    );
    expect(result.sourceTrace.companyName).toEqual(
      expect.objectContaining({
        resolution: 'localized_override',
      }),
    );
  });

  it('returns block results and structured context analysis for recognition', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'sec-1',
          type: 'paragraph',
          text: '第一条 委托方：______________',
        },
        {
          id: 'sec-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '第一条 委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };

    const result = await service.recognizeTemplate(documentIr, undefined, 'zh', ['ja']);

    expect(result.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(['partyAName', 'projectName'])
    );
    expect(result.blockResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: 'sec-1',
          resultStatus: 'fallback_success',
          fieldIds: expect.arrayContaining(['partyAName']),
        }),
        expect.objectContaining({
          blockId: 'sec-2',
          resultStatus: 'fallback_success',
          fieldIds: expect.arrayContaining(['projectName']),
        }),
      ])
    );
    expect(result.contextAnalysis).toEqual(
      expect.objectContaining({
        requestedAI: false,
        usedAI: false,
        resultStatus: 'fallback_success',
        requestTrace: expect.objectContaining({
          blockCount: 2,
          candidateFieldCount: 2,
        }),
        fallbackTrace: expect.objectContaining({
          usedFallback: true,
        }),
      })
    );
  });

  it('uses understanding summary and block AI results when sample document is provided', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from('委托方：广州日产通商贸易有限公司\n项目名称：无线网络设备更新').toString('base64'),
    };
    const postSpy = jest.spyOn(axios, 'post');
    postSpy
      .mockResolvedValueOnce({
        data: {
          response: JSON.stringify({
            documentTitle: '技术服务合同',
            understandingSummaryText: '这是一份技术服务合同，重点字段集中在主体信息和项目名称。',
            sectionHints: ['合同头部', '项目条款'],
            terminologyCandidates: ['无线网络设备更新'],
            layoutFeatures: ['paragraphs:2'],
            warnings: [],
          }),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          response: JSON.stringify({
            summary: '当前块识别到主体字段',
            suggestions: [
              {
                candidateId: 'fc_1',
                fieldId: 'partyAName',
                fieldType: 'legal_entity_name',
                policy: 'dictionary_first',
                riskLevel: 'high',
                confidence: 0.97,
                needsReview: false,
                accepted: true,
              },
            ],
            warnings: [],
          }),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          response: JSON.stringify({
            summary: '当前块识别到项目字段',
            suggestions: [
              {
                candidateId: 'fc_2',
                fieldId: 'projectName',
                fieldType: 'project_name',
                policy: 'dictionary_first',
                riskLevel: 'medium',
                confidence: 0.95,
                needsReview: false,
                accepted: true,
              },
            ],
            warnings: [],
          }),
        },
      } as any);

    const result = await service.recognizeTemplate(documentIr, sampleDocument, 'zh', ['ja']);

    expect(postSpy).toHaveBeenCalledTimes(3);
    expect(result.contextAnalysis).toEqual(
      expect.objectContaining({
        requestedAI: true,
        usedAI: true,
        resultSource: 'ai',
        resultStatus: 'succeeded',
        requestTrace: expect.objectContaining({
          requestCount: 2,
          promptTemplateVersion: 'word-recognize-v1',
        }),
      })
    );
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'partyAName',
          confidence: 0.97,
          needsReview: false,
        }),
        expect.objectContaining({
          fieldId: 'projectName',
          confidence: 0.95,
          needsReview: false,
        }),
      ])
    );
    expect(result.blockResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: 'p-1',
          aiCallSucceeded: true,
          resultStatus: 'succeeded',
          fieldIds: ['partyAName'],
        }),
        expect.objectContaining({
          blockId: 'p-2',
          aiCallSucceeded: true,
          resultStatus: 'succeeded',
          fieldIds: ['projectName'],
        }),
      ])
    );
  });

  it('builds template asset manifest from field specs and language profile', () => {
    const fieldSpecs: WorkflowTemplateFieldSpec[] = [
      {
        fieldId: 'partyAName',
        type: 'legal_entity_name',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        policy: 'dictionary_first',
        required: true,
      },
    ];

    const manifest = service.buildTemplateAssetManifest(
      'tpl_asset_demo',
      'contract.docx',
      'docx',
      fieldSpecs,
      {
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      undefined,
      TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
      '1.2.3',
    );

    expect(manifest).toEqual(
      expect.objectContaining({
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
        templateId: 'tpl_asset_demo',
        fileName: 'contract.docx',
        format: 'docx',
        fieldCount: 1,
        renderPlanVersion: DEFAULT_RENDER_PLAN_VERSION,
        metadata: expect.objectContaining({
          source: TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
          addinVersion: '1.2.3',
        }),
      }),
    );
    expect(manifest.renderPlan.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'partyAName',
          variablePath: 'partyAName_zh',
        }),
        expect.objectContaining({
          fieldId: 'partyAName',
          variablePath: 'partyAName_ja',
        }),
      ]),
    );
  });

  it('reuses prefetched understanding during recognition to avoid duplicate understanding call', async () => {
    const documentIr: WorkflowDocumentIR = {
      host: 'word',
      elements: [
        {
          id: 'p-1',
          type: 'paragraph',
          text: '委托方：______________',
        },
        {
          id: 'p-2',
          type: 'paragraph',
          text: '项目名称：______________',
        },
      ],
      anchors: [
        {
          id: 'a-1',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '委托方：______________',
          },
        },
        {
          id: 'a-2',
          type: 'word-range',
          text: '______________',
          ref: {
            paragraphText: '项目名称：______________',
          },
        },
      ],
    };
    const sampleDocument = {
      fileName: 'sample.docx',
      contentBase64: Buffer.from('委托方：广州日产通商贸易有限公司\n项目名称：无线网络设备更新').toString('base64'),
    };
    const prefetchedUnderstanding = {
      analysisId: 'ana_prefetched',
      languageProfile: {
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      summary: {
        documentTitle: '技术服务合同',
        understandingSummaryText: '已复用前一步整体理解结果。',
        sampleFileName: 'sample.docx',
        paragraphCount: 2,
        tableCount: 0,
        sectionHints: ['合同头部', '项目条款'],
        sectionSummaries: [],
        terminologyCandidates: ['无线网络设备更新'],
        fieldCandidateIds: ['partyAName', 'projectName'],
        layoutFeatures: ['paragraphs:2'],
      },
      warnings: [],
      contextAnalysis: {
        usedAI: true,
        promptRequestText: 'prefetched-understanding-prompt',
        rawAiResponse: 'prefetched-understanding-response',
      },
    };
    const postSpy = jest.spyOn(axios, 'post');
    postSpy
      .mockResolvedValueOnce({
        data: {
          response: JSON.stringify({
            summary: '当前块识别到主体字段',
            suggestions: [
              {
                candidateId: 'fc_1',
                fieldId: 'partyAName',
                fieldType: 'legal_entity_name',
                policy: 'dictionary_first',
                riskLevel: 'high',
                confidence: 0.97,
                needsReview: false,
                accepted: true,
              },
            ],
            warnings: [],
          }),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          response: JSON.stringify({
            summary: '当前块识别到项目字段',
            suggestions: [
              {
                candidateId: 'fc_2',
                fieldId: 'projectName',
                fieldType: 'project_name',
                policy: 'dictionary_first',
                riskLevel: 'medium',
                confidence: 0.95,
                needsReview: false,
                accepted: true,
              },
            ],
            warnings: [],
          }),
        },
      } as any);

    const result = await service.recognizeTemplate(
      documentIr,
      sampleDocument,
      'zh',
      ['ja'],
      undefined,
      undefined,
      prefetchedUnderstanding,
    );

    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(result.contextAnalysis).toEqual(
      expect.objectContaining({
        globalUnderstandingUsedAI: true,
        cacheTrace: expect.objectContaining({
          understandingHit: true,
        }),
        debugArtifacts: expect.objectContaining({
          promptRequestText: expect.any(String),
        }),
      })
    );
  });
});
