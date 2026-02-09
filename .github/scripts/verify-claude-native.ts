#!/usr/bin/env bun
/**
 * Claude Native Verification Script (Reusable)
 *
 * Verifies project compliance with official Claude Code documentation
 * while preserving unique features.
 *
 * Usage:
 *     bun run .github/scripts/verify-claude-native.ts [--dry-run] [--force]
 *
 * Environment Variables:
 *     PROJECT_ROOT: Project root directory (default: current working directory)
 *     ANTHROPIC_API_KEY: Required for Claude API calls
 *     GITHUB_TOKEN: Required for creating GitHub issues
 *     GITHUB_REPOSITORY: Set by GitHub Actions (owner/repo format)
 */

import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';
import path from 'path';
import { readFile, readdir, stat, mkdir, writeFile } from 'fs/promises';
import { Glob } from 'bun';
import { createHash } from 'crypto';

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_CODE_DOCS_BASE = 'https://code.claude.com/docs';
const LLMS_TXT_URL = `${CLAUDE_CODE_DOCS_BASE}/llms.txt`;
const ANTHROPIC_MODELS_URL = 'https://docs.anthropic.com/en/docs/about-claude/models';
const KEY_DOC_PAGES = [
  '/en/skills',
  '/en/sub-agents',
  '/en/hooks',
  '/en/features-overview',
];

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude/agents');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude/skills');
const RULES_DIR = path.join(PROJECT_ROOT, '.claude/rules');
const HASH_FILE = path.join(PROJECT_ROOT, '.claude/claude-native-hash.txt');

const LOCAL_DOCS_DIR = path.join(process.env.HOME || '~', '.claude/references/claude-code');
const LOCAL_DOCS_MAX_AGE_DAYS = 7;

const BAEKGOM_UNIQUE_RULES = ['R000', 'R007', 'R008', 'R009', 'R010', 'R016', 'R017', 'R018'];

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface Frontmatter {
  name?: string;
  description?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  [key: string]: any;
}

interface AgentInfo {
  name: string;
  path: string;
  frontmatter: Frontmatter;
  has_name: boolean;
  has_description: boolean;
  frontmatter_fields: string[];
}

interface SkillInfo {
  name: string;
  path: string;
  frontmatter: Frontmatter;
  has_description: boolean;
  frontmatter_fields: string[];
}

interface RuleInfo {
  name: string;
  path: string;
  rule_id: string | null;
  is_unique: boolean;
}

interface ProjectStructure {
  agents: AgentInfo[];
  skills: SkillInfo[];
  rules: RuleInfo[];
  agent_count: number;
  skill_count: number;
}

interface OfficialDocs {
  llms_txt?: string;
  pages?: Record<string, string>;
  'sub-agents': string;
  skills: string;
  source: 'local' | 'network' | 'unknown';
}

interface ComplianceIssue {
  category: 'agents' | 'skills' | 'hooks';
  description: string;
  severity: 'high' | 'medium' | 'low';
}

interface DocUpdate {
  type: 'new_feature' | 'deprecation' | 'change';
  title: string;
  description: string;
  impact: string;
}

interface UniqueFeaturesStatus {
  parallel_execution: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  orchestrator: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  agent_id: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  tool_id: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  continuous_improvement: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  sync_verify: 'preserved' | 'at_risk' | 'missing' | 'unknown';
  agent_teams: 'preserved' | 'at_risk' | 'missing' | 'unknown';
}

interface Analysis {
  compliance_issues: ComplianceIssue[];
  doc_updates: DocUpdate[];
  recommendations: string[];
  unique_features_status: UniqueFeaturesStatus;
  summary: string;
  raw_response?: string;
}

interface HashCheckResult {
  changed: boolean;
  currentHash: string;
  storedHash: string | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.log(`Warning: Failed to fetch ${url}: ${error}`);
    return '';
  }
}

async function isLocalDocsFresh(): Promise<boolean> {
  const lastUpdatedFile = path.join(LOCAL_DOCS_DIR, 'last-updated.txt');
  try {
    const lastUpdatedStr = await readFile(lastUpdatedFile, 'utf-8');
    const lastUpdated = new Date(lastUpdatedStr.trim().replace('Z', '+00:00'));
    const ageDays = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    return ageDays < LOCAL_DOCS_MAX_AGE_DAYS;
  } catch (error) {
    return false;
  }
}

