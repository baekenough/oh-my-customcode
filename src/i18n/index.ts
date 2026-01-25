/**
 * i18n initialization and typed translation function
 */

import i18next from 'i18next';
import en from './locales/en.json';
import ko from './locales/ko.json';
import type { SupportedLanguage, TranslationKey } from './types.js';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './types.js';

/**
 * Detect system language
 * Checks LANG, LC_ALL, LC_MESSAGES environment variables
 */
export function detectLanguage(): SupportedLanguage {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';

  // Extract language code (e.g., 'en_US.UTF-8' -> 'en')
  const langCode = envLang.split(/[_.-]/)[0]?.toLowerCase();

  // Check if detected language is supported
  const isSupported = SUPPORTED_LANGUAGES.some((lang) => lang.code === langCode);

  return isSupported ? (langCode as SupportedLanguage) : DEFAULT_LANGUAGE;
}

/**
 * Initialize i18next with resources and configuration
 *
 * @param language - Language to use (defaults to detected system language)
 */
export async function initI18n(language?: SupportedLanguage): Promise<void> {
  const lng = language || detectLanguage();

  await i18next.init({
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'translation',
    ns: ['translation'],
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    interpolation: {
      escapeValue: false, // Not needed for CLI
    },
    returnNull: false,
    returnEmptyString: false,
  });
}

/**
 * i18n object with t() method for translations
 * Provides the same API as i18next for convenience
 */
export const i18n = {
  /**
   * Typed translation function
   *
   * @param key - Translation key in dot notation (e.g., 'common.success')
   * @param options - Interpolation options
   * @returns Translated string
   *
   * @example
   * ```typescript
   * i18n.t('common.success') // "Success"
   * i18n.t('init.configCreated', { path: './config.json' }) // "Configuration created at ./config.json"
   * ```
   */
  t(key: TranslationKey | string, options?: Record<string, string | number>): string {
    return i18next.t(key, options);
  },

  /**
   * Change the current language
   *
   * @param language - Language code to switch to
   */
  async changeLanguage(language: SupportedLanguage): Promise<void> {
    await i18next.changeLanguage(language);
  },

  /**
   * Get the current language
   */
  get language(): SupportedLanguage {
    return (i18next.language as SupportedLanguage) || DEFAULT_LANGUAGE;
  },
};

/**
 * Standalone typed translation function (alternative to i18n.t())
 *
 * @param key - Translation key in dot notation (e.g., 'common.success')
 * @param options - Interpolation options
 * @returns Translated string
 *
 * @example
 * ```typescript
 * t('common.success') // "Success"
 * t('init.configCreated', { path: './config.json' }) // "Configuration created at ./config.json"
 * ```
 */
export function t(key: TranslationKey | string, options?: Record<string, string | number>): string {
  return i18next.t(key, options);
}

/**
 * Change the current language
 *
 * @param language - Language code to switch to
 */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
}

/**
 * Get the current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  return (i18next.language as SupportedLanguage) || DEFAULT_LANGUAGE;
}

// Re-export types and constants
export type { SupportedLanguage, TranslationKey } from './types.js';
export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './types.js';

// Export i18next instance for advanced usage
export { i18next };
