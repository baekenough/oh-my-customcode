import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { checkUpdateAvailable } from '../../../src/cli/doctor.js';
import * as selfUpdate from '../../../src/core/self-update.js';
import { initI18n } from '../../../src/i18n/index.js';

describe('checkUpdateAvailable', () => {
  beforeEach(async () => {
    await initI18n('en');
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return warn when update is available', () => {
    spyOn(selfUpdate, 'checkSelfUpdate').mockReturnValue({
      checked: true,
      updateAvailable: true,
      latestVersion: '1.0.0',
      usedCache: false,
    });

    const result = checkUpdateAvailable('0.31.1');

    expect(result.name).toBe('Update');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('0.31.1');
    expect(result.message).toContain('1.0.0');
    expect(result.fixable).toBe(false);
    expect(result.details).toEqual(['(checked from npm registry)']);
  });

  it('should include cache indicator in details when update check used cache', () => {
    spyOn(selfUpdate, 'checkSelfUpdate').mockReturnValue({
      checked: true,
      updateAvailable: true,
      latestVersion: '1.0.0',
      usedCache: true,
    });

    const result = checkUpdateAvailable('0.31.1');

    expect(result.status).toBe('warn');
    expect(result.details).toEqual(['(checked from cache)']);
  });

  it('should return pass when up to date', () => {
    spyOn(selfUpdate, 'checkSelfUpdate').mockReturnValue({
      checked: true,
      updateAvailable: false,
      latestVersion: '0.31.1',
      usedCache: false,
    });

    const result = checkUpdateAvailable('0.31.1');

    expect(result.name).toBe('Update');
    expect(result.status).toBe('pass');
    expect(result.message).toContain('0.31.1');
    expect(result.fixable).toBe(false);
    expect(result.details).toBeUndefined();
  });

  it('should return warn when check fails with reason', () => {
    spyOn(selfUpdate, 'checkSelfUpdate').mockReturnValue({
      checked: false,
      updateAvailable: false,
      latestVersion: null,
      usedCache: false,
      reason: 'lookup-failed',
    });

    const result = checkUpdateAvailable('0.31.1');

    expect(result.name).toBe('Update');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('lookup-failed');
    expect(result.fixable).toBe(false);
  });

  it('should return warn when check fails without reason', () => {
    spyOn(selfUpdate, 'checkSelfUpdate').mockReturnValue({
      checked: false,
      updateAvailable: false,
      latestVersion: null,
      usedCache: false,
    });

    const result = checkUpdateAvailable('0.31.1');

    expect(result.status).toBe('warn');
    expect(result.message).toContain('unknown');
  });
});