async function loadLocalDocs(): Promise<OfficialDocs> {
  const docs: OfficialDocs = {
    'sub-agents': '',
    skills: '',
    source: 'local',
  };

  const subAgentsFile = path.join(LOCAL_DOCS_DIR, 'sub-agents.md');
  const skillsFile = path.join(LOCAL_DOCS_DIR, 'skills.md');

  try {
    docs['sub-agents'] = await readFile(subAgentsFile, 'utf-8');
  } catch (error) {
    // File doesn't exist
  }

  try {
    docs.skills = await readFile(skillsFile, 'utf-8');
  } catch (error) {
    // File doesn't exist
  }

  return docs;
}

async function fetchClaudeCodeDocs(): Promise<OfficialDocs> {
  // Check local docs first
  try {
    await stat(LOCAL_DOCS_DIR);
    if (await isLocalDocsFresh()) {
      console.log(`   Using local docs from ${LOCAL_DOCS_DIR}`);
      const localDocs = await loadLocalDocs();
      if (localDocs['sub-agents'] && localDocs.skills) {
        return localDocs;
      }
      console.log('   Local docs incomplete, falling back to network');
    }
  } catch (error) {
    // LOCAL_DOCS_DIR doesn't exist
  }

  console.log('   Fetching from network...');
  const docs: OfficialDocs = {
    llms_txt: await fetchUrl(LLMS_TXT_URL),
    pages: {},
    'sub-agents': '',
    skills: '',
    source: 'network',
  };

  for (const page of KEY_DOC_PAGES) {
    const url = `${CLAUDE_CODE_DOCS_BASE}${page}`;
    const content = await fetchUrl(url);
    if (content) {
      docs.pages![page] = content;
    }
  }

  docs['sub-agents'] = docs.pages!['/en/sub-agents'] || '';
  docs.skills = docs.pages!['/en/skills'] || '';

  return docs;
}

function parseFrontmatter(content: string): [Frontmatter, string] {
  if (!content.startsWith('---')) {
    return [{}, content];
  }

  const parts = content.split('---');
  if (parts.length < 3) {
    return [{}, content];
  }

  try {
    const frontmatter = yaml.load(parts[1]) as Frontmatter;
    const body = parts.slice(2).join('---').trim();
    return [frontmatter || {}, body];
  } catch (error) {
    return [{}, content];
  }
}

// ============================================================================
// Hash Check Functions
// ============================================================================

async function checkDocsHash(): Promise<HashCheckResult> {
  console.log('🔍 Checking documentation hash...');

  // Fetch current documentation content
  const llmsTxt = await fetchUrl(LLMS_TXT_URL);
  const modelsPage = await fetchUrl(ANTHROPIC_MODELS_URL);
  const combinedContent = llmsTxt + modelsPage;

  // Compute current hash
  const currentHash = createHash('sha256').update(combinedContent).digest('hex');

  // Read stored hash if exists
  let storedHash: string | null = null;
  try {
    storedHash = (await readFile(HASH_FILE, 'utf-8')).trim();
  } catch (error) {
    // Hash file doesn't exist yet
    console.log('   No stored hash found (first run)');
  }

  const changed = storedHash !== currentHash;

  if (changed) {
    console.log(`   📝 Documentation changed (or first run)`);
    if (storedHash) {
      console.log(`      Previous: ${storedHash.substring(0, 12)}...`);
    }
    console.log(`      Current:  ${currentHash.substring(0, 12)}...`);
  } else {
    console.log(`   ✅ Documentation unchanged (${currentHash.substring(0, 12)}...)`);
  }

  return {
    changed,
    currentHash,
    storedHash,
  };
}

