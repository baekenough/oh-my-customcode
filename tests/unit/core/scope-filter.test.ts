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

  // ---------------------------------------------------------------------------
  // Additional edge cases (v0.33.0)
  // ---------------------------------------------------------------------------

  test('scope field in body (outside frontmatter) is NOT parsed', () => {
    // getSkillScope only matches within the YAML frontmatter block (between --- delimiters).
    // A scope: line in the body text is intentionally ignored.
    const content = '---\nname: test\ndescription: Test\n---\nscope: harness\n';
    expect(getSkillScope(content)).toBe('core');
  });

  test('scope field with extra whitespace is trimmed and parsed correctly', () => {
    // \s* in the regex handles leading/trailing spaces around the value
    const content = '---\nname: test\nscope:  core  \ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('core');
  });

  test('first scope field wins when multiple scope fields are present', () => {
    // String.match() returns the first match, so the first scope line wins
    const content = '---\nname: test\nscope: harness\nscope: package\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('harness');
  });

  test('returns core for empty content string', () => {
    expect(getSkillScope('')).toBe('core');
  });

  test('returns core for scope field with invalid value', () => {
    // 'invalid' is not one of core|harness|package, so regex does not match → default 'core'
    const content = '---\nname: test\nscope: invalid\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('core');
  });

  test('scope is case-sensitive: scope: Core does not match and defaults to core', () => {
    // Regex is case-sensitive; 'Core' (capital C) is not matched → default 'core'
    const content = '---\nname: test\nscope: Core\ndescription: Test\n---\n';
    expect(getSkillScope(content)).toBe('core');
  });
});
