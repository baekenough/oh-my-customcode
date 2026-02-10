#!/usr/bin/env bun
/**
 * Codex Native Verification Script
 *
 * Validates Codex-native project structure and metadata.
 *
 * Usage:
 *     bun run .github/scripts/verify-codex-native.ts [--dry-run] [--force]
 *
 * Environment Variables:
 *     PROJECT_ROOT: Project root directory (default: current working directory)
 */

import path from 'path';
import { access, readFile, readdir, stat, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { parse as parseYaml } from 'yaml';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const CODEX_ROOT = path.join(PROJECT_ROOT, '.codex');
const HASH_FILE = path.join(CODEX_ROOT, 'codex-native-hash.txt');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

type Issue = {
  severity: 'error' | 'warn';
  message: string;
};

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function extractFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  try {
    return parseYaml(match[1]) as Record<string, any>;
  } catch {
    return null;
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      if (entry.name === 'codex-native-hash.txt') continue;
      files.push(fullPath);
    }
  }

  return files;
}

async function readHashFile(): Promise<string | null> {
  try {
    const content = await readFile(HASH_FILE, 'utf-8');
    return content.trim();
  } catch {
    return null;
  }
}

async function computeHash(): Promise<string> {
  const files = await collectFiles(CODEX_ROOT);
  const rootCandidates = ['AGENTS.md', 'AGENTS.md.en', 'AGENTS.md.ko', 'manifest.codex.json'];

  for (const candidate of rootCandidates) {
    const candidatePath = path.join(PROJECT_ROOT, candidate);
    if (await exists(candidatePath)) {
      files.push(candidatePath);
    }
  }

  const uniqueFiles = Array.from(new Set(files)).sort();
  const hash = createHash('sha256');

  for (const filePath of uniqueFiles) {
    const content = await readFile(filePath, 'utf-8');
    hash.update(path.relative(PROJECT_ROOT, filePath));
    hash.update('\n');
    hash.update(content);
    hash.update('\n');
  }

  return hash.digest('hex');
}

async function verifyCodexStructure(): Promise<void> {
  if (!(await isDirectory(CODEX_ROOT))) {
    console.log('Skip: .codex directory not found. Codex-native verification not applicable.');
    return;
  }

  const currentHash = await computeHash();
  const storedHash = await readHashFile();

  if (!force && storedHash && storedHash === currentHash) {
    console.log('No Codex structure changes detected. Use --force to re-run checks.');
    return;
  }

  const issues: Issue[] = [];
  const requiredDirs = ['agents', 'skills', 'rules', 'hooks', 'contexts'];

  for (const dir of requiredDirs) {
    const dirPath = path.join(CODEX_ROOT, dir);
    if (!(await isDirectory(dirPath))) {
      issues.push({
        severity: 'error',
        message: `Missing required directory: .codex/${dir}`,
      });
    }
  }

  const entryDocPath = path.join(PROJECT_ROOT, 'AGENTS.md');
  const entryDocEnPath = path.join(PROJECT_ROOT, 'AGENTS.md.en');
  const entryDocKoPath = path.join(PROJECT_ROOT, 'AGENTS.md.ko');

  const hasEntryDoc = await exists(entryDocPath);
  const hasEntryDocEn = await exists(entryDocEnPath);
  const hasEntryDocKo = await exists(entryDocKoPath);

  if (!hasEntryDoc && !(hasEntryDocEn && hasEntryDocKo)) {
    issues.push({
      severity: 'error',
      message: 'Missing AGENTS.md (or both AGENTS.md.en and AGENTS.md.ko).',
    });
  }

  const manifestPath = path.join(PROJECT_ROOT, 'manifest.codex.json');
  if (!(await exists(manifestPath))) {
    issues.push({
      severity: 'warn',
      message: 'manifest.codex.json not found (expected in template roots).',
    });
  }

  const hooksConfigPath = path.join(CODEX_ROOT, 'hooks', 'hooks.json');
  if (!(await exists(hooksConfigPath))) {
    issues.push({
      severity: 'warn',
      message: 'hooks.json not found under .codex/hooks.',
    });
  }

  const contextsIndexPath = path.join(CODEX_ROOT, 'contexts', 'index.yaml');
  if (!(await exists(contextsIndexPath))) {
    issues.push({
      severity: 'warn',
      message: 'contexts/index.yaml not found under .codex/contexts.',
    });
  }

  const agentsDir = path.join(CODEX_ROOT, 'agents');
  if (await isDirectory(agentsDir)) {
    const agentFiles = (await readdir(agentsDir)).filter((file) => file.endsWith('.md'));
    if (agentFiles.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No agent files found under .codex/agents.',
      });
    }

    for (const file of agentFiles) {
      const content = await readFile(path.join(agentsDir, file), 'utf-8');
      const frontmatter = extractFrontmatter(content);
      if (!frontmatter) {
        issues.push({
          severity: 'error',
          message: `Missing or invalid frontmatter in agent file: ${file}`,
        });
        continue;
      }

      const requiredFields = ['name', 'description', 'model', 'tools'];
      for (const field of requiredFields) {
        if (frontmatter[field] === undefined) {
          issues.push({
            severity: 'error',
            message: `Agent file ${file} missing frontmatter field: ${field}`,
          });
        }
      }
    }
  }

  const skillsDir = path.join(CODEX_ROOT, 'skills');
  if (await isDirectory(skillsDir)) {
    const skillFiles = (await collectFiles(skillsDir)).filter((file) => file.endsWith('SKILL.md'));

    if (skillFiles.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No SKILL.md files found under .codex/skills.',
      });
    }

    for (const skillFile of skillFiles) {
      const content = await readFile(skillFile, 'utf-8');
      const frontmatter = extractFrontmatter(content);

      if (!frontmatter) {
        issues.push({
          severity: 'error',
          message: `Missing or invalid frontmatter in skill file: ${path.relative(PROJECT_ROOT, skillFile)}`,
        });
        continue;
      }

      const requiredFields = ['name', 'description'];
      for (const field of requiredFields) {
        if (frontmatter[field] === undefined) {
          issues.push({
            severity: 'error',
            message: `Skill file ${path.relative(PROJECT_ROOT, skillFile)} missing frontmatter field: ${field}`,
          });
        }
      }
    }
  }

  const rulesDir = path.join(CODEX_ROOT, 'rules');
  if (await isDirectory(rulesDir)) {
    const ruleFiles = (await readdir(rulesDir)).filter((file) => file.endsWith('.md'));
    if (ruleFiles.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No rule files found under .codex/rules.',
      });
    }

    const validPrefixes = ['MUST-', 'SHOULD-', 'MAY-'];
    for (const file of ruleFiles) {
      const hasValidPrefix = validPrefixes.some((prefix) => file.startsWith(prefix));
      if (!hasValidPrefix) {
        issues.push({
          severity: 'warn',
          message: `Rule file missing priority prefix: ${file}`,
        });
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  } else {
    console.log('All Codex-native structural checks passed.');
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warnCount = issues.filter((issue) => issue.severity === 'warn').length;

  console.log(`Summary: ${errorCount} error(s), ${warnCount} warning(s)`);

  if (!dryRun && errorCount === 0) {
    await writeFile(HASH_FILE, `${currentHash}\n`, 'utf-8');
    console.log(`Updated hash: ${path.relative(PROJECT_ROOT, HASH_FILE)}`);
  }

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

await verifyCodexStructure();