async function updateStoredHash(hash: string): Promise<void> {
  console.log('💾 Updating stored hash...');
  try {
    // Ensure .claude directory exists
    const claudeDir = path.dirname(HASH_FILE);
    try {
      await mkdir(claudeDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }

    await writeFile(HASH_FILE, hash + '\n', 'utf-8');
    console.log(`   ✅ Hash updated: ${hash.substring(0, 12)}...`);
  } catch (error) {
    console.error(`   ❌ Failed to update hash: ${error}`);
  }
}

// ============================================================================
// Analysis Functions
// ============================================================================

async function analyzeAgents(): Promise<AgentInfo[]> {
  const agents: AgentInfo[] = [];

  try {
    await stat(AGENTS_DIR);
  } catch (error) {
    return agents;
  }

  const glob = new Glob('*.md');
  for await (const file of glob.scan(AGENTS_DIR)) {
    const filePath = path.join(AGENTS_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const [frontmatter, _body] = parseFrontmatter(content);

    agents.push({
      name: path.basename(file, '.md'),
      path: path.relative(PROJECT_ROOT, filePath),
      frontmatter,
      has_name: 'name' in frontmatter,
      has_description: 'description' in frontmatter,
      frontmatter_fields: Object.keys(frontmatter),
    });
  }

  return agents;
}

async function analyzeSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  try {
    await stat(SKILLS_DIR);
  } catch (error) {
    return skills;
  }

  const glob = new Glob('*/SKILL.md');
  for await (const file of glob.scan(SKILLS_DIR)) {
    const filePath = path.join(SKILLS_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const [frontmatter, _body] = parseFrontmatter(content);
    const skillName = path.basename(path.dirname(filePath));

    skills.push({
      name: skillName,
      path: path.relative(PROJECT_ROOT, filePath),
      frontmatter,
      has_description: 'description' in frontmatter,
      frontmatter_fields: Object.keys(frontmatter),
    });
  }

  return skills;
}

async function analyzeRules(): Promise<RuleInfo[]> {
  const rules: RuleInfo[] = [];

  try {
    await stat(RULES_DIR);
  } catch (error) {
    return rules;
  }

  const glob = new Glob('*.md');
  for await (const file of glob.scan(RULES_DIR)) {
    const filePath = path.join(RULES_DIR, file);
    const content = await readFile(filePath, 'utf-8');

    // Try to extract rule ID from filename or content
    const fileNameMatch = file.match(/R(\d{3})/);
    const contentMatch = content.match(/R(\d{3})/);
    const ruleIdMatch = fileNameMatch || contentMatch;
    const ruleId = ruleIdMatch ? `R${ruleIdMatch[1]}` : null;

    rules.push({
      name: path.basename(file, '.md'),
      path: path.relative(PROJECT_ROOT, filePath),
      rule_id: ruleId,
      is_unique: ruleId ? BAEKGOM_UNIQUE_RULES.includes(ruleId) : false,
    });
  }

  return rules;
}

async function analyzeProjectStructure(): Promise<ProjectStructure> {
  const agents = await analyzeAgents();
  const skills = await analyzeSkills();
  const rules = await analyzeRules();

  return {
    agents,
    skills,
    rules,
    agent_count: agents.length,
    skill_count: skills.length,
  };
}

// ============================================================================
// Claude Analysis
// ============================================================================

function extractFrontmatterSpec(docContent: string, docType: string): string {
  const lines = docContent.split('\n');
  const tableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('| `name`')) {
      inTable = true;
      if (i > 0) {
        tableLines.push(lines[i - 1]);
      }
      tableLines.push(line);
      continue;
    } else if (inTable) {
      if (line.trim().startsWith('|')) {
        tableLines.push(line);
      } else {
        break;
      }
    }
  }

  if (tableLines.length > 0) {
    return tableLines.join('\n');
  }

  return `(No frontmatter specification table found for ${docType})`;
}

