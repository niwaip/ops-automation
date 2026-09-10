import { Injectable } from '@nestjs/common';
import type { RecorderObservedRegion } from '../execute/recorder-debug.types';

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
  structuralHash?: string;
  activeContainer?: {
    type: 'floating-chat' | 'modal' | 'drawer' | 'dialog';
    name?: string;
    title?: string;
    selector?: string;
  };
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  regions?: RecorderObservedRegion[];
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
      ...(input.structure.activeContainer
        ? { activeContainer: input.structure.activeContainer }
        : {}),
      ...(input.structure.structuralHash
        ? { structuralHash: String(input.structure.structuralHash) }
        : {}),
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
      const getBooleanAttr = (element, name) => {
        if (!(element instanceof HTMLElement)) {
          return undefined;
        }
        const value = element.getAttribute(name);
        if (value === null) {
          return undefined;
        }
        if (value === '' || value === 'true') {
          return true;
        }
        if (value === 'false') {
          return false;
        }
        return undefined;
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

      const allRows = uniqueElements(queryAllAcrossRoots('[data-ai-row-key], tr, [role="row"], [data-ai-row-index]')).filter(isVisible);
      allRows.forEach((row, idx) => {
        if (row instanceof HTMLElement) {
          row.setAttribute('data-sys-row-index', String(idx + 1));
        }
      });

      const getContainerInfo = el => {
        const modal = el.closest ? el.closest('[role="dialog"], .ant-modal, .ant-drawer, [class*="chat-window"], [class*="chat-panel"]') : null;
        if (!modal) return undefined;
        const cls = ((modal.getAttribute && modal.getAttribute('class')) || '').toLowerCase();
        if (cls.includes('chat')) return { type: 'floating-chat', name: '聊天框' };
        if (cls.includes('drawer')) return { type: 'drawer', name: '抽屉面板' };
        return { type: 'modal', name: '弹窗' };
      };

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
          container: getContainerInfo(element),
          region: getDatasetAttr(element, 'aiRegion'),
          stableName: getDatasetAttr(element, 'aiStableName'),
          visible: true,
          disabled: 'disabled' in element ? Boolean(element.disabled) : undefined,
          checked: element instanceof HTMLInputElement ? Boolean(element.checked) : undefined,
          selected: element instanceof HTMLOptionElement ? Boolean(element.selected) : undefined,
          ariaSelected: getBooleanAttr(element, 'aria-selected'),
          ariaPressed: getBooleanAttr(element, 'aria-pressed'),
          dataState: getDataAttr(element, 'data-state'),
          rowIndex: (() => {
            const raw = getDatasetAttr(element, 'aiRowIndex');
            const parsed = raw ? Number.parseInt(raw, 10) : NaN;
            if (Number.isFinite(parsed)) return parsed;
            const closestRow = element.closest && element.closest('[data-sys-row-index]');
            if (closestRow) {
              const sysParsed = Number.parseInt(closestRow.getAttribute('data-sys-row-index'), 10);
              return Number.isFinite(sysParsed) ? sysParsed : undefined;
            }
            return undefined;
          })(),
        }));

      const interactiveSelector = [
        'button',
        'a',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="option"]',
        '.ant-segmented-item',
        'label.ant-radio-button-wrapper',
        '[data-ai-action]',
      ].join(', ');

      const buttons = uniqueElements(queryAllAcrossRoots(interactiveSelector))
        .filter(isVisible)
        .map((element, index) => {
          const rawTitle = getDataAttr(element, 'title') || (element.getAttribute ? element.getAttribute('title') : undefined);
          const svgEl = element.querySelector ? element.querySelector('svg, img, [class*="icon"]') : null;
          const svgTitle = svgEl ? (
            getDataAttr(svgEl, 'aria-label') ||
            (svgEl.getAttribute ? svgEl.getAttribute('title') : undefined) ||
            (svgEl.querySelector && svgEl.querySelector('title') ? svgEl.querySelector('title').textContent : undefined) ||
            (svgEl instanceof HTMLImageElement ? svgEl.alt : undefined)
          ) : undefined;
          const classAttr = getDataAttr(element, 'class') || '';

          const checkFloating = el => {
            let cur = el;
            while (cur && cur !== document.body && cur !== document.documentElement) {
              const s = window.getComputedStyle ? window.getComputedStyle(cur) : null;
              if (s) {
                if (s.position === 'fixed') return true;
                const z = parseInt(s.zIndex, 10);
                if (s.position === 'absolute' && ((!isNaN(z) && z > 10) || (s.bottom && s.bottom !== 'auto'))) return true;
              }
              const cls = (cur.getAttribute && cur.getAttribute('class')) || '';
              if (typeof cls === 'string' && (cls.includes('chat-widget') || cls.includes('floating'))) return true;
              cur = cur.parentElement;
            }
            return false;
          };
          const isFloating = checkFloating(element);

          const isInsideChatWindow = Boolean(
            element.closest && element.closest('[class*="chat-window"], [class*="chat-panel"], [class*="chat-content"]')
          );

          const isChatTrigger = !isInsideChatWindow && Boolean(
            getDataAttr(element, 'data-testid') === 'floating-chat-trigger' ||
            getDataAttr(element, 'data-ai-action') === 'open-floating-chat' ||
            classAttr.includes('chat-trigger') ||
            (element.closest && element.closest('[class*="chat-widget-trigger"], [class*="chat-trigger"]'))
          );

          const isSegmented = Boolean(element.classList && element.classList.contains('ant-segmented-item'));
          const isRadioWrapper = Boolean(element.classList && element.classList.contains('ant-radio-button-wrapper'));
          const segmentedInput = (isSegmented || isRadioWrapper) ? element.querySelector('input') : null;
          const isSelected = Boolean(
            getBooleanAttr(element, 'aria-selected') ||
            (element.classList ? (element.classList.contains('ant-segmented-item-selected') || element.classList.contains('ant-radio-button-wrapper-checked')) : false) ||
            (segmentedInput ? Boolean(segmentedInput.checked) : false)
          );
          const resolvedRole = getDataAttr(element, 'role') || (isSegmented ? 'tab' : (isRadioWrapper ? 'radio' : element.tagName.toLowerCase()));

          const elementTextContent = toText(element.textContent);
          const isOnlyNumber = /^\d+$/.test(elementTextContent);
          const iconAriaLabel = (() => {
            const icon = element.querySelector ? element.querySelector('.anticon, [role="img"], [data-icon]') : null;
            if (!icon) return undefined;
            const dataIcon = getDataAttr(icon, 'data-icon');
            const iconAria = getDataAttr(icon, 'aria-label');
            if (iconAria && iconAria !== 'img') return iconAria;
            if (dataIcon) {
              const iconMap = {
                bell: '消息通知',
                'menu-fold': '折叠菜单',
                'menu-unfold': '展开菜单',
                close: '关闭',
                setting: '设置',
                user: '用户',
              };
              return iconMap[dataIcon] || dataIcon;
            }
            return undefined;
          })();

          let buttonText = getDataAttr(element, 'aria-label');
          if (!buttonText && isSegmented) {
            const labelEl = element.querySelector ? element.querySelector('.ant-segmented-item-label') : null;
            buttonText = toText(labelEl ? labelEl.textContent : element.textContent);
          }
          if (!buttonText && !isOnlyNumber && elementTextContent) {
            buttonText = elementTextContent;
          }
          if (!buttonText && rawTitle) {
            buttonText = rawTitle;
          }
          if (!buttonText && svgTitle) {
            buttonText = svgTitle;
          }
          if (!buttonText && iconAriaLabel) {
            buttonText = isOnlyNumber ? (iconAriaLabel + ' (' + elementTextContent + ')') : iconAriaLabel;
          }
          if (!buttonText && isChatTrigger) {
            buttonText = '打开悬浮对话框';
          } else if (!buttonText && isFloating) {
            buttonText = '悬浮按钮';
          } else if (!buttonText && isOnlyNumber) {
            buttonText = elementTextContent;
          }
          buttonText = toText(buttonText);

          const resolvedAction = getDatasetAttr(element, 'aiAction') || (isChatTrigger ? 'open-floating-chat' : undefined);
          const resolvedTitle = rawTitle ? toText(rawTitle) : (svgTitle ? toText(svgTitle) : (isChatTrigger ? '打开悬浮对话框' : undefined));
          const containerInfo = getContainerInfo(element);
          const preferredLocator = (() => {
            if (isSegmented && buttonText) {
              const escaped = buttonText.replace(/"/g, '\\"');
              if (containerInfo && containerInfo.type === 'floating-chat') {
                return { type: 'css', value: '[class*="chat-window"] .ant-segmented-item:has-text("' + escaped + '")' };
              }
              return { type: 'css', value: '.ant-segmented-item:has-text("' + escaped + '")' };
            }
            return undefined;
          })();

          return {
            index,
            ref: getElementRef(element),
            tagName: element.tagName.toLowerCase(),
            text: buttonText,
            title: resolvedTitle,
            isFloating,
            container: containerInfo,
            preferredLocator,
            role: resolvedRole,
            href: element instanceof HTMLAnchorElement ? element.href : undefined,
            dataTestId: getDataAttr(element, 'data-testid') || getDataAttr(element, 'data-test-id') || (isChatTrigger ? 'floating-chat-trigger' : undefined),
            action: resolvedAction,
            region: getDatasetAttr(element, 'aiRegion'),
            stableName: getDatasetAttr(element, 'aiStableName'),
            visible: true,
            disabled: 'disabled' in element ? Boolean(element.disabled) : undefined,
            selected: isSelected,
            ariaSelected: isSelected,
            ariaPressed: getBooleanAttr(element, 'aria-pressed'),
            dataState: getDataAttr(element, 'data-state'),
            rowIndex: (() => {
              const raw = getDatasetAttr(element, 'aiRowIndex');
              const parsed = raw ? Number.parseInt(raw, 10) : NaN;
              if (Number.isFinite(parsed)) return parsed;
              const closestRow = element.closest && element.closest('[data-sys-row-index]');
              if (closestRow) {
                const sysParsed = Number.parseInt(closestRow.getAttribute('data-sys-row-index'), 10);
                return Number.isFinite(sysParsed) ? sysParsed : undefined;
              }
              return undefined;
            })(),
            rowKey: getDatasetAttr(element, 'aiRowKey'),
            rowText: getDatasetAttr(element, 'aiRowText'),
          };
        })
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
            regionId: getDatasetAttr(element, 'aiRegion') || getDataAttr(element, 'aria-label') || getDataAttr(element, 'id') || ('region-' + (index + 1)),
            label: getDatasetAttr(element, 'aiRegionType') || element.tagName.toLowerCase(),
            text: toText(element.textContent),
            fields,
            actions,
            entryCount: fields.length + actions.length,
            visible: true,
            nodeRefs: [...fields, ...actions].map(item => item.ref).filter(Boolean),
          };
        })
        .filter(region => !region.regionId.startsWith('region-') || region.fields.length > 0 || region.actions.length > 0);

      const headings = uniqueElements(queryAllAcrossRoots('h1, h2, h3, h4, [role="heading"]'))
        .filter(isVisible)
        .map(element => toText(element.textContent))
        .filter(Boolean)
        .slice(0, 20);

      const links = uniqueElements(queryAllAcrossRoots('a[href], [role="link"]'))
        .filter(isVisible)
        .filter(element => {
          const href = element.getAttribute ? (element.getAttribute('href') || '').trim() : '';
          return href && href !== '#' && !href.startsWith('javascript:');
        })
        .map(element => toText(getDataAttr(element, 'aria-label') || element.textContent))
        .filter(Boolean)
        .slice(0, 30);

      const simpleHash = str => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash).toString(36);
      };

      const structuralSignature = [
        window.location.pathname || '',
        inputs.length,
        buttons.length,
        rows.length,
        regions.length,
        inputs.slice(0, 6).map(i => i.name || i.id || i.placeholder || i.tagName).join(','),
        buttons.slice(0, 6).map(b => b.text || b.action || b.dataTestId).join(',')
      ].join('::');

      const structuralHash = simpleHash(structuralSignature);

      const activeContainer = (() => {
        const chatWin = document.querySelector('[class*="chat-window"]:not([style*="display: none"]), [class*="chat-panel"]:not([style*="display: none"])');
        if (chatWin && isVisible(chatWin)) {
          return { type: 'floating-chat', name: '聊天框', selector: '.chat-window' };
        }
        const modal = document.querySelector('.ant-modal:not([style*="display: none"]), [role="dialog"]:not([aria-hidden="true"])');
        if (modal && isVisible(modal)) {
          const title = toText(modal.querySelector('.ant-modal-title, [class*="title"]')?.textContent);
          return { type: 'modal', name: '弹窗', title: title || undefined, selector: '.ant-modal' };
        }
        const drawer = document.querySelector('.ant-drawer-open, [role="dialog"].ant-drawer');
        if (drawer && isVisible(drawer)) {
          const title = toText(drawer.querySelector('.ant-drawer-title, [class*="title"]')?.textContent);
          return { type: 'drawer', name: '抽屉面板', title: title || undefined, selector: '.ant-drawer' };
        }
        return undefined;
      })();

      return {
        url: window.location.href,
        title: document.title,
        inputs,
        buttons,
        rows,
        regions,
        headings,
        links,
        activeContainer,
        structuralHash,
        pageSemantics: (window).__AI_PAGE_SEMANTICS__ || undefined,
      };
    })())`;
  }

  private mergeObservedRecords<T extends object>(...groups: T[][]): T[] {
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
