import type { I18nPort } from '@ops/user-core';

export const browserI18n: I18nPort = {
  changeLanguage: (language) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  },
};
