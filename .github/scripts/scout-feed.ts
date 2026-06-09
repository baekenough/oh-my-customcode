#!/usr/bin/env bun

/**
 * Daily Scout Feed Script
 *
 * Monitors multiple RSS/Atom feeds, scores items for oh-my-customcode relevance
 * using Claude Haiku, deduplicates against existing GitHub issues, and files
 * GitHub issues for high-scoring items.
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Required
 * - GITHUB_TOKEN: Required
 * - GITHUB_REPOSITORY: Required (format: owner/repo)
 * - SCOUT_DRY_RUN: 'true'/'false' (default: false)
 * - SCOUT_MIN_SCORE: minimum relevance score 0-100 (default: 60)
 * - SCOUT_MAX_ISSUES: hard cap on issues created per run (default: 5)
 * - SCOUT_SOURCES: comma-separated source names to restrict (default: all)
 * - SCOUT_LIMIT_PER_SOURCE: max items to fetch per source (default: 50)
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Interfaces
// ============================================================================

interface SourceConfig {
  name: string;
  url: string;
  enabled: boolean;
}

interface FeedItem {
  title: string;
  link: string;
  published: string;
  source: string;
}

interface ScoreResult {
  index: number;
  score: number;
  reason: string;
}

interface ScoredItem extends FeedItem {
  score: number;
  reason: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  githubRepo: process.env.GITHUB_REPOSITORY,
  dryRun: process.env.SCOUT_DRY_RUN === 'true',
  minScore: parseIntSafe(process.env.SCOUT_MIN_SCORE, 60),
  maxIssues: parseIntSafe(process.env.SCOUT_MAX_ISSUES, 5),
  limitPerSource: parseIntSafe(process.env.SCOUT_LIMIT_PER_SOURCE, 50),
  enabledSources: parseSourceFilter(process.env.SCOUT_SOURCES),
};

const ALL_SOURCES: SourceConfig[] = [
  { name: 'hada', url: 'https://feeds.feedburner.com/geeknews-feed', enabled: true },
  { name: 'hackernews', url: 'https://hnrss.org/frontpage', enabled: true },
  { name: 'arxiv-cs-ai', url: 'http://export.arxiv.org/rss/cs.AI', enabled: true },
];

function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseSourceFilter(value: string | undefined): Set<string> | null {
  if (!value || value.trim() === '') return null;
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
}

function getActiveSources(): SourceConfig[] {
  if (!CONFIG.enabledSources) return ALL_SOURCES.filter((s) => s.enabled);
  return ALL_SOURCES.filter((s) => s.enabled && CONFIG.enabledSources!.has(s.name));
}

// ============================================================================
// Environment Validation
// ============================================================================

function validateEnvironment(): void {
  const missing: string[] = [];

  if (!CONFIG.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!CONFIG.githubToken) missing.push('GITHUB_TOKEN');
  if (!CONFIG.githubRepo) missing.push('GITHUB_REPOSITORY');

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ============================================================================
// RSS / Atom Feed Parsing
// ============================================================================

/**
 * Strip CDATA wrappers: <![CDATA[...]]> → inner content
 */
function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

/**
 * Decode basic HTML entities in a string.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract the inner text of the first occurrence of <tagName ...>TEXT</tagName>.
 * Handles attributes on the opening tag.
 */
function extractTag(xml: string, tagName: string): string {
  const openRe = new RegExp(`<${tagName}[^>]*>`, 'i');
  const match = openRe.exec(xml);
  if (!match) return '';
  const afterOpen = xml.slice(match.index + match[0].length);
  const closeIdx = afterOpen.toLowerCase().indexOf(`</${tagName.toLowerCase()}>`);
  if (closeIdx === -1) return '';
  return afterOpen.slice(0, closeIdx).trim();
}

/**
 * Extract the value of an attribute from a tag element.
 * E.g. extractAttr('<link href="https://example.com"/>', 'link', 'href') → 'https://example.com'
 */
