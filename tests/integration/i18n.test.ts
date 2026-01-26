import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
} from '../../src/i18n/index.js';

describe('i18n integration', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-i18n-test-'));
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('language detection', () => {
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

    it('should fall back to English for unsupported locales', () => {
      process.env.LANG = 'ja_JP.UTF-8';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = '';

      const detected = detectLanguage();

      expect(detected).toBe(DEFAULT_LANGUAGE);
    });

    it('should fall back to English when no locale is set', () => {
      process.env.LANG = '';
      process.env.LC_ALL = '';
      process.env.LC_MESSAGES = '';

      const detected = detectLanguage();

      expect(detected).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('translation loading', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    it('should load translation files correctly', () => {
      const result = t('common.error');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).not.toBe('common.error');
    });

    it('should handle missing translation keys', () => {
      const result = t('nonexistent.key.that.does.not.exist');

      // i18next returns the key when translation is not found
      expect(result).toBe('nonexistent.key.that.does.not.exist');
    });

    it('should support interpolation', async () => {
      await initI18n('en');

      const result = t('init.configCreated', { path: '/test/path' });

      expect(result).toContain('/test/path');
    });
  });

  describe('language switching', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    it('should switch language at runtime', async () => {
      expect(getCurrentLanguage()).toBe('en');

      await changeLanguage('ko');

      expect(getCurrentLanguage()).toBe('ko');
    });

    it('should affect translations after switching', async () => {
      const englishResult = t('common.success');

      await changeLanguage('ko');
      const koreanResult = t('common.success');

      // Both should be valid strings
      expect(typeof englishResult).toBe('string');
      expect(typeof koreanResult).toBe('string');
      expect(englishResult.length).toBeGreaterThan(0);
      expect(koreanResult.length).toBeGreaterThan(0);
    });

    it('should switch back to English', async () => {
      await changeLanguage('ko');
      expect(getCurrentLanguage()).toBe('ko');

      await changeLanguage('en');
      expect(getCurrentLanguage()).toBe('en');
    });
  });

  describe('CLI message translation', () => {
    it('should translate error messages in English', async () => {
      await initI18n('en');

      const result = t('common.error');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should translate error messages in Korean', async () => {
      await initI18n('ko');

      const result = t('common.error');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should translate init command messages', async () => {
      await initI18n('en');

      const starting = t('init.starting');
      const success = t('init.success');

      expect(starting).toBeDefined();
      expect(success).toBeDefined();
    });

    it('should translate update command messages', async () => {
      await initI18n('en');

      const checking = t('update.checking');
      const noUpdates = t('update.noUpdates');

      expect(checking).toBeDefined();
      expect(noUpdates).toBeDefined();
    });

    it('should translate list command messages', async () => {
      await initI18n('en');

      const loading = t('list.loading');
      const noAgents = t('list.noAgents');

      expect(loading).toBeDefined();
      expect(noAgents).toBeDefined();
    });

    it('should translate doctor command messages', async () => {
      await initI18n('en');

      const running = t('doctor.running');
      const allPassed = t('doctor.allPassed');

      expect(running).toBeDefined();
      expect(allPassed).toBeDefined();
    });
  });

  describe('i18n object API', () => {
    beforeEach(async () => {
      await initI18n('en');
    });

    it('should provide t method', () => {
      const result = i18n.t('common.success');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should provide changeLanguage method', async () => {
      await i18n.changeLanguage('ko');

      expect(i18n.language).toBe('ko');
    });

    it('should provide language getter', () => {
      expect(i18n.language).toBe('en');
    });
  });

  describe('supported languages', () => {
    it('should include all supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(2);
    });

    it('should have English configuration', () => {
      const english = SUPPORTED_LANGUAGES.find((l) => l.code === 'en');

      expect(english).toBeDefined();
      expect(english?.name).toBe('English');
      expect(english?.nativeName).toBe('English');
    });

    it('should have Korean configuration', () => {
      const korean = SUPPORTED_LANGUAGES.find((l) => l.code === 'ko');

      expect(korean).toBeDefined();
      expect(korean?.name).toBe('Korean');
      expect(korean?.nativeName).toBe('한국어');
    });
  });

  describe('i18next instance', () => {
    it('should be exported for advanced usage', () => {
      expect(i18next).toBeDefined();
    });

    it('should be initialized after initI18n', async () => {
      await initI18n('en');

      expect(i18next.isInitialized).toBe(true);
    });

    it('should have correct language after initialization', async () => {
      await initI18n('ko');

      expect(i18next.language).toBe('ko');
    });
  });
});
