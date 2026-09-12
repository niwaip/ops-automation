import { Injectable } from '@nestjs/common';
import type { AlignedClausePair, ContractClauseNode, DiffType } from './contract-compare.types';

@Injectable()
export class SectionAlignerService {
  /**
   * Two-phase deterministic alignment of source and target contract clauses
   */
  public alignSections(
    sourceClauses: ContractClauseNode[],
    targetClauses: ContractClauseNode[]
  ): AlignedClausePair[] {
    const matchedSourceIdxs = new Set<number>();
    const matchedTargetIdxs = new Set<number>();
    const alignedPairs: AlignedClausePair[] = [];

    // 1. Phase 1a: Exact clause number AND strong title compatibility
    for (let s = 0; s < sourceClauses.length; s++) {
      const src = sourceClauses[s];
      const normSrcNum = this.normalizeClauseNumber(src.clauseNumber);

      for (let t = 0; t < targetClauses.length; t++) {
        if (matchedTargetIdxs.has(t)) continue;
        const tgt = targetClauses[t];
        const normTgtNum = this.normalizeClauseNumber(tgt.clauseNumber);

        const isNumMatch = normSrcNum && normSrcNum === normTgtNum;
        const titleSim = this.calculateTitleSimilarity(src.title, tgt.title);
        const isCompatibleTitle = titleSim >= 0.4 || src.clauseNumber === '前言' || !src.title || !tgt.title;

        if (isNumMatch && isCompatibleTitle) {
          matchedSourceIdxs.add(s);
          matchedTargetIdxs.add(t);
          alignedPairs.push({
            id: `align-${s + 1}-${t + 1}`,
            status: src.content.trim() === tgt.content.trim() ? 'UNCHANGED' : 'MODIFIED',
            sourceClause: src,
            targetClause: tgt,
            similarity: src.content.trim() === tgt.content.trim() ? 1.0 : 0.8,
          });
          break;
        }
      }
    }

    // 2. Phase 1b: Exact/Strong Title Match (Renumbered clauses, e.g. 第五条 moved to 第六条)
    for (let s = 0; s < sourceClauses.length; s++) {
      if (matchedSourceIdxs.has(s)) continue;
      const src = sourceClauses[s];
      if (!src.title || src.title.length < 3) continue;

      for (let t = 0; t < targetClauses.length; t++) {
        if (matchedTargetIdxs.has(t)) continue;
        const tgt = targetClauses[t];
        const titleSim = this.calculateTitleSimilarity(src.title, tgt.title);

        if (titleSim >= 0.8) {
          matchedSourceIdxs.add(s);
          matchedTargetIdxs.add(t);
          alignedPairs.push({
            id: `align-${s + 1}-${t + 1}`,
            status: src.content.trim() === tgt.content.trim() ? 'UNCHANGED' : 'MODIFIED',
            sourceClause: src,
            targetClause: tgt,
            similarity: src.content.trim() === tgt.content.trim() ? 1.0 : 0.8,
          });
          break;
        }
      }
    }

    // 3. Phase 1c: Same number match fallback for generic/remaining numbered clauses
    for (let s = 0; s < sourceClauses.length; s++) {
      if (matchedSourceIdxs.has(s)) continue;
      const src = sourceClauses[s];
      const normSrcNum = this.normalizeClauseNumber(src.clauseNumber);
      if (!normSrcNum) continue;

      for (let t = 0; t < targetClauses.length; t++) {
        if (matchedTargetIdxs.has(t)) continue;
        const tgt = targetClauses[t];
        const normTgtNum = this.normalizeClauseNumber(tgt.clauseNumber);

        if (normSrcNum === normTgtNum) {
          const titleSim = this.calculateTitleSimilarity(src.title, tgt.title);
          if (titleSim >= 0.25 || !src.title || !tgt.title) {
            matchedSourceIdxs.add(s);
            matchedTargetIdxs.add(t);
            alignedPairs.push({
              id: `align-${s + 1}-${t + 1}`,
              status: src.content.trim() === tgt.content.trim() ? 'UNCHANGED' : 'MODIFIED',
              sourceClause: src,
              targetClause: tgt,
              similarity: src.content.trim() === tgt.content.trim() ? 1.0 : 0.8,
            });
            break;
          }
        }
      }
    }

    // 2. Phase 2: Fuzzy matching for remaining unassigned clauses (e.g. renumbered clauses)
    for (let s = 0; s < sourceClauses.length; s++) {
      if (matchedSourceIdxs.has(s)) continue;
      const src = sourceClauses[s];

      let bestTargetIdx = -1;
      let highestSimilarity = 0;

      for (let t = 0; t < targetClauses.length; t++) {
        if (matchedTargetIdxs.has(t)) continue;
        const tgt = targetClauses[t];

        const titleSim = this.calculateTitleSimilarity(src.title, tgt.title);
        const contentSim = this.quickJaccard(src.content, tgt.content);

        const combinedSim = titleSim * 0.6 + contentSim * 0.4;
        if (combinedSim > 0.45 && combinedSim > highestSimilarity) {
          highestSimilarity = combinedSim;
          bestTargetIdx = t;
        }
      }

      if (bestTargetIdx !== -1) {
        matchedSourceIdxs.add(s);
        matchedTargetIdxs.add(bestTargetIdx);
        const tgt = targetClauses[bestTargetIdx];
        alignedPairs.push({
          id: `align-${s + 1}-${bestTargetIdx + 1}`,
          status: src.content.trim() === tgt.content.trim() ? 'UNCHANGED' : 'MODIFIED',
          sourceClause: src,
          targetClause: tgt,
          similarity: Number(highestSimilarity.toFixed(4)),
        });
      }
    }

    // 3. Phase 3: Remaining source clauses are DELETED
    for (let s = 0; s < sourceClauses.length; s++) {
      if (!matchedSourceIdxs.has(s)) {
        alignedPairs.push({
          id: `align-del-${s + 1}`,
          status: 'DELETED',
          sourceClause: sourceClauses[s],
          similarity: 0.0,
        });
      }
    }

    // 4. Phase 4: Remaining target clauses are ADDED
    for (let t = 0; t < targetClauses.length; t++) {
      if (!matchedTargetIdxs.has(t)) {
        alignedPairs.push({
          id: `align-add-${t + 1}`,
          status: 'ADDED',
          targetClause: targetClauses[t],
          similarity: 0.0,
        });
      }
    }

    // 5. Stable ordering: sort primarily by target order (if present), else by source order
    return this.sortAlignedPairs(alignedPairs, sourceClauses, targetClauses);
  }

  /**
   * Normalize Chinese and Western legal numbering for matching
   * e.g. "第一条", "第1条", "1." -> "1"
   */
  public normalizeClauseNumber(numStr: string): string {
    if (!numStr) return '';
    const cleaned = numStr.trim().replace(/^第/, '').replace(/[章节条款]$/, '');

    const cnToNumMap: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
      十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
    };

    if (cnToNumMap[cleaned]) {
      return String(cnToNumMap[cleaned]);
    }

    return cleaned.replace(/[^\d\.]/g, '');
  }

  /**
   * Title similarity using character overlap and prefix matching
   */
  private calculateTitleSimilarity(t1: string, t2: string): number {
    if (!t1 || !t2) return 0;
    if (t1 === t2) return 1.0;

    const set1 = new Set(Array.from(t1));
    const set2 = new Set(Array.from(t2));

    let intersection = 0;
    for (const ch of set1) {
      if (set2.has(ch)) intersection++;
    }

    const union = new Set([...set1, ...set2]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Fast Jaccard character set similarity for content comparison
   */
  private quickJaccard(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;

    // Sample up to first 500 characters for speed
    const sub1 = s1.slice(0, 500);
    const sub2 = s2.slice(0, 500);

    const set1 = new Set(Array.from(sub1));
    const set2 = new Set(Array.from(sub2));

    let inter = 0;
    for (const c of set1) {
      if (set2.has(c)) inter++;
    }

    const total = new Set([...set1, ...set2]).size;
    return total === 0 ? 0 : inter / total;
  }

  /**
   * Sort aligned pairs in a natural reading order
   */
  private sortAlignedPairs(
    pairs: AlignedClausePair[],
    sourceClauses: ContractClauseNode[],
    targetClauses: ContractClauseNode[]
  ): AlignedClausePair[] {
    const srcIndexMap = new Map(sourceClauses.map((c, i) => [c.id, i]));
    const tgtIndexMap = new Map(targetClauses.map((c, i) => [c.id, i]));

    return pairs.sort((a, b) => {
      const aSrc = a.sourceClause ? (srcIndexMap.get(a.sourceClause.id) ?? 999) : 999;
      const bSrc = b.sourceClause ? (srcIndexMap.get(b.sourceClause.id) ?? 999) : 999;
      const aTgt = a.targetClause ? (tgtIndexMap.get(a.targetClause.id) ?? 999) : 999;
      const bTgt = b.targetClause ? (tgtIndexMap.get(b.targetClause.id) ?? 999) : 999;

      const aRank = Math.min(aSrc, aTgt);
      const bRank = Math.min(bSrc, bTgt);

      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return (a.targetClause ? 0 : 1) - (b.targetClause ? 0 : 1);
    });
  }
}
