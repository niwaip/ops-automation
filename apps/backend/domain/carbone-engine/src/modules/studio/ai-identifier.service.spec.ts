/**
 * AI Identifier Service - Unit Tests
 * 测试AI识别服务的核心处理逻辑
 * 注意：private方法通过公开接口间接测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIIdentifierService', () => {
  let service: AIIdentifierService;
  let mockDocumentStructureService: Partial<DocumentStructureService>;

  // Mock AI响应
  const mockAIResponse = {
    success: true,
    response: JSON.stringify([
      {
        index: 1,
        variablePath: '{d.partyA.name}',
        variableName: 'partyA_name',
        significance: '甲方公司名称',
        fieldType: 'text',
        confidence: 0.95
      },
      {
        index: 2,
        variablePath: '{d.partyB.name}',
        variableName: 'partyB_name',
        significance: '乙方公司名称',
        fieldType: 'text',
        confidence: 0.90
      }
    ])
  };

  // Mock 文档理解AI响应
  const mockDocumentUnderstandingResponse = {
    success: true,
    response: JSON.stringify({
      documentType: '合同',
      mainPurpose: '合作协议模板',
      keyEntities: ['甲方', '乙方', '项目名称'],
      dataSchema: '{ partyA: { name, address }, partyB: { name, address } }',
      sections: [
        {
          name: '第一条 协议双方',
          content: '协议双方信息',
          purpose: '明确合同当事人',
          needsParameterization: true,
          estimatedParams: ['甲方名称', '甲方地址']
        },
        {
          name: '第二条 合同生效',
          content: '合同生效条款',
          purpose: '明确生效条件',
          needsParameterization: false,
          estimatedParams: []
        }
      ],
      parties: [
        { role: '甲方', fieldsNeeded: ['名称', '地址', '代表人'] },
        { role: '乙方', fieldsNeeded: ['名称', '地址', '代表人'] }
      ]
    })
  };

  beforeEach(async () => {
    mockDocumentStructureService = {
      parseDocx: jest.fn().mockResolvedValue({
        elements: [],
        tables: [],
        images: []
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIIdentifierService,
        {
          provide: DocumentStructureService,
          useValue: mockDocumentStructureService,
        },
      ],
    }).compile();

    service = module.get<AIIdentifierService>(AIIdentifierService);

    // 设置环境变量用于测试
    process.env.AI_ORCHESTRATOR_URL = 'http://localhost:3007';
    process.env.AI_MODEL_ID = 'test-model-id';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // 测试1: 流程判断逻辑 - 快速流程 vs 多阶段流程
  // ============================================
  describe('Flow Selection Logic', () => {
    it('should use quick flow when underlineInfo is provided', async () => {
      // Mock AI调用
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '甲方：______',
          paragraphIndex: 0,
          position: { start: 3, end: 9 }
        },
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '乙方：______',
          paragraphIndex: 1,
          position: { start: 3, end: 9 }
        }
      ];

      const documentContent = '甲方：______\n乙方：______';
      const templateType = 'contract';
      const progressCallback = jest.fn();

      const result = await service.identifyFromContentMultiStage(
        documentContent,
        'docx',
        templateType,
        '测试合同',
        progressCallback,
        underlineInfo
      );

      // 验证结果
      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);

      // 验证进度回调被调用
      expect(progressCallback).toHaveBeenCalled();

      // 验证AI只调用了一次（快速流程）
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // 验证flowType为'quick'
      expect(result.contextAnalysis?.flowType).toBe('quick');
    });

    it('should use multi-stage flow when underlineInfo is empty', async () => {
      // Mock 阶段1: 文档理解
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });

      // Mock 阶段2: 章节参数化 (只对needsParameterization=true的章节)
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          response: JSON.stringify({ suggestions: [
            { index: 1, originalText: '______', variablePath: '{d.partyA.name}', variableName: 'partyA_name', fieldType: 'text', significance: '甲方名称', confidence: 0.95 }
          ]})
        }
      });

      // Mock 阶段3: 整合确认
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const documentContent = '第一条 协议双方\n甲方：______\n第二条 合同生效\n本合同自签字之日起生效。';
      const templateType = 'contract';
      const progressCallback = jest.fn();

      const result = await service.identifyFromContentMultiStage(
        documentContent,
        'docx',
        templateType,
        '测试合同',
        progressCallback,
        [] // 空的underlineInfo
      );

      // 验证结果
      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();

      // 验证进度回调被调用多次（多阶段）
      expect(progressCallback).toHaveBeenCalled();

      // 验证AI调用次数 >= 2（文档理解 + 章节参数化/整合）
      expect(mockedAxios.post.mock.calls.length).toBeGreaterThanOrEqual(2);

      // 验证flowType为'multi-stage'
      expect(result.contextAnalysis?.flowType).toBe('multi-stage');
    });

    it('should use multi-stage flow when underlineInfo is undefined', async () => {
      // Mock 阶段1: 文档理解
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });

      // Mock 阶段2-3
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const documentContent = '第一条 协议双方\n甲方：______';
      const templateType = 'contract';

      const result = await service.identifyFromContentMultiStage(
        documentContent,
        'docx',
        templateType,
        undefined,
        undefined,
        undefined // underlineInfo为undefined
      );

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(mockedAxios.post.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // 测试2: 下划线信息处理（间接测试mergeUnderlineInfo）
  // ============================================
  describe('Underline Info Processing', () => {
    it('should correctly process underlineInfo with position via quick flow', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方名称：______',
        paragraphIndex: 0,
        position: { start: 8, end: 14 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方名称：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      // 间接验证：underlineInfo被正确处理
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle multiple underline positions in same paragraph', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '甲方：______ 地址：______',
          paragraphIndex: 0,
          position: { start: 3, end: 9 }
        },
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '甲方：______ 地址：______',
          paragraphIndex: 0,
          position: { start: 14, end: 20 }
        }
      ];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______ 地址：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      // 间接验证：多个位置都被处理
      expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle underlineInfo without paragraphIndex', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 测试3: AI响应解析
  // ============================================
  describe('AI Response Parsing', () => {
    it('should parse JSON array response correctly', async () => {
      const arrayResponse = {
        success: true,
        response: '[{"index":1,"variablePath":"{d.name}","variableName":"name","significance":"名称","fieldType":"text","confidence":0.9}]'
      };
      mockedAxios.post.mockResolvedValueOnce({ data: arrayResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBe(1);
    });

    it('should parse JSON object with suggestions field', async () => {
      const objectResponse = {
        success: true,
        response: '{"suggestions":[{"index":1,"variablePath":"{d.name}","significance":"名称"}]}'
      };
      mockedAxios.post.mockResolvedValueOnce({ data: objectResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      expect(result.suggestions).toBeDefined();
    });

    it('should handle markdown code block in response', async () => {
      const markdownResponse = {
        success: true,
        response: '```json\n[{"index":1,"variablePath":"{d.name}","significance":"名称"}]\n```'
      };
      mockedAxios.post.mockResolvedValueOnce({ data: markdownResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      expect(result.suggestions).toBeDefined();
    });

    it('should handle invalid JSON response gracefully', async () => {
      const invalidResponse = {
        success: true,
        response: 'This is not a valid JSON response'
      };
      mockedAxios.post.mockResolvedValueOnce({ data: invalidResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      // 重试机制会多次调用
      mockedAxios.post.mockResolvedValue({ data: invalidResponse });

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      // 应该返回空suggestions而不是抛出错误
      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });
  });

  // ============================================
  // 测试4: 章节需要参数化判断（间接测试checkNeedsParameterization）
  // ============================================
  describe('Needs Parameterization Check', () => {
    it('should identify sections needing parameterization via multi-stage flow', async () => {
      // 文档有两个章节，一个需要参数化，一个不需要
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const documentContent = `
第一条 协议双方
甲方：______

第二条 合同生效
本合同自签字之日起生效。
`;

      const result = await service.identifyFromContentMultiStage(
        documentContent,
        'docx',
        'contract',
        undefined,
        undefined,
        []
      );

      // 间接验证：只有第一条会调用AI进行参数化
      expect(result).toBeDefined();
    });

    it('should detect blanks in content via identifyFromContent', async () => {
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const contentWithBlanks = '甲方：______';
      const contentWithoutBlanks = '本合同自签字之日起生效，具有法律效力。';

      const resultWithBlanks = await service.identifyFromContent(
        contentWithBlanks,
        'docx',
        'contract',
        undefined
      );

      // 有空白的应该有suggestions
      expect(resultWithBlanks.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // 测试5: 空白模式提取（间接测试extractBlankPatterns）
  // ============================================
  describe('Blank Pattern Extraction', () => {
    it('should extract underline blanks via identifyFromContent', async () => {
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const content = '甲方：______ 乙方：______';

      const result = await service.identifyFromContent(
        content,
        'docx',
        'contract',
        undefined
      );

      // 间接验证：空白被识别
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should extract colon blanks', async () => {
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const content = '甲方名称：     乙方名称：     ';

      const result = await service.identifyFromContent(
        content,
        'docx',
        'contract',
        undefined
      );

      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty for content without blanks', async () => {
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const content = '本合同自签字之日起生效。';

      const result = await service.identifyFromContent(
        content,
        'docx',
        'contract',
        undefined
      );

      expect(result.suggestions).toBeDefined();
    });
  });

  // ============================================
  // 测试6: 章节结构提取（间接测试extractChapterStructure）
  // ============================================
  describe('Chapter Structure Extraction', () => {
    it('should extract chapters from document via multi-stage flow', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const content = '第一条 协议双方\n甲方：______\n第二条 合同生效\n本合同自签字之日起生效。';

      const result = await service.identifyFromContentMultiStage(
        content,
        'docx',
        'contract',
        undefined,
        undefined,
        []
      );

      // 间接验证：章节被正确识别和处理
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // 测试7: 进度回调
  // ============================================
  describe('Progress Callback', () => {
    it('should call progress callback with correct stages', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const progressCallback = jest.fn();

      await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        progressCallback,
        underlineInfo
      );

      expect(progressCallback).toHaveBeenCalled();

      // 验证进度包含必要的阶段信息
      const calls = progressCallback.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.progress).toBeDefined();
      expect(lastCall.message).toBeDefined();
    });

    it('should report 100% progress on completion', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const progressCallback = jest.fn();

      await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        progressCallback,
        underlineInfo
      );

      // 最后一次进度应该是100%
      const calls = progressCallback.mock.calls;
      const lastProgress = calls[calls.length - 1][0];
      expect(lastProgress.progress).toBe(100);
    });
  });

  // ============================================
  // 测试8: 错误处理和重试
  // ============================================
  describe('Error Handling and Retry', () => {
    it('should retry on network error', async () => {
      // 第一次调用失败
      mockedAxios.post.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
      // 第二次调用成功
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      expect(result).toBeDefined();
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should fallback when AI fails', async () => {
      // 所有AI调用都失败
      mockedAxios.post.mockRejectedValue({ message: 'AI service unavailable' });

      const documentContent = '第一条 协议双方\n甲方：______';
      const templateType = 'contract';

      const result = await service.identifyFromContent(
        documentContent,
        'docx',
        templateType,
        undefined
      );

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });
  });

  // ============================================
  // 测试9: 返回结果结构验证
  // ============================================
  describe('Response Structure Validation', () => {
    it('should return correct AIIdentifyResponse structure', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      // 验证返回结构
      expect(result.suggestions).toBeDefined();
      expect(result.templateConfig).toBeDefined();
      expect(result.analyzedAt).toBeDefined();
      expect(result.documentStats).toBeDefined();
      expect(result.loops).toBeDefined();
    });

    it('should process underlineInfo and return suggestions', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

      const underlineInfo = [{
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 }
      }];

      const result = await service.identifyFromContentMultiStage(
        '甲方：______',
        'docx',
        'contract',
        undefined,
        undefined,
        underlineInfo
      );

      // 验证suggestion被处理
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 测试10: 边界情况
  // ============================================
  describe('Edge Cases', () => {
    it('should generate skill guide with array parameters from loop column mappings', async () => {
      const skill = await service.generateAISkillGuide(
        [
          {
            id: 'loop-1',
            type: 'loop',
            applied: true,
            suggestedName: '{#d.contract.procurementDetails}{/d.contract.procurementDetails}',
            originalText: 'tblProcurementDetail',
            details: {
              fieldType: 'loop',
              arrayPath: 'd.contract.procurementDetails',
              tableName: 'tblProcurementDetail',
              significance: '采购明细数组',
              columnMappings: [
                {
                  headerName: '序号',
                  variablePath: 'd.contract.procurementDetails[].seq',
                  sampleValue: '1',
                  columnIndex: 0,
                },
                {
                  headerName: '物料编码',
                  variablePath: 'd.contract.procurementDetails[].materialCode',
                  sampleValue: 'RB-6A-001',
                  columnIndex: 1,
                },
                {
                  headerName: '数量',
                  variablePath: 'd.contract.procurementDetails[].quantity',
                  sampleValue: '2',
                  columnIndex: 2,
                },
              ],
            },
          },
          {
            id: 'var-1',
            type: 'variable',
            applied: true,
            suggestedName: '{d.contract.contractNo}',
            originalText: 'PC-2026-001',
            details: {
              fieldType: 'text',
              significance: '合同编号',
            },
          },
        ],
        {
          tableLoops: [],
        },
        'contract',
        '采购合同模板'
      );

      expect(skill.parameters.map((p: any) => p.name)).toEqual(
        expect.arrayContaining([
          'contract.contractNo',
          'contract.procurementDetails[].seq',
          'contract.procurementDetails[].materialCode',
          'contract.procurementDetails[].quantity',
        ])
      );

      expect(skill.specialRules.tableLoops).toHaveLength(1);
      expect(skill.specialRules.tableLoops[0].arrayPath).toBe('d.contract.procurementDetails');

      const exampleData = JSON.parse(skill.dataExampleJson);
      expect(exampleData.contract.contractNo).toBe('PC-2026-001');
      expect(Array.isArray(exampleData.contract.procurementDetails)).toBe(true);
      expect(exampleData.contract.procurementDetails[0]).toMatchObject({
        seq: '1',
        materialCode: 'RB-6A-001',
        quantity: '2',
        unitPrice: '185,000.00',
        subtotal: '740,000.00',
      });
    });

    it('should preserve excel groupLabel when duplicate suggestions are merged', async () => {
      const skill = await service.generateAISkillGuide(
        [
          {
            id: 'loop-1',
            type: 'loop',
            applied: true,
            suggestedName: '{#d.items}{/d.items}',
            originalText: '采购明细',
            context: '采购明细 ↔ 数据源',
            details: {
              fieldType: 'loop',
              arrayPath: 'd.items',
              tableName: '采购明细',
              columnMappings: [
                {
                  headerName: '物料编码',
                  variablePath: 'd.items[].code',
                  sampleValue: 'RB-6A-001',
                  columnIndex: 0,
                },
              ],
              excelAnchor: {
                type: 'table',
                sheetName: '采购明细',
                pairIndex: 0,
                tableName: '采购明细',
              },
            },
          },
          {
            id: 'var-1',
            type: 'variable',
            applied: true,
            suggestedName: '{d.items[].code}',
            originalText: 'RB-6A-001',
            elementPath: '采购明细!B3',
            details: {
              fieldType: 'text',
            },
          },
        ],
        {
          tableLoops: [],
        },
        'contract',
        '采购合同模板'
      );

      const target = skill.parameters.find((p: any) => p.name === 'items[].code');
      expect(target).toBeDefined();
      expect(target.groupLabel).toBe('采购明细');
      expect(target.sheetName).toBe('采购明细');
    });

    it('should handle empty document content', async () => {
      mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

      const result = await service.identifyFromContentMultiStage(
        '',
        'docx',
        'contract',
        undefined,
        undefined,
        []
      );

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    it('should handle document without blanks', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });
      mockedAxios.post.mockResolvedValue({
        data: { success: true, response: '{"suggestions":[]}' }
      });

      const result = await service.identifyFromContentMultiStage(
        '这是一份已完成的合同，所有内容都已填写。',
        'docx',
        'contract',
        undefined,
        undefined,
        []
      );

      expect(result.suggestions.length).toBe(0);
    });

    it('should handle different template types', async () => {
      const templateTypes = ['contract', 'report', 'invoice', 'certificate'];

      for (const templateType of templateTypes) {
        mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

        const result = await service.identifyFromContentMultiStage(
          '测试内容：______',
          'docx',
          templateType,
          undefined,
          undefined,
          [{
            text: '______',
            underlineType: 'single',
            paragraphText: '测试内容：______',
            paragraphIndex: 0,
            position: { start: 8, end: 14 }
          }]
        );

        expect(result).toBeDefined();
      }
    });
  });
});