async function callClaudeForAnalysis(
  officialDocs: OfficialDocs,
  projectStructure: ProjectStructure
): Promise<Analysis> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const agentsSpec = extractFrontmatterSpec(officialDocs['sub-agents'], 'sub-agents');
  const skillsSpec = extractFrontmatterSpec(officialDocs.skills, 'skills');
  const docsSource = officialDocs.source;

  const prompt = `You are a Claude Code expert. Analyze the following and provide a JSON response.

## Task
Compare project structure against official Claude Code documentation.

## Official Documentation Source
Documentation source: ${docsSource}

### Official Sub-agent (.claude/agents/<name>.md) Frontmatter Specification
${agentsSpec}

### Official Skill (.claude/skills/<name>/SKILL.md) Frontmatter Specification
${skillsSpec}

## Current Project Structure

### Agents (${projectStructure.agent_count} total)
${JSON.stringify(projectStructure.agents, null, 2)}

### Skills (${projectStructure.skill_count} total)
${JSON.stringify(projectStructure.skills, null, 2)}

### Unique Rules
${JSON.stringify(projectStructure.rules.filter((r) => r.is_unique), null, 2)}

## Analysis Required

1. **Compliance Issues**: Check if agent/skill files follow official format
2. **Field Validation**: Are frontmatter fields valid per official spec?
3. **Documentation Updates**: Any new features in official docs we should adopt?
4. **Unique Features**: Verify project unique rules are preserved

## Response Format (JSON only)

{
    "compliance_issues": [
        {"category": "agents|skills|hooks", "description": "...", "severity": "high|medium|low"}
    ],
    "doc_updates": [
        {"type": "new_feature|deprecation|change", "title": "...", "description": "...", "impact": "..."}
    ],
    "recommendations": ["..."],
    "unique_features_status": {
        "parallel_execution": "preserved|at_risk|missing",
        "orchestrator": "preserved|at_risk|missing",
        "agent_id": "preserved|at_risk|missing",
        "tool_id": "preserved|at_risk|missing",
        "continuous_improvement": "preserved|at_risk|missing",
        "sync_verify": "preserved|at_risk|missing",
        "agent_teams": "preserved|at_risk|missing"
    },
    "summary": "Brief overall assessment"
}

Respond with ONLY valid JSON, no markdown formatting.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  let responseText = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    // Try to extract JSON from markdown code blocks
    if (responseText.includes('```json')) {
      const jsonMatch = responseText.match(/```json\s*(.*?)\s*```/s);
      if (jsonMatch) {
        responseText = jsonMatch[1];
      }
    } else if (responseText.includes('```')) {
      const jsonMatch = responseText.match(/```\s*(.*?)\s*```/s);
      if (jsonMatch) {
        responseText = jsonMatch[1];
      }
    }

    return JSON.parse(responseText) as Analysis;
  } catch (error) {
    console.log(`Warning: Failed to parse Claude response as JSON: ${error}`);
    return {
      compliance_issues: [],
      doc_updates: [],
      recommendations: [],
      unique_features_status: {
        parallel_execution: 'unknown',
        orchestrator: 'unknown',
        agent_id: 'unknown',
        tool_id: 'unknown',
        continuous_improvement: 'unknown',
        sync_verify: 'unknown',
        agent_teams: 'unknown',
      },
      summary: `Analysis failed: ${error}`,
      raw_response: responseText,
    };
  }
}

// ============================================================================
// GitHub Issue Creation
// ============================================================================

