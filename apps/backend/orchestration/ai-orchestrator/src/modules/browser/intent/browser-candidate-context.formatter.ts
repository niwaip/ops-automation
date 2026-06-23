import { Injectable } from '@nestjs/common';
import type { BrowserCommandCandidate, BrowserCommandContext } from './browser-command.types';

@Injectable()
export class BrowserCandidateContextFormatter {
  formatBrowserContext(context: BrowserCommandContext): string {
    const sections = [
      context.commandType ? `- Preferred command type: ${context.commandType}` : null,
      context.currentPageUrl ? `- Current page URL: ${context.currentPageUrl}` : null,
      context.backend ? `- Execution backend: ${context.backend}` : null,
      context.lastObservationText
        ? `- Current page text excerpt: ${context.lastObservationText.slice(0, 800)}`
        : null,
      context.availableInputs?.length ? `- Visible inputs: ${context.availableInputs.join(', ')}` : null,
      context.availableButtons?.length
        ? `- Visible buttons: ${context.availableButtons.join(', ')}`
        : null,
      this.formatCandidatesSection(context.availableCandidates),
      context.controlHints?.length
        ? `- Recorder control hints: ${context.controlHints.join(' ')}`
        : null,
    ].filter(Boolean);

    return sections.join('\n') || '- No browser context provided';
  }

  private formatCandidatesSection(candidates?: BrowserCommandCandidate[]): string | null {
    if (!candidates?.length) {
      return null;
    }

    const visibleCandidates = candidates.slice(0, 20);
    const rowGroups = new Map<string, BrowserCommandCandidate[]>();
    const primaryActions: BrowserCommandCandidate[] = [];
    const inputs: BrowserCommandCandidate[] = [];
    const fields: BrowserCommandCandidate[] = [];
    const regions: BrowserCommandCandidate[] = [];

    for (const candidate of visibleCandidates) {
      if (candidate.row?.index || candidate.row?.key) {
        const rowKey = `${candidate.row?.index || '?'}|${candidate.row?.key || candidate.row?.text || ''}`;
        const existing = rowGroups.get(rowKey) || [];
        existing.push(candidate);
        rowGroups.set(rowKey, existing);
        continue;
      }

      if (candidate.kind === 'input') {
        inputs.push(candidate);
      } else if (candidate.kind === 'field') {
        fields.push(candidate);
      } else if (candidate.kind === 'region') {
        regions.push(candidate);
      } else {
        primaryActions.push(candidate);
      }
    }

    const lines: string[] = ['Visible Page Candidates (prefer candidateId or ref-backed targets):'];

    if (primaryActions.length) {
      lines.push('Primary Actions:');
      for (const candidate of primaryActions) {
        lines.push(`  ${this.describeCandidate(candidate)}`);
      }
    }

    if (rowGroups.size) {
      lines.push('Rows:');
      for (const [rowKey, group] of rowGroups.entries()) {
        const [rowIndex, rowIdentity] = rowKey.split('|');
        lines.push(`  Row ${rowIndex}${rowIdentity ? ` (${rowIdentity})` : ''}:`);
        for (const candidate of group) {
          lines.push(`    ${this.describeCandidate(candidate)}`);
        }
      }
    }

    if (inputs.length) {
      lines.push('Inputs:');
      for (const candidate of inputs) {
        lines.push(`  ${this.describeCandidate(candidate)}`);
      }
    }

    if (fields.length) {
      lines.push('Readable Fields:');
      for (const candidate of fields) {
        lines.push(`  ${this.describeCandidate(candidate)}`);
      }
    }

    if (regions.length) {
      lines.push('Regions:');
      for (const candidate of regions) {
        lines.push(`  ${this.describeCandidate(candidate)}`);
      }
    }

    lines.push('Structured Candidate Hints:');
    for (const candidate of visibleCandidates) {
      lines.push(`  - ${candidate.summary}`);
    }

    return lines.join('\n');
  }

  private describeCandidate(candidate: BrowserCommandCandidate): string {
    const role = candidate.role ? candidate.role.toLowerCase() : candidate.kind;
    const locator = candidate.preferredLocator?.value || candidate.ref;
    const label = candidate.text || candidate.label;
    const extras = [
      candidate.action ? `action=${candidate.action}` : null,
      candidate.field ? `field=${candidate.field}` : null,
      candidate.region?.name ? `region=${candidate.region.name}` : null,
    ].filter(Boolean);

    return `[${candidate.candidateId}] ${role} "${label}"${
      locator ? ` (ref=${locator})` : ''
    }${extras.length ? ` {${extras.join(', ')}}` : ''}`;
  }
}
