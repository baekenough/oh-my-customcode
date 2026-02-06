#!/usr/bin/env bun

/**
 * sync-core.ts
 *
 * Syncs source content to oh-my-customcode/templates
 * Usage: bun run scripts/sync-core.ts /path/to/source
 */

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';

interface Component {
  name: string;
  path: string;
  description: string;
  files: number;
}

interface Manifest {
  version: string;
  lastUpdated: string;
  components: Component[];
  source: string;
}

/**
 * Directory mappings from source to templates/
 *
 * Updated for official Claude Code format:
 * - .claude/agents/ contains flat .md files with prefixes (lang-, be-, mgr-, etc.)
 * - .claude/skills/ contains skill directories with SKILL.md
 * - commands/ removed (absorbed into skills as slash commands)
 */
const SYNC_MAPPINGS = [
  { source: '.claude/rules/', target: '.claude/rules/' },
  { source: '.claude/hooks/', target: '.claude/hooks/' },
  { source: '.claude/contexts/', target: '.claude/contexts/' },
  { source: '.claude/install-hooks.sh', target: '.claude/install-hooks.sh' },
  { source: '.claude/uninstall-hooks.sh', target: '.claude/uninstall-hooks.sh' },
  { source: '.claude/agents/', target: '.claude/agents/' },
  { source: '.claude/skills/', target: '.claude/skills/' },
  { source: 'guides/', target: 'guides/' },
] as const;

/**
 * Count files recursively in a directory
 */
function countFiles(dir: string, pattern?: RegExp): number {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      count += countFiles(fullPath, pattern);
    } else if (entry.isFile()) {
      if (pattern) {
        if (pattern.test(entry.name)) {
          count++;
        }
      } else {
        count++;
      }
    }
  }

  return count;
}

/**
 * Count agent .md files in flat .claude/agents/ directory
 * Official Claude Code format: .claude/agents/{prefix}-{name}.md
 */
function countAgents(agentsDir: string): number {
  if (!fs.existsSync(agentsDir)) {
    return 0;
  }

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length;
}

/**
 * Count SKILL.md files in skills directory
 */
function countSkills(skillsDir: string): number {
  return countFiles(skillsDir, /^SKILL\.md$/);
}

/**
 * Count guide topics (index.yaml files in guide subdirectories)
 */
function countGuides(guidesDir: string): number {
  if (!fs.existsSync(guidesDir)) {
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(guidesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const indexYaml = path.join(guidesDir, entry.name, 'index.yaml');
      if (fs.existsSync(indexYaml)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Update manifest.json with new file counts
 */
function updateManifest(templatesDir: string): void {
  const manifestPath = path.join(templatesDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error('[sync] ✗ manifest.json not found');
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Update file counts for each component
  // Updated for official Claude Code format (agents and skills in .claude/)
  const componentCounts: Record<string, number> = {
    rules: countFiles(path.join(templatesDir, '.claude/rules'), /\.(md|yaml)$/),
    agents: countAgents(path.join(templatesDir, '.claude/agents')),
    skills: countSkills(path.join(templatesDir, '.claude/skills')),
    guides: countGuides(path.join(templatesDir, 'guides')),
    hooks: countFiles(path.join(templatesDir, '.claude/hooks')),
    contexts: countFiles(path.join(templatesDir, '.claude/contexts')),
  };

  // Update manifest
  manifest.lastUpdated = new Date().toISOString();

  for (const component of manifest.components) {
    if (componentCounts[component.name] !== undefined) {
      component.files = componentCounts[component.name];
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('[sync] ✓ manifest.json updated');
}

/**
 * Validate source directory structure
 * Updated for official Claude Code format
 */
function validateSource(sourcePath: string): boolean {
  const requiredPaths = ['.claude/rules', '.claude/agents', '.claude/skills', 'guides'];

  for (const required of requiredPaths) {
    const fullPath = path.join(sourcePath, required);
    if (!fs.existsSync(fullPath)) {
      console.error(`[sync] ✗ Required path not found: ${required}`);
      return false;
    }
  }

  return true;
}

/**
 * Sync a single directory or file using rsync
 */
async function syncPath(
  sourcePath: string,
  targetPath: string,
  isDirectory: boolean
): Promise<number> {
  if (isDirectory) {
    // Ensure target directory exists
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // Trailing slash on source = copy contents, target = specific subdir
    // --delete only affects files within targetPath, not its parent
    await $`rsync -a --copy-links --delete ${sourcePath}/ ${targetPath}/`;
    return countFiles(targetPath);
  } else {
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    await $`rsync -a --copy-links ${sourcePath} ${targetPath}`;
    return 1;
  }
}

/**
 * Main sync function
 */
async function sync(sourcePath: string): Promise<void> {
  console.log(`[sync] Starting sync from ${sourcePath}`);

  // Validate source directory
  if (!fs.existsSync(sourcePath)) {
    console.error('[sync] ✗ Source path does not exist');
    process.exit(1);
  }

  if (!validateSource(sourcePath)) {
    console.error('[sync] ✗ Invalid source structure');
    process.exit(1);
  }

  // Get script directory and templates path
  const scriptDir = path.dirname(import.meta.path);
  const templatesDir = path.resolve(scriptDir, '..', 'templates');

  // Ensure templates directory exists
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  let componentCount = 0;

  // Sync each mapping
  for (const mapping of SYNC_MAPPINGS) {
    const mappedSourcePath = path.join(sourcePath, mapping.source);
    const targetPath = path.join(templatesDir, mapping.target);

    if (!fs.existsSync(mappedSourcePath)) {
      console.log(`[sync] ⊘ Skipping ${mapping.source} (not found)`);
      continue;
    }

    const isDirectory = fs.statSync(mappedSourcePath).isDirectory();

    try {
      const fileCount = await syncPath(mappedSourcePath, targetPath, isDirectory);
      console.log(`[sync] ✓ ${mapping.source} (${fileCount} files)`);
      componentCount++;
    } catch (error) {
      console.error(`[sync] ✗ Failed to sync ${mapping.source}:`, error);
      process.exit(1);
    }
  }

  // Update manifest.json
  updateManifest(templatesDir);

  console.log(`[sync] Done! Synced ${componentCount} components`);
}

/**
 * Entry point
 */
async function main() {
  const sourcePath = process.argv[2];

  if (!sourcePath) {
    console.error('Usage: bun run scripts/sync-core.ts /path/to/source');
    process.exit(1);
  }

  const absolutePath = path.resolve(sourcePath);

  try {
    await sync(absolutePath);
  } catch (error) {
    console.error('[sync] ✗ Sync failed:', error);
    process.exit(1);
  }
}

main();
