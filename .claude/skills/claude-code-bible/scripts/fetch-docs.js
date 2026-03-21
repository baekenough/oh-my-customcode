#!/usr/bin/env node

/**
 * fetch-docs.js
 *
 * Fetches Claude Code official documentation from code.claude.com
 * and saves it locally for reference.
 *
 * Usage:
 *   node fetch-docs.js [--force] [--output <dir>]
 *
 * Options:
 *   --force          Skip 24-hour cache check
 *   --output <dir>   Output directory (default: ~/.claude/references/claude-code/)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { homedir } = require('os');

// Configuration
const LLMS_TXT_URL = 'https://code.claude.com/docs/llms.txt';
const DEFAULT_OUTPUT_DIR = path.join(homedir(), '.claude', 'references', 'claude-code');
const FETCH_DELAY_MS = 200;
const CACHE_HOURS = 24;

// Parse CLI arguments
function parseArgs() {
  const args = {
    force: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--force') {
      args.force = true;
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.outputDir = process.argv[++i];
    }
  }

  return args;
}

// Check if cache is fresh
function isCacheFresh(outputDir) {
  const lastUpdatedPath = path.join(outputDir, 'last-updated.txt');

  if (!fs.existsSync(lastUpdatedPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(lastUpdatedPath, 'utf-8').trim();
    const lastUpdated = new Date(content);
    const now = new Date();
    const hoursSince = (now - lastUpdated) / (1000 * 60 * 60);

    return hoursSince < CACHE_HOURS;
  } catch (error) {
    return false;
  }
}

// Fetch URL with redirect support
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Extract documentation URLs from llms.txt
function extractDocUrls(llmsTxtContent) {
  const urls = [];

  // Match URLs in markdown links: [title](url) and bare URLs
  const markdownLinkRegex = /\(https?:\/\/code\.claude\.com\/docs\/[^)]+\)/g;
  const bareLinkRegex = /^https?:\/\/code\.claude\.com\/docs\/\S+/gm;

  let match;
  while ((match = markdownLinkRegex.exec(llmsTxtContent)) !== null) {
    // Remove surrounding parentheses
    urls.push(match[0].slice(1, -1));
  }
  while ((match = bareLinkRegex.exec(llmsTxtContent)) !== null) {
    urls.push(match[0]);
  }

  return [...new Set(urls)]; // Remove duplicates
}

// Convert URL to filename
function urlToFilename(url) {
  const urlObj = new URL(url);
  let filename = urlObj.pathname.replace(/^\/docs\//, '').replace(/\/$/, '');

  if (!filename) {
    filename = 'index';
  }

  // Remove language prefix (e.g., "en/") to keep filenames clean
  filename = filename.replace(/^en\//, '');

  // Replace remaining slashes with dashes for nested paths
  filename = filename.replace(/\//g, '-');

  if (!filename.endsWith('.md')) {
    filename += '.md';
  }

  return filename;
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Main execution
async function main() {
  const args = parseArgs();
  const { force, outputDir } = args;

  console.log('Claude Code Documentation Fetcher');
  console.log('==================================\n');

  // Check cache freshness
  if (!force && isCacheFresh(outputDir)) {
    console.log('✓ Cache is fresh (less than 24 hours old)');
    console.log('  Use --force to bypass cache check\n');
    console.log(`Output directory: ${outputDir}`);
    return;
  }

  // Ensure output directory exists
  ensureDir(outputDir);

  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    failures: [],
  };

  try {
    // Step 1: Fetch llms.txt
    console.log('Fetching llms.txt...');
    const llmsTxtContent = await fetchUrl(LLMS_TXT_URL);
    console.log('✓ llms.txt fetched\n');

    // Save llms.txt itself
    const llmsTxtPath = path.join(outputDir, 'llms.txt');
    fs.writeFileSync(llmsTxtPath, llmsTxtContent, 'utf-8');

    // Step 2: Extract documentation URLs
    const docUrls = extractDocUrls(llmsTxtContent);

    if (docUrls.length === 0) {
      console.log('⚠ No documentation URLs found in llms.txt');
      return;
    }

    console.log(`Found ${docUrls.length} documentation URL(s)\n`);
    stats.total = docUrls.length;

    // Step 3: Fetch each documentation page
    for (let i = 0; i < docUrls.length; i++) {
      const url = docUrls[i];
      const filename = urlToFilename(url);
      const filepath = path.join(outputDir, filename);

      try {
        console.log(`[${i + 1}/${docUrls.length}] Fetching ${url}...`);
        const content = await fetchUrl(url);
        fs.writeFileSync(filepath, content, 'utf-8');
        console.log(`  ✓ Saved to ${filename}`);
        stats.success++;
      } catch (error) {
        console.log(`  ✗ Failed: ${error.message}`);
        stats.failed++;
        stats.failures.push({ url, error: error.message });
      }

      // Delay between requests
      if (i < docUrls.length - 1) {
        await sleep(FETCH_DELAY_MS);
      }
    }

    // Step 4: Write last-updated timestamp
    const timestamp = new Date().toISOString();
    const lastUpdatedPath = path.join(outputDir, 'last-updated.txt');
    fs.writeFileSync(lastUpdatedPath, timestamp, 'utf-8');

    // Summary
    console.log('\n==================================');
    console.log('Summary:');
    console.log(`  Total URLs:      ${stats.total}`);
    console.log(`  Downloaded:      ${stats.success}`);
    console.log(`  Failed:          ${stats.failed}`);
    console.log(`  Save location:   ${outputDir}`);
    console.log(`  Last updated:    ${timestamp}`);

    if (stats.failures.length > 0) {
      console.log('\nFailures:');
      stats.failures.forEach(({ url, error }) => {
        console.log(`  - ${url}`);
        console.log(`    ${error}`);
      });
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
