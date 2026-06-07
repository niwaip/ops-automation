import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptDebugSettingsService {
  private promptDebugEnabled = true;

  getSettings(): { promptDebugEnabled: boolean } {
    return {
      promptDebugEnabled: this.promptDebugEnabled,
    };
  }

  isPromptDebugEnabled(): boolean {
    return this.promptDebugEnabled;
  }

  updateSettings(input: { promptDebugEnabled: boolean }): { promptDebugEnabled: boolean } {
    this.promptDebugEnabled = input.promptDebugEnabled;
    return this.getSettings();
  }
}