function extractAttr(xml: string, tagName: string, attrName: string): string {
  // Match the entire opening tag (including self-closing)
  const tagRe = new RegExp(`<${tagName}[^>]*/?>`, 'i');
  const tagMatch = tagRe.exec(xml);
  if (!tagMatch) return '';
  const tagContent = tagMatch[0];

  // Try double-quoted attribute
  const dqRe = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const dqMatch = dqRe.exec(tagContent);
  if (dqMatch) return dqMatch[1];

  // Try single-quoted attribute
  const sqRe = new RegExp(`${attrName}='([^']*)'`, 'i');
  const sqMatch = sqRe.exec(tagContent);
  if (sqMatch) return sqMatch[1];

  return '';
}

/**
 * Parse either Atom 1.0 or RSS 2.0 XML into FeedItem array.
 * Port of the dual-format logic from check-feed.sh.
 */
function parseFeed(xml: string, sourceName: string, limit: number): FeedItem[] {
  const items: FeedItem[] = [];

  // Detect format: Atom uses <entry>, RSS uses <item>
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const entryTag = isAtom ? 'entry' : 'item';

  // Split the XML into entry/item blocks
  const entryPattern = new RegExp(`<${entryTag}[\\s>][\\s\\S]*?<\\/${entryTag}>`, 'gi');
  const matches = xml.match(entryPattern) ?? [];

  for (const block of matches) {
    if (items.length >= limit) break;

    // Extract title
    const rawTitle = extractTag(block, 'title');
    const title = decodeHtmlEntities(stripCdata(rawTitle));
    if (!title) continue;

    // Extract link
    // Atom: <link href="..." /> or <link rel="alternate" href="..." />
    // RSS: <link>url</link>
    let link = extractAttr(block, 'link', 'href');
    if (!link) {
      link = stripCdata(extractTag(block, 'link')).trim();
    }
    if (!link) continue;

    // Extract published / pubDate
    let published = extractTag(block, 'published');
    if (!published) published = extractTag(block, 'pubDate');
    published = stripCdata(published).trim();

    items.push({ title, link, published, source: sourceName });
  }

  return items;
}

/**
 * Fetch an RSS/Atom feed with a 30s timeout.
 * Returns null on failure (caller should warn and continue).
 */
async function fetchFeed(source: SourceConfig): Promise<FeedItem[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'oh-my-customcode-scout/1.0' },
    });

    if (!response.ok) {
      console.warn(`⚠️  [${source.name}] HTTP ${response.status} ${response.statusText} — skipping`);
      return null;
    }

    const xml = await response.text();
    if (!xml.trim()) {
      console.warn(`⚠️  [${source.name}] Empty response — skipping`);
      return null;
    }

    const items = parseFeed(xml, source.name, CONFIG.limitPerSource);
    console.log(`📡 [${source.name}] Fetched ${items.length} items from ${source.url}`);
    return items;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  [${source.name}] Fetch failed: ${msg} — skipping`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// GitHub API Helpers
// ============================================================================

function githubHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CONFIG.githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'oh-my-customcode-scout',
  };
}

/**
 * Fetch bodies of existing issues labeled 'daily-scout' (all states).
 * Used for deduplication.
 */
async function fetchTrackedIssueBodies(): Promise<string[]> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues?labels=daily-scout&state=all&per_page=100`;

  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    console.warn(`⚠️  Could not fetch existing issues (${response.status}) — dedup may miss duplicates`);
    return [];
  }

  const issues = await response.json() as Array<{ body?: string | null }>;
  return issues.map((i) => i.body ?? '');
}

/**
 * Ensure a GitHub label exists. Ignores 422 (already exists).
 */
async function ensureLabelExists(name: string, color: string, description: string): Promise<void> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/labels`;
  const response = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({ name, color, description }),
  });

  // 201 = created, 422 = already exists — both are acceptable
  if (response.status !== 201 && response.status !== 422) {
    console.warn(`⚠️  Could not ensure label '${name}': HTTP ${response.status}`);
  }
}

/**
 * Create a GitHub issue.
 */
async function createGitHubIssue(title: string, body: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({
      title,
      body,
      labels: ['automated', 'daily-scout'],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ Failed to create issue: HTTP ${response.status} — ${text}`);
    return null;
  }

  const issue = await response.json() as { html_url?: string; number?: number };
  return issue.html_url ?? null;
}

// ============================================================================
// LLM Scoring
// ============================================================================

