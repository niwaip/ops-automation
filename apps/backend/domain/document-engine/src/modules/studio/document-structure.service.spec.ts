import JSZip from 'jszip';
import { DocumentStructureService } from './document-structure.service';

describe('DocumentStructureService', () => {
  let service: DocumentStructureService;

  beforeEach(() => {
    service = new DocumentStructureService();
  });

  it('keeps static title text when a duplicate title variable mapping is applied', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:p><w:r><w:t>技术服务合同</w:t></w:r></w:p>',
        '<w:p><w:r><w:t>委托方</w:t></w:r></w:p>',
        '</w:body>',
        '</w:document>',
      ].join(''),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.applyConfigToDocx(buffer, {
      staticElements: [
        {
          type: 'title',
          content: '技术服务合同',
        },
      ],
      variableMappings: [
        {
          index: 0,
          path: 'd.title',
          sampleValue: '技术服务合同',
          type: 'text',
        },
        {
          index: 1,
          path: 'd.partyAName',
          sampleValue: '委托方',
          type: 'text',
        },
      ],
    });

    const outputZip = await JSZip.loadAsync(result);
    const documentXml = await outputZip.file('word/document.xml')?.async('text');

    expect(documentXml).toContain('技术服务合同');
    expect(documentXml).not.toContain('{d.title}');
    expect(documentXml).toContain('{d.partyAName}');
  });

  it('keeps existing table cell text and appends variable on a new line', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>表头</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>中文说明</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body>',
        '</w:document>',
      ].join(''),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.applyConfigToDocx(buffer, {
      tableLoops: [
        {
          tableIndex: 0,
          arrayPath: 'd.items',
          columnMappings: [
            {
              columnIndex: 0,
              variablePath: 'd.items[].jpName',
            },
          ],
        },
      ],
    });

    const outputZip = await JSZip.loadAsync(result);
    const documentXml = await outputZip.file('word/document.xml')?.async('text');

    expect(documentXml).toContain('{#d.items}中文说明');
    expect(documentXml).toContain('<w:br/>');
    expect(documentXml).toContain('{d.items[].jpName}{/d.items}');
  });

  it('keeps multiple bilingual loop mappings in the same cell on separate lines', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:tbl>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>品名</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>明细内容</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '</w:tbl>',
        '</w:body>',
        '</w:document>',
      ].join(''),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.applyConfigToDocx(buffer, {
      tableLoops: [
        {
          tableIndex: 0,
          arrayPath: 'd.items',
          columnMappings: [
            {
              columnIndex: 0,
              variablePath: 'd.items[].productName_jp',
            },
            {
              columnIndex: 0,
              variablePath: 'd.items[].quantity_jp',
            },
          ],
        },
      ],
    });

    const outputZip = await JSZip.loadAsync(result);
    const documentXml = await outputZip.file('word/document.xml')?.async('text');

    expect(documentXml).toContain('{#d.items}明细内容');
    expect(documentXml).toContain('{d.items[].productName_jp}');
    expect(documentXml).toContain('{d.items[].quantity_jp}{/d.items}');
    expect((documentXml?.match(/<w:br\/>/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps all variable mappings when multiple params target the same element', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:p><w:r><w:t>占位</w:t></w:r></w:p>',
        '</w:body>',
        '</w:document>',
      ].join(''),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.applyConfigToDocx(buffer, {
      variableMappings: [
        {
          index: 0,
          path: 'd.party_a.name_jp',
          type: 'text',
        },
        {
          index: 0,
          path: 'd.party_a.legalRepresentative_jp',
          type: 'text',
        },
        {
          index: 0,
          path: 'd.party_a.contactAddress_jp',
          type: 'text',
        },
      ],
    });

    const outputZip = await JSZip.loadAsync(result);
    const documentXml = await outputZip.file('word/document.xml')?.async('text');

    expect(documentXml).toContain('{d.party_a.name_jp}');
    expect(documentXml).toContain('{d.party_a.legalRepresentative_jp}');
    expect(documentXml).toContain('{d.party_a.contactAddress_jp}');
    expect((documentXml?.match(/<w:br\/>/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('supports legacy mappings alias for single element replacement', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:p><w:r><w:t>客户名称</w:t></w:r></w:p>',
        '</w:body>',
        '</w:document>',
      ].join(''),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.applyConfigToDocx(buffer, {
      mappings: [
        {
          index: 0,
          path: 'd.customerName',
          type: 'text',
        },
      ],
    });

    const outputZip = await JSZip.loadAsync(result);
    const documentXml = await outputZip.file('word/document.xml')?.async('text');

    expect(documentXml).toContain('{d.customerName}');
  });
});
