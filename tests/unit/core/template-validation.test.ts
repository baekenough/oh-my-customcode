import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { getSkillScope, shouldInstallSkill } from '../../../src/core/scope-filter.js';

const TEMPLATES_DIR = resolve(import.meta.dir, '../../../templates');

/**
 * Repo root, and the EXECUTED agents directory CC actually reads when spawning
 * agents in this project — distinct from the distribution mirror under
 * `templates/.claude/agents` covered by TEMPLATES_DIR above (#1536).
 */
const PROJECT_ROOT = resolve(import.meta.dir, '../../..');
const ACTUAL_AGENTS_DIR = join(PROJECT_ROOT, '.claude/agents');

interface ManifestComponent {
  name: string;
  path: string;
  description: string;
  files: number;
}

interface Manifest {
  version: string;
  lastUpdated: string;
  components: ManifestComponent[];
  source: string;
}

interface FrontmatterResult {
  isValid: boolean;
  /** Top-level scalar fields: key → value. For array fields, value is empty string but key is present. */
  fields: Record<string, string>;
  /** Keys whose values are multiline YAML lists (e.g. tools:\n  - Read). */
  arrayFields: Set<string>;
  hasFrontmatter: boolean;
  hasClosingMarker: boolean;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const openingMarker = content.startsWith('---\n') || content.startsWith('---\r\n');

  if (!openingMarker) {
    return {
      isValid: false,
      fields: {},
      arrayFields: new Set(),
      hasFrontmatter: false,
      hasClosingMarker: false,
    };
  }

  const afterOpening = content.slice(4);
  const closingIndex = afterOpening.indexOf('\n---');

  if (closingIndex === -1) {
    return {
      isValid: false,
      fields: {},
      arrayFields: new Set(),
      hasFrontmatter: true,
      hasClosingMarker: false,
    };
  }

  const frontmatterBlock = afterOpening.slice(0, closingIndex);
  const fields: Record<string, string> = {};
  const arrayFields = new Set<string>();
  let lastTopLevelKey: string | null = null;

  for (const line of frontmatterBlock.split('\n')) {
    // Indented lines belong to the previous top-level key (array items or nested values)
    if (line.startsWith('  ') || line.startsWith('\t')) {
      if (lastTopLevelKey !== null) {
        arrayFields.add(lastTopLevelKey);
      }
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key && !key.startsWith('-')) {
      fields[key] = value;
      lastTopLevelKey = key;
    }
  }

  return { isValid: true, fields, arrayFields, hasFrontmatter: true, hasClosingMarker: true };
}

/** Result of parsing a frontmatter block with a real YAML parser (#1988). */
type YamlFrontmatterResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Parses the leading `---` frontmatter block with the `yaml` package.
 * Unlike {@link parseFrontmatter} (line-based, accepts malformed YAML such as an
 * unclosed quote or `name: [a`), this fails on anything a real YAML parser rejects,
 * and on blocks that do not parse to a mapping. The block regex mirrors
 * `getSkillScope` in src/core/scope-filter.ts.
 */
