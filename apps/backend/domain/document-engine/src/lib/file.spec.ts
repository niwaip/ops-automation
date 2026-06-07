import JSZip from 'jszip';
import { FileHandler } from './file';

describe('FileHandler', () => {
  const buildSharedStringDoc = (values: string[]) => ({
    prefix: `<sst count="${values.length}" uniqueCount="${values.length}">`,
    suffix: '</sst>',
    entries: values.map((value) => `<si><t>${value}</t></si>`),
    values: [...values],
  });

  it('expands shared string loop rows beyond placeholders and updates formula ranges', () => {
    const handler = new FileHandler() as any;
    const originalStrings = [
      '{#d.procurementDetails}{d.procurementDetails[].seq}',
      '{d.procurementDetails[].materialCode}',
      '{d.procurementDetails[].deviceName}',
      '{d.procurementDetails[].model}',
      '{d.procurementDetails[].unit}',
      '{d.procurementDetails[].quantity}',
      '{d.procurementDetails[].unitPrice}',
      '{d.procurementDetails[].subtotal}{/d.procurementDetails}',
      '含税总额',
    ];

    const sharedStringDocument = buildSharedStringDoc(originalStrings);
    const sheetXml = [
      '<worksheet>',
      '<dimension ref="A1:H9"/>',
      '<sheetData>',
      '<row r="5"><c r="A5" s="3" t="s"><v>0</v></c><c r="B5" s="3" t="s"><v>1</v></c><c r="C5" s="3" t="s"><v>2</v></c><c r="D5" s="3" t="s"><v>3</v></c><c r="E5" s="3" t="s"><v>4</v></c><c r="F5" s="3" t="s"><v>5</v></c><c r="G5" s="3" t="s"><v>6</v></c><c r="H5" s="3" t="s"><v>7</v></c></row>',
      '<row r="6"><c r="A6" s="3"/><c r="B6" s="3"/><c r="C6" s="3"/><c r="D6" s="3"/><c r="E6" s="3"/><c r="F6" s="3"/><c r="G6" s="3"/><c r="H6" s="3"/></row>',
      '<row r="7"><c r="A7" s="3"/><c r="B7" s="3"/><c r="C7" s="3"/><c r="D7" s="3"/><c r="E7" s="3"/><c r="F7" s="3"/><c r="G7" s="3"/><c r="H7" s="3"/></row>',
      '<row r="9"><c r="G9" s="1" t="s"><v>8</v></c><c r="H9" s="2"><f>SUM(H5:H7)</f><v>0</v></c></row>',
      '</sheetData>',
      '</worksheet>',
    ].join('');

    const data = {
      procurementDetails: [
        { seq: '1.00', materialCode: 'RB-001', deviceName: '机器人1', model: 'XR', unit: '台', quantity: '4.00', unitPrice: '185,000.00', subtotal: '740,000.00' },
        { seq: '2.00', materialCode: 'RB-002', deviceName: '机器人2', model: 'XR', unit: '台', quantity: '4.00', unitPrice: '185,000.00', subtotal: '740,000.00' },
        { seq: '3.00', materialCode: 'RB-003', deviceName: '机器人3', model: 'XR', unit: '台', quantity: '4.00', unitPrice: '185,000.00', subtotal: '740,000.00' },
        { seq: '4.00', materialCode: 'RB-004', deviceName: '机器人4', model: 'XR', unit: '台', quantity: '4.00', unitPrice: '185,000.00', subtotal: '740,000.00' },
        { seq: '5.00', materialCode: 'RB-005', deviceName: '机器人5', model: 'XR', unit: '台', quantity: '4.00', unitPrice: '185,000.00', subtotal: '740,000.00' },
      ],
    };

    const result = handler.expandWorksheetSharedStringLoops(sheetXml, originalStrings, sharedStringDocument, data);

    expect(result.expansions).toEqual([
      { startRow: 5, oldEndRow: 7, newEndRow: 9, delta: 2 },
    ]);
    expect(result.xml).toContain('<row r="8"');
    expect(result.xml).toContain('<row r="9"');
    expect(result.xml).toContain('<row r="11"');
    expect(result.xml).toContain('<f>SUM(H5:H9)</f>');
    expect(result.xml).toContain('<c r="H5" s="3"><v>740000.00</v></c>');
    expect(result.xml).toContain('<c r="H9" s="3"><v>740000.00</v></c>');
  });

  it('updates linked worksheet tables for expanded row ranges', async () => {
    const handler = new FileHandler() as any;
    const zip = new JSZip();

    zip.file(
      'xl/worksheets/_rels/sheet5.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>'
    );
    zip.file(
      'xl/tables/table1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><table ref="A4:H7"><autoFilter ref="A4:H7"/></table>'
    );

    await handler.updateWorksheetTables(
      zip,
      new Map([
        ['xl/worksheets/sheet5.xml', [{ startRow: 5, oldEndRow: 7, newEndRow: 9, delta: 2 }]],
      ])
    );

    const updated = await zip.file('xl/tables/table1.xml')!.async('text');
    expect(updated).toContain('ref="A4:H9"');
    expect(updated).toContain('<autoFilter ref="A4:H9"');
  });

  it('forces workbook recalculation for regenerated xlsx files', async () => {
    const handler = new FileHandler() as any;
    const zip = new JSZip();

    zip.file('xl/workbook.xml', '<workbook><calcPr calcId="123"/><extLst><ext foo="bar"/></extLst></workbook>');
    zip.file('xl/calcChain.xml', '<calcChain/>');

    await handler.enableWorkbookRecalculation(zip);

    const workbookXml = await zip.file('xl/workbook.xml')!.async('text');
    expect(workbookXml).toContain('<calcPr calcId="123" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
    expect(workbookXml).toContain('calcMode="auto"');
    expect(workbookXml).toContain('fullCalcOnLoad="1"');
    expect(workbookXml).toContain('forceFullCalc="1"');
    expect(workbookXml).toContain('<extLst><ext foo="bar"/></extLst>');
    expect(zip.file('xl/calcChain.xml')).toBeNull();
  });

  it('renders scalar values even when markers are split across sharedStrings rich text runs', async () => {
    const templateZip = new JSZip();
    templateZip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><r><t>{d.latePayment</t></r><r><t>PenaltyRatio}</t></r></si>
  <si><r><t>{d.quality</t></r><r><t>Liability}</t></r></si>
  <si><r><t>{d.acceptance</t></r><r><t>Standard}</t></r></si>
  <si><r><t>{d.installation</t></r><r><t>Condition}</t></r></si>
</sst>`
    );
    templateZip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c></row>
    <row r="3"><c r="A3" t="s"><v>2</v></c></row>
    <row r="4"><c r="A4" t="s"><v>3</v></c></row>
  </sheetData>
</worksheet>`
    );
    const patchedTemplate = await templateZip.generateAsync({ type: 'nodebuffer' });

    const handler = new FileHandler();
    const output = await handler.renderTemplate(
      patchedTemplate,
      {
        latePaymentPenaltyRatio: '每日按迟延部分货款的0.3%计收违约金',
        qualityLiability: '若设备存在重大质量缺陷，乙方应在48小时内响应，并在5个工作日内提供解决方案或更换设备',
        acceptanceStandard: '设备运行稳定72小时无重大异常，核心性能指标达到技术协议要求',
        installationCondition: '安装服务已启用，乙方需完成现场联调后再组织最终验收，甲方需提供必要的安装场地、电源及气源接口',
      },
      'preview.xlsx'
    );

    const outputZip = await JSZip.loadAsync(output);
    const renderedSharedStrings = await outputZip.file('xl/sharedStrings.xml')!.async('text');
    expect(renderedSharedStrings).toContain('每日按迟延部分货款的0.3%计收违约金');
    expect(renderedSharedStrings).toContain('重大质量缺陷');
    expect(renderedSharedStrings).toContain('运行稳定72小时');
    expect(renderedSharedStrings).toContain('安装服务已启用');
    expect(renderedSharedStrings).not.toContain('{d.latePaymentPenaltyRatio}');
    expect(renderedSharedStrings).not.toContain('{d.qualityLiability}');
    expect(renderedSharedStrings).not.toContain('{d.acceptanceStandard}');
    expect(renderedSharedStrings).not.toContain('{d.installationCondition}');
  });

  it('preserves scalar shared string indexes after loop expansion in xlsx previews', async () => {
    const templateZip = new JSZip();
    templateZip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="9" uniqueCount="9">
  <si><t>{#d.deliveryItems}{d.deliveryItems[].batch}</t></si>
  <si><t>{d.deliveryItems[].location}</t></si>
  <si><t>{d.deliveryItems[].arrivalDate}</t></si>
  <si><t>{d.deliveryItems[].installationDate}</t></si>
  <si><t>{d.deliveryItems[].acceptanceType}{/d.deliveryItems}</t></si>
  <si><t>{d.latePaymentPenaltyRatio}</t></si>
  <si><t>{d.qualityLiability}</t></si>
  <si><t>{d.acceptanceStandard}</t></si>
  <si><t>{d.installationCondition}</t></si>
</sst>`
    );
    templateZip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E10"/>
  <sheetData>
    <row r="5"><c r="A5" t="s"><v>0</v></c><c r="B5" t="s"><v>1</v></c><c r="C5" t="s"><v>2</v></c><c r="D5" t="s"><v>3</v></c><c r="E5" t="s"><v>4</v></c></row>
    <row r="6"><c r="A6"/><c r="B6"/><c r="C6"/><c r="D6"/><c r="E6"/></row>
    <row r="9"><c r="B9" t="s"><v>7</v></c></row>
    <row r="10"><c r="B10" t="s"><v>8</v></c></row>
  </sheetData>
</worksheet>`
    );
    templateZip.file(
      'xl/worksheets/sheet2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B12"/>
  <sheetData>
    <row r="4"><c r="B4" t="s"><v>5</v></c></row>
    <row r="12"><c r="B12" t="s"><v>6</v></c></row>
  </sheetData>
</worksheet>`
    );
    const template = await templateZip.generateAsync({ type: 'nodebuffer' });

    const handler = new FileHandler();
    const output = await handler.renderTemplate(
      template,
      {
        deliveryItems: [
          {
            batch: '第一批',
            location: '苏州园区二期厂房',
            arrivalDate: '2026-06-15',
            installationDate: '2026-06-22',
            acceptanceType: '到货+安装验收',
          },
          {
            batch: '第二批',
            location: '苏州园区二期厂房',
            arrivalDate: '2026-07-10',
            installationDate: '2026-07-17',
            acceptanceType: '到货+安装验收',
          },
        ],
        latePaymentPenaltyRatio: '每日按迟延部分货款的0.3‰计收违约金',
        qualityLiability: '若设备存在重大质量缺陷，乙方应在48小时内响应并在72小时内到场处理',
        acceptanceStandard: '设备运行稳定72小时无重大异常',
        installationCondition: '安装服务已启用，乙方需完成现场联调后再组织最终验收',
      },
      'preview.xlsx'
    );

    const outputZip = await JSZip.loadAsync(output);
    const sharedStringsXml = await outputZip.file('xl/sharedStrings.xml')!.async('text');
    const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) =>
      Array.from(match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
        .map((item) => item[1])
        .join('')
    );
    expect(sharedStrings[5]).toBe('每日按迟延部分货款的0.3‰计收违约金');
    expect(sharedStrings[6]).toBe('若设备存在重大质量缺陷，乙方应在48小时内响应并在72小时内到场处理');
    expect(sharedStrings[7]).toBe('设备运行稳定72小时无重大异常');
    expect(sharedStrings[8]).toBe('安装服务已启用，乙方需完成现场联调后再组织最终验收');

    const sheet1Xml = await outputZip.file('xl/worksheets/sheet1.xml')!.async('text');
    const sheet2Xml = await outputZip.file('xl/worksheets/sheet2.xml')!.async('text');
    expect(sheet1Xml).toContain('<c r="B9" t="s"><v>7</v></c>');
    expect(sheet1Xml).toContain('<c r="B10" t="s"><v>8</v></c>');
    expect(sheet2Xml).toContain('<c r="B4" t="s"><v>5</v></c>');
    expect(sheet2Xml).toContain('<c r="B12" t="s"><v>6</v></c>');
  });
});
