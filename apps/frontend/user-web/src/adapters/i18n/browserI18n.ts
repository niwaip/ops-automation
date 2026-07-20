import type { I18nPort } from '@ops/user-core';
import { initI18n, type SupportedLanguage } from './i18nInstance';

const isSupported = (language: string): language is SupportedLanguage =>
  language === 'zh-CN' || language === 'en-US' || language === 'ja-JP';

export const browserI18n: I18nPort = {
  changeLanguage: (language) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
    if (isSupported(language)) {
      initI18n(language);
    }
  },
};