function parseYamlFrontmatter(content: string): YamlFrontmatterResult {
  const match = content.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { ok: false, reason: 'no frontmatter block' };

  let parsed: unknown;
  try {
    parsed = parse(match[1]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `YAML parse error: ${message.split('\n')[0]}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'frontmatter is not a YAML mapping' };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

type SkillRefsResult = { ok: true; refs: string[] } | { ok: false; reason: string };

/**
 * Reads the `skills:` frontmatter key via the YAML parser, so block lists
 * (`skills:\n  - a`) and inline arrays (`skills: [a, b]`) are both read.
 * An absent or empty `skills:` yields no references.
 */
function extractAgentSkillRefs(content: string): SkillRefsResult {
  const parsed = parseYamlFrontmatter(content);
  if (!parsed.ok) return parsed;

  const skills = parsed.data.skills;
  if (skills === undefined || skills === null) return { ok: true, refs: [] };
  if (!Array.isArray(skills) || !skills.every((s): s is string => typeof s === 'string')) {
    return { ok: false, reason: "'skills' is not a list of strings" };
  }
  return { ok: true, refs: skills.map((s) => s.trim()) };
}

type SkillRefStatus = 'ok' | 'missing' | 'package';

interface AgentSkillRef {
  file: string;
  skill: string;
  status: SkillRefStatus;
}

interface AgentSkillScan {
  /** Agent files whose frontmatter could not be parsed or whose `skills:` is malformed. */
  parseErrors: string[];
  refs: AgentSkillRef[];
  /** Number of agents declaring at least one skill reference. */
  nonEmptySets: number;
}

/**
 * Scans every `*.md` agent in `agentsDir` and classifies each `skills:` reference
 * against `skillsDir`: 'missing' (no `<skill>/SKILL.md`), 'package' (exists but
 * `shouldInstallSkill(getSkillScope(...))` is false, so `init` does not deploy it),
 * or 'ok'.
 */
async function scanAgentSkillRefs(agentsDir: string, skillsDir: string): Promise<AgentSkillScan> {
  const agentFiles = (await readdir(agentsDir, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  const scan: AgentSkillScan = { parseErrors: [], refs: [], nonEmptySets: 0 };

  for (const file of agentFiles) {
    const extracted = extractAgentSkillRefs(await readFile(join(agentsDir, file), 'utf-8'));
    if (!extracted.ok) {
      scan.parseErrors.push(`${file}: ${extracted.reason}`);
      continue;
    }
    if (extracted.refs.length > 0) scan.nonEmptySets++;

    for (const skill of extracted.refs) {
      let status: SkillRefStatus;
      try {
        const skillContent = await readFile(join(skillsDir, skill, 'SKILL.md'), 'utf-8');
        status = shouldInstallSkill(getSkillScope(skillContent)) ? 'ok' : 'package';
      } catch {
        status = 'missing';
      }
      scan.refs.push({ file, skill, status });
    }
  }

  return scan;
}

/** Errors for a scan; `requireDeployed` additionally rejects package-scope references. */
function skillRefErrors(scan: AgentSkillScan, requireDeployed: boolean): string[] {
  const errors = [...scan.parseErrors];
  for (const ref of scan.refs) {
    if (ref.status === 'missing') {
      errors.push(`${ref.file}: skill reference '${ref.skill}' not found`);
    } else if (ref.status === 'package' && requireDeployed) {
      errors.push(
        `${ref.file}: skill reference '${ref.skill}' is package-scope and is not deployed by init`
      );
    }
  }
  return errors;
}

/** ∃ guard: errors when the scan saw no references, so a ∀ check cannot pass vacuously. */
function vacuityErrors(scan: AgentSkillScan): string[] {
  const errors: string[] = [];
  if (scan.nonEmptySets < 1) errors.push('no agent declares a non-empty skills: list');
  if (scan.refs.length < 1) errors.push('no skill references were scanned');
  return errors;
}

/**
 * Returns true if a field is present in frontmatter, including fields with
 * multiline array values (e.g. tools:\n  - Read\n  - Write).
 */
function hasField(result: FrontmatterResult, fieldName: string): boolean {
  return fieldName in result.fields || result.arrayFields.has(fieldName);
}

/**
 * Agent frontmatter `model` field 3-tier policy (R006 MUST-agent-design.md).
 *
 * - Tier 1: CC-native aliases, resolved by CC itself. Valid in both frontmatter
 *   and the Agent tool's `model` parameter.
 * - Tier 2: full model IDs, frontmatter-only (recommended). Optionally suffixed
 *   with an extended-context marker (e.g. `claude-opus-4-6[1m]`).
 * - Version-suffixed aliases (e.g. `sonnet5`, `opus48`) are NEVER valid — CC does
 *   not resolve them and agent spawn fails immediately when they appear in
 *   frontmatter. This is a deterministic regression guard (R023 shift-left):
 *   broadening the allow-list without an explicit reject-pattern would let this
 *   exact defect recur silently.
 */
const TIER1_MODEL_ALIASES = new Set(['sonnet', 'opus', 'haiku', 'opusplan', 'inherit']);

const TIER2_MODEL_ID_PATTERN = /^claude-(?:opus|sonnet|haiku|fable)-\d+(?:-\d+)?(?:\[1m\])?$/;

/** Matches a Tier 1 alias with a bare or hyphenated numeric version suffix (e.g. sonnet5, opus-48). */
const VERSION_SUFFIXED_ALIAS_PATTERN = /^(?:sonnet|opus|haiku)-?\d+$/;

function isValidModelValue(model: string): boolean {
  return TIER1_MODEL_ALIASES.has(model) || TIER2_MODEL_ID_PATTERN.test(model);
}

function describeInvalidModel(model: string): string {
  const tier1List = [...TIER1_MODEL_ALIASES].join(', ');

  if (VERSION_SUFFIXED_ALIAS_PATTERN.test(model)) {
    return (
      `invalid model '${model}': CC does not resolve version-suffixed aliases ` +
      `(e.g. sonnet5, opus48); use a Tier 2 full model ID such as claude-sonnet-5-5, ` +
      `or a Tier 1 alias (${tier1List})`
    );
  }

  return (
    `invalid model '${model}' (must be a Tier 1 alias [${tier1List}] or a Tier 2 ` +
    `full model ID matching claude-<family>-<version>, e.g. claude-sonnet-5-5)`
  );
}

async function countSkillDirectories(fullPath: string): Promise<number> {
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).length;
}

async function countGuidesDirectories(fullPath: string): Promise<number> {
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).length;
}

async function countHooksFiles(fullPath: string): Promise<number> {
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.json')).length;
}

async function countMdFiles(fullPath: string): Promise<number> {
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).length;
}

async function countActualFiles(componentPath: string, componentName: string): Promise<number> {
  const fullPath = join(TEMPLATES_DIR, componentPath);

  if (componentName === 'skills') return countSkillDirectories(fullPath);
  if (componentName === 'guides') return countGuidesDirectories(fullPath);
  if (componentName === 'hooks') return countHooksFiles(fullPath);

  // Default: count only .md files to exclude metadata files like index.yaml
  return countMdFiles(fullPath);
}

async function validateSkillFrontmatter(
  skillDir: string,
  skillsDir: string,
  errors: string[]
): Promise<void> {
  const skillFilePath = join(skillsDir, skillDir, 'SKILL.md');
  let content: string;

  try {
    content = await readFile(skillFilePath, 'utf-8');
  } catch {
    errors.push(`${skillDir}/SKILL.md: file not found`);
    return;
  }

  const result = parseFrontmatter(content);

  if (!result.hasFrontmatter) {
    errors.push(`${skillDir}/SKILL.md: missing frontmatter opening marker`);
    return;
  }

  if (!result.hasClosingMarker) {
    errors.push(`${skillDir}/SKILL.md: missing frontmatter closing marker`);
    return;
  }

  if (!result.fields.name) {
    errors.push(`${skillDir}/SKILL.md: missing required field 'name'`);
  }

  if (!result.fields.description) {
    errors.push(`${skillDir}/SKILL.md: missing required field 'description'`);
  }

  // #1988: the line-based parser above accepts malformed YAML (unclosed quote,
  // `name: [a`), so the block must also parse with a real YAML parser.
  const yamlResult = parseYamlFrontmatter(content);
  if (!yamlResult.ok) {
    errors.push(`${skillDir}/SKILL.md: invalid YAML frontmatter (${yamlResult.reason})`);
    return;
  }

  // Fields the line parser saw as present must be non-empty strings (the
  // missing-field messages above already cover absent fields).
  for (const field of ['name', 'description'] as const) {
    const value = yamlResult.data[field];
    if (result.fields[field] && !(typeof value === 'string' && value.trim() !== '')) {
      errors.push(`${skillDir}/SKILL.md: field '${field}' must be a non-empty string`);
    }
  }
}

async function validateAgentFrontmatter(
  agentFile: string,
  agentsDir: string,
  errors: string[]
): Promise<void> {
  const agentFilePath = join(agentsDir, agentFile);
  const content = await readFile(agentFilePath, 'utf-8');
  const result = parseFrontmatter(content);

  if (!result.hasFrontmatter) {
    errors.push(`${agentFile}: missing frontmatter opening marker`);
    return;
  }

  if (!result.hasClosingMarker) {
    errors.push(`${agentFile}: missing frontmatter closing marker`);
    return;
  }

  const requiredFields = ['name', 'description', 'model', 'tools'];
  for (const field of requiredFields) {
    // tools may be a multiline array (tools:\n  - Read), so use hasField
    if (!hasField(result, field)) {
      errors.push(`${agentFile}: missing required field '${field}'`);
    }
  }
}

async function validateAgentModelField(
  agentFile: string,
  agentsDir: string,
  errors: string[]
): Promise<void> {
  const agentFilePath = join(agentsDir, agentFile);
  const content = await readFile(agentFilePath, 'utf-8');
  const result = parseFrontmatter(content);

  if (result.isValid && result.fields.model) {
    const model = result.fields.model.trim();
    if (!isValidModelValue(model)) {
      errors.push(`${agentFile}: ${describeInvalidModel(model)}`);
    }
  }
}

async function validateAgentNameField(
  agentFile: string,
  agentsDir: string,
  errors: string[]
): Promise<void> {
  const agentFilePath = join(agentsDir, agentFile);
  const content = await readFile(agentFilePath, 'utf-8');
  const result = parseFrontmatter(content);

  if (result.isValid && result.fields.name) {
    const expectedName = agentFile.replace(/\.md$/, '');
    const actualName = result.fields.name.trim();
    if (actualName !== expectedName) {
      errors.push(
        `${agentFile}: name field '${actualName}' does not match filename '${expectedName}'`
      );
    }
  }
}

describe('Template Validation', () => {
  describe('Manifest consistency', () => {
    it('should have a valid manifest.json with required fields', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      expect(manifest.version).toBeDefined();
      expect(typeof manifest.version).toBe('string');
      expect(manifest.components).toBeDefined();
      expect(Array.isArray(manifest.components)).toBe(true);
      expect(manifest.components.length).toBeGreaterThan(0);
      expect(manifest.source).toBeDefined();
    });

    it('should have files count matching actual rules directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const rulesComponent = manifest.components.find((c) => c.name === 'rules');
      expect(rulesComponent).toBeDefined();

      const actualCount = await countActualFiles(rulesComponent?.path ?? '', 'rules');
      expect<number | undefined>(actualCount).toBe(rulesComponent?.files);
    });

    it('should have files count matching actual agents directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const agentsComponent = manifest.components.find((c) => c.name === 'agents');
      expect(agentsComponent).toBeDefined();

      const actualCount = await countActualFiles(agentsComponent?.path ?? '', 'agents');
      expect<number | undefined>(actualCount).toBe(agentsComponent?.files);
    });

    it('should have files count matching actual skills directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const skillsComponent = manifest.components.find((c) => c.name === 'skills');
      expect(skillsComponent).toBeDefined();

      const actualCount = await countActualFiles(skillsComponent?.path ?? '', 'skills');
      expect<number | undefined>(actualCount).toBe(skillsComponent?.files);
    });

    it('should have files count matching actual guides directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const guidesComponent = manifest.components.find((c) => c.name === 'guides');
      expect(guidesComponent).toBeDefined();

      const actualCount = await countActualFiles(guidesComponent?.path ?? '', 'guides');
      expect<number | undefined>(actualCount).toBe(guidesComponent?.files);
    });

    it('should have files count matching actual hooks directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const hooksComponent = manifest.components.find((c) => c.name === 'hooks');
      expect(hooksComponent).toBeDefined();

      const actualCount = await countActualFiles(hooksComponent?.path ?? '', 'hooks');
      expect<number | undefined>(actualCount).toBe(hooksComponent?.files);
    });

    it('should have files count matching actual contexts directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const contextsComponent = manifest.components.find((c) => c.name === 'contexts');
      expect(contextsComponent).toBeDefined();

      const actualCount = await countActualFiles(contextsComponent?.path ?? '', 'contexts');
      expect<number | undefined>(actualCount).toBe(contextsComponent?.files);
    });

    it('each manifest component should have required fields', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      for (const component of manifest.components) {
        expect(component.name).toBeDefined();
        expect(typeof component.name).toBe('string');
        expect(component.path).toBeDefined();
        expect(typeof component.path).toBe('string');
        expect(component.files).toBeDefined();
        expect(typeof component.files).toBe('number');
        expect(component.files).toBeGreaterThan(0);
      }
    });
  });

  describe('Skill frontmatter', () => {
    it('every SKILL.md should have valid YAML frontmatter', async () => {
      const skillsDir = join(TEMPLATES_DIR, '.claude/skills');
      const skillDirs = await readdir(skillsDir, { withFileTypes: true });
      const skillDirectories = skillDirs.filter((e) => e.isDirectory()).map((e) => e.name);

      expect(skillDirectories.length).toBeGreaterThan(0);

      const errors: string[] = [];

      for (const skillDir of skillDirectories) {
        await validateSkillFrontmatter(skillDir, skillsDir, errors);
      }

      expect(errors).toEqual([]);
    });

    it('skill name field should be non-empty string', async () => {
      const skillsDir = join(TEMPLATES_DIR, '.claude/skills');
      const skillDirs = await readdir(skillsDir, { withFileTypes: true });
      const skillDirectories = skillDirs.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const skillDir of skillDirectories) {
        const skillFilePath = join(skillsDir, skillDir, 'SKILL.md');
        let content: string;

        try {
          content = await readFile(skillFilePath, 'utf-8');
        } catch {
          continue;
        }

        const result = parseFrontmatter(content);

        if (result.isValid && result.fields.name !== undefined) {
          expect(result.fields.name.length).toBeGreaterThan(0);
        }
      }
    });

    it('skill description field should be non-empty string', async () => {
      const skillsDir = join(TEMPLATES_DIR, '.claude/skills');
      const skillDirs = await readdir(skillsDir, { withFileTypes: true });
      const skillDirectories = skillDirs.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const skillDir of skillDirectories) {
        const skillFilePath = join(skillsDir, skillDir, 'SKILL.md');
        let content: string;

        try {
          content = await readFile(skillFilePath, 'utf-8');
        } catch {
          continue;
        }

        const result = parseFrontmatter(content);

        if (result.isValid && result.fields.description !== undefined) {
          expect(result.fields.description.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Agent frontmatter', () => {
    it('every agent .md file should have valid YAML frontmatter', async () => {
      const agentsDir = join(TEMPLATES_DIR, '.claude/agents');
      const agentFiles = (await readdir(agentsDir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);

      expect(agentFiles.length).toBeGreaterThan(0);

      const errors: string[] = [];

      for (const agentFile of agentFiles) {
        await validateAgentFrontmatter(agentFile, agentsDir, errors);
      }

      expect(errors).toEqual([]);
    });

    it('agent model field should be a valid model value', async () => {
      const agentsDir = join(TEMPLATES_DIR, '.claude/agents');
      const agentFiles = (await readdir(agentsDir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);

      const errors: string[] = [];

      for (const agentFile of agentFiles) {
        const agentFilePath = join(agentsDir, agentFile);
        const content = await readFile(agentFilePath, 'utf-8');
        const result = parseFrontmatter(content);

        if (result.isValid && result.fields.model) {
          const model = result.fields.model.trim();
          if (!isValidModelValue(model)) {
            errors.push(`${agentFile}: ${describeInvalidModel(model)}`);
          }
        }
      }

      expect(errors).toEqual([]);
    });

    it('agent model field should reject version-suffixed aliases (regression guard)', () => {
      // R006 / R010 policy: CC does not resolve version-suffixed aliases
      // (sonnet5, opus5, opus48, opus47) — using them in frontmatter causes
      // agent spawn to fail immediately. This test pins that rejection so a
      // future broadening of the allow-list cannot silently reintroduce them.
      const invalidVersionSuffixedAliases = ['sonnet5', 'opus5', 'opus48', 'opus47'];
      for (const model of invalidVersionSuffixedAliases) {
        expect(isValidModelValue(model)).toBe(false);
      }

      // Tier 1 CC-native aliases must remain valid.
      for (const model of ['sonnet', 'opus', 'haiku', 'opusplan', 'inherit']) {
        expect(isValidModelValue(model)).toBe(true);
      }

      // Tier 2 full model IDs (frontmatter-only) must remain valid, including
      // the optional extended-context suffix.
      for (const model of [
        'claude-sonnet-5-5',
        'claude-opus-5-5',
        'claude-sonnet-5',
        'claude-opus-5',
        'claude-haiku-4-5',
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-fable-5',
        'claude-opus-4-6[1m]',
      ]) {
        expect(isValidModelValue(model)).toBe(true);
      }

      // Nonsense values must still be rejected.
      for (const model of ['gpt-4', 'claude', 'claude-', '']) {
        expect(isValidModelValue(model)).toBe(false);
      }
    });

    it('agent name field should match filename without extension', async () => {
      const agentsDir = join(TEMPLATES_DIR, '.claude/agents');
      const agentFiles = (await readdir(agentsDir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);

      const errors: string[] = [];

      for (const agentFile of agentFiles) {
        const agentFilePath = join(agentsDir, agentFile);
        const content = await readFile(agentFilePath, 'utf-8');
        const result = parseFrontmatter(content);

        if (result.isValid && result.fields.name) {
          const expectedName = agentFile.replace(/\.md$/, '');
          const actualName = result.fields.name.trim();
          if (actualName !== expectedName) {
            errors.push(
              `${agentFile}: name field '${actualName}' does not match filename '${expectedName}'`
            );
          }
        }
      }

      expect(errors).toEqual([]);
    });

    // #1536: the tests above only walk the templates/.claude/agents mirror.
    // CC spawns agents from the EXECUTED .claude/agents directory at the repo
    // root, so an invalid `model` value there (e.g. the sonnet5/opus5 incident,
    // #1524) can slip past this file entirely if only the mirror is checked.
    // Re-run the same frontmatter/model/name checks against ACTUAL_AGENTS_DIR,
    // reusing the shared (directory-agnostic) helpers/validators above rather
    // than duplicating validation logic.
    describe('executed .claude/agents (non-mirror)', () => {
      it('every agent .md file should have valid YAML frontmatter', async () => {
        const agentFiles = (await readdir(ACTUAL_AGENTS_DIR, { withFileTypes: true }))
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map((e) => e.name);

        expect(agentFiles.length).toBeGreaterThan(0);

        const errors: string[] = [];

        for (const agentFile of agentFiles) {
          await validateAgentFrontmatter(agentFile, ACTUAL_AGENTS_DIR, errors);
        }

        expect(errors).toEqual([]);
      });

      it('agent model field should be a valid model value', async () => {
        const agentFiles = (await readdir(ACTUAL_AGENTS_DIR, { withFileTypes: true }))
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map((e) => e.name);

        const errors: string[] = [];

        for (const agentFile of agentFiles) {
          await validateAgentModelField(agentFile, ACTUAL_AGENTS_DIR, errors);
        }

        expect(errors).toEqual([]);
      });

      it('agent name field should match filename without extension', async () => {
        const agentFiles = (await readdir(ACTUAL_AGENTS_DIR, { withFileTypes: true }))
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map((e) => e.name);

        const errors: string[] = [];

        for (const agentFile of agentFiles) {
          await validateAgentNameField(agentFile, ACTUAL_AGENTS_DIR, errors);
        }

        expect(errors).toEqual([]);
      });
    });
  });

  describe('README count sync', () => {
    it('README.md agent count should match actual template agent files', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Agents (42)" or "| **Total** | **42** |" patterns
      const agentsHeaderMatch = readmeContent.match(/###\s+Agents\s+\((\d+)\)/);
      expect(agentsHeaderMatch).not.toBeNull();

      const readmeAgentCount = parseInt(agentsHeaderMatch?.[1] ?? '0', 10);

      const agentsDir = join(TEMPLATES_DIR, '.claude/agents');
      const agentFiles = (await readdir(agentsDir, { withFileTypes: true })).filter(
        (e) => e.isFile() && e.name.endsWith('.md')
      );

      expect(agentFiles.length).toBe(readmeAgentCount);
    });

    it('README.md skill count should match actual template skill directories', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Skills (56)" pattern
      const skillsHeaderMatch = readmeContent.match(/###\s+Skills\s+\((\d+)\)/);
      expect(skillsHeaderMatch).not.toBeNull();

      const readmeSkillCount = parseInt(skillsHeaderMatch?.[1] ?? '0', 10);

      const skillsDir = join(TEMPLATES_DIR, '.claude/skills');
      const skillDirs = (await readdir(skillsDir, { withFileTypes: true })).filter((e) =>
        e.isDirectory()
      );

      expect(skillDirs.length).toBe(readmeSkillCount);
    });

    it('README.md rules count should match actual template rules files', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Rules (18)" pattern
      const rulesHeaderMatch = readmeContent.match(/###\s+Rules\s+\((\d+)\)/);
      expect(rulesHeaderMatch).not.toBeNull();

      const readmeRulesCount = parseInt(rulesHeaderMatch?.[1] ?? '0', 10);

      const rulesDir = join(TEMPLATES_DIR, '.claude/rules');
      const rulesFiles = (await readdir(rulesDir, { withFileTypes: true })).filter(
        (e) => e.isFile() && e.name.endsWith('.md')
      );

      expect(rulesFiles.length).toBe(readmeRulesCount);
    });

    it('README.md guides count should match actual template guides directories', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Guides (22)" pattern
      const guidesHeaderMatch = readmeContent.match(/###\s+Guides\s+\((\d+)\)/);
      expect(guidesHeaderMatch).not.toBeNull();

      const readmeGuidesCount = parseInt(guidesHeaderMatch?.[1] ?? '0', 10);

      const guidesDir = join(TEMPLATES_DIR, 'guides');
      const guidesDirs = (await readdir(guidesDir, { withFileTypes: true })).filter((e) =>
        e.isDirectory()
      );

      expect(guidesDirs.length).toBe(readmeGuidesCount);
    });
  });

  describe('CLAUDE.md count validation', () => {
    const PROJECT_ROOT = resolve(import.meta.dir, '../../..');

    it('agent count in CLAUDE.md matches actual files', async () => {
      const claudeMd = await readFile(join(PROJECT_ROOT, 'CLAUDE.md'), 'utf-8');
      const agentFiles = (
        await readdir(join(PROJECT_ROOT, '.claude', 'agents'), { withFileTypes: true })
      )
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);

      // CLAUDE.md contains "에이전트 정의 (N 파일)" pattern
      const match = claudeMd.match(/에이전트 정의 \((\d+) 파일\)/);
      if (match) {
        expect(parseInt(match[1], 10)).toBe(agentFiles.length);
      }
    });

    it('skill count in CLAUDE.md matches actual directories', async () => {
      const claudeMd = await readFile(join(PROJECT_ROOT, 'CLAUDE.md'), 'utf-8');

      // Count SKILL.md files recursively under .claude/skills
      async function countSkillMdFiles(dir: string): Promise<number> {
        const entries = await readdir(dir, { withFileTypes: true });
        let count = 0;
        for (const entry of entries) {
          if (entry.isDirectory()) {
            count += await countSkillMdFiles(join(dir, entry.name));
          } else if (entry.isFile() && entry.name === 'SKILL.md') {
            count++;
          }
        }
        return count;
      }

      const skillCount = await countSkillMdFiles(join(PROJECT_ROOT, '.claude', 'skills'));

      const match = claudeMd.match(/스킬 \((\d+) 디렉토리\)/);
      if (match) {
        expect(parseInt(match[1], 10)).toBe(skillCount);
      }
    });

    it('rule count in CLAUDE.md reflects actual rule files', async () => {
      const ruleFiles = (
        await readdir(join(PROJECT_ROOT, '.claude', 'rules'), { withFileTypes: true })
      ).filter((e) => e.isFile() && e.name.endsWith('.md'));

      expect(ruleFiles.length).toBeGreaterThan(0);
    });
  });

  describe('routing-agent existence validation', () => {
    const PROJECT_ROOT = resolve(import.meta.dir, '../../..');

    async function fileExists(filePath: string): Promise<boolean> {
      try {
        await access(filePath);
        return true;
      } catch {
        return false;
      }
    }

    it('all agents referenced in dev-lead-routing exist', async () => {
      const routingPath = join(PROJECT_ROOT, '.claude', 'skills', 'dev-lead-routing', 'SKILL.md');
      if (!(await fileExists(routingPath))) return;

      const routing = await readFile(routingPath, 'utf-8');
      const agentRefs = routing.match(/(?:lang|be|fe|tool)-[\w-]+/g) ?? [];
      const uniqueAgents = [...new Set(agentRefs)];

      const errors: string[] = [];
      for (const agent of uniqueAgents) {
        const agentPath = join(PROJECT_ROOT, '.claude', 'agents', `${agent}.md`);
        if (!(await fileExists(agentPath))) {
          errors.push(`${agent}.md not found`);
        }
      }

      expect(errors).toEqual([]);
    });

    it('all agents referenced in secretary-routing exist', async () => {
      const routingPath = join(PROJECT_ROOT, '.claude', 'skills', 'secretary-routing', 'SKILL.md');
      if (!(await fileExists(routingPath))) return;

      const routing = await readFile(routingPath, 'utf-8');
      const agentRefs = routing.match(/(?:mgr|sys)-[\w-]+/g) ?? [];
      const uniqueAgents = [...new Set(agentRefs)];

      const errors: string[] = [];
      for (const agent of uniqueAgents) {
        const agentPath = join(PROJECT_ROOT, '.claude', 'agents', `${agent}.md`);
        if (!(await fileExists(agentPath))) {
          errors.push(`${agent}.md not found`);
        }
      }

      expect(errors).toEqual([]);
    });
  });

  describe('agent frontmatter skills validation', () => {
    it('all skill references in agent frontmatter exist', async () => {
      const scan = await scanAgentSkillRefs(
        join(PROJECT_ROOT, '.claude', 'agents'),
        join(PROJECT_ROOT, '.claude', 'skills')
      );

      // ∃: the ∀ existence check below must have scanned at least one reference.
      expect(vacuityErrors(scan)).toEqual([]);
      // Existence only; package scope is judged against the deployed template set below.
      expect(skillRefErrors(scan, false)).toEqual([]);
    });

    it('every skill referenced by a template agent is deployed by init (exists and is not package-scope)', async () => {
      const scan = await scanAgentSkillRefs(
        join(TEMPLATES_DIR, '.claude/agents'),
        join(TEMPLATES_DIR, '.claude/skills')
      );

      // ∃: at least one non-empty reference set and at least one reference scanned.
      expect(vacuityErrors(scan)).toEqual([]);
      // ∀: each reference exists under templates/.claude/skills and getSkillScope/shouldInstallSkill
      // says init deploys it.
      expect(skillRefErrors(scan, true)).toEqual([]);
    });
  });

  describe('frontmatter and skill-reference checks (synthetic fixtures)', () => {
    const fixtureRoots: string[] = [];

    afterAll(() => {
      for (const root of fixtureRoots) {
        rmSync(root, { recursive: true, force: true });
      }
    });

    function makeFixture(files: Record<string, string>): string {
      const root = mkdtempSync(join(tmpdir(), 'template-validation-'));
      fixtureRoots.push(root);
      for (const [relativePath, content] of Object.entries(files)) {
        const filePath = join(root, relativePath);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content);
      }
      return root;
    }

    function skillMd(name: string, scope?: string): string {
      const scopeLine = scope ? `scope: ${scope}\n` : '';
      return `---\nname: ${name}\ndescription: demo skill\n${scopeLine}---\n\nbody\n`;
    }

    function agentMd(skillsYaml: string): string {
      return `---\nname: demo\ndescription: demo agent\nmodel: sonnet\ntools:\n  - Read\n${skillsYaml}---\n\nbody\n`;
    }

    /** One fixture: a core, a harness and a package skill, plus one agent with the given `skills:` YAML. */
    async function scanWithSkillsYaml(skillsYaml: string): Promise<AgentSkillScan> {
      const root = makeFixture({
        'skills/core-skill/SKILL.md': skillMd('core-skill'),
        'skills/harness-skill/SKILL.md': skillMd('harness-skill', 'harness'),
        'skills/pkg-skill/SKILL.md': skillMd('pkg-skill', 'package'),
        'agents/demo.md': agentMd(skillsYaml),
      });
      return scanAgentSkillRefs(join(root, 'agents'), join(root, 'skills'));
    }

    async function skillFrontmatterErrors(skillContent: string): Promise<string[]> {
      const root = makeFixture({ 'skills/demo/SKILL.md': skillContent });
      const errors: string[] = [];
      await validateSkillFrontmatter('demo', join(root, 'skills'), errors);
      return errors;
    }

    describe('parseYamlFrontmatter', () => {
      it('accepts a valid mapping', () => {
        const result = parseYamlFrontmatter('---\nname: a\ndescription: b\n---\nbody\n');
        expect(result).toEqual({ ok: true, data: { name: 'a', description: 'b' } });
      });

      it('rejects an unclosed quote that the line-based parser accepts', () => {
        const content = '---\nname: a\ndescription: "unclosed\n---\nbody\n';
        expect(parseFrontmatter(content).isValid).toBe(true);
        const result = parseYamlFrontmatter(content);
        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.reason).toContain('YAML parse error');
      });

      it('rejects an unterminated flow sequence that the line-based parser accepts', () => {
        const content = '---\nname: [a\ndescription: b\n---\nbody\n';
        expect(parseFrontmatter(content).isValid).toBe(true);
        expect(parseYamlFrontmatter(content).ok).toBe(false);
      });

      it('rejects missing frontmatter and non-mapping frontmatter', () => {
        expect(parseYamlFrontmatter('no frontmatter here\n').ok).toBe(false);
        expect(parseYamlFrontmatter('---\n- a\n- b\n---\nbody\n').ok).toBe(false);
        expect(parseYamlFrontmatter('---\n---\nbody\n').ok).toBe(false);
      });
    });

    describe('SKILL.md frontmatter validation', () => {
      it('passes a valid SKILL.md (∃: file is read, so no error is not a missing-file pass)', async () => {
        expect(await skillFrontmatterErrors(skillMd('demo'))).toEqual([]);
        const missingRoot = makeFixture({});
        const missing: string[] = [];
        await validateSkillFrontmatter('demo', join(missingRoot, 'skills'), missing);
        expect(missing).toEqual(['demo/SKILL.md: file not found']);
      });

      it('rejects a description with an unclosed quote', async () => {
        const errors = await skillFrontmatterErrors(
          '---\nname: demo\ndescription: "unclosed\n---\nbody\n'
        );
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('invalid YAML frontmatter');
      });

      it('rejects an unterminated flow sequence in name', async () => {
        const errors = await skillFrontmatterErrors(
          '---\nname: [a\ndescription: demo skill\n---\nbody\n'
        );
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('invalid YAML frontmatter');
      });

      it('rejects name/description that parse but are not non-empty strings', async () => {
        const listName = await skillFrontmatterErrors(
          '---\nname: [a]\ndescription: demo skill\n---\nbody\n'
        );
        expect(listName).toEqual(["demo/SKILL.md: field 'name' must be a non-empty string"]);

        const numberDescription = await skillFrontmatterErrors(
          '---\nname: demo\ndescription: 123\n---\nbody\n'
        );
        expect(numberDescription).toEqual([
          "demo/SKILL.md: field 'description' must be a non-empty string",
        ]);

        const emptyName = await skillFrontmatterErrors(
          "---\nname: ''\ndescription: demo skill\n---\nbody\n"
        );
        expect(emptyName).toEqual(["demo/SKILL.md: field 'name' must be a non-empty string"]);
      });
    });

    describe('agent skills: reference scan', () => {
      it('reads block-list references (∃ refs; core and harness are deployed)', async () => {
        const scan = await scanWithSkillsYaml('skills:\n  - core-skill\n  - harness-skill\n');
        expect(scan.refs.map((r) => r.skill)).toEqual(['core-skill', 'harness-skill']);
        expect(scan.nonEmptySets).toBe(1);
        expect(skillRefErrors(scan, true)).toEqual([]);
        expect(vacuityErrors(scan)).toEqual([]);
      });

      it('reads inline-array references (∃ refs; core and harness are deployed)', async () => {
        const scan = await scanWithSkillsYaml('skills: [core-skill, harness-skill]\n');
        expect(scan.refs.map((r) => r.skill)).toEqual(['core-skill', 'harness-skill']);
        expect(scan.nonEmptySets).toBe(1);
        expect(skillRefErrors(scan, true)).toEqual([]);
        expect(vacuityErrors(scan)).toEqual([]);
      });

      it('rejects a package-scope reference in block form', async () => {
        const scan = await scanWithSkillsYaml('skills:\n  - core-skill\n  - pkg-skill\n');
        expect(scan.refs).toHaveLength(2);
        expect(skillRefErrors(scan, true)).toEqual([
          "demo.md: skill reference 'pkg-skill' is package-scope and is not deployed by init",
        ]);
        // Existence-only mode (used for the executed .claude/ tree) does not flag package scope.
        expect(skillRefErrors(scan, false)).toEqual([]);
      });

      it('rejects a package-scope reference in inline form', async () => {
        const scan = await scanWithSkillsYaml('skills: [pkg-skill, core-skill]\n');
        expect(scan.refs).toHaveLength(2);
        expect(skillRefErrors(scan, true)).toEqual([
          "demo.md: skill reference 'pkg-skill' is package-scope and is not deployed by init",
        ]);
      });

      it('rejects a reference to a skill that does not exist (block and inline)', async () => {
        const block = await scanWithSkillsYaml('skills:\n  - core-skill\n  - ghost-skill\n');
        expect(skillRefErrors(block, true)).toEqual([
          "demo.md: skill reference 'ghost-skill' not found",
        ]);
        const inline = await scanWithSkillsYaml('skills: [ghost-skill]\n');
        expect(skillRefErrors(inline, true)).toEqual([
          "demo.md: skill reference 'ghost-skill' not found",
        ]);
        // Existence is also enforced in existence-only mode.
        expect(skillRefErrors(inline, false)).toHaveLength(1);
      });

      it('reports a malformed skills: value instead of ignoring it', async () => {
        const scan = await scanWithSkillsYaml('skills: core-skill\n');
        expect(scan.parseErrors).toEqual(["demo.md: 'skills' is not a list of strings"]);
        expect(skillRefErrors(scan, true)).toHaveLength(1);
      });

      it('treats an absent or empty skills: key as no references, and the ∃ guard flags it', async () => {
        const absent = await scanWithSkillsYaml('');
        const empty = await scanWithSkillsYaml('skills:\n');
        for (const scan of [absent, empty]) {
          expect(scan.refs).toEqual([]);
          expect(skillRefErrors(scan, true)).toEqual([]);
          expect(vacuityErrors(scan)).toHaveLength(2);
        }
      });

      it('∃ guard fails on an empty agents directory (no vacuous pass)', async () => {
        const root = makeFixture({
          'skills/core-skill/SKILL.md': skillMd('core-skill'),
          'agents/README.txt': 'not an agent',
        });
        const scan = await scanAgentSkillRefs(join(root, 'agents'), join(root, 'skills'));
        expect(scan.refs).toEqual([]);
        expect(skillRefErrors(scan, true)).toEqual([]);
        expect(vacuityErrors(scan)).toEqual([
          'no agent declares a non-empty skills: list',
          'no skill references were scanned',
        ]);
      });
    });
  });
});
