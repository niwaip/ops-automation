/**
 * Studio API E2E Tests
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestApp, teardownTestApp, getTemplatesDir, getOutputsDir } from './jest.e2e.setup';
import { NestApplication } from '@nestjs/core';
import JSZip from 'jszip';

describe('Studio API (e2e)', () => {
  let app: NestApplication;
  let templateId: string;
  let testDocxBuffer: Buffer;

  beforeAll(async () => {
    app = await setupTestApp();

    // 创建测试用的docx模板
    testDocxBuffer = await createTestDocxTemplate();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  /**
   * 创建测试用的docx模板buffer
   */
  async function createTestDocxTemplate(): Promise<Buffer> {
    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    // _rels/.rels
    zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/document.xml - 包含测试变量
    zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello {d.name}!</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Your email is {d.email}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Total: {d.total:formatNumber(#,##0.00)}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);

    // word/_rels/document.xml.rels
    zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async function createTableLoopDocxTemplate(): Promise<Buffer> {
    const zip = new JSZip();

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>维护费</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#d.items}{d.items[].projectName_cn}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{d.items[].maintenanceFee_jp}{/d.items}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);

    zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  describe('/studio/upload (POST)', () => {
    it('should upload a docx template and return template info', async () => {
      const response = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_template.docx')
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fileName).toBe('test_template.docx');
      expect(response.body.format).toBe('docx');
      expect(response.body.variables).toContain('d.name');
      expect(response.body.variables).toContain('d.email');

      templateId = response.body.id;
    });

    it('should reject invalid file format', async () => {
      const invalidBuffer = Buffer.from('not a valid file');

      await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', invalidBuffer, 'invalid.txt')
        .expect(400);
    });

    it('should reject missing file', async () => {
      await request(app.getHttpServer())
        .post('/studio/upload')
        .expect(400);
    });
  });

  describe('/studio/templates/:id (GET)', () => {
    it('should return template info', async () => {
      // 先上传模板
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_get.docx');

      const response = await request(app.getHttpServer())
        .get(`/studio/templates/${uploadRes.body.id}`)
        .expect(200);

      expect(response.body.id).toBe(uploadRes.body.id);
      expect(response.body.fileName).toBe('test_get.docx');
    });

    it('should return 404 for non-existent template', async () => {
      await request(app.getHttpServer())
        .get('/studio/templates/non-existent-id')
        .expect(404);
    });
  });

  describe('/studio/templates (GET)', () => {
    it('should list all templates', async () => {
      // 先上传一个模板
      await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_list.docx');

      const response = await request(app.getHttpServer())
        .get('/studio/templates')
        .expect(200);

      expect(response.body.templates).toBeDefined();
      expect(Array.isArray(response.body.templates)).toBe(true);
      expect(response.body.templates.length).toBeGreaterThan(0);
    });
  });

  describe('/studio/templates/:id/variables (GET)', () => {
    it('should return template variables', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_vars.docx');

      const response = await request(app.getHttpServer())
        .get(`/studio/templates/${uploadRes.body.id}/variables`)
        .expect(200);

      expect(response.body.variables).toBeDefined();
      expect(response.body.variables).toContain('d.name');
    });
  });

  describe('/studio/formatters (GET)', () => {
    it('should return available formatters', async () => {
      const response = await request(app.getHttpServer())
        .get('/studio/formatters')
        .expect(200);

      expect(response.body.formatters).toBeDefined();
      expect(Array.isArray(response.body.formatters)).toBe(true);
      expect(response.body.formatters.length).toBeGreaterThan(50);
    });
  });

  describe('/studio/render (POST)', () => {
    it('should render template with data', async () => {
      // 上传模板
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_render.docx');

      const renderData = {
        templateId: uploadRes.body.id,
        data: {
          name: 'Test User',
          email: 'test@example.com',
          total: 1234.56
        }
      };

      const response = await request(app.getHttpServer())
        .post('/studio/render')
        .send(renderData)
        .expect(200);

      expect(response.body.downloadUrl).toBeDefined();
      expect(response.body.fileName).toBeDefined();
      expect(response.body.format).toBe('docx');
    });

    it('should return 404 for non-existent template', async () => {
      const renderData = {
        templateId: 'non-existent',
        data: { name: 'Test' }
      };

      await request(app.getHttpServer())
        .post('/studio/render')
        .send(renderData)
        .expect(404);
    });

    it('renders explicit docx table loops as separate rows end-to-end', async () => {
      const tableLoopTemplate = await createTableLoopDocxTemplate();
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', tableLoopTemplate, 'table_loop.docx')
        .expect(201);

      const renderRes = await request(app.getHttpServer())
        .post('/studio/render')
        .send({
          templateId: uploadRes.body.id,
          data: {
            items: [
              { projectName_cn: '企业管理系统升级', maintenanceFee_jp: '人民元280,000円' },
              { projectName_cn: '系统集成与部署', maintenanceFee_jp: '人民元120,000円' },
            ],
          },
        })
        .expect(200);

      const downloadId = renderRes.body.downloadUrl.split('/').pop();
      const outputBuffer = fs.readFileSync(path.join(getOutputsDir(), `${downloadId}.docx`));
      const outputZip = await JSZip.loadAsync(outputBuffer);
      const documentXml = await outputZip.file('word/document.xml')?.async('text');

      expect(documentXml).toBeDefined();
      expect(documentXml).toContain('<w:t>企业管理系统升级</w:t>');
      expect(documentXml).toContain('<w:t>系统集成与部署</w:t>');
      expect(documentXml).toContain('<w:t>人民元280,000円</w:t>');
      expect(documentXml).toContain('<w:t>人民元120,000円</w:t>');
      expect(documentXml).toContain('</w:tr><w:tr>');
      expect(documentXml).not.toContain('人民元280,000円系统集成与部署');
    });
  });

  describe('/studio/validate (POST)', () => {
    it('should validate complete data', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_validate.docx');

      const validateData = {
        templateId: uploadRes.body.id,
        data: {
          name: 'Test User',
          email: 'test@example.com',
          total: 100
        }
      };

      const response = await request(app.getHttpServer())
        .post('/studio/validate')
        .send(validateData)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.missing).toHaveLength(0);
    });

    it('should detect missing data', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_validate_missing.docx');

      const validateData = {
        templateId: uploadRes.body.id,
        data: { name: 'Test User' } // missing email and total
      };

      const response = await request(app.getHttpServer())
        .post('/studio/validate')
        .send(validateData)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.missing).toContain('d.email');
    });
  });

  describe('/studio/download/:id (GET)', () => {
    it('should download rendered document', async () => {
      // 上传并渲染
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_download.docx');

      const renderRes = await request(app.getHttpServer())
        .post('/studio/render')
        .send({
          templateId: uploadRes.body.id,
          data: { name: 'Download Test', email: 'download@test.com', total: 999 }
        });

      const downloadId = renderRes.body.downloadUrl.split('/').pop();

      const response = await request(app.getHttpServer())
        .get(`/studio/download/${downloadId}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application');
    });

    it('should return 404 for non-existent download', async () => {
      await request(app.getHttpServer())
        .get('/studio/download/non-existent')
        .expect(404);
    });
  });

  describe('/studio/templates/:id/delete (POST)', () => {
    it('should delete template', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'test_delete.docx');

      await request(app.getHttpServer())
        .post(`/studio/templates/${uploadRes.body.id}/delete`)
        .expect(200);

      // 验证已删除
      await request(app.getHttpServer())
        .get(`/studio/templates/${uploadRes.body.id}`)
        .expect(404);
    });
  });

  describe('Full workflow test', () => {
    it('should complete full upload-render-download cycle', async () => {
      // 1. Upload
      const uploadRes = await request(app.getHttpServer())
        .post('/studio/upload')
        .attach('file', testDocxBuffer, 'workflow_test.docx')
        .expect(201);

      expect(uploadRes.body.id).toBeDefined();

      // 2. Validate data
      const validateRes = await request(app.getHttpServer())
        .post('/studio/validate')
        .send({
          templateId: uploadRes.body.id,
          data: { name: 'Workflow User', email: 'workflow@test.com', total: 1500 }
        })
        .expect(200);

      expect(validateRes.body.valid).toBe(true);

      // 3. Render
      const renderRes = await request(app.getHttpServer())
        .post('/studio/render')
        .send({
          templateId: uploadRes.body.id,
          data: { name: 'Workflow User', email: 'workflow@test.com', total: 1500.75 }
        })
        .expect(200);

      expect(renderRes.body.downloadUrl).toBeDefined();

      // 4. Download
      const downloadId = renderRes.body.downloadUrl.split('/').pop();
      await request(app.getHttpServer())
        .get(`/studio/download/${downloadId}`)
        .expect(200);

      // 5. Cleanup
      await request(app.getHttpServer())
        .post(`/studio/templates/${uploadRes.body.id}/delete`)
        .expect(200);
    });
  });
});
