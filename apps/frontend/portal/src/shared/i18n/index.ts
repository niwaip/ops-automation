import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCNCommon from '@/i18n/locales/zh-CN/common.json';
import zhCNAuth from '@/i18n/locales/zh-CN/auth.json';
import zhCNSession from '@/i18n/locales/zh-CN/session.json';
import zhCNTemplate from '@/i18n/locales/zh-CN/template.json';
import zhCNAdmin from '@/i18n/locales/zh-CN/admin.json';
import zhCNRecorder from '@/i18n/locales/zh-CN/recorder.json';

import enUSCommon from '@/i18n/locales/en-US/common.json';
import enUSAuth from '@/i18n/locales/en-US/auth.json';
import enUSSession from '@/i18n/locales/en-US/session.json';
import enUSTemplate from '@/i18n/locales/en-US/template.json';
import enUSAdmin from '@/i18n/locales/en-US/admin.json';
import enUSRecorder from '@/i18n/locales/en-US/recorder.json';

import jaJPCommon from '@/i18n/locales/ja-JP/common.json';
import jaJPAuth from '@/i18n/locales/ja-JP/auth.json';
import jaJPSession from '@/i18n/locales/ja-JP/session.json';
import jaJPTemplate from '@/i18n/locales/ja-JP/template.json';
import jaJPAdmin from '@/i18n/locales/ja-JP/admin.json';
import jaJPRecorder from '@/i18n/locales/ja-JP/recorder.json';

const resources = {
  'zh-CN': {
    common: zhCNCommon,
    auth: zhCNAuth,
    session: zhCNSession,
    template: zhCNTemplate,
    admin: zhCNAdmin,
    recorder: zhCNRecorder,
  },
  'en-US': {
    common: enUSCommon,
    auth: enUSAuth,
    session: enUSSession,
    template: enUSTemplate,
    admin: enUSAdmin,
    recorder: enUSRecorder,
  },
  'ja-JP': {
    common: jaJPCommon,
    auth: jaJPAuth,
    session: jaJPSession,
    template: jaJPTemplate,
    admin: jaJPAdmin,
    recorder: jaJPRecorder,
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: ['common', 'auth', 'session', 'template', 'admin', 'recorder'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
