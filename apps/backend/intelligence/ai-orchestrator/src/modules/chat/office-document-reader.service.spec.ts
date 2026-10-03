import { OfficeDocumentReaderService } from './office-document-reader.service';
import JSZip from 'jszip';
import * as xlsx from 'xlsx';

describe('OfficeDocumentReaderService', () => {
  let service: OfficeDocumentReaderService;

  beforeEach(() => {
    service = new OfficeDocumentReaderService();
  });

  it('correctly extracts plain text documents', async () => {
    const buf = Buffer.from('这是运维部署说明文档，包含 Redis 与 Postgres 配置说明。', 'utf-8');
    const result = await service.extractText(buf, 'readme.txt', 'text/plain');

    expect(result.format).toBe('text');
    expect(result.text).toContain('这是运维部署说明文档');
    expect(result.characterCount).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it('correctly extracts DOCX via XML structure', async () => {
    const zip = new JSZip();
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>关于服务器扩容的审批申请</w:t></w:r></w:p>
          <w:p><w:r><w:t>申请人：运维组 张三</w:t></w:r></w:p>
          <w:p><w:r><w:t>申请扩容 4 台 GPU 算力节点。</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    zip.file('word/document.xml', docXml);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.extractText(buf, '1234 (1).docx');

    expect(result.format).toBe('docx');
    expect(result.text).toContain('关于服务器扩容的审批申请');
    expect(result.text).toContain('申请人：运维组 张三');
    expect(result.text).toContain('申请扩容 4 台 GPU 算力节点');
    expect(result.characterCount).toBeGreaterThan(0);
  });

  it('correctly extracts XLSX via SheetJS', async () => {
    const wb = xlsx.utils.book_new();
    const wsData = [
      ['服务器IP', '主机名', '状态'],
      ['192.168.1.10', 'ops-master-01', 'Online'],
      ['192.168.1.11', 'ops-worker-01', 'Online'],
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, '集群节点清单');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await service.extractText(buf, 'nodes.xlsx');

    expect(result.format).toBe('xlsx');
    expect(result.text).toContain('【工作表: 集群节点清单】');
    expect(result.text).toContain('ops-master-01');
    expect(result.text).toContain('Online');
    expect(result.pageOrSheetCount).toBe(1);
  });

  it('correctly extracts PPTX via slide XML parsing', async () => {
    const zip = new JSZip();
    const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>2026 运维自动化平台架构规划</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`;
    const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>第二部分：智能调度与高可用保障</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`;
    zip.file('ppt/slides/slide1.xml', slide1Xml);
    zip.file('ppt/slides/slide2.xml', slide2Xml);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.extractText(buf, 'presentation.pptx');

    expect(result.format).toBe('pptx');
    expect(result.text).toContain('[幻灯片 1]');
    expect(result.text).toContain('2026 运维自动化平台架构规划');
    expect(result.text).toContain('[幻灯片 2]');
    expect(result.text).toContain('第二部分：智能调度与高可用保障');
    expect(result.pageOrSheetCount).toBe(2);
  });

  it('enforces max character truncation protection', async () => {
    const longString = 'A'.repeat(5000);
    const buf = Buffer.from(longString, 'utf-8');

    const result = await service.extractText(buf, 'large.txt', 'text/plain', 500);

    expect(result.text.length).toBe(500);
    expect(result.characterCount).toBe(5000);
    expect(result.truncated).toBe(true);
  });

  it('supports checking whether a document is an office/pdf format', () => {
    expect(service.supports('doc.docx')).toBe(true);
    expect(service.supports('sheet.xlsx')).toBe(true);
    expect(service.supports('deck.pptx')).toBe(true);
    expect(service.supports('paper.pdf')).toBe(true);
    expect(service.supports('binary.bin')).toBe(false);
  });

  it('extracts embedded images from scanned or image-based PDF', async () => {
    // Construct minimal valid PDF with image XObject
    const fakeJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      ...Array(50).fill(0xaa),
      0xff, 0xd9,
    ]);
    const pdfContent = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Filter /DCTDecode >>\nstream\r\n'),
      fakeJpeg,
      Buffer.from('\r\nendstream\nendobj\ntrailer\n<<>>\n%%EOF'),
    ]);

    const result = await service.extractText(pdfContent, 'scanned_contract.pdf');

    expect(result.format).toBe('pdf');
    expect(result.isScannedOrImagePdf).toBe(true);
    expect(result.images).toBeDefined();
    expect(result.images?.length).toBeGreaterThan(0);
    expect(result.images?.[0]?.mimeType).toBe('image/jpeg');
    expect(result.images?.[0]?.base64).toBe(fakeJpeg.toString('base64'));
  });
});

