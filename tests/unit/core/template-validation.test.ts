import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const TEMPLATES_DIR = resolve(import.meta.dir, '../../../templates');

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

/**
 * Returns true if a field is present in frontmatter, including fields with
 * multiline array values (e.g. tools:\n  - Read\n  - Write).
 */
function hasField(result: FrontmatterResult, fieldName: string): boolean {
  return fieldName in result.fields || result.arrayFields.has(fieldName);
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

async function countOntologyFiles(fullPath: string): Promise<number> {
  const entries = await readdir(fullPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isFile()) {
      count++;
    } else if (entry.isDirectory()) {
      const subEntries = await readdir(join(fullPath, entry.name), { withFileTypes: true });
      count += subEntries.filter((e) => e.isFile()).length;
    }
  }
  return count;
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
  if (componentName === 'ontology') return countOntologyFiles(fullPath);

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
    if (!hasField(result, field) && !result.fields[field]) {
      errors.push(`${agentFile}: missing required field '${field}'`);
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

      const actualCount = await countActualFiles(rulesComponent?.path, 'rules');
      expect(actualCount).toBe(rulesComponent?.files);
    });

    it('should have files count matching actual agents directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const agentsComponent = manifest.components.find((c) => c.name === 'agents');
      expect(agentsComponent).toBeDefined();

      const actualCount = await countActualFiles(agentsComponent?.path, 'agents');
      expect(actualCount).toBe(agentsComponent?.files);
    });

    it('should have files count matching actual skills directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const skillsComponent = manifest.components.find((c) => c.name === 'skills');
      expect(skillsComponent).toBeDefined();

      const actualCount = await countActualFiles(skillsComponent?.path, 'skills');
      expect(actualCount).toBe(skillsComponent?.files);
    });

    it('should have files count matching actual guides directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const guidesComponent = manifest.components.find((c) => c.name === 'guides');
      expect(guidesComponent).toBeDefined();

      const actualCount = await countActualFiles(guidesComponent?.path, 'guides');
      expect(actualCount).toBe(guidesComponent?.files);
    });

    it('should have files count matching actual hooks directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const hooksComponent = manifest.components.find((c) => c.name === 'hooks');
      expect(hooksComponent).toBeDefined();

      const actualCount = await countActualFiles(hooksComponent?.path, 'hooks');
      expect(actualCount).toBe(hooksComponent?.files);
    });

    it('should have files count matching actual contexts directory', async () => {
      const manifestPath = join(TEMPLATES_DIR, 'manifest.json');
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      const contextsComponent = manifest.components.find((c) => c.name === 'contexts');
      expect(contextsComponent).toBeDefined();

      const actualCount = await countActualFiles(contextsComponent?.path, 'contexts');
      expect(actualCount).toBe(contextsComponent?.files);
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
      const validModels = new Set(['sonnet', 'opus', 'haiku', 'inherit']);
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
          if (!validModels.has(model)) {
            errors.push(
              `${agentFile}: invalid model '${model}' (must be one of: ${[...validModels].join(', ')})`
            );
          }
        }
      }

      expect(errors).toEqual([]);
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
  });

  describe('README count sync', () => {
    it('README.md agent count should match actual template agent files', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Agents (42)" or "| **Total** | **42** |" patterns
      const agentsHeaderMatch = readmeContent.match(/###\s+Agents\s+\((\d+)\)/);
      expect(agentsHeaderMatch).not.toBeNull();

      const readmeAgentCount = parseInt(agentsHeaderMatch?.[1], 10);

      const agentsDir = join(TEMPLATES_DIR, '.claude/agents');
      const agentFiles = (await readdir(agentsDir, { withFileTypes: true })).filter(
        (e) => e.isFile() && e.name.endsWith('.md')
      );

      expect(agentFiles.length).toBe(readmeAgentCount);
    });

    it('README.md skill count should match actual template skill directories', async () => {
      const readmePath = resolve(import.meta.dir, '../../../README.md');
      const readmeContent = await readFile(readmePath, 'utf-8');

      // Match "### Skills (55)" pattern
      const skillsHeaderMatch = readmeContent.match(/###\s+Skills\s+\((\d+)\)/);
      expect(skillsHeaderMatch).not.toBeNull();

      const readmeSkillCount = parseInt(skillsHeaderMatch?.[1], 10);

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

      const readmeRulesCount = parseInt(rulesHeaderMatch?.[1], 10);

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

      const readmeGuidesCount = parseInt(guidesHeaderMatch?.[1], 10);

      const guidesDir = join(TEMPLATES_DIR, 'guides');
      const guidesDirs = (await readdir(guidesDir, { withFileTypes: true })).filter((e) =>
        e.isDirectory()
      );

      expect(guidesDirs.length).toBe(readmeGuidesCount);
    });
  });
});
