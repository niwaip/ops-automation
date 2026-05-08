import { Injectable } from '@nestjs/common';
import { BrowserActionStep, BrowserRuntimeParamBinding } from '../domain/browser-step.types';

@Injectable()
export class BrowserParameterizationService {
  parameterizeStep(step: BrowserActionStep): BrowserActionStep {
    const scriptFragment = step.scriptFragment?.trim();
    const bindings = step.paramBindings || [];
    if (!scriptFragment || bindings.length === 0) {
      return step;
    }

    let parameterized = scriptFragment;
    for (const binding of bindings) {
      if (binding.source !== 'user_input' && binding.source !== 'secret') {
        continue;
      }
      parameterized = this.applyBinding(parameterized, binding);
    }

    if (parameterized === scriptFragment) {
      return step;
    }

    return {
      ...step,
      parameterizedScriptFragment: parameterized,
    };
  }

  private applyBinding(script: string, binding: BrowserRuntimeParamBinding): string {
    const accessor = `params.${binding.name}`;
    const value = binding.value;

    if (typeof value === 'string') {
      const candidates = [
        JSON.stringify(value),
        `'${this.escapeSingleQuoted(value)}'`,
      ];

      return candidates.reduce((current, literal) => (
        this.replaceAllLiteral(current, literal, accessor)
      ), script);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.replaceAllLiteral(script, String(value), accessor);
    }

    return script;
  }

  private replaceAllLiteral(script: string, literal: string, replacement: string): string {
    if (!literal || !script.includes(literal)) {
      return script;
    }
    const pattern = new RegExp(this.escapeRegExp(literal), 'g');
    return script.replace(pattern, replacement);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeSingleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
  }
}
