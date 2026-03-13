import { describe, expect, test } from 'bun:test';
import { getSkillScope, shouldInstallSkill } from '../../../src/core/scope-filter.js';

describe('scope-filter', () => {
  test('returns core for missing scope field', () => {
    const content = '---\nname: test\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('core');
  });

  test('parses scope: core', () => {
    const content = '---\nname: test\nscope: core\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('core');
  });

  test('parses scope: harness', () => {
    const content = '---\nname: test\nscope: harness\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('harness');
  });

  test('parses scope: package', () => {
    const content = '---\nname: test\nscope: package\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('package');
  });

  test('shouldInstallSkill returns true for core', () => {
    expect(shouldInstallSkill('core')).toBe(true);
  });

  test('shouldInstallSkill returns true for harness', () => {
    expect(shouldInstallSkill('harness')).toBe(true);
  });

  test('shouldInstallSkill returns false for package', () => {
    expect(shouldInstallSkill('package')).toBe(false);
  });
});