async function createGithubIssue(analysis: Analysis, dryRun: boolean = false): Promise<void> {
  const kstOffset = 9 * 60; // KST = UTC+9
  const now = new Date();
  const kstDate = new Date(now.getTime() + kstOffset * 60 * 1000);
  const dateStr = kstDate
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' KST');

  const hasIssues = analysis.compliance_issues.length > 0 || analysis.doc_updates.length > 0;
  const status = hasIssues ? '⚠️ Issues Found' : '✅ All Checks Passed';

  const bodyParts: string[] = [];

  // Header
  bodyParts.push(`# ${status}`);
  bodyParts.push('');
  bodyParts.push(`**Verification Date**: ${dateStr}`);
  bodyParts.push('');
  bodyParts.push('## Summary');
  bodyParts.push('');
  bodyParts.push(analysis.summary);
  bodyParts.push('');

  // Compliance Issues
  if (analysis.compliance_issues.length > 0) {
    bodyParts.push('## 🔴 Compliance Issues');
    bodyParts.push('');

    const issuesByCategory = analysis.compliance_issues.reduce(
      (acc, issue) => {
        if (!acc[issue.category]) {
          acc[issue.category] = [];
        }
        acc[issue.category].push(issue);
        return acc;
      },
      {} as Record<string, ComplianceIssue[]>
    );

    for (const [category, issues] of Object.entries(issuesByCategory)) {
      bodyParts.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      bodyParts.push('');

      for (const issue of issues) {
        const severityEmoji = {
          high: '🔴',
          medium: '🟡',
          low: '🟢',
        }[issue.severity];
        bodyParts.push(`- ${severityEmoji} **${issue.severity.toUpperCase()}**: ${issue.description}`);
      }
      bodyParts.push('');
    }
  }

  // Documentation Updates
  if (analysis.doc_updates.length > 0) {
    bodyParts.push('## 📚 Documentation Updates');
    bodyParts.push('');

    for (const update of analysis.doc_updates) {
      const typeEmoji = {
        new_feature: '✨',
        deprecation: '⚠️',
        change: '🔄',
      }[update.type];
      bodyParts.push(`### ${typeEmoji} ${update.title}`);
      bodyParts.push('');
      bodyParts.push(`**Type**: ${update.type}`);
      bodyParts.push('');
      bodyParts.push(`**Description**: ${update.description}`);
      bodyParts.push('');
      bodyParts.push(`**Impact**: ${update.impact}`);
      bodyParts.push('');
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    bodyParts.push('## 💡 Recommendations');
    bodyParts.push('');
    for (const rec of analysis.recommendations) {
      bodyParts.push(`- ${rec}`);
    }
    bodyParts.push('');
  }

  // Unique Features Status
  bodyParts.push('## 🔒 Unique Features Status');
  bodyParts.push('');
  bodyParts.push('| Feature | Status |');
  bodyParts.push('|---------|--------|');

  const featureLabels: Record<keyof UniqueFeaturesStatus, string> = {
    parallel_execution: 'R009: Parallel Execution',
    orchestrator: 'R010: Orchestrator Coordination',
    agent_id: 'R007: Agent Identification',
    tool_id: 'R008: Tool Identification',
    continuous_improvement: 'R016: Continuous Improvement',
    sync_verify: 'R017: Sync Verification',
    agent_teams: 'R018: Agent Teams',
  };

  const statusEmoji: Record<string, string> = {
    preserved: '✅',
    at_risk: '⚠️',
    missing: '❌',
    unknown: '❓',
  };

  for (const [key, label] of Object.entries(featureLabels)) {
    const status = analysis.unique_features_status[key as keyof UniqueFeaturesStatus];
    const emoji = statusEmoji[status] || '❓';
    bodyParts.push(`| ${label} | ${emoji} ${status} |`);
  }
  bodyParts.push('');

  // Footer
  bodyParts.push('---');
  bodyParts.push('');
  bodyParts.push('*This issue was automatically generated by `verify-claude-native.ts`*');

  const issueBody = bodyParts.join('\n');

  if (dryRun) {
    console.log('\n📝 DRY RUN: Would create GitHub issue with the following content:\n');
    console.log('Title:', 'Claude Code Compliance Check');
    console.log('\nBody:\n');
    console.log(issueBody);
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPOSITORY;

  if (!githubToken || !githubRepo) {
    console.log('\n⚠️  GITHUB_TOKEN or GITHUB_REPOSITORY not set. Skipping issue creation.');
    console.log('\nIssue content:\n');
    console.log(issueBody);
    return;
  }

  try {
    const [owner, repo] = githubRepo.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: 'Claude Code Compliance Check',
        body: issueBody,
        labels: ['documentation', 'verification', 'automated'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const issue = (await response.json()) as { html_url: string; number: number };
    console.log(`\n✅ GitHub issue created: ${issue.html_url}`);
  } catch (error) {
    console.error(`\n❌ Failed to create GitHub issue: ${error}`);
    console.log('\nIssue content:\n');
    console.log(issueBody);
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  console.log('🔍 Claude Native Verification');
  console.log(`   Project root: ${PROJECT_ROOT}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  // Step 1: Hash check (cheap, no API calls)
  const hashResult = await checkDocsHash();

  // Step 2: Decide whether to run full analysis
  if (!hashResult.changed && !force) {
    console.log('\n✅ No documentation changes detected. Skipping analysis.');
    console.log('   (Use --force to run analysis anyway)');
    process.exit(0);
  }

  if (force) {
    console.log('\n⚡ --force flag detected. Running analysis regardless of hash.');
  }

  // Step 3: Run full analysis
  console.log('\n📚 Fetching official Claude Code documentation...');
  const officialDocs = await fetchClaudeCodeDocs();

  console.log('\n🔎 Analyzing project structure...');
  const projectStructure = await analyzeProjectStructure();

  console.log('\n🤖 Calling Claude API for analysis...');
  const analysis = await callClaudeForAnalysis(officialDocs, projectStructure);

  const hasFindings =
    analysis.compliance_issues.length > 0 ||
    analysis.doc_updates.length > 0 ||
    analysis.recommendations.length > 0;

  // Step 4: Create GitHub issue if findings
  if (hasFindings) {
    await createGithubIssue(analysis, dryRun);
  } else {
    console.log('\n✅ All checks passed');
  }

  // Step 5: Update stored hash after successful analysis
  if (!dryRun) {
    await updateStoredHash(hashResult.currentHash);
  } else {
    console.log('\n📝 DRY RUN: Skipping hash update');
  }
}

// Run main function
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
