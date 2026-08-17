import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptRendererService {
  /**
   * Render user template with variable substitution
   * {{variable}} pattern replaced with input values
   */
  public renderUserTemplate(template: string, input: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const value = input[name];
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    });
  }

  /**
   * Render prompt from manifest (system + user templates)
   */
  public renderManifestPrompt(
    manifest: Record<string, unknown>,
    input: Record<string, unknown>,
  ): { systemPrompt: string; userPrompt: string } {
    const promptTemplates = (manifest.prompt as Record<string, string>) ?? {};
    const systemPrompt = promptTemplates.systemTemplate ?? '';
    const userPrompt = this.renderUserTemplate(promptTemplates.userTemplate ?? '', input);
    return { systemPrompt, userPrompt };
  }
}