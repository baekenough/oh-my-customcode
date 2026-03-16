import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAgentDomain,
  getSkillScope,
  shouldInstallAgent,
  shouldInstallSkill,
} from '../../../src/core/scope-filter.js';

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

  test('handles Windows line endings (\\r\\n)', () => {
    const content = '---\r\nname: test\r\nscope: package\r\n---\r\n';
    expect(getSkillScope(content)).toBe('package');
  });

  test('handles UTF-8 BOM prefix', () => {
    const content = '\uFEFF---\nname: test\nscope: package\n---\n';
    expect(getSkillScope(content)).toBe('package');
  });
});

// ---------------------------------------------------------------------------
// Fixture-based SKILL.md integration (v0.40.0 — replaces real file reads)
// ---------------------------------------------------------------------------

describe('fixture SKILL.md files integration', () => {
  const FIXTURES_ROOT = join(import.meta.dir, '../../fixtures');

  function readFixtureSkill(skillName: string): string {
    const skillPath = join(FIXTURES_ROOT, 'skills', skillName, 'SKILL.md');
    return readFileSync(skillPath, 'utf-8');
  }

  test('package-scoped fixture skill is correctly identified', () => {
    const content = readFixtureSkill('mock-package-skill');
    expect(getSkillScope(content)).toBe('package');
  });

  test('harness-scoped fixture skill is correctly identified', () => {
    const content = readFixtureSkill('mock-harness-skill');
    expect(getSkillScope(content)).toBe('harness');
  });

  test('core-scoped fixture skill is correctly identified', () => {
    const content = readFixtureSkill('mock-core-skill');
    expect(getSkillScope(content)).toBe('core');
  });

  test('shouldInstallSkill correctly filters all scope types from fixtures', () => {
    const coreContent = readFixtureSkill('mock-core-skill');
    const harnessContent = readFixtureSkill('mock-harness-skill');
    const packageContent = readFixtureSkill('mock-package-skill');

    expect(shouldInstallSkill(getSkillScope(coreContent))).toBe(true);
    expect(shouldInstallSkill(getSkillScope(harnessContent))).toBe(true);
    expect(shouldInstallSkill(getSkillScope(packageContent))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAgentDomain
// ---------------------------------------------------------------------------

describe('getAgentDomain', () => {
  test('returns universal for missing domain field', () => {
    const content = '---\nname: test\n---\nBody';
    expect(getAgentDomain(content)).toBe('universal');
  });

  test('returns universal for empty content string', () => {
    expect(getAgentDomain('')).toBe('universal');
  });

  test('returns universal for content with no frontmatter', () => {
    expect(getAgentDomain('Just plain body text')).toBe('universal');
  });

  test('parses domain: backend', () => {
    const content = '---\nname: test\ndomain: backend\n---\nBody';
    expect(getAgentDomain(content)).toBe('backend');
  });

  test('parses domain: frontend', () => {
    const content = '---\nname: test\ndomain: frontend\n---\nBody';
    expect(getAgentDomain(content)).toBe('frontend');
  });

  test('parses domain: data-engineering', () => {
    const content = '---\nname: test\ndomain: data-engineering\n---\nBody';
    expect(getAgentDomain(content)).toBe('data-engineering');
  });

  test('parses domain: devops', () => {
    const content = '---\nname: test\ndomain: devops\n---\nBody';
    expect(getAgentDomain(content)).toBe('devops');
  });

  test('parses domain: universal', () => {
    const content = '---\nname: test\ndomain: universal\n---\nBody';
    expect(getAgentDomain(content)).toBe('universal');
  });

  test('handles all valid domains exhaustively', () => {
    const validDomains = [
      'backend',
      'frontend',
      'data-engineering',
      'devops',
      'universal',
    ] as const;
    for (const domain of validDomains) {
      const content = `---\nname: test\ndomain: ${domain}\n---\n`;
      expect(getAgentDomain(content)).toBe(domain);
    }
  });

  test('domain field in body (outside frontmatter) is NOT parsed', () => {
    const content = '---\nname: test\n---\ndomain: backend\n';
    expect(getAgentDomain(content)).toBe('universal');
  });

  test('domain field with extra whitespace is trimmed and parsed correctly', () => {
    const content = '---\nname: test\ndomain:  backend  \n---\n';
    expect(getAgentDomain(content)).toBe('backend');
  });

  test('returns universal for domain field with invalid value', () => {
    const content = '---\nname: test\ndomain: fullstack\n---\n';
    expect(getAgentDomain(content)).toBe('universal');
  });

  test('domain is case-sensitive: Backend does not match and defaults to universal', () => {
    const content = '---\nname: test\ndomain: Backend\n---\n';
    expect(getAgentDomain(content)).toBe('universal');
  });

  test('handles Windows line endings (\\r\\n)', () => {
    const content = '---\r\nname: test\r\ndomain: devops\r\n---\r\n';
    expect(getAgentDomain(content)).toBe('devops');
  });

  test('handles UTF-8 BOM prefix', () => {
    const content = '\uFEFF---\nname: test\ndomain: frontend\n---\n';
    expect(getAgentDomain(content)).toBe('frontend');
  });

  test('first domain field wins when multiple domain fields are present', () => {
    const content = '---\nname: test\ndomain: backend\ndomain: frontend\n---\n';
    expect(getAgentDomain(content)).toBe('backend');
  });
});

// ---------------------------------------------------------------------------
// shouldInstallAgent
// ---------------------------------------------------------------------------

describe('shouldInstallAgent', () => {
  test('installs all agents when no filter is provided', () => {
    expect(shouldInstallAgent('backend')).toBe(true);
    expect(shouldInstallAgent('frontend')).toBe(true);
    expect(shouldInstallAgent('data-engineering')).toBe(true);
    expect(shouldInstallAgent('devops')).toBe(true);
    expect(shouldInstallAgent('universal')).toBe(true);
  });

  test('installs all agents when filter is undefined explicitly', () => {
    expect(shouldInstallAgent('backend', undefined)).toBe(true);
    expect(shouldInstallAgent('frontend', undefined)).toBe(true);
  });

  test('installs universal agent regardless of filter domain', () => {
    expect(shouldInstallAgent('universal', 'backend')).toBe(true);
    expect(shouldInstallAgent('universal', 'frontend')).toBe(true);
    expect(shouldInstallAgent('universal', 'data-engineering')).toBe(true);
    expect(shouldInstallAgent('universal', 'devops')).toBe(true);
    expect(shouldInstallAgent('universal', 'unknown-domain')).toBe(true);
  });

  test('installs matching domain agent', () => {
    expect(shouldInstallAgent('backend', 'backend')).toBe(true);
    expect(shouldInstallAgent('frontend', 'frontend')).toBe(true);
    expect(shouldInstallAgent('data-engineering', 'data-engineering')).toBe(true);
    expect(shouldInstallAgent('devops', 'devops')).toBe(true);
  });

  test('skips agent whose domain does not match the filter', () => {
    expect(shouldInstallAgent('frontend', 'backend')).toBe(false);
    expect(shouldInstallAgent('backend', 'frontend')).toBe(false);
    expect(shouldInstallAgent('devops', 'data-engineering')).toBe(false);
    expect(shouldInstallAgent('data-engineering', 'devops')).toBe(false);
  });

  test('skips agent when filter is an unrecognized domain string', () => {
    // agentDomain is typed, but filterDomain is string — unknown filter still matches by equality
    expect(shouldInstallAgent('backend', 'fullstack')).toBe(false);
    expect(shouldInstallAgent('frontend', 'mobile')).toBe(false);
  });

  test('installs agent when filter matches exactly — no case folding', () => {
    // domain comparison is strict string equality
    expect(shouldInstallAgent('backend', 'Backend')).toBe(false);
    expect(shouldInstallAgent('frontend', 'FRONTEND')).toBe(false);
  });
});
