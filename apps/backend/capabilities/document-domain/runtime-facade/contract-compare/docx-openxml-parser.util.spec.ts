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
});
