import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import type { SkillSource } from './personal-skill.types';

export function resolveSkillInput(workspace: string, source: SkillSource): string | undefined {
  const session = (source.source.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const candidates = source.inputs.flatMap((input) => [
    path.join(workspace, '.sessions', session, path.basename(input.name)), path.join(workspace, path.basename(input.name)),
  ]);
  return candidates.find((candidate) => fs.existsSync(candidate) &&
    fs.realpathSync(candidate).startsWith(path.resolve(workspace) + path.sep));
}

/** Send header names to the authoring model, never raw numeric/employee rows. */
export function skillInputSchema(input?: string): Array<{ sheet: string; fields: string[] }> {
  if (!input || !/\.xls[mx]$/i.test(input)) return [];
  if (fs.statSync(input).size > 10 * 1024 * 1024) throw new Error('来源附件超出技能提炼预算');
  const book = XLSX.readFile(input, { sheetRows: 50 });
  return book.SheetNames.slice(0, 16).flatMap((name) => {
    const sheet = book.Sheets[name];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false });
    const candidates = rows.filter((row) => row.filter((v) => v != null && v !== '').length >= 2 &&
      row.filter((v) => v != null && v !== '').every((v) => typeof v === 'string'));
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return best ? [{ sheet: name, fields: best.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) }] : [];
  });
}
