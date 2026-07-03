import { Injectable } from '@nestjs/common';
import { BrowserActionStep, BrowserRuntimeLocator } from '../domain/browser-step.types';

interface ParseContext {
  backend?: string;
  source?: 'manual' | 'manual_takeover';
  runtimeSessionId?: string;
}

interface ParseState {
  knownPageAliases: Set<string>;
  pendingPopupPromiseNames: Set<string>;
}

@Injectable()
export class CodegenScriptParserService {
  parse(script: string, context?: ParseContext): BrowserActionStep[] {
    const state: ParseState = {
      knownPageAliases: new Set(['page']),
      pendingPopupPromiseNames: new Set<string>(),
    };
    const lines = script
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const steps: BrowserActionStep[] = [];
    for (const line of lines) {
      const step = this.parseLine(line, steps.length, context, state);
      if (step) {
        steps.push(step);
      }
    }

    return steps;
  }

  private parseLine(
    line: string,
    index: number,
    context?: ParseContext,
    state?: ParseState
  ): BrowserActionStep | null {
    const popupPromiseMatch = line.match(
      /^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*|context|browserContext)\.waitForEvent\((['"])(popup|page)\2\);?$/
    );
    if (popupPromiseMatch?.[1] && state) {
      state.pendingPopupPromiseNames.add(popupPromiseMatch[1]);
      return null;
    }

    const popupPageAliasMatch = line.match(
      /^const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*;?$/
    );
    if (
      popupPageAliasMatch?.[1] &&
      popupPageAliasMatch[2] &&
      state?.pendingPopupPromiseNames.has(popupPageAliasMatch[2])
    ) {
      state.pendingPopupPromiseNames.delete(popupPageAliasMatch[2]);
      state.knownPageAliases.add(popupPageAliasMatch[1]);
      return this.buildStep(
        index,
        'switch_latest_tab',
        {
          params: {},
          scriptFragment: line,
        },
        context
      );
    }

    const directPopupPageAliasMatch = line.match(
      /^const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s*(?:[A-Za-z_$][\w$]*|context|browserContext)\.waitForEvent\((['"])(popup|page)\2\);?$/
    );
    if (directPopupPageAliasMatch?.[1] && state) {
      state.knownPageAliases.add(directPopupPageAliasMatch[1]);
      return this.buildStep(
        index,
        'switch_latest_tab',
        {
          params: {},
          scriptFragment: line,
        },
        context
      );
    }

    const pageAlias = this.extractKnownPageAlias(line, state);
    if (!pageAlias) {
      return null;
    }

    const gotoMatch = line.match(
      new RegExp(`^await\\s+${this.escapeForRegex(pageAlias)}\\.goto\\((['"])([\\s\\S]*?)\\1\\);?$`)
    );
    if (gotoMatch?.[2]) {
      return this.buildStep(
        index,
        'navigate',
        {
          params: { url: gotoMatch[2] },
          scriptFragment: line,
        },
        context
      );
    }

    const pageCloseMatch = line.match(
      new RegExp(`^await\\s+${this.escapeForRegex(pageAlias)}\\.close\\(\\);?$`)
    );
    if (pageCloseMatch) {
      return this.buildStep(
        index,
        'close_tab',
        {
          params: {},
          scriptFragment: line,
        },
        context
      );
    }

    const pageClickMatch = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.click\\((['"])([\\s\\S]*?)\\1\\);?$`
      )
    );
    if (pageClickMatch?.[2]) {
      const selector = pageClickMatch[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { selector },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const pageFillMatch = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.fill\\((['"])([\\s\\S]*?)\\1\\s*,\\s*(['"])([\\s\\S]*?)\\3\\);?$`
      )
    );
    if (pageFillMatch?.[2] && pageFillMatch[4] !== undefined) {
      const selector = pageFillMatch[2];
      const value = pageFillMatch[4];
      return this.buildStep(
        index,
        'fill',
        {
          params: { selector, value },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const pageHoverMatch = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.hover\\((['"])([\\s\\S]*?)\\1\\);?$`
      )
    );
    if (pageHoverMatch?.[2]) {
      const selector = pageHoverMatch[2];
      return this.buildStep(
        index,
        'hover',
        {
          params: { selector },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const roleClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByRole\\((['"])([^'"]+)\\1,\\s*\\{\\s*name:\\s*(['"])([\\s\\S]*?)\\3.*\\}\\)\\.click\\(\\);?$`
      )
    );
    if (roleClick?.[2] && roleClick[4]) {
      const role = roleClick[2];
      const name = roleClick[4];
      return this.buildStep(
        index,
        'click',
        {
          params: { target: `role=${role}[name="${name}"]`, role, name },
          locator: { strategy: 'role', value: role, role, name },
          scriptFragment: line,
        },
        context
      );
    }

    const roleHover = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByRole\\((['"])([^'"]+)\\1,\\s*\\{\\s*name:\\s*(['"])([\\s\\S]*?)\\3.*\\}\\)\\.hover\\(\\);?$`
      )
    );
    if (roleHover?.[2] && roleHover[4]) {
      const role = roleHover[2];
      const name = roleHover[4];
      return this.buildStep(
        index,
        'hover',
        {
          params: { target: `role=${role}[name="${name}"]`, role, name },
          locator: { strategy: 'role', value: role, role, name },
          scriptFragment: line,
        },
        context
      );
    }

    const roleFill = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByRole\\((['"])([^'"]+)\\1,\\s*\\{\\s*name:\\s*(['"])([\\s\\S]*?)\\3.*\\}\\)\\.fill\\((['"])([\\s\\S]*?)\\5\\);?$`
      )
    );
    if (roleFill?.[2] && roleFill[4] && roleFill[6] !== undefined) {
      const role = roleFill[2];
      const name = roleFill[4];
      const value = roleFill[6];
      return this.buildStep(
        index,
        'fill',
        {
          params: { target: `role=${role}[name="${name}"]`, role, name, value },
          locator: { strategy: 'role', value: role, role, name },
          scriptFragment: line,
        },
        context
      );
    }

    const textClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByText\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.click\\(\\);?$`
      )
    );
    if (textClick?.[2]) {
      const text = textClick[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { text },
          locator: { strategy: 'text', value: text },
          scriptFragment: line,
        },
        context
      );
    }

    const textHover = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByText\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.hover\\(\\);?$`
      )
    );
    if (textHover?.[2]) {
      const text = textHover[2];
      return this.buildStep(
        index,
        'hover',
        {
          params: { text },
          locator: { strategy: 'text', value: text },
          scriptFragment: line,
        },
        context
      );
    }

    const labelClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByLabel\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.click\\(\\);?$`
      )
    );
    if (labelClick?.[2]) {
      const label = labelClick[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { label },
          locator: { strategy: 'label', value: label },
          scriptFragment: line,
        },
        context
      );
    }

    const labelFill = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByLabel\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.fill\\((['"])([\\s\\S]*?)\\3\\);?$`
      )
    );
    if (labelFill?.[2] && labelFill[4] !== undefined) {
      const label = labelFill[2];
      const value = labelFill[4];
      return this.buildStep(
        index,
        'fill',
        {
          params: { label, value },
          locator: { strategy: 'label', value: label },
          scriptFragment: line,
        },
        context
      );
    }

    const placeholderClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByPlaceholder\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.click\\(\\);?$`
      )
    );
    if (placeholderClick?.[2]) {
      const placeholder = placeholderClick[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { placeholder },
          locator: { strategy: 'placeholder', value: placeholder },
          scriptFragment: line,
        },
        context
      );
    }

    const placeholderFill = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByPlaceholder\\((['"])([\\s\\S]*?)\\1(?:,\\s*\\{.*\\})?\\)\\.fill\\((['"])([\\s\\S]*?)\\3\\);?$`
      )
    );
    if (placeholderFill?.[2] && placeholderFill[4] !== undefined) {
      const placeholder = placeholderFill[2];
      const value = placeholderFill[4];
      return this.buildStep(
        index,
        'fill',
        {
          params: { placeholder, value },
          locator: { strategy: 'placeholder', value: placeholder },
          scriptFragment: line,
        },
        context
      );
    }

    const testIdClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByTestId\\((['"])([\\s\\S]*?)\\1\\)\\.click\\(\\);?$`
      )
    );
    if (testIdClick?.[2]) {
      const testId = testIdClick[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { testId },
          locator: { strategy: 'testid', value: testId },
          scriptFragment: line,
        },
        context
      );
    }

    const testIdFill = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.getByTestId\\((['"])([\\s\\S]*?)\\1\\)\\.fill\\((['"])([\\s\\S]*?)\\3\\);?$`
      )
    );
    if (testIdFill?.[2] && testIdFill[4] !== undefined) {
      const testId = testIdFill[2];
      const value = testIdFill[4];
      return this.buildStep(
        index,
        'fill',
        {
          params: { testId, value },
          locator: { strategy: 'testid', value: testId },
          scriptFragment: line,
        },
        context
      );
    }

    const locatorClick = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.locator\\((['"])([\\s\\S]*?)\\1\\)\\.click\\(\\);?$`
      )
    );
    if (locatorClick?.[2]) {
      const selector = locatorClick[2];
      return this.buildStep(
        index,
        'click',
        {
          params: { selector },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const locatorHover = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.locator\\((['"])([\\s\\S]*?)\\1\\)\\.hover\\(\\);?$`
      )
    );
    if (locatorHover?.[2]) {
      const selector = locatorHover[2];
      return this.buildStep(
        index,
        'hover',
        {
          params: { selector },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const locatorFill = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.locator\\((['"])([\\s\\S]*?)\\1\\)\\.fill\\((['"])([\\s\\S]*?)\\3\\);?$`
      )
    );
    if (locatorFill?.[2] && locatorFill[4] !== undefined) {
      const selector = locatorFill[2];
      const value = locatorFill[4];
      return this.buildStep(
        index,
        'fill',
        {
          params: { selector, value },
          locator: { strategy: 'css', value: selector },
          scriptFragment: line,
        },
        context
      );
    }

    const keyboardPress = line.match(
      new RegExp(
        `^await\\s+${this.escapeForRegex(pageAlias)}\\.keyboard\\.press\\((['"])([^'"]+)\\1\\);?$`
      )
    );
    if (keyboardPress?.[2]) {
      return this.buildStep(
        index,
        'press_key',
        {
          params: { key: keyboardPress[2] },
          scriptFragment: line,
        },
        context
      );
    }

    return null;
  }

  private buildStep(
    index: number,
    action: string,
    input: {
      params?: Record<string, unknown>;
      locator?: BrowserRuntimeLocator;
      scriptFragment: string;
    },
    context?: ParseContext
  ): BrowserActionStep {
    const source = context?.source === 'manual_takeover' ? 'manual_takeover' : 'manual';
    const locator = input.locator
      ? {
          ...input.locator,
          type: input.locator.type || input.locator.strategy,
        }
      : undefined;

    return {
      id: `patch_${String(index + 1).padStart(3, '0')}`,
      source,
      backend: context?.backend || 'cli',
      action,
      status: 'success',
      locator,
      params: input.params,
      scriptFragment: input.scriptFragment,
      parameterizedScriptFragment: null,
      assertionFragment: null,
      replayable: true,
      timestamp: Date.now() + index,
    };
  }

  private extractKnownPageAlias(line: string, state?: ParseState): string | undefined {
    const pageAlias = line.match(/^await\s+([A-Za-z_$][\w$]*)\./)?.[1];
    if (!pageAlias) {
      return undefined;
    }
    if (!state) {
      return pageAlias === 'page' ? pageAlias : undefined;
    }
    return state.knownPageAliases.has(pageAlias) ? pageAlias : undefined;
  }

  private escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
