#!/usr/bin/env bun

/**
 * sync-core.ts
 *
 * Syncs baekgom-agents content to oh-my-customcode/templates
 * Usage: bun run scripts/sync-core.ts /path/to/baekgom-agents
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
 * Directory mappings from baekgom-agents to templates/
 */
const SYNC_MAPPINGS = [
  { source: '.claude/rules/', target: '.claude/rules/' },
  { source: '.claude/hooks/', target: '.claude/hooks/' },
  { source: '.claude/contexts/', target: '.claude/contexts/' },
  { source: '.claude/install-hooks.sh', target: '.claude/install-hooks.sh' },
  { source: '.claude/uninstall-hooks.sh', target: '.claude/uninstall-hooks.sh' },
  { source: 'agents/', target: 'agents/' },
  { source: 'skills/', target: 'skills/' },
  { source: 'guides/', target: 'guides/' },
  { source: 'commands/', target: 'commands/' },
  { source: 'pipelines/', target: 'pipelines/' },
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
 * Count AGENT.md files in agents directory
 */
function countAgents(agentsDir: string): number {
  return countFiles(agentsDir, /^AGENT\.md$/);
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
 * Count command files (excluding index.yaml)
 */
function countCommands(commandsDir: string): number {
  if (!fs.existsSync(commandsDir)) {
    return 0;
  }

  let count = 0;

  function countInDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        countInDir(fullPath);
      } else if (entry.isFile() && entry.name !== 'index.yaml') {
        if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
          count++;
        }
      }
    }
  }

  countInDir(commandsDir);
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
  const componentCounts: Record<string, number> = {
    rules: countFiles(path.join(templatesDir, '.claude/rules'), /\.(md|yaml)$/),
    agents: countAgents(path.join(templatesDir, 'agents')),
    skills: countSkills(path.join(templatesDir, 'skills')),
    guides: countGuides(path.join(templatesDir, 'guides')),
    pipelines: countFiles(path.join(templatesDir, 'pipelines')),
    commands: countCommands(path.join(templatesDir, 'commands')),
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
 * Validate baekgom-agents directory structure
 */
function validateSource(sourcePath: string): boolean {
  const requiredPaths = ['.claude/rules', 'agents', 'skills', 'guides'];

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
async function sync(baekgomPath: string): Promise<void> {
  console.log(`[sync] Starting sync from ${baekgomPath}`);

  // Validate source directory
  if (!fs.existsSync(baekgomPath)) {
    console.error('[sync] ✗ Source path does not exist');
    process.exit(1);
  }

  if (!validateSource(baekgomPath)) {
    console.error('[sync] ✗ Invalid baekgom-agents structure');
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
    const sourcePath = path.join(baekgomPath, mapping.source);
    const targetPath = path.join(templatesDir, mapping.target);

    if (!fs.existsSync(sourcePath)) {
      console.log(`[sync] ⊘ Skipping ${mapping.source} (not found)`);
      continue;
    }

    const isDirectory = fs.statSync(sourcePath).isDirectory();

    try {
      const fileCount = await syncPath(sourcePath, targetPath, isDirectory);
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
  const baekgomPath = process.argv[2];

  if (!baekgomPath) {
    console.error('Usage: bun run scripts/sync-core.ts /path/to/baekgom-agents');
    process.exit(1);
  }

  const absolutePath = path.resolve(baekgomPath);

  try {
    await sync(absolutePath);
  } catch (error) {
    console.error('[sync] ✗ Sync failed:', error);
    process.exit(1);
  }
}

main();
