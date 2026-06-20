/**
 * AI Identify API E2E Tests
 * 测试AI识别API端点的完整流程
 */

import request from 'supertest';
import { setupTestApp, teardownTestApp } from './jest.e2e.setup';
import { NestApplication } from '@nestjs/core';

describe('AI Identify API (e2e)', () => {
  let app: NestApplication;

  // Mock AI响应的测试数据
  const mockContractContent = `
第一条 协议双方

甲方：______
地址：______
法定代表人：______

乙方：______
地址：______
法定代表人：______

第二条 合同内容

本合同于____年____月____日签署，合同金额为____元。

第三条 合同生效

本合同自双方签字之日起生效，具有法律效力。
`;

  const mockUnderlineInfo = [
    {
      text: '______',
      underlineType: 'single',
      paragraphText: '甲方：______',
      paragraphIndex: 0,
      position: { start: 3, end: 9 },
    },
    {
      text: '______',
      underlineType: 'single',
      paragraphText: '地址：______',
      paragraphIndex: 1,
      position: { start: 3, end: 9 },
    },
    {
      text: '______',
      underlineType: 'single',
      paragraphText: '法定代表人：______',
      paragraphIndex: 2,
      position: { start: 8, end: 14 },
    },
    {
      text: '______',
      underlineType: 'single',
      paragraphText: '乙方：______',
      paragraphIndex: 3,
      position: { start: 3, end: 9 },
    },
    {
      text: '______',
      underlineType: 'single',
      paragraphText: '地址：______',
      paragraphIndex: 4,
      position: { start: 3, end: 9 },
    },
  ];

  beforeAll(async () => {
    app = await setupTestApp();

    // Mock环境变量，确保不实际调用AI服务
    process.env.AI_ORCHESTRATOR_URL = 'http://localhost:3007';
    process.env.AI_MODEL_ID = 'test-model-id';
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  // ============================================
  // 测试1: 直接AI识别API - POST /studio/direct-ai-identify
  // ============================================
  describe('/studio/direct-ai-identify (POST)', () => {
    it('should accept document content and return identification result', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          context: '这是一份合同模板，需要识别空白填充部分',
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.suggestions).toBeDefined();
      expect(Array.isArray(response.body.suggestions)).toBe(true);
      expect(response.body.confidence).toBeDefined();
      expect(response.body.templateConfig).toBeDefined();
    });

    it('should accept underlineInfo in request', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo,
        })
        .expect(200);

      expect(response.body.suggestions).toBeDefined();
      expect(response.body.suggestions.length).toBeGreaterThan(0);
    });

    it('should return 400 for missing documentContent', async () => {
      await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentType: 'docx',
          templateType: 'contract',
        })
        .expect(400);
    });

    it('should return 400 for missing documentType', async () => {
      await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentContent: 'some content',
          templateType: 'contract',
        })
        .expect(400);
    });

    it('should handle different template types', async () => {
      const templateTypes = ['contract', 'report', 'invoice', 'certificate', 'letter'];

      for (const templateType of templateTypes) {
        const response = await request(app.getHttpServer())
          .post('/studio/direct-ai-identify')
          .send({
            documentContent: mockContractContent,
            documentType: 'docx',
            templateType,
          })
          .expect(200);

        expect(response.body.templateConfig.templateType).toBeDefined();
      }
    });

    it('should handle different document types', async () => {
      const documentTypes = ['docx', 'xlsx', 'pptx', 'text'];

      for (const documentType of documentTypes) {
        const response = await request(app.getHttpServer())
          .post('/studio/direct-ai-identify')
          .send({
            documentContent: mockContractContent,
            documentType,
            templateType: 'contract',
          })
          .expect(200);

        expect(response.body).toBeDefined();
      }
    });

    it('should include underlineInfo in suggestions when provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentContent: '甲方：______',
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: [
            {
              text: '______',
              underlineType: 'single',
              paragraphText: '甲方：______',
              paragraphIndex: 0,
              position: { start: 3, end: 9 },
            },
          ],
        })
        .expect(200);

      // 检查suggestion是否包含underlineInfo
      if (response.body.suggestions.length > 0 && response.body.suggestions[0].underlineInfo) {
        expect(response.body.suggestions[0].underlineInfo.paragraphIndex).toBe(0);
        expect(response.body.suggestions[0].underlineInfo.position).toBeDefined();
      }
    });
  });

  // ============================================
  // 测试2: 多阶段AI识别API - POST /studio/direct-ai-identify-multistage
  // ============================================
  describe('/studio/direct-ai-identify-multistage (POST)', () => {
    it('should use quick flow when underlineInfo is provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.suggestions).toBeDefined();
      // 快速流程应该返回与underlineInfo数量相同或接近的suggestions
      expect(response.body.suggestions.length).toBeGreaterThanOrEqual(mockUnderlineInfo.length - 2);
    });

    it('should use multi-stage flow when underlineInfo is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: [],
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.suggestions).toBeDefined();
    });

    it('should use multi-stage flow when underlineInfo is undefined', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.suggestions).toBeDefined();
    });

    it('should accept paragraphFormats in request', async () => {
      const paragraphFormats = [
        {
          text: '甲方：______',
          index: 0,
          format: {
            fontSize: 12,
            isBold: false,
            alignment: 'left',
          },
        },
      ];

      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo,
          paragraphFormats,
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should return correct response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo,
        })
        .expect(200);

      // 验证返回结构
      expect(response.body).toHaveProperty('suggestions');
      expect(response.body).toHaveProperty('templateConfig');
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('contextAnalysis');

      // 验证confidence范围
      expect(response.body.confidence).toBeGreaterThanOrEqual(0);
      expect(response.body.confidence).toBeLessThanOrEqual(1);

      // 验证suggestion结构（如果有suggestions）
      if (response.body.suggestions.length > 0) {
        const suggestion = response.body.suggestions[0];
        expect(suggestion).toHaveProperty('id');
        expect(suggestion).toHaveProperty('originalText');
        expect(suggestion).toHaveProperty('suggestedName');
        expect(suggestion).toHaveProperty('confidence');
        expect(suggestion).toHaveProperty('applied');
      }
    });
  });

  // ============================================
  // 测试3: SSE进度API - GET /studio/direct-ai-identify-progress
  // ============================================
  describe('/studio/direct-ai-identify-progress (GET)', () => {
    it('should return SSE stream with progress events', async () => {
      const response = await request(app.getHttpServer())
        .get('/studio/direct-ai-identify-progress')
        .query({
          documentContent: '甲方：______',
          documentType: 'docx',
          templateType: 'contract',
          context: '测试合同',
        })
        .expect(200);

      // SSE响应应该是text/event-stream
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('should return 400 for missing required query params', async () => {
      await request(app.getHttpServer())
        .get('/studio/direct-ai-identify-progress')
        .query({
          documentType: 'docx',
          templateType: 'contract',
        })
        .expect(400);
    });
  });

  // ============================================
  // 测试4: 验证内容API - POST /studio/validate-content
  // ============================================
  describe('/studio/validate-content (POST)', () => {
    it('should validate template content syntax', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/validate-content')
        .send({
          template: '{d.name} {d.date:formatD(YYYY-MM-DD)} {d.total:formatNumber}',
        })
        .expect(200);

      expect(response.body).toHaveProperty('valid');
      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('warnings');
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(Array.isArray(response.body.warnings)).toBe(true);
    });

    it('should detect invalid variable syntax', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/validate-content')
        .send({
          template: '{d.} {invalid} {d.name::}',
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should detect valid loop syntax', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/validate-content')
        .send({
          template: '{#d.items} {d.items[i].name} {/d.items}',
        })
        .expect(200);

      // 循环语法应该被验证
      expect(response.body).toBeDefined();
    });

    it('should detect unmatched loop markers', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/validate-content')
        .send({
          template: '{#d.items} {d.items[i].name}', // 缺少{/d.items}
        })
        .expect(200);

      expect(response.body.warnings.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 测试5: 预览内容API - POST /studio/preview-content
  // ============================================
  describe('/studio/preview-content (POST)', () => {
    it('should generate preview from document content', async () => {
      const templateConfig = {
        templateType: 'contract',
        variableMappings: [{ path: '{d.partyA.name}', sampleValue: '测试甲方公司' }],
      };

      const response = await request(app.getHttpServer())
        .post('/studio/preview-content')
        .send({
          documentContent: '甲方：______',
          templateConfig,
          format: 'docx',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('previewUrl');
    });

    it('should return sampleData in response', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/preview-content')
        .send({
          documentContent: '甲方：______',
          templateConfig: { templateType: 'contract' },
          format: 'docx',
        })
        .expect(200);

      expect(response.body).toHaveProperty('sampleData');
    });
  });

  // ============================================
  // 测试6: 获取模板类型API - GET /studio/template-types
  // ============================================
  describe('/studio/template-types (GET)', () => {
    it('should return available template types', async () => {
      const response = await request(app.getHttpServer()).get('/studio/template-types').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // 验证每个模板类型的结构
      const templateType = response.body[0];
      expect(templateType).toHaveProperty('id');
      expect(templateType).toHaveProperty('name');
      expect(templateType).toHaveProperty('description');
    });
  });

  // ============================================
  // 测试7: 完整AI识别流程
  // ============================================
  describe('Full AI Identify Workflow', () => {
    it('should complete identify-preview-apply cycle', async () => {
      // 1. AI识别
      const identifyRes = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: mockContractContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo,
        })
        .expect(200);

      expect(identifyRes.body.suggestions.length).toBeGreaterThan(0);

      // 2. 验证内容
      const validateRes = await request(app.getHttpServer())
        .post('/studio/validate-content')
        .send({
          template: identifyRes.body.suggestions.map((s: any) => s.suggestedName).join(' '),
        })
        .expect(200);

      expect(validateRes.body).toBeDefined();

      // 3. 预览
      const previewRes = await request(app.getHttpServer())
        .post('/studio/preview-content')
        .send({
          documentContent: mockContractContent,
          templateConfig: identifyRes.body.templateConfig,
          format: 'docx',
        })
        .expect(200);

      expect(previewRes.body.success).toBe(true);
    });

    it('should handle empty document content gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify')
        .send({
          documentContent: '',
          documentType: 'docx',
          templateType: 'contract',
        })
        .expect(200);

      expect(response.body.suggestions).toBeDefined();
      expect(response.body.suggestions.length).toBe(0);
    });

    it('should handle document without blanks', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: '这是一份已完成的合同，所有内容都已填写。无需参数化处理。',
          documentType: 'docx',
          templateType: 'contract',
        })
        .expect(200);

      expect(response.body.suggestions.length).toBe(0);
    });
  });

  // ============================================
  // 测试8: 性能测试
  // ============================================
  describe('Performance Tests', () => {
    it('should handle large document content', async () => {
      // 创建大型文档内容
      const largeContent = Array(100).fill('甲方：______\n乙方：______\n').join('\n');
      const largeUnderlineInfo = Array(200).fill({
        text: '______',
        underlineType: 'single',
        paragraphText: '甲方：______',
        paragraphIndex: 0,
        position: { start: 3, end: 9 },
      });

      // 设置较长超时
      const response = await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .timeout(120000) // 2分钟超时
        .send({
          documentContent: largeContent,
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: largeUnderlineInfo,
        });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toBeDefined();
    }, 120000); // Jest超时设置

    it('should complete within reasonable time for small document', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/studio/direct-ai-identify-multistage')
        .send({
          documentContent: '甲方：______',
          documentType: 'docx',
          templateType: 'contract',
          underlineInfo: mockUnderlineInfo.slice(0, 1),
        })
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 小文档应该在30秒内完成（考虑mock AI响应）
      expect(duration).toBeLessThan(30000);
    });
  });
});
