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
});
