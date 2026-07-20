import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCNCommon from '../../locales/zh-CN/common.json';
import zhCNExecution from '../../locales/zh-CN/execution.json';
import zhCNDashboard from '../../locales/zh-CN/dashboard.json';
import zhCNChat from '../../locales/zh-CN/chat.json';
import zhCNAuth from '../../locales/zh-CN/auth.json';
import zhCNSkill from '../../locales/zh-CN/skill.json';
import zhCNReport from '../../locales/zh-CN/report.json';
import zhCNNotification from '../../locales/zh-CN/notification.json';
import enUSCommon from '../../locales/en-US/common.json';
import enUSExecution from '../../locales/en-US/execution.json';
import enUSDashboard from '../../locales/en-US/dashboard.json';
import enUSChat from '../../locales/en-US/chat.json';
import enUSAuth from '../../locales/en-US/auth.json';
import enUSSkill from '../../locales/en-US/skill.json';
import enUSReport from '../../locales/en-US/report.json';
import enUSNotification from '../../locales/en-US/notification.json';
import jaJPCommon from '../../locales/ja-JP/common.json';
import jaJPExecution from '../../locales/ja-JP/execution.json';
import jaJPDashboard from '../../locales/ja-JP/dashboard.json';
import jaJPChat from '../../locales/ja-JP/chat.json';
import jaJPAuth from '../../locales/ja-JP/auth.json';
import jaJPSkill from '../../locales/ja-JP/skill.json';
import jaJPReport from '../../locales/ja-JP/report.json';
import jaJPNotification from '../../locales/ja-JP/notification.json';

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'zh-CN';

const resources = {
  'zh-CN': {
    common: zhCNCommon,
    execution: zhCNExecution,
    dashboard: zhCNDashboard,
    chat: zhCNChat,
    auth: zhCNAuth,
    skill: zhCNSkill,
    report: zhCNReport,
    notification: zhCNNotification,
  },
  'en-US': {
    common: enUSCommon,
    execution: enUSExecution,
    dashboard: enUSDashboard,
    chat: enUSChat,
    auth: enUSAuth,
    skill: enUSSkill,
    report: enUSReport,
    notification: enUSNotification,
  },
  'ja-JP': {
    common: jaJPCommon,
    execution: jaJPExecution,
    dashboard: jaJPDashboard,
    chat: jaJPChat,
    auth: jaJPAuth,
    skill: jaJPSkill,
    report: jaJPReport,
    notification: jaJPNotification,
  },
} as const;

let initialized = false;

export const initI18n = (language: SupportedLanguage = DEFAULT_LANGUAGE): typeof i18n => {
  if (!initialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'common',
      ns: ['common', 'execution', 'dashboard', 'chat', 'auth', 'skill', 'report', 'notification'],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    initialized = true;
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
};

// Initialize synchronously on module load
initI18n(DEFAULT_LANGUAGE);

export default i18n;
