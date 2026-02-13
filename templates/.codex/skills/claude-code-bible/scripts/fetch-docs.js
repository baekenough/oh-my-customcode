#!/usr/bin/env node

/**
 * fetch-docs.js
 *
 * Fetches Codex documentation from official OpenAI sources and saves
 * local snapshots for verification workflows.
 *
 * Usage:
 *   node fetch-docs.js [--force] [--output <dir>]
 *
 * Options:
 *   --force          Skip 24-hour cache check
 *   --output <dir>   Output directory (default: ~/.codex/references/codex-docs/)
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_OUTPUT_DIR = path.join(homedir(), '.codex', 'references', 'codex-docs');
const LAST_UPDATED_FILE = 'last-updated.txt';
const SOURCE_POLICY_FILE = 'source-policy.json';
const FETCH_REPORT_FILE = 'fetch-report.json';
const CACHE_HOURS = 24;
const FETCH_DELAY_MS = 200;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15000;

// Primary + fallback URLs are explicit to keep behavior predictable in CI.
const SOURCE_POLICY = [
  {
    id: 'codex-overview',
    description: 'Codex landing and product overview',
    urls: ['https://developers.openai.com/codex/', 'https://developers.openai.com/codex'],
  },
  {
    id: 'codex-cli',
    description: 'Codex CLI guide',
    urls: ['https://developers.openai.com/codex/cli'],
  },
  {
    id: 'codex-ide',
    description: 'Codex IDE guide',
    urls: ['https://developers.openai.com/codex/ide'],
  },
  {
    id: 'codex-cloud',
    description: 'Codex cloud guide',
    urls: ['https://developers.openai.com/codex/cloud'],
  },
  {
    id: 'codex-cloud-internet',
    description: 'Codex cloud internet access policy',
    urls: [
      'https://developers.openai.com/codex/cloud/internet-access',
      'https://developers.openai.com/codex/cloud/agent-internet',
    ],
  },
  {
    id: 'codex-changelog',
    description: 'Codex changelog',
    urls: ['https://developers.openai.com/codex/changelog'],
  },
];

function parseArgs() {
  const args = {
    force: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--output' && i + 1 < process.argv.length) {
      args.outputDir = process.argv[++i];
    }
  }

  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCacheFresh(outputDir) {
  const lastUpdatedPath = path.join(outputDir, LAST_UPDATED_FILE);
  if (!fs.existsSync(lastUpdatedPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(lastUpdatedPath, 'utf-8').trim();
    const lastUpdated = new Date(content);
    if (Number.isNaN(lastUpdated.getTime())) {
      return false;
    }

    const hoursSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
    return hoursSince < CACHE_HOURS;
  } catch {
    return false;
  }
}

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      const statusCode = res.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects: ${url}`));
          return;
        }

        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode !== 200) {
        reject(new Error(`HTTP ${statusCode}: ${url}`));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });

    request.on('error', reject);
  });
}

async function fetchWithFallback(source) {
  const errors = [];

  for (const candidateUrl of source.urls) {
    try {
      const content = await fetchUrl(candidateUrl);
      return { success: true, content, url: candidateUrl, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ url: candidateUrl, error: message });
    }
  }

  return { success: false, content: null, url: null, errors };
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function main() {
  const { force, outputDir } = parseArgs();

  console.log('Codex Documentation Fetcher');
  console.log('==================================\n');

  if (!force && isCacheFresh(outputDir)) {
    console.log('✓ Cache is fresh (less than 24 hours old)');
    console.log('  Use --force to bypass cache check\n');
    console.log(`Output directory: ${outputDir}`);
    return;
  }

  ensureDir(outputDir);

  const fetchedAt = new Date().toISOString();
  const report = {
    fetchedAt,
    sourcePolicyVersion: 1,
    totalSources: SOURCE_POLICY.length,
    successCount: 0,
    failureCount: 0,
    sources: [],
  };

  console.log(`Source policy: ${SOURCE_POLICY.length} canonical source(s)\n`);

  for (let i = 0; i < SOURCE_POLICY.length; i++) {
    const source = SOURCE_POLICY[i];
    console.log(`[${i + 1}/${SOURCE_POLICY.length}] ${source.id}`);

    const result = await fetchWithFallback(source);

    if (result.success) {
      const fileName = `${source.id}.html`;
      fs.writeFileSync(path.join(outputDir, fileName), result.content, 'utf-8');
      report.successCount += 1;
      report.sources.push({
        id: source.id,
        description: source.description,
        status: 'ok',
        selectedUrl: result.url,
        outputFile: fileName,
        attemptedUrls: source.urls,
      });
      console.log(`  ✓ fetched ${result.url}`);
      console.log(`  ✓ saved ${fileName}`);
    } else {
      report.failureCount += 1;
      report.sources.push({
        id: source.id,
        description: source.description,
        status: 'failed',
        selectedUrl: null,
        outputFile: null,
        attemptedUrls: source.urls,
        errors: result.errors,
      });
      console.log('  ✗ failed all candidate URLs');
      for (const item of result.errors) {
        console.log(`    - ${item.url}: ${item.error}`);
      }
    }

    if (i < SOURCE_POLICY.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  writeJsonFile(path.join(outputDir, SOURCE_POLICY_FILE), {
    generatedAt: fetchedAt,
    policy: SOURCE_POLICY,
  });
  writeJsonFile(path.join(outputDir, FETCH_REPORT_FILE), report);

  if (report.successCount === 0) {
    console.error('\n✗ Fatal error: unable to fetch any Codex documentation sources.');
    process.exit(1);
  }

  fs.writeFileSync(path.join(outputDir, LAST_UPDATED_FILE), `${fetchedAt}\n`, 'utf-8');

  console.log('\n==================================');
  console.log('Summary:');
  console.log(`  Total sources:   ${report.totalSources}`);
  console.log(`  Downloaded:      ${report.successCount}`);
  console.log(`  Failed:          ${report.failureCount}`);
  console.log(`  Save location:   ${outputDir}`);
  console.log(`  Last updated:    ${fetchedAt}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n✗ Unexpected error:', message);
  process.exit(1);
});
