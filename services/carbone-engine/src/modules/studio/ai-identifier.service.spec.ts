/**
 * AI Identifier Service - Unit Tests
 * 测试AI识别服务的核心处理逻辑
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AIIdentifierService, ProcessingStage, ProcessingProgress } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { Logger } from '@nestjs/common';
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
    it('should use quickNameParameters when underlineInfo is provided', async () => {
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
    });

    it('should use multi-stage flow when underlineInfo is empty', async () => {
      // Mock 阶段1: 文档理解
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });

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

      // 验证AI调用次数（文档理解 + 章节参数化(只对needsParameterization=true) + 整合）
      // 注意：只有第一条需要参数化，第二条不需要
      expect(mockedAxios.post.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should use multi-stage flow when underlineInfo is undefined', async () => {
      // Mock 阶段1: 文档理解
      mockedAxios.post.mockResolvedValueOnce({ data: mockDocumentUnderstandingResponse });

      // Mock 阶段3: 整合确认
      mockedAxios.post.mockResolvedValueOnce({ data: mockAIResponse });

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
  // 测试2: 下划线信息处理 - mergeUnderlineInfo
  // ============================================
  describe('Underline Info Processing', () => {
    it('should correctly process underlineInfo with position', () => {
      const underlineInfo = [
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '甲方名称：______',
          paragraphIndex: 0,
          position: { start: 8, end: 14 }
        }
      ];

      const documentContent = '甲方名称：______';
      const templateType = 'contract';

      // 调用内部方法测试
      const result = service.mergeUnderlineInfo([], underlineInfo, documentContent, templateType);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].text).toBe('______');
      expect(result[0].chapter).toBeDefined();
    });

    it('should handle multiple underline positions in same paragraph', () => {
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

      const documentContent = '甲方：______ 地址：______';
      const templateType = 'contract';

      const result = service.mergeUnderlineInfo([], underlineInfo, documentContent, templateType);

      expect(result.length).toBe(2);
    });

    it('should handle underlineInfo without paragraphIndex', () => {
      const underlineInfo = [
        {
          text: '______',
          underlineType: 'single',
          paragraphText: '甲方：______',
          position: { start: 3, end: 9 }
        }
      ];

      const documentContent = '甲方：______';
      const templateType = 'contract';

      const result = service.mergeUnderlineInfo([], underlineInfo, documentContent, templateType);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
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
  // 测试4: 章节需要参数化判断 - checkNeedsParameterization
  // ============================================
  describe('Check Needs Parameterization', () => {
    it('should return true for content with colon followed by blank', () => {
      const content = '甲方名称：______';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(true);
    });

    it('should return true for content with underline blanks', () => {
      const content = '甲方名称______';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(true);
    });

    it('should return true for content with multiple spaces', () => {
      const content = '甲方名称     ';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(true);
    });

    it('should return true for content with date blanks', () => {
      const content = '签署日期  年  月  日';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(true);
    });

    it('should return true for content with parenthesis blanks', () => {
      const content = '金额（  ）元';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(true);
    });

    it('should return false for content without blanks', () => {
      const content = '本合同自签字之日起生效，具有法律效力。';
      const result = service.checkNeedsParameterization(content);
      expect(result).toBe(false);
    });
  });

  // ============================================
  // 测试5: 空白模式提取 - extractBlankPatterns
  // ============================================
  describe('Extract Blank Patterns', () => {
    it('should extract underline blanks', () => {
      const content = '甲方：______ 乙方：______';
      const result = service.extractBlankPatterns(content, 'contract');

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract colon blanks', () => {
      const content = '甲方名称：     乙方名称：     ';
      const result = service.extractBlankPatterns(content, 'contract');

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract date blanks', () => {
      const content = '签署日期  年  月  日';
      const result = service.extractBlankPatterns(content, 'contract');

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for content without blanks', () => {
      const content = '本合同自签字之日起生效。';
      const result = service.extractBlankPatterns(content, 'contract');

      expect(result.length).toBe(0);
    });

    it('should correctly identify blank type', () => {
      const content = '甲方：______';
      const result = service.extractBlankPatterns(content, 'contract');

      expect(result[0].type).toBeDefined();
    });
  });

  // ============================================
  // 测试6: 章节结构提取 - extractChapterStructure
  // ============================================
  describe('Extract Chapter Structure', () => {
    it('should extract chapters from document', () => {
      const content = '第一条 协议双方\n甲方：______\n第二条 合同生效\n本合同自签字之日起生效。';
      const result = service.extractChapterStructure(content);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].title).toContain('第一条');
      expect(result[1].title).toContain('第二条');
    });

    it('should return empty array for document without chapters', () => {
      const content = '这是一份简单的文档，没有章节结构。';
      const result = service.extractChapterStructure(content);

      expect(result.length).toBe(0);
    });

    it('should correctly identify chapter positions', () => {
      const content = '第一条 协议双方\n内容...\n第二条 合同生效\n更多内容...';
      const result = service.extractChapterStructure(content);

      expect(result[0].startPos).toBeDefined();
      expect(result[0].endPos).toBeDefined();
      expect(result[0].startPos).toBeLessThan(result[0].endPos);
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
  // 测试8: 变量路径推断 - inferVariablePath
  // ============================================
  describe('Infer Variable Path', () => {
    it('should infer correct path from label', () => {
      const result = service.inferVariablePath('甲方名称', 'text', 'contract');
      expect(result).toContain('partyA');
      expect(result).toContain('name');
    });

    it('should infer correct path for date field', () => {
      const result = service.inferVariablePath('签署日期', 'date', 'contract');
      expect(result).toContain('date');
    });

    it('should infer correct path for amount field', () => {
      const result = service.inferVariablePath('合同金额', 'amount', 'contract');
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // 测试9: 字段类型推断 - inferFieldType
  // ============================================
  describe('Infer Field Type', () => {
    it('should infer text type for name fields', () => {
      const result = service.inferFieldType('甲方名称', '______');
      expect(result).toBe('text');
    });

    it('should infer date type for date fields', () => {
      const result = service.inferFieldType('签署日期', '____年__月__日');
      expect(result).toBe('date');
    });

    it('should infer number type for amount fields', () => {
      const result = service.inferFieldType('合同金额', '____元');
      expect(result).toBe('number');
    });
  });

  // ============================================
  // 测试10: 错误处理和重试
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

    it('should fallback to basic understanding when AI fails', async () => {
      // 所有AI调用都失败
      mockedAxios.post.mockRejectedValue({ message: 'AI service unavailable' });

      const documentContent = '第一条 协议双方\n甲方：______';
      const templateType = 'contract';

      // 这应该触发fallback逻辑
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
  // 测试11: 返回结果结构验证
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
      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include underlineInfo in suggestions', async () => {
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

      // 验证suggestion包含位置信息
      if (result.suggestions.length > 0) {
        expect(result.suggestions[0].underlineInfo).toBeDefined();
        expect(result.suggestions[0].underlineInfo.paragraphIndex).toBe(0);
      }
    });
  });
});