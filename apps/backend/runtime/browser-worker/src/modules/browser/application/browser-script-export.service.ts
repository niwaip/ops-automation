import { Injectable } from '@nestjs/common';
import { BrowserActionStep } from '../domain/browser-step.types';

export interface ExportOptions {
  title?: string;
  baseUrl?: string;
  useParameterized?: boolean;
  includeImports?: boolean;
}

@Injectable()
export class BrowserScriptExportService {
  /**
   * Generates a full Playwright script from a sequence of steps
   */
  exportToPlaywright(steps: BrowserActionStep[], options: ExportOptions = {}): string {
    const {
      title = 'Browser Automation Task',
      baseUrl,
      useParameterized = true,
      includeImports = true,
    } = options;

    const lines: string[] = [];

    // 1. Imports
    if (includeImports) {
      lines.push("import { test, expect } from '@playwright/test';");
      lines.push('');
    }

    // 2. Test block header
    lines.push(`test('${title}', async ({ page }) => {`);

    // 3. Optional: Set base URL or initial navigation if the first step isn't a navigation
    if (baseUrl && !this.isNavigationStep(steps[0])) {
      lines.push(`  await page.goto('${baseUrl}');`);
    }

    // 4. Collect all parameter bindings if using parameterized version
    if (useParameterized) {
      const allParams = this.collectParams(steps);
      if (Object.keys(allParams).length > 0) {
        lines.push('  // Parameters used in this script:');
        lines.push(`  const params = ${JSON.stringify(allParams, null, 2).replace(/\n/g, '\n  ')};`);
        lines.push('');
      }
    }

    // 5. Steps
    for (const step of steps) {
      if (step.status !== 'success') continue;

      const fragment = useParameterized
        ? step.parameterizedScriptFragment || step.scriptFragment
        : step.scriptFragment;

      if (fragment) {
        lines.push(`  // Step: ${step.intent || step.action}`);
        lines.push(`  ${fragment}`);
        
        if (step.assertionFragment) {
          lines.push(`  ${step.assertionFragment}`);
        }
        
        lines.push('');
      }
    }

    // 6. Test block footer
    lines.push('});');

    return lines.join('\n');
  }

  private isNavigationStep(step?: BrowserActionStep): boolean {
    if (!step) return false;
    return step.action === 'goto' || step.action === 'open' || !!(step.params && step.params.url);
  }

  private collectParams(steps: BrowserActionStep[]): Record<string, any> {
    const params: Record<string, any> = {};
    for (const step of steps) {
      if (step.paramBindings) {
        for (const binding of step.paramBindings) {
          params[binding.name] = binding.value;
        }
      }
    }
    return params;
  }
}
