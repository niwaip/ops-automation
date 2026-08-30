import { BadRequestException } from '@nestjs/common';

export const MAX_SPLIT_OUTPUTS = 50;

export function parsePdfPageSelection(spec: unknown, totalPages: number): number[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new BadRequestException('PDF has no pages to split');
  }

  if (spec === undefined || spec === null || spec === '') {
    if (totalPages > MAX_SPLIT_OUTPUTS) {
      throw new BadRequestException(
        `PDF has ${totalPages} pages; specify pages explicitly because one split can create at most ${MAX_SPLIT_OUTPUTS} artifacts`
      );
    }
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (typeof spec !== 'string') {
    throw new BadRequestException('pages must be a string such as "1,3,5-7"');
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  for (const rawPart of spec.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) {
      throw new BadRequestException(`Invalid page selection "${rawPart}"; expected e.g. "1,3,5-7"`);
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || end > totalPages) {
      throw new BadRequestException(
        `Page selection "${part}" is outside the document range 1-${totalPages}`
      );
    }
    for (let page = start; page <= end; page += 1) {
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
      if (pages.length > MAX_SPLIT_OUTPUTS) {
        throw new BadRequestException(
          `One split can create at most ${MAX_SPLIT_OUTPUTS} artifacts`
        );
      }
    }
  }
  if (pages.length === 0) {
    throw new BadRequestException('pages must select at least one page');
  }
  return pages;
}
