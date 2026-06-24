import { Injectable } from '@nestjs/common';

interface SnapshotObservationLike {
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
  snapshotPath?: string;
}

interface RecorderProbeObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  regions?: Array<Record<string, unknown>>;
  pageSemantics?: Record<string, unknown>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
}

@Injectable()
export class RecorderStructureProbeService {
  parseJsonResult(value: unknown): Record<string, any> | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, any> | string;
      if (typeof parsed === 'string') {
        return JSON.parse(parsed) as Record<string, any>;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  normalizePageSemantics(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  buildObservationFromStructure(input: {
    structure: Record<string, any>;
    textResult?: Record<string, any>;
    snapshotObservation?: SnapshotObservationLike;
  }): RecorderProbeObservationLike {
    const pageSemantics = this.normalizePageSemantics(input.structure.pageSemantics);
    const inputs = this.mergeObservedRecords(
      Array.isArray(input.structure.inputs) ? input.structure.inputs : [],
      input.snapshotObservation?.inputs || []
    );
    const buttons = this.mergeObservedRecords(
      Array.isArray(input.structure.buttons) ? input.structure.buttons : [],
      input.snapshotObservation?.buttons || []
    );

    return {
      currentPageUrl: input.structure.url,
      title: input.structure.title,
      text:
        input.textResult?.data?.text || input.textResult?.text || input.textResult?.stdout || '',
      inputs,
      buttons,
      rows: this.mergeObservedRecords(
        Array.isArray(input.structure.rows) ? input.structure.rows : []
      ),
      regions: this.mergeObservedRecords(
        Array.isArray(input.structure.regions) ? input.structure.regions : []
      ),
      ...(pageSemantics ? { pageSemantics } : {}),
      headings: this.mergeObservedStrings(
        Array.isArray(input.structure.headings) ? input.structure.headings : [],
        input.snapshotObservation?.headings || []
      ),
      links: this.mergeObservedStrings(
        Array.isArray(input.structure.links) ? input.structure.links : [],
        input.snapshotObservation?.links || []
      ),
      suggestedParameters: [],
      ...(input.snapshotObservation?.snapshotPath
        ? { snapshotPath: input.snapshotObservation.snapshotPath }
        : {}),
    };
  }

  buildStructureProbeScript(): string {
    return `() => JSON.stringify((() => {
      const collectRoots = root => {
        const roots = [root];
        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        elements.forEach(element => {
          if (element.shadowRoot) {
            roots.push(...collectRoots(element.shadowRoot));
          }
          if (element instanceof HTMLIFrameElement) {
            try {
              const frameDocument = element.contentDocument || element.contentWindow?.document;
              if (frameDocument) {
                roots.push(...collectRoots(frameDocument));
              }
            } catch (error) {
              void error;
            }
          }
        });
        return roots;
      };

      const roots = collectRoots(document);

      const isVisible = element => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const toText = value => (value || '').replace(/\\s+/g, ' ').trim();

      const queryAllAcrossRoots = selector => roots.flatMap(root => [...(root.querySelectorAll ? root.querySelectorAll(selector) : [])]);
      const uniqueElements = elements => [...new Set(elements)];
      const getDataAttr = (element, name) => {
        if (!(element instanceof HTMLElement)) {
          return undefined;
        }
        const value = element.getAttribute(name);
        return value ? value.trim() : undefined;
      };
      const getDatasetAttr = (element, key) => {
        if (!(element instanceof HTMLElement)) {
          return undefined;
        }
        const value = element.dataset ? element.dataset[key] : undefined;
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
      };
      const getLabelText = element => {
        if (!(element instanceof HTMLElement)) {
          return undefined;
        }
        const id = element.getAttribute('id');
        if (id) {
          const labels = uniqueElements(queryAllAcrossRoots('label[for="' + CSS.escape(id) + '"]'));
          const labelText = labels.map(label => toText(label.textContent)).find(Boolean);
          if (labelText) {
            return labelText;
          }
        }
        const wrappedLabel = element.closest('label');
        if (wrappedLabel) {
          return toText(wrappedLabel.textContent);
        }
        return undefined;
      };
      const getElementRef = element => getDataAttr(element, 'data-ref') || getDataAttr(element, 'data-playwright-ref') || undefined;

      const inputs = uniqueElements(queryAllAcrossRoots('input, textarea, select, [contenteditable="true"]'))
        .filter(isVisible)
        .map((element, index) => ({
          index,
          ref: getElementRef(element),
          tagName: element.tagName.toLowerCase(),
          type: element instanceof HTMLInputElement ? element.type : element.getAttribute('type') || undefined,
          name: getDataAttr(element, 'name'),
          id: getDataAttr(element, 'id'),
          placeholder: getDataAttr(element, 'placeholder'),
          value: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? toText(element.value)
            : toText(element.textContent),
          label: getDataAttr(element, 'aria-label') || getLabelText(element),
          labelText: getLabelText(element),
          role: getDataAttr(element, 'role') || undefined,
          autocomplete: getDataAttr(element, 'autocomplete'),
          dataTestId: getDataAttr(element, 'data-testid') || getDataAttr(element, 'data-test-id'),
          region: getDatasetAttr(element, 'aiRegion'),
          stableName: getDatasetAttr(element, 'aiStableName'),
        }));

      const buttons = uniqueElements(queryAllAcrossRoots('button, a, [role="button"], [role="link"], [data-ai-action]'))
        .filter(isVisible)
        .map((element, index) => ({
          index,
          ref: getElementRef(element),
          tagName: element.tagName.toLowerCase(),
          text: toText(getDataAttr(element, 'aria-label') || element.textContent),
          role: getDataAttr(element, 'role') || element.tagName.toLowerCase(),
          href: element instanceof HTMLAnchorElement ? element.href : undefined,
          dataTestId: getDataAttr(element, 'data-testid') || getDataAttr(element, 'data-test-id'),
          action: getDatasetAttr(element, 'aiAction'),
          region: getDatasetAttr(element, 'aiRegion'),
          stableName: getDatasetAttr(element, 'aiStableName'),
          rowIndex: (() => {
            const raw = getDatasetAttr(element, 'aiRowIndex');
            const parsed = raw ? Number.parseInt(raw, 10) : NaN;
            return Number.isFinite(parsed) ? parsed : undefined;
          })(),
          rowKey: getDatasetAttr(element, 'aiRowKey'),
          rowText: getDatasetAttr(element, 'aiRowText'),
        }))
        .filter(item => item.text);

      const rows = uniqueElements(queryAllAcrossRoots('[data-ai-row-key], tr, [role="row"], [data-ai-row-index]'))
        .filter(isVisible)
        .map((element, index) => {
          const rowButtons = uniqueElements([
            ...element.querySelectorAll('button, a, [role="button"], [role="link"], [data-ai-action]'),
          ])
            .filter(isVisible)
            .map(button => ({
              text: toText(getDataAttr(button, 'aria-label') || button.textContent),
              role: getDataAttr(button, 'role') || button.tagName.toLowerCase(),
              action: getDatasetAttr(button, 'aiAction'),
              ref: getElementRef(button),
            }))
            .filter(button => button.text);

          const rowFields = uniqueElements([
            ...element.querySelectorAll('[data-ai-field], td, [role="cell"]'),
          ])
            .filter(isVisible)
            .map(field => ({
              field: getDatasetAttr(field, 'aiField'),
              text: toText(field.textContent),
              dataTestId: getDataAttr(field, 'data-testid') || getDataAttr(field, 'data-test-id'),
              id: getDataAttr(field, 'id'),
            }))
            .filter(field => field.field || field.text);

          const rawRowIndex = getDatasetAttr(element, 'aiRowIndex');
          const parsedRowIndex = rawRowIndex ? Number.parseInt(rawRowIndex, 10) : NaN;

          return {
            index,
            rowIndex: Number.isFinite(parsedRowIndex) ? parsedRowIndex : index,
            rowKey: getDatasetAttr(element, 'aiRowKey'),
            rowText: getDatasetAttr(element, 'aiRowText') || toText(element.textContent),
            region: getDatasetAttr(element, 'aiRegion'),
            regionType: getDatasetAttr(element, 'aiRegionType'),
            rowButtons,
            rowFields,
          };
        })
        .filter(row => row.rowText || row.rowButtons.length > 0 || row.rowFields.length > 0);

      const regions = uniqueElements(queryAllAcrossRoots('[data-ai-region], section, main, aside, nav, form'))
        .filter(isVisible)
        .map((element, index) => {
          const fields = uniqueElements([
            ...element.querySelectorAll('[data-ai-field], input, textarea, select'),
          ])
            .filter(isVisible)
            .map(field => ({
              field: getDatasetAttr(field, 'aiField'),
              text: field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
                ? toText(field.value)
                : toText(field.textContent),
              dataTestId: getDataAttr(field, 'data-testid') || getDataAttr(field, 'data-test-id'),
              id: getDataAttr(field, 'id'),
            }))
            .filter(field => field.field || field.text);

          const actions = uniqueElements([
            ...element.querySelectorAll('[data-ai-action], button, a, [role="button"], [role="link"]'),
          ])
            .filter(isVisible)
            .map(action => ({
              action: getDatasetAttr(action, 'aiAction'),
              text: toText(getDataAttr(action, 'aria-label') || action.textContent),
              role: getDataAttr(action, 'role') || action.tagName.toLowerCase(),
              ref: getElementRef(action),
            }))
            .filter(action => action.action || action.text);

          return {
            index,
            region: getDatasetAttr(element, 'aiRegion') || getDataAttr(element, 'aria-label') || getDataAttr(element, 'id') || undefined,
            regionType: getDatasetAttr(element, 'aiRegionType') || element.tagName.toLowerCase(),
            text: toText(element.textContent),
            fields,
            actions,
          };
        })
        .filter(region => region.region || region.fields.length > 0 || region.actions.length > 0);

      const headings = uniqueElements(queryAllAcrossRoots('h1, h2, h3, h4, [role="heading"]'))
        .filter(isVisible)
        .map(element => toText(element.textContent))
        .filter(Boolean)
        .slice(0, 20);

      const links = uniqueElements(queryAllAcrossRoots('a[href], [role="link"]'))
        .filter(isVisible)
        .map(element => toText(getDataAttr(element, 'aria-label') || element.textContent))
        .filter(Boolean)
        .slice(0, 30);

      return {
        url: window.location.href,
        title: document.title,
        inputs,
        buttons,
        rows,
        regions,
        headings,
        links,
        pageSemantics: (window).__AI_PAGE_SEMANTICS__ || undefined,
      };
    })())`;
  }

  private mergeObservedRecords<T extends Record<string, unknown>>(...groups: T[][]): T[] {
    const merged = new Map<string, T>();
    for (const group of groups) {
      for (const item of group) {
        const key = JSON.stringify(item);
        if (!merged.has(key)) {
          merged.set(key, item);
        }
      }
    }
    return [...merged.values()];
  }

  private mergeObservedStrings(...groups: string[][]): string[] {
    const merged = new Set<string>();
    for (const group of groups) {
      for (const item of group) {
        if (typeof item === 'string' && item.trim().length > 0) {
          merged.add(item.trim());
        }
      }
    }
    return [...merged.values()];
  }
}
