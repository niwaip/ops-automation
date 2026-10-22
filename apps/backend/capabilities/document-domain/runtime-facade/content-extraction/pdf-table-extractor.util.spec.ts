import { tryExtractPdfTable, tryExtractPdfTables, type PdfJsTextItem } from './pdf-table-extractor.util';

describe('tryExtractPdfTable', () => {
  it('extracts multi-column commercial quotation table from PDF geometric text items', () => {
    const rawItems: PdfJsTextItem[] = [
      // Table Header row at Y = 733.1
      { str: '序号', transform: [1, 0, 0, 1, 91.1, 733.1], width: 12, height: 12 },
      { str: '品名', transform: [1, 0, 0, 1, 124.7, 733.1], width: 12, height: 12 },
      { str: '规格', transform: [1, 0, 0, 1, 222.8, 733.1], width: 12, height: 12 },
      { str: '数量', transform: [1, 0, 0, 1, 312.3, 733.1], width: 12, height: 12 },
      { str: '单位', transform: [1, 0, 0, 1, 348.7, 733.1], width: 12, height: 12 },
      { str: '备注', transform: [1, 0, 0, 1, 385.2, 733.1], width: 12, height: 12 },
      { str: '单价(RMB)', transform: [1, 0, 0, 1, 414.0, 733.1], width: 27, height: 12 },
      { str: '总价(RMB)', transform: [1, 0, 0, 1, 450.5, 733.1], width: 27, height: 12 },
      { str: '税率', transform: [1, 0, 0, 1, 487.6, 733.1], width: 12, height: 12 },

      // Multi-line cell in Specification column (starting higher at Y=699 down to Y=658)
      { str: 'Annual Support for Viewer', transform: [1, 0, 0, 1, 158.0, 699.0], width: 100, height: 10 },
      { str: '维护服务明细', transform: [1, 0, 0, 1, 158.0, 692.0], width: 90, height: 10 },
      { str: '维护期间：', transform: [1, 0, 0, 1, 374.0, 688.0], width: 30, height: 10 },
      { str: 'FJICAD SX V8', transform: [1, 0, 0, 1, 104.0, 685.0], width: 35, height: 10 },
      { str: '2026-1-1到2026-12-31', transform: [1, 0, 0, 1, 158.0, 685.0], width: 80, height: 10 },
      { str: '2026年1月1日', transform: [1, 0, 0, 1, 374.0, 682.0], width: 40, height: 10 },
      { str: '1', transform: [1, 0, 0, 1, 91.1, 678.0], width: 5, height: 10 },
      { str: 'Viewer', transform: [1, 0, 0, 1, 104.0, 678.0], width: 30, height: 10 },
      { str: '已签约用户', transform: [1, 0, 0, 1, 158.0, 678.0], width: 50, height: 10 },
      { str: '3', transform: [1, 0, 0, 1, 317.0, 678.0], width: 5, height: 10 },
      { str: '个', transform: [1, 0, 0, 1, 337.0, 678.0], width: 8, height: 10 },
      { str: '1,500.00', transform: [1, 0, 0, 1, 424.0, 678.0], width: 20, height: 10 },
      { str: '4,500.00', transform: [1, 0, 0, 1, 460.0, 678.0], width: 20, height: 10 },
      { str: '6%', transform: [1, 0, 0, 1, 491.0, 678.0], width: 10, height: 10 },
      { str: '-2026年12月31日', transform: [1, 0, 0, 1, 374.0, 675.0], width: 40, height: 10 },
    ];

    const result = tryExtractPdfTable(rawItems);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual([
      '序号',
      '品名',
      '规格',
      '数量',
      '单位',
      '备注',
      '单价(RMB)',
      '总价(RMB)',
      '税率',
    ]);
    expect(result!.rows.length).toBe(1);
    const row = result!.rows[0];
    expect(row[0]).toBe('1');
    expect(row[1]).toContain('FJICAD');
    expect(row[2]).toContain('Annual Support');
    expect(row[3]).toBe('3');
    expect(row[4]).toBe('个');
    expect(row[5]).toContain('2026');
    expect(row[6]).toBe('1,500.00');
    expect(row[7]).toBe('4,500.00');
    expect(row[8]).toBe('6%');
    expect(result!.tableMarkdown).toContain('| 序号 | 品名 | 规格 | 数量 | 单位 | 备注 | 单价(RMB) | 总价(RMB) | 税率 |');
  });

  it('returns null for pages without table headers', () => {
    const rawItems: PdfJsTextItem[] = [
      { str: '第一条', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 10 },
      { str: '服务范围与目标', transform: [1, 0, 0, 1, 90, 700], width: 80, height: 10 },
      { str: '乙方为甲方提供日常运维与开发技术服务。', transform: [1, 0, 0, 1, 50, 680], width: 200, height: 10 },
    ];
    expect(tryExtractPdfTable(rawItems)).toBeNull();
  });

  it('rejects inline financial key-value lines with colons and numbers as table headers', () => {
    const rawItems: PdfJsTextItem[] = [
      { str: '不含税金额：', transform: [1, 0, 0, 1, 50, 344], width: 60, height: 10 },
      { str: 'RMB', transform: [1, 0, 0, 1, 115, 344], width: 20, height: 10 },
      { str: '4,245.28', transform: [1, 0, 0, 1, 140, 344], width: 40, height: 10 },
      { str: '，税率：', transform: [1, 0, 0, 1, 185, 344], width: 30, height: 10 },
      { str: '6', transform: [1, 0, 0, 1, 220, 344], width: 10, height: 10 },
      { str: '%', transform: [1, 0, 0, 1, 235, 344], width: 10, height: 10 },
      { str: '，增值税税额：', transform: [1, 0, 0, 1, 250, 344], width: 60, height: 10 },
      { str: 'RMB', transform: [1, 0, 0, 1, 315, 344], width: 20, height: 10 },
      { str: '254.72', transform: [1, 0, 0, 1, 340, 344], width: 40, height: 10 },
      // Following text
      { str: '2、技术服务费由甲方一次支付乙方。', transform: [1, 0, 0, 1, 50, 300], width: 250, height: 10 },
    ];
    expect(tryExtractPdfTable(rawItems)).toBeNull();
  });

  it('correctly splits narrow index column and centered wide text column without shifting', () => {
    const rawItems: PdfJsTextItem[] = [
      // Header line at Y=543
      { str: '项', transform: [1, 0, 0, 1, 96.8, 543.0], width: 3.2, height: 10 },
      { str: '作业费用', transform: [1, 0, 0, 1, 149.9, 543.0], width: 13.0, height: 10 },
      { str: '型号', transform: [1, 0, 0, 1, 226.0, 543.0], width: 6.5, height: 10 },
      { str: '数量', transform: [1, 0, 0, 1, 259.2, 543.0], width: 6.5, height: 10 },
      { str: '单价', transform: [1, 0, 0, 1, 285.0, 543.0], width: 6.5, height: 10 },
      { str: '总价', transform: [1, 0, 0, 1, 320.0, 543.0], width: 6.5, height: 10 },
      { str: '税率', transform: [1, 0, 0, 1, 353.7, 543.0], width: 6.5, height: 10 },
      { str: '备注', transform: [1, 0, 0, 1, 434.8, 543.0], width: 6.5, height: 10 },

      // Row 1 at Y=528
      { str: '1.1', transform: [1, 0, 0, 1, 96.2, 528.0], width: 4.6, height: 10 },
      { str: 'Prones 系统改造费用', transform: [1, 0, 0, 1, 107.4, 528.0], width: 31.1, height: 10 },
      { str: '0', transform: [1, 0, 0, 1, 250.0, 528.0], width: 1.9, height: 10 },
      { str: '一式', transform: [1, 0, 0, 1, 259.2, 528.0], width: 6.5, height: 10 },
      { str: '35,400.00', transform: [1, 0, 0, 1, 288.5, 528.0], width: 14.9, height: 10 },
      { str: '35,400.00', transform: [1, 0, 0, 1, 326.9, 528.0], width: 14.9, height: 10 },
      { str: '6%', transform: [1, 0, 0, 1, 354.5, 528.0], width: 4.8, height: 10 },
      { str: '采购接收（手持终端）', transform: [1, 0, 0, 1, 371.9, 528.0], width: 80.0, height: 10 },

      // Row 2 at Y=503
      { str: '1.2', transform: [1, 0, 0, 1, 96.2, 503.0], width: 4.6, height: 10 },
      { str: 'Prones 系统改造费用', transform: [1, 0, 0, 1, 107.4, 503.0], width: 31.1, height: 10 },
      { str: '一式', transform: [1, 0, 0, 1, 259.2, 503.0], width: 6.5, height: 10 },
      { str: '39,000.00', transform: [1, 0, 0, 1, 288.5, 503.0], width: 14.9, height: 10 },
      { str: '39,000.00', transform: [1, 0, 0, 1, 326.9, 503.0], width: 14.9, height: 10 },
      { str: '6%', transform: [1, 0, 0, 1, 354.5, 503.0], width: 4.8, height: 10 },
      { str: '生产实绩（手持终端）', transform: [1, 0, 0, 1, 371.9, 503.0], width: 80.0, height: 10 },

      // Summary lines
      { str: '小计', transform: [1, 0, 0, 1, 153.2, 478.0], width: 6.5, height: 10 },
      { str: '164,000.00', transform: [1, 0, 0, 1, 323.6, 478.0], width: 18.1, height: 10 },
      { str: '总合计（含税）', transform: [1, 0, 0, 1, 145.0, 454.0], width: 22.7, height: 10 },
      { str: '154,000.00', transform: [1, 0, 0, 1, 323.6, 454.0], width: 18.1, height: 10 },

      // Non-table bullet text below table
      { str: '■环保告知', transform: [1, 0, 0, 1, 90.7, 430.0], width: 15.0, height: 10 },
      { str: '1）“服务器”运行噪声：采取措施降低噪声；', transform: [1, 0, 0, 1, 101.8, 410.0], width: 150.0, height: 10 },
    ];

    const result = tryExtractPdfTable(rawItems);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual(['项', '作业费用', '型号', '数量', '单价', '总价', '税率', '备注']);
    expect(result!.rows.length).toBe(4); // 2 data rows + 2 summary rows

    // Row 0 assertions
    expect(result!.rows[0][0]).toBe('1.1');
    expect(result!.rows[0][1]).toBe('Prones 系统改造费用');
    expect(result!.rows[0][2]).toBe('0');
    expect(result!.rows[0][3]).toBe('一式');
    expect(result!.rows[0][4]).toBe('35,400.00');
    expect(result!.rows[0][5]).toBe('35,400.00');
    expect(result!.rows[0][6]).toBe('6%');
    expect(result!.rows[0][7]).toContain('采购接收');

    // Row 1 assertions
    expect(result!.rows[1][0]).toBe('1.2');
    expect(result!.rows[1][1]).toBe('Prones 系统改造费用');
    expect(result!.rows[1][2]).toBe('');
    expect(result!.rows[1][3]).toBe('一式');
    expect(result!.rows[1][4]).toBe('39,000.00');

    // Summary row assertions
    expect(result!.rows[2][1]).toBe('小计');
    expect(result!.rows[2][5]).toBe('164,000.00');
    expect(result!.rows[3][1]).toBe('总合计（含税）');
    expect(result!.rows[3][5]).toBe('154,000.00');

    // Non-table bullet text must NOT be in table items or table markdown
    expect(result!.tableMarkdown).not.toContain('环保告知');
  });

  it('extracts multiple tables on a single PDF page independently', () => {
    const rawItems: PdfJsTextItem[] = [
      // Table 1 Header (Y=587)
      { str: 'Ｎｏ', transform: [1, 0, 0, 1, 93.7, 587.0], width: 9.5, height: 10 },
      { str: '项目', transform: [1, 0, 0, 1, 175.0, 587.0], width: 9.5, height: 10 },
      { str: '数量', transform: [1, 0, 0, 1, 273.5, 587.0], width: 9.5, height: 10 },
      { str: '报价金额', transform: [1, 0, 0, 1, 328.2, 587.0], width: 19.0, height: 10 },
      { str: '备考', transform: [1, 0, 0, 1, 433.3, 587.0], width: 9.5, height: 10 },

      // Table 1 Row 1 (Y=578)
      { str: '1', transform: [1, 0, 0, 1, 97.0, 578.0], width: 3.1, height: 10 },
      { str: '系统改造费用', transform: [1, 0, 0, 1, 120.0, 578.0], width: 50.0, height: 10 },
      { str: '一式', transform: [1, 0, 0, 1, 273.2, 578.0], width: 10.0, height: 10 },
      { str: '154,000.00', transform: [1, 0, 0, 1, 342.6, 578.0], width: 27.8, height: 10 },

      // Text between tables (Y=548)
      { str: '1）明细', transform: [1, 0, 0, 1, 90.7, 548.0], width: 11.8, height: 10 },

      // Table 2 Header (Y=543)
      { str: '项', transform: [1, 0, 0, 1, 96.8, 543.0], width: 3.2, height: 10 },
      { str: '作业费用', transform: [1, 0, 0, 1, 149.9, 543.0], width: 13.0, height: 10 },
      { str: '数量', transform: [1, 0, 0, 1, 259.2, 543.0], width: 6.5, height: 10 },
      { str: '单价', transform: [1, 0, 0, 1, 285.0, 543.0], width: 6.5, height: 10 },

      // Table 2 Row 1 (Y=528)
      { str: '1.1', transform: [1, 0, 0, 1, 96.2, 528.0], width: 4.6, height: 10 },
      { str: '改造费用', transform: [1, 0, 0, 1, 120.0, 528.0], width: 30.0, height: 10 },
      { str: '一式', transform: [1, 0, 0, 1, 259.2, 528.0], width: 6.5, height: 10 },
      { str: '35,400.00', transform: [1, 0, 0, 1, 288.5, 528.0], width: 14.9, height: 10 },
    ];

    const tables = tryExtractPdfTables(rawItems);
    expect(tables.length).toBe(2);
    expect(tables[0].headers).toEqual(['Ｎｏ', '项目', '数量', '报价金额', '备考']);
    expect(tables[0].rows[0][0]).toBe('1');
    expect(tables[0].rows[0][1]).toBe('系统改造费用');

    expect(tables[1].headers).toEqual(['项', '作业费用', '数量', '单价']);
    expect(tables[1].rows[0][0]).toBe('1.1');
    expect(tables[1].rows[0][1]).toBe('改造费用');
  });
});
