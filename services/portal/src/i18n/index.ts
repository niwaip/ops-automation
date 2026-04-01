import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCNCommon from './locales/zh-CN/common.json';
import zhCNAuth from './locales/zh-CN/auth.json';
import zhCNSession from './locales/zh-CN/session.json';
import zhCNTemplate from './locales/zh-CN/template.json';
import zhCNAdmin from './locales/zh-CN/admin.json';

import enUSCommon from './locales/en-US/common.json';
import enUSAuth from './locales/en-US/auth.json';
import enUSSession from './locales/en-US/session.json';
import enUSTemplate from './locales/en-US/template.json';
import enUSAdmin from './locales/en-US/admin.json';

import jaJPCommon from './locales/ja-JP/common.json';
import jaJPAuth from './locales/ja-JP/auth.json';
import jaJPSession from './locales/ja-JP/session.json';
import jaJPTemplate from './locales/ja-JP/template.json';
import jaJPAdmin from './locales/ja-JP/admin.json';

const resources = {
  'zh-CN': {
    common: zhCNCommon,
    auth: zhCNAuth,
    session: zhCNSession,
    template: zhCNTemplate,
    admin: zhCNAdmin,
  },
  'en-US': {
    common: enUSCommon,
    auth: enUSAuth,
    session: enUSSession,
    template: enUSTemplate,
    admin: enUSAdmin,
  },
  'ja-JP': {
    common: jaJPCommon,
    auth: jaJPAuth,
    session: jaJPSession,
    template: jaJPTemplate,
    admin: jaJPAdmin,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: ['common', 'auth', 'session', 'template', 'admin'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;