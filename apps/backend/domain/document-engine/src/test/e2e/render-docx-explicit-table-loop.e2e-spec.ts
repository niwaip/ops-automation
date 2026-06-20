import JSZip from 'jszip';
import { FileHandler } from '../../lib/file';

describe('Render DOCX explicit table loop (e2e)', () => {
  it('renders each explicit loop item into a separate table row', async () => {
    const zip = new JSZip();

    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );

    zip.folder('_rels')?.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );

    zip.folder('word')?.file(
      'document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
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
</w:document>`
    );

    zip
      .folder('word')
      ?.folder('_rels')
      ?.file(
        'document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
      );

    const templateBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const handler = new FileHandler();
    const renderedBuffer = await handler.renderTemplate(
      templateBuffer,
      {
        items: [
          { projectName_cn: '企业管理系统升级', maintenanceFee_jp: '人民元280,000円' },
          { projectName_cn: '系统集成与部署', maintenanceFee_jp: '人民元120,000円' },
        ],
      },
      'explicit-table-loop.docx'
    );

    const outputZip = await JSZip.loadAsync(renderedBuffer);
    const documentXml = await outputZip.file('word/document.xml')!.async('text');

    expect(documentXml).toContain('<w:t>企业管理系统升级</w:t>');
    expect(documentXml).toContain('<w:t>系统集成与部署</w:t>');
    expect(documentXml).toContain('<w:t>人民元280,000円</w:t>');
    expect(documentXml).toContain('<w:t>人民元120,000円</w:t>');
    expect(documentXml).toContain('</w:tr><w:tr>');
    expect(documentXml).not.toContain('人民元280,000円系统集成与部署');
  });
});
