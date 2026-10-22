import * as fs from 'fs';
import * as path from 'path';
import { parseDocxOpenXml } from './docx-openxml-parser.util';

describe('docx-openxml-parser.util', () => {
  const fixturesDir = path.resolve(
    process.cwd(),
    'tests/fixtures/contract-review-multilingual-20261017/contracts'
  );

  it('correctly parses CT01-zh.docx containing soft breaks (<w:br/>) preserving all 8 clauses and markers', async () => {
    const filePath = path.join(fixturesDir, 'procurement/CT01-zh.docx');
    if (!fs.existsSync(filePath)) {
      return;
    }
    const buf = fs.readFileSync(filePath);
    const clauses = await parseDocxOpenXml(buf);

    // Preamble + 8 clauses = 9 nodes
    expect(clauses.length).toBeGreaterThanOrEqual(9);

    const fullText = clauses.map((c) => `${c.title} ${c.content}`).join('\n');
    for (let i = 1; i <= 8; i++) {
      expect(fullText).toContain(`CT01-zh-A0${i}`);
    }

    // Verify clause numbers are sequential
    const articleClauses = clauses.filter((c) => c.clauseNumber !== '前言');
    expect(articleClauses.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(articleClauses[i].clauseNumber).toBe(`第${i + 1}条`);
      expect(articleClauses[i].content.length).toBeGreaterThan(0);
    }
  });

  it('correctly parses bilingual CT01-zh-ja.docx preserving all 8 clauses, markers, and Japanese translations', async () => {
    const filePath = path.join(fixturesDir, 'procurement/CT01-zh-ja.docx');
    if (!fs.existsSync(filePath)) {
      return;
    }
    const buf = fs.readFileSync(filePath);
    const clauses = await parseDocxOpenXml(buf);

    expect(clauses.length).toBeGreaterThanOrEqual(9);

    const fullText = clauses.map((c) => `${c.title} ${c.content}`).join('\n');
    for (let i = 1; i <= 8; i++) {
      expect(fullText).toContain(`CT01-zh-ja-A0${i}`);
    }

    // Verify bilingual pair blocks exist in clauses
    const hasBilingualBlocks = clauses.some((c) =>
      c.blocks?.some((b) => b.type === 'bilingual_pair')
    );
    expect(hasBilingualBlocks).toBe(true);
  });

  it('does not consume short Japanese clause text without punctuation as secondary title (CMPH01)', async () => {
    const cmphPath = path.resolve(
      process.cwd(),
      'docs/artifacts/reviews/contract-compare-reaudit2/run-2026-10-18T07-26-52.918Z/heldout-fixtures/CMPH01_A.docx'
    );
    if (!fs.existsSync(cmphPath)) return;
    const buf = fs.readFileSync(cmphPath);
    const clauses = await parseDocxOpenXml(buf);

    const payClause = clauses.find(
      (c) => c.title.includes('付款期限') || c.clauseNumber?.includes('付款期限')
    );
    expect(payClause).toBeDefined();
    // Operational Japanese clause body must stay in content, NOT swallowed into titleJa
    expect(payClause!.content).toContain('甲は30日以内に100000円を支払う');
    expect(payClause!.titleJa).toBeUndefined();
  });

  it('correctly preserves natural Japanese clause body with Kanji numerals and topic particle without punctuation (CMPH02)', async () => {
    const cmph02PathA = path.resolve(
      process.cwd(),
      'docs/artifacts/reviews/contract-compare-reaudit3/run-2026-10-18T10-34-17.378Z/natural-fixtures/CMPH02_A.docx'
    );
    if (!fs.existsSync(cmph02PathA)) return;
    const bufA = fs.readFileSync(cmph02PathA);
    const clausesA = await parseDocxOpenXml(bufA);

    const feeClauseA = clausesA.find((c) => c.title.includes('报酬金额'));
    expect(feeClauseA).toBeDefined();
    expect(feeClauseA!.content).toBe('報酬は月額十万円');
    expect(feeClauseA!.titleJa).toBeUndefined();

    const cmph02PathB = path.resolve(
      process.cwd(),
      'docs/artifacts/reviews/contract-compare-reaudit3/run-2026-10-18T10-34-17.378Z/natural-fixtures/CMPH02_B.docx'
    );
    if (!fs.existsSync(cmph02PathB)) return;
    const bufB = fs.readFileSync(cmph02PathB);
    const clausesB = await parseDocxOpenXml(bufB);

    const feeClauseB = clausesB.find((c) => c.title.includes('报酬金额'));
    expect(feeClauseB).toBeDefined();
    expect(feeClauseB!.content).toBe('報酬は月額十五万円');
    expect(feeClauseB!.titleJa).toBeUndefined();
  });

  it('correctly parses table with headers and w:gridSpan cell spans', async () => {
    const docxPath = path.resolve(
      process.cwd(),
      'apps/backend/intelligence/ai-orchestrator/data/storage/uploads/file-1792388446418-fiwl2300n-补充条款_富士通Azure超额261015.docx'
    );
    if (!fs.existsSync(docxPath)) return;
    const buf = fs.readFileSync(docxPath);
    const clauses = await parseDocxOpenXml(buf);

    const priceClause = clauses.find((c) => c.title.includes('产品清单及价格'));
    expect(priceClause).toBeDefined();
    const tableBlock = priceClause!.blocks?.find((b) => b.type === 'table');
    expect(tableBlock).toBeDefined();
    expect(tableBlock!.tableData).toBeDefined();

    // Verify headers extracted
    expect(tableBlock!.tableData!.headers).toEqual([
      '序号',
      'SKU号',
      '名称及规格',
      '总价（未税）',
      '总价（人民币含税6%）',
      '备注',
    ]);

    // Verify cell with colSpan 4 (总金额)
    const row2 = tableBlock!.tableData!.rows[2];
    expect(row2[0]).toEqual({ text: '总金额（人民币，含税6%）', colSpan: 4 });

    // Verify cell with colSpan 5 (备注长文本)
    const row3 = tableBlock!.tableData!.rows[3];
    expect((row3[1] as any).colSpan).toBe(5);
  });
});
