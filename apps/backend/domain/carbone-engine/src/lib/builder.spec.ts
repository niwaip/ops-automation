import { Builder } from './builder';

describe('Builder', () => {
  it('prefers exact dotted keys over nested traversal', () => {
    const builder = new Builder();
    const xml = '<root><t>{d.contract.partyA}</t><t>{d.contract.partyA.name}</t></root>';
    const result = builder.buildXML(xml, {
      'contract.partyA': '委托方：',
      'contract.partyA.name': '甲 方',
      contract: {
        partyA: {
          name: 'nested fallback should not win',
        },
      },
    });

    expect(result.xml).toBe('<root><t>委托方：</t><t>甲 方</t></root>');
  });

  it('resolves exact dotted keys inside loop rows', () => {
    const builder = new Builder();
    const xml = [
      '<w:tr>',
      '<w:tc><w:p><w:r><w:t>{#d.items}{d.items[].partyA}</w:t></w:r></w:p></w:tc>',
      '<w:tc><w:p><w:r><w:t>{d.items[].partyA.name}{/d.items}</w:t></w:r></w:p></w:tc>',
      '</w:tr>',
    ].join('');

    const result = builder.buildXML(xml, {
      items: [
        {
          partyA: '委托方：',
          'partyA.name': '甲 方',
        },
      ],
    });

    expect(result.xml).toContain('<w:t>委托方：</w:t>');
    expect(result.xml).toContain('<w:t>甲 方</w:t>');
  });

  it('escapes xml special characters when replacing scalar markers', () => {
    const builder = new Builder();
    const xml = '<si><t>{d.qualityLiability}</t></si>';
    const result = builder.buildXML(xml, { qualityLiability: 'A&B <C> "D" \'E\'' });
    expect(result.xml).toBe('<si><t>A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;</t></si>');
  });

  it('replaces all occurrences of the same marker', () => {
    const builder = new Builder();
    const xml = '<root><t>{d.name}</t><t>{d.name}</t></root>';
    const result = builder.buildXML(xml, { name: 'X' });
    expect(result.xml).toBe('<root><t>X</t><t>X</t></root>');
  });

  it('renders explicit docx table loops as separate rows without concatenating adjacent cells', () => {
    const builder = new Builder();
    const xml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body>',
      '<w:tbl>',
      '<w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>维护费</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr>',
      '<w:tc><w:p><w:r><w:t>{#d.items}{d.items[].projectName_cn}</w:t></w:r></w:p></w:tc>',
      '<w:tc><w:p><w:r><w:t>{d.items[].maintenanceFee_jp}{/d.items}</w:t></w:r></w:p></w:tc>',
      '</w:tr>',
      '</w:tbl>',
      '</w:body>',
      '</w:document>',
    ].join('');

    const result = builder.buildXML(xml, {
      items: [
        { projectName_cn: '企业管理系统升级', maintenanceFee_jp: '人民元280,000円' },
        { projectName_cn: '系统集成与部署', maintenanceFee_jp: '人民元120,000円' },
      ],
    });

    expect(result.xml).toContain('<w:t>企业管理系统升级</w:t>');
    expect(result.xml).toContain('<w:t>系统集成与部署</w:t>');
    expect(result.xml).toContain('<w:t>人民元280,000円</w:t>');
    expect(result.xml).toContain('<w:t>人民元120,000円</w:t>');
    expect(result.xml).toContain('</w:tr><w:tr>');
    expect(result.xml).not.toContain('人民元280,000円系统集成与部署');
  });
});
