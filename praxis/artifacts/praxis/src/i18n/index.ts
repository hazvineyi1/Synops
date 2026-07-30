import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zu from './locales/zu.json';
import xh from './locales/xh.json';
import af from './locales/af.json';
import es from './locales/es.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zu: { translation: zu },
      xh: { translation: xh },
      af: { translation: af },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zu', 'xh', 'af', 'es'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'praxis_language',
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
