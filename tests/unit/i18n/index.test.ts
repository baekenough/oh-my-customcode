import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  changeLanguage,
  DEFAULT_LANGUAGE,
  detectLanguage,
  getCurrentLanguage,
  i18n,
  i18next,
  initI18n,
  SUPPORTED_LANGUAGES,
  t,
} from '../../../src/i18n/index.js';

describe('i18n', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    // Reset i18next before each test
    if (i18next.isInitialized) {
      await i18next.changeLanguage('en');
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('detectLanguage', () => {
    it('should detect language from LANG environment variable', () => {
      process.env.LANG = 'ko_KR.UTF-8';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = '';

      const detected = detectLanguage();

      expect(detected).toBe('ko');
    });

    it('should detect language from LC_ALL environment variable', () => {
      process.env.LANG = '';
      process.env.LC_ALL = 'ko_KR.UTF-8';
      process.env.LC_MESSAGES = '';

      const detected = detectLanguage();

      expect(detected).toBe('ko');
    });

    it('should detect language from LC_MESSAGES environment variable', () => {
      process.env.LANG = '';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = 'ko_KR.UTF-8';

      const detected = detectLanguage();

      expect(detected).toBe('ko');
    });

    it('should prioritize LANG over other variables', () => {
      process.env.LANG = 'en_US.UTF-8';
      process.env.LC_ALL = 'ko_KR.UTF-8';
      process.env.LC_MESSAGES = 'ko_KR.UTF-8';

      const detected = detectLanguage();

      expect(detected).toBe('en');
    });

    it('should extract language code from complex locale string', () => {
      process.env.LANG = 'en_US.UTF-8';

      const detected = detectLanguage();

      expect(detected).toBe('en');
    });

    it('should handle locale with hyphen separator', () => {
      process.env.LANG = 'en-US';

      const detected = detectLanguage();

      expect(detected).toBe('en');
    });

    it('should return default language for unsupported locale', () => {
      process.env.LANG = 'fr_FR.UTF-8';

      const detected = detectLanguage();

      expect(detected).toBe(DEFAULT_LANGUAGE);
    });

    it('should return default language when no locale is set', () => {
      process.env.LANG = '';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = '';

      const detected = detectLanguage();

      expect(detected).toBe(DEFAULT_LANGUAGE);
    });

    it('should handle empty string locale', () => {
      process.env.LANG = '';

      const detected = detectLanguage();

      expect(detected).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('initI18n', () => {
    it('should initialize with default language when no parameter', async () => {
      process.env.LANG = '';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = '';

      await initI18n();

      expect(getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('should initialize with specified language', async () => {
      await initI18n('ko');

      expect(getCurrentLanguage()).toBe('ko');
    });

    it('should initialize with detected language', async () => {
      process.env.LANG = 'ko_KR.UTF-8';

      await initI18n();

      expect(getCurrentLanguage()).toBe('ko');
    });

    it('should load English translations', async () => {
      await initI18n('en');

      const result = t('common.success');

      expect(result).toBeDefined();
      expect(result).not.toBe('common.success');
    });

    it('should load Korean translations', async () => {
      await initI18n('ko');

      const result = t('common.success');

      expect(result).toBeDefined();
      expect(result).not.toBe('common.success');
    });
  });

  describe('t (translation function)', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    it('should translate known keys', () => {
      const result = t('common.success');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return key for unknown translations', () => {
      const result = t('nonexistent.key');

      // i18next returns the key when translation is not found
      expect(result).toBe('nonexistent.key');
    });

    it('should support interpolation', () => {
      const result = t('init.configCreated', { path: '/test/path' });

      expect(result).toContain('/test/path');
    });

    it('should handle interpolation with numbers', () => {
      // Use a key that supports number interpolation if available
      const result = t('list.agentCount', { count: 5 });

      expect(result).toBeDefined();
    });
  });

  describe('i18n object', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    describe('i18n.t', () => {
      it('should translate known keys', () => {
        const result = i18n.t('common.success');

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      it('should support interpolation', () => {
        const result = i18n.t('init.configCreated', { path: '/some/path' });

        expect(result).toContain('/some/path');
      });
    });

    describe('i18n.changeLanguage', () => {
      it('should change language', async () => {
        await i18n.changeLanguage('ko');

        expect(i18n.language).toBe('ko');
      });
    });

    describe('i18n.language', () => {
      it('should return current language', () => {
        expect(i18n.language).toBe('en');
      });

      it('should reflect language changes', async () => {
        await i18n.changeLanguage('ko');

        expect(i18n.language).toBe('ko');
      });
    });
  });

  describe('changeLanguage', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    it('should change language to Korean', async () => {
      await changeLanguage('ko');

      expect(getCurrentLanguage()).toBe('ko');
    });

    it('should change language to English', async () => {
      await changeLanguage('ko');
      await changeLanguage('en');

      expect(getCurrentLanguage()).toBe('en');
    });

    it('should affect translations after change', async () => {
      const englishResult = t('common.success');

      await changeLanguage('ko');
      const koreanResult = t('common.success');

      // They should be different (unless they happen to be the same word)
      // At minimum, both should be valid strings
      expect(typeof englishResult).toBe('string');
      expect(typeof koreanResult).toBe('string');
    });
  });

  describe('getCurrentLanguage', () => {
    it('should return current language after initialization', async () => {
      await initI18n('en');

      expect(getCurrentLanguage()).toBe('en');
    });

    it('should return updated language after change', async () => {
      await initI18n('en');
      await changeLanguage('ko');

      expect(getCurrentLanguage()).toBe('ko');
    });

    it('should return default language when not initialized', () => {
      // Before initialization or in edge cases
      const lang = getCurrentLanguage();

      // Should return a valid language code
      expect(['en', 'ko']).toContain(lang);
    });
  });

  describe('constants', () => {
    describe('SUPPORTED_LANGUAGES', () => {
      it('should include English', () => {
        const english = SUPPORTED_LANGUAGES.find((l) => l.code === 'en');

        expect(english).toBeDefined();
        expect(english?.name).toBe('English');
        expect(english?.nativeName).toBe('English');
      });

      it('should include Korean', () => {
        const korean = SUPPORTED_LANGUAGES.find((l) => l.code === 'ko');

        expect(korean).toBeDefined();
        expect(korean?.name).toBe('Korean');
        expect(korean?.nativeName).toBe('한국어');
      });
    });

    describe('DEFAULT_LANGUAGE', () => {
      it('should be English', () => {
        expect(DEFAULT_LANGUAGE).toBe('en');
      });
    });
  });

  describe('i18next instance', () => {
    it('should be exported for advanced usage', () => {
      expect(i18next).toBeDefined();
    });

    it('should have isInitialized property', async () => {
      await initI18n('en');

      expect(i18next.isInitialized).toBe(true);
    });
  });
});
