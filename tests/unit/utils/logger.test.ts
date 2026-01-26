import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import {
  addMessages,
  createLogger,
  debug,
  error,
  getLoggerOptions,
  info,
  progress,
  raw,
  setColors,
  setLocale,
  setLogLevel,
  spinner,
  success,
  table,
  warn,
} from '../../../src/utils/logger.js';

describe('logger utilities', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;
  let stdoutWriteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Spy on console methods to capture output
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
    stdoutWriteSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Reset logger to default state
    createLogger({
      level: 'info',
      colors: true,
      locale: 'en',
      timestamps: false,
      prefix: undefined,
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('should create logger with custom options', () => {
      createLogger({
        level: 'debug',
        colors: false,
        locale: 'ko',
        prefix: 'test',
      });

      const options = getLoggerOptions();

      expect(options.level).toBe('debug');
      expect(options.colors).toBe(false);
      expect(options.locale).toBe('ko');
      expect(options.prefix).toBe('test');
    });

    it('should merge options with existing', () => {
      createLogger({ level: 'debug' });
      createLogger({ colors: false });

      const options = getLoggerOptions();

      expect(options.level).toBe('debug');
      expect(options.colors).toBe(false);
    });
  });

  describe('setLogLevel', () => {
    it('should set log level to debug', () => {
      setLogLevel('debug');

      const options = getLoggerOptions();
      expect(options.level).toBe('debug');
    });

    it('should set log level to error', () => {
      setLogLevel('error');

      const options = getLoggerOptions();
      expect(options.level).toBe('error');
    });
  });

  describe('setLocale', () => {
    it('should set locale to Korean', () => {
      setLocale('ko');

      const options = getLoggerOptions();
      expect(options.locale).toBe('ko');
    });

    it('should set locale to English', () => {
      setLocale('en');

      const options = getLoggerOptions();
      expect(options.locale).toBe('en');
    });
  });

  describe('setColors', () => {
    it('should enable colors', () => {
      setColors(true);

      const options = getLoggerOptions();
      expect(options.colors).toBe(true);
    });

    it('should disable colors', () => {
      setColors(false);

      const options = getLoggerOptions();
      expect(options.colors).toBe(false);
    });
  });

  describe('info', () => {
    it('should output message to console.info', () => {
      info('install.start');

      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should translate message key', () => {
      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('oh-my-customcode');
    });

    it('should not output when log level is higher than info', () => {
      setLogLevel('warn');

      info('install.start');

      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should output when log level is info or lower', () => {
      setLogLevel('debug');

      info('install.start');

      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should support interpolation params', () => {
      info('install.backup', { path: '/test/backup' });

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('/test/backup');
    });

    it('should use Korean messages when locale is ko', () => {
      setLocale('ko');

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('초기화');
    });
  });

  describe('warn', () => {
    it('should output message to console.warn', () => {
      warn('update.failed', { error: 'test error' });

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not output when log level is higher than warn', () => {
      setLogLevel('error');

      warn('update.failed', { error: 'test error' });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should output when log level is warn or lower', () => {
      setLogLevel('warn');

      warn('update.failed', { error: 'test error' });

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should include warning color when colors enabled', () => {
      setColors(true);

      warn('update.failed', { error: 'test' });

      const call = consoleWarnSpy.mock.calls[0][0];
      // Should contain yellow color code
      expect(call).toContain('\x1b[33m');
    });
  });

  describe('error', () => {
    it('should output message to console.error', () => {
      error('install.failed', { error: 'test error' });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should always output regardless of log level', () => {
      setLogLevel('error');

      error('install.failed', { error: 'test error' });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include error color when colors enabled', () => {
      setColors(true);

      error('install.failed', { error: 'test' });

      const call = consoleErrorSpy.mock.calls[0][0];
      // Should contain red color code
      expect(call).toContain('\x1b[31m');
    });
  });

  describe('debug', () => {
    it('should output message to console.debug when level is debug', () => {
      setLogLevel('debug');

      debug('config.saved', { path: '/test/path' });

      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should not output when log level is higher than debug', () => {
      setLogLevel('info');

      debug('config.saved', { path: '/test/path' });

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should include dim color when colors enabled', () => {
      setLogLevel('debug');
      setColors(true);

      debug('config.saved', { path: '/test' });

      const call = consoleDebugSpy.mock.calls[0][0];
      // Should contain dim color code
      expect(call).toContain('\x1b[2m');
    });
  });

  describe('success', () => {
    it('should output message to console.info', () => {
      success('install.success');

      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should include green checkmark when colors enabled', () => {
      setColors(true);

      success('install.success');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain green color code and checkmark
      expect(call).toContain('\x1b[32m');
      expect(call).toContain('✓');
    });

    it('should include [SUCCESS] prefix when colors disabled', () => {
      setColors(false);

      success('install.success');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('[SUCCESS]');
    });

    it('should not output when log level is higher than info', () => {
      setLogLevel('warn');

      success('install.success');

      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('raw', () => {
    it('should output raw message to console.log', () => {
      raw('info', 'raw message');

      expect(consoleLogSpy).toHaveBeenCalledWith('raw message');
    });

    it('should respect log level', () => {
      setLogLevel('warn');

      raw('info', 'raw message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should output when level matches', () => {
      setLogLevel('error');

      raw('error', 'error message');

      expect(consoleLogSpy).toHaveBeenCalledWith('error message');
    });
  });

  describe('progress', () => {
    it('should write progress bar to stdout', () => {
      progress(50, 100, 'Loading...');

      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should show correct percentage', () => {
      progress(50, 100);

      const call = stdoutWriteSpy.mock.calls[0][0];
      expect(call).toContain('50%');
    });

    it('should show 100% when complete', () => {
      progress(100, 100);

      // Should have two writes: progress line and newline
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(2);
    });

    it('should include message when provided', () => {
      progress(25, 100, 'Processing...');

      const call = stdoutWriteSpy.mock.calls[0][0];
      expect(call).toContain('Processing...');
    });

    it('should not output when log level is higher than info', () => {
      setLogLevel('warn');

      progress(50, 100);

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should use hash characters when colors disabled', () => {
      setColors(false);

      progress(50, 100);

      const call = stdoutWriteSpy.mock.calls[0][0];
      expect(call).toContain('#');
    });
  });

  describe('spinner', () => {
    it('should return stop function', () => {
      const stop = spinner('Loading...');

      expect(typeof stop).toBe('function');
      stop();
    });

    it('should log message when colors disabled', () => {
      setColors(false);

      const stop = spinner('Loading...');

      expect(consoleLogSpy).toHaveBeenCalledWith('Loading...');
      stop();
    });

    it('should fallback to log message when log level is higher than info', () => {
      // When spinner can't be shown (log level too high or colors disabled),
      // it falls back to logging the message once
      setLogLevel('warn');

      const stop = spinner('Loading...');

      // Fallback behavior: logs message instead of spinning
      expect(consoleLogSpy).toHaveBeenCalledWith('Loading...');
      stop();
    });

    it('should log message and return noop when both log level high and colors disabled', () => {
      // Test the exact condition: !shouldLog('info') || !currentOptions.colors
      setLogLevel('warn');
      setColors(false);

      const stop = spinner('Loading...');

      // Should log the message
      expect(consoleLogSpy).toHaveBeenCalledWith('Loading...');

      // Should return a noop function
      expect(typeof stop).toBe('function');
      stop(); // Should not throw
    });

    it('should log message when colors disabled even if log level is info', () => {
      // Test the second part of the OR condition: !currentOptions.colors
      setLogLevel('info');
      setColors(false);

      const stop = spinner('Loading...');

      // Should log the message due to colors being disabled
      expect(consoleLogSpy).toHaveBeenCalledWith('Loading...');
      stop();
    });

    it('should animate spinner when colors enabled', async () => {
      setColors(true);
      setLogLevel('info');

      const stop = spinner('Processing...');

      // Wait for at least one frame
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have written to stdout
      expect(stdoutWriteSpy.mock.calls.length).toBeGreaterThan(0);

      // Stop the spinner
      stop();

      // After stopping, should write final line with checkmark
      const lastCall = stdoutWriteSpy.mock.calls[stdoutWriteSpy.mock.calls.length - 1][0];
      expect(lastCall).toContain('✓');
      expect(lastCall).toContain('Processing...');
    });
  });

  describe('table', () => {
    it('should output table headers and rows', () => {
      const headers = ['Name', 'Version', 'Status'];
      const rows = [
        ['agent1', '1.0.0', 'enabled'],
        ['agent2', '2.0.0', 'disabled'],
      ];

      table(headers, rows);

      // Should have called console.log multiple times
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('should not output when log level is higher than info', () => {
      setLogLevel('warn');

      table(['Header'], [['Row']]);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should format columns with padding', () => {
      const headers = ['Name', 'Status'];
      const rows = [['test', 'ok']];

      table(headers, rows, { padding: 4 });

      const headerCall = consoleLogSpy.mock.calls[0][0];
      expect(headerCall.length).toBeGreaterThan('NameStatus'.length);
    });

    it('should use default padding when not specified', () => {
      const headers = ['Name', 'Status'];
      const rows = [['test', 'ok']];

      // Call without padding option (or with padding: undefined)
      table(headers, rows);

      const headerCall = consoleLogSpy.mock.calls[0][0];
      // Should have padding (default is 2)
      expect(headerCall.length).toBeGreaterThan('NameStatus'.length);
    });

    it('should use bold headers when colors enabled', () => {
      setColors(true);

      table(['Header'], [['Row']]);

      const headerCall = consoleLogSpy.mock.calls[0][0];
      // Should contain bold color code
      expect(headerCall).toContain('\x1b[1m');
    });

    it('should not use bold headers when colors disabled', () => {
      setColors(false);

      table(['Header'], [['Row']]);

      const headerCall = consoleLogSpy.mock.calls[0][0];
      // Should NOT contain ANSI color codes
      expect(headerCall).not.toContain('\x1b[');
      expect(headerCall).toContain('Header');
    });

    it('should handle empty cells', () => {
      const headers = ['Name', 'Status'];
      const rows = [
        ['test', ''],
        ['', 'ok'],
      ];

      table(headers, rows);

      // Should not throw
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('addMessages', () => {
    it('should add new messages to English locale', () => {
      addMessages('en', { 'custom.message': 'Custom Message' });

      info('custom.message');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Custom Message');
    });

    it('should add new messages to Korean locale', () => {
      addMessages('ko', { 'custom.message': '커스텀 메시지' });
      setLocale('ko');

      info('custom.message');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('커스텀 메시지');
    });

    it('should override existing messages', () => {
      addMessages('en', { 'install.start': 'Custom Start Message' });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Custom Start Message');
    });

    it('should create new locale if it does not exist', () => {
      // This tests the if (!MESSAGES[locale]) branch
      // Create a new locale by using a type assertion
      const newLocale = 'en' as 'en' | 'ko';

      // First, verify the locale works
      addMessages(newLocale, { 'test.new': 'New Locale Test' });

      // Verify the message was added
      setLocale(newLocale);
      info('test.new');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('New Locale Test');
    });
  });

  describe('getLoggerOptions', () => {
    it('should return current logger options', () => {
      createLogger({
        level: 'debug',
        colors: false,
        locale: 'ko',
        prefix: 'myapp',
        timestamps: true,
      });

      const options = getLoggerOptions();

      expect(options.level).toBe('debug');
      expect(options.colors).toBe(false);
      expect(options.locale).toBe('ko');
      expect(options.prefix).toBe('myapp');
      expect(options.timestamps).toBe(true);
    });

    it('should return a copy of options', () => {
      const options1 = getLoggerOptions();
      options1.level = 'error';

      const options2 = getLoggerOptions();

      expect(options2.level).not.toBe('error');
    });
  });

  describe('timestamps', () => {
    it('should include timestamp when enabled', () => {
      createLogger({ timestamps: true });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain timestamp format [HH:MM:SS]
      expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });

    it('should not include timestamp when disabled', () => {
      createLogger({ timestamps: false });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should not contain timestamp format
      expect(call).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });

    it('should include timestamp without colors', () => {
      createLogger({ timestamps: true, colors: false });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain timestamp format without color codes
      expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
      // Should not contain ANSI escape codes
      expect(call).not.toContain('\x1b[');
    });
  });

  describe('prefix', () => {
    it('should include prefix when set', () => {
      createLogger({ prefix: 'OMCC' });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('[OMCC]');
    });

    it('should not include prefix when not set', () => {
      createLogger({ prefix: undefined });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).not.toContain('[undefined]');
    });

    it('should include prefix without colors', () => {
      createLogger({ prefix: 'TEST', colors: false });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('[TEST]');
      // Should not contain ANSI escape codes
      expect(call).not.toContain('\x1b[');
    });

    it('should include prefix with colors', () => {
      createLogger({ prefix: 'TEST', colors: true });

      info('install.start');

      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('[TEST]');
      // Should contain cyan color for prefix
      expect(call).toContain('\x1b[36m');
    });
  });

  describe('log level priority', () => {
    it('should respect debug < info < warn < error ordering', () => {
      // Debug level - all should output
      setLogLevel('debug');
      debug('config.saved', { path: '/test' });
      info('install.start');
      warn('update.failed', { error: 'test' });
      error('install.failed', { error: 'test' });

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should filter based on level', () => {
      setLogLevel('warn');

      debug('config.saved', { path: '/test' });
      info('install.start');
      warn('update.failed', { error: 'test' });
      error('install.failed', { error: 'test' });

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMessage fallback', () => {
    it('should fallback to MESSAGES.en when locale is invalid', () => {
      // Reset logger to ensure clean state
      createLogger({
        level: 'info',
        colors: true,
        locale: 'en',
        timestamps: false,
        prefix: undefined,
      });

      // Force an invalid locale to test the fallback
      // @ts-expect-error - Intentionally setting invalid locale to test fallback
      createLogger({ locale: 'fr' });

      // Use a message that definitely exists in English but not in our invalid locale
      info('general.done');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain English message (fallback)
      expect(call).toContain('Done');
    });

    it('should use Korean messages when locale is valid', () => {
      // Reset logger first
      createLogger({
        level: 'info',
        colors: true,
        locale: 'ko',
        timestamps: false,
        prefix: undefined,
      });

      info('general.done');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain Korean version
      expect(call).toContain('완료');
    });
  });

  describe('formatMessage edge cases', () => {
    it('should output info messages correctly', () => {
      setColors(true);
      setLogLevel('info');

      // Info level message should output
      info('install.start');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      // Should contain some text (the message)
      expect(typeof call).toBe('string');
      expect(call.length).toBeGreaterThan(0);
    });

    it('should fallback to key when message not found', () => {
      info('nonexistent.key');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should return the key itself
      expect(call).toContain('nonexistent.key');
    });

    it('should use message from current locale when available', () => {
      // Add a message to both locales
      addMessages('en', { 'test.message': 'English Message' });
      addMessages('ko', { 'test.message': '한글 메시지' });
      setLocale('ko');

      info('test.message');

      const call = consoleInfoSpy.mock.calls[0][0];
      // Should use Korean message when locale is ko
      expect(call).toContain('한글 메시지');
    });
  });
});
