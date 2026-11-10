import { describe, expect, it } from 'bun:test';
import { isCiEnvironment, isCiFlagSet } from '../../../src/utils/ci.js';

describe('isCiFlagSet', () => {
  it.each(['true', 'True', '1', 'woodpecker', ' yes '])('treats %p as CI', (value) => {
    expect(isCiFlagSet(value)).toBe(true);
  });

  it.each([
    undefined,
    '',
    '  ',
    'false',
    'FALSE',
    '0',
    ' 0 ',
  ])('does not treat %p as CI', (value) => {
    expect(isCiFlagSet(value)).toBe(false);
  });
});

describe('isCiEnvironment', () => {
  it('detects CI, GITHUB_ACTIONS and TF_BUILD', () => {
    expect(isCiEnvironment({ CI: '1' })).toBe(true);
    expect(isCiEnvironment({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isCiEnvironment({ TF_BUILD: 'True' })).toBe(true);
  });

  it('is false for an empty environment and for CI=false/0', () => {
    expect(isCiEnvironment({})).toBe(false);
    expect(isCiEnvironment({ CI: 'false', GITHUB_ACTIONS: '0', TF_BUILD: '' })).toBe(false);
  });

  it('reads process.env by default', () => {
    expect(isCiEnvironment()).toBe(isCiEnvironment(process.env));
  });
});