const SYSTEM_PROMPT = `You are a relevance filter for the oh-my-customcode project — an AI agent harness/orchestration system built on Claude Code CLI.

Project domains (HIGH relevance, score 70-100):
- AI agent orchestration, multi-agent systems, agent design patterns
- Harness, benchmark, evaluation frameworks for AI agents
- Claude Code, Anthropic ecosystem, MCP (Model Context Protocol)
- Code review automation, development workflow automation
- Agent sandbox, isolation, security patterns
- LLM-assisted development tools and methodologies

Project domains (MEDIUM relevance, score 40-69):
- General AI/ML tooling that could be adapted for agent workflows
- DevOps automation patterns applicable to agent infrastructure
- New programming paradigms for AI-assisted development

NOT relevant (score 0-39):
- Pure frontend/UI frameworks without agent connection
- Business/management topics
- Hardware, networking, non-AI infrastructure
- Social media, marketing tools

For each numbered item, evaluate its title and return a JSON array.`;

/**
 * Score all items in a single Haiku batch call.
 * Returns the items with scores assigned.
 */
async function scoreItemsWithHaiku(items: FeedItem[]): Promise<ScoreResult[]> {
  const client = new Anthropic({ apiKey: CONFIG.anthropicApiKey });

  const numberedList = items
    .map((item, i) => `${i + 1}. [${item.source}] ${item.title}`)
    .join('\n');

  const userPrompt = `Score each item for oh-my-customcode relevance (0-100).

Items:
${numberedList}

Return a JSON array (no markdown, raw JSON only) with exactly ${items.length} objects:
[
  { "index": 1, "score": <0-100>, "reason": "<one line>" },
  ...
]`;

  console.log(`🤖 Scoring ${items.length} items with Haiku (single batch)...`);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text content using type narrowing (discriminated union)
  const textContent = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  // Parse JSON — handle markdown code-block wrapping like analyze-issue.ts
  let jsonStr = textContent.trim();
  const jsonMatch = jsonStr.match(/```json?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\s*\n/, '').replace(/\n```\s*$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('❌ Failed to parse LLM scoring response as JSON:');
    console.error(textContent.slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error('❌ LLM scoring response is not an array');
    console.error(textContent.slice(0, 500));
    process.exit(1);
  }

  // Validate and normalise each element
  const results: ScoreResult[] = [];
  for (const element of parsed) {
    if (
      typeof element === 'object' &&
      element !== null &&
      typeof (element as Record<string, unknown>).index === 'number' &&
      typeof (element as Record<string, unknown>).score === 'number' &&
      typeof (element as Record<string, unknown>).reason === 'string'
    ) {
      const el = element as Record<string, unknown>;
      results.push({
        index: el.index as number,
        score: Math.max(0, Math.min(100, el.score as number)),
        reason: el.reason as string,
      });
    }
  }

  if (results.length === 0) {
    console.error('❌ LLM returned no valid score objects');
    process.exit(1);
  }

  return results;
}

// ============================================================================
// Issue Body Formatting
// ============================================================================

function buildIssueBody(item: ScoredItem): string {
  const truncatedTitle = item.title.length > 120 ? item.title.slice(0, 117) + '...' : item.title;

  return `## ${truncatedTitle}

**Source:** ${item.link}
**Published:** ${item.published || 'unknown'}
**Feed:** ${item.source}
**Relevance score:** ${item.score}/100 — ${item.reason}

---

## Action Items

- [ ] Review article for applicability to oh-my-customcode
- [ ] If relevant: internalize patterns or create an implementation issue
- [ ] If not relevant: close with comment

---

_Auto-created by the daily-scout GitHub Actions workflow._`;
}

// ============================================================================
// Deduplication
// ============================================================================

function isAlreadyTracked(item: FeedItem, existingBodies: string[]): boolean {
  return existingBodies.some((body) => body.includes(item.link));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 Starting daily-scout feed script\n');

  validateEnvironment();

  const activeSources = getActiveSources();
  if (activeSources.length === 0) {
    console.error('❌ No active sources after applying SCOUT_SOURCES filter');
    process.exit(1);
  }

  console.log(`📋 Config: minScore=${CONFIG.minScore}, maxIssues=${CONFIG.maxIssues}, dryRun=${CONFIG.dryRun}`);
  console.log(`📡 Sources: ${activeSources.map((s) => s.name).join(', ')}\n`);

  // ── Phase 1: Fetch all feeds (continue on single-source failures) ──────────
  const allItems: FeedItem[] = [];
  let failedSources = 0;

  for (const source of activeSources) {
    const items = await fetchFeed(source);
    if (items === null) {
      failedSources++;
    } else {
      allItems.push(...items);
    }
  }

  if (failedSources === activeSources.length) {
    console.error('❌ All sources failed — aborting');
    process.exit(1);
  }

  const totalFetched = allItems.length;
  console.log(`\n📊 Total items fetched: ${totalFetched}`);

  if (totalFetched === 0) {
    console.log('ℹ️  No items fetched from any source');
    console.log(`\n=== Summary: fetched=0 deduped=0 scored=0 passed=0 created=0 (dry_run=${CONFIG.dryRun}) ===`);
    return;
  }

  // ── Phase 2: Deduplication ─────────────────────────────────────────────────
  console.log('\n🔍 Fetching existing daily-scout issues for deduplication...');
  const existingBodies = await fetchTrackedIssueBodies();
  console.log(`📋 Found ${existingBodies.length} existing tracked issues`);

  const deduped = allItems.filter((item) => !isAlreadyTracked(item, existingBodies));
  const dedupedCount = totalFetched - deduped.length;
  console.log(`🔁 Deduped: ${dedupedCount} already tracked, ${deduped.length} new items remaining`);

  if (deduped.length === 0) {
    console.log('ℹ️  No new items after deduplication');
    console.log(`\n=== Summary: fetched=${totalFetched} deduped=${deduped.length} scored=0 passed=0 created=0 (dry_run=${CONFIG.dryRun}) ===`);
    return;
  }

  // ── Phase 3: LLM Scoring ───────────────────────────────────────────────────
  const scoreResults = await scoreItemsWithHaiku(deduped);

  // Map scores back to items (index is 1-based from the LLM)
  const scoreMap = new Map<number, ScoreResult>();
  for (const result of scoreResults) {
    scoreMap.set(result.index, result);
  }

  const scoredItems: ScoredItem[] = deduped.map((item, i) => {
    const result = scoreMap.get(i + 1);
    return {
      ...item,
      score: result?.score ?? 0,
      reason: result?.reason ?? 'no score returned',
    };
  });

  const passed = scoredItems
    .filter((item) => item.score >= CONFIG.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.maxIssues);

  console.log(`\n📊 Scoring results:`);
  for (const item of scoredItems) {
    const marker = item.score >= CONFIG.minScore ? '✓' : '✗';
    console.log(`  ${marker} [${item.source}] "${item.title.slice(0, 80)}" → ${item.score}/100`);
  }
  console.log(`\n✅ Passed threshold (>=${CONFIG.minScore}): ${passed.length} items (cap: ${CONFIG.maxIssues})`);

  // ── Phase 4: Issue Creation ────────────────────────────────────────────────
  if (passed.length > 0 && !CONFIG.dryRun) {
    console.log('\n🏷️  Ensuring required labels exist...');
    await ensureLabelExists('automated', 'e4e669', 'Automatically created by a bot');
    await ensureLabelExists('daily-scout', '1d76db', 'Daily feed scout — scored by LLM');
  }

  let createdCount = 0;

  for (const item of passed) {
    const issueTitle = `[scout] ${item.title.slice(0, 120)}`;
    const issueBody = buildIssueBody(item);

    if (CONFIG.dryRun) {
      console.log(`\n[DRY-RUN] would create: "${issueTitle}"`);
      console.log(`  Score: ${item.score}/100 | Reason: ${item.reason}`);
      console.log(`  Link: ${item.link}`);
      createdCount++;
    } else {
      console.log(`\n📝 Creating issue: "${issueTitle}"`);
      const issueUrl = await createGitHubIssue(issueTitle, issueBody);
      if (issueUrl) {
        console.log(`  ✅ Created: ${issueUrl}`);
        createdCount++;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    `\n=== Summary: fetched=${totalFetched} deduped=${deduped.length} scored=${scoredItems.length} passed=${passed.length} created=${createdCount} (dry_run=${CONFIG.dryRun}) ===`,
  );
}

main().catch((error: unknown) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
