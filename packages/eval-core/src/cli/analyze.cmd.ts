import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  getImprovementSuggestions,
  getRoutingMissPatterns,
  saveImprovementActions,
  type ImprovementSuggestion,
  type RoutingMissPattern,
} from '../query/feedback.js';
import { getDefaultConfig } from '../types/config.js';

interface AnalyzeCliOptions {
  since?: string;
  minSessions?: string;
  format?: 'table' | 'json' | 'markdown';
  dbPath?: string;
  save?: boolean;
}

interface ImprovementRule {
  name: string;
  pattern: string;
  min_sessions: number;
  actions: Array<{ type: string; description: string }>;
  confidence: 'low' | 'medium' | 'high';
}

interface ImprovementRulesFile {
  rules: ImprovementRule[];
}

function loadImprovementRules(): ImprovementRulesFile | null {
  // Look for improvement-rules.yml relative to the package root
  const candidates = [
    join(import.meta.dir, '../../improvement-rules.yml'),
    join(process.cwd(), 'improvement-rules.yml'),
  ];

  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, 'utf-8');
      return parseYaml(content);
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Minimal YAML parser for the improvement-rules.yml format.
 * Handles the specific structure used in improvement-rules.yml without
 * requiring an external YAML dependency.
 */
function parseYaml(content: string): ImprovementRulesFile {
  const rules: ImprovementRule[] = [];
  let currentRule: Partial<ImprovementRule> | null = null;
  let inActions = false;
  let currentAction: { type?: string; description?: string } | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level "rules:" key
    if (trimmed === 'rules:') {
      inActions = false;
      continue;
    }

    // New rule entry (starts with "  - name:")
    const ruleNameMatch = line.match(/^  - name:\s*(.+)$/);
    if (ruleNameMatch) {
      if (currentRule) {
        if (currentAction && currentRule.actions) {
          currentRule.actions.push(currentAction as { type: string; description: string });
        }
        rules.push(currentRule as ImprovementRule);
      }
      currentRule = { name: ruleNameMatch[1].trim(), actions: [] };
      inActions = false;
      currentAction = null;
      continue;
    }

    if (!currentRule) continue;

    // Rule-level fields
    const patternMatch = line.match(/^    pattern:\s*"(.+)"$/);
    if (patternMatch) {
      currentRule.pattern = patternMatch[1];
      continue;
    }

    const minSessionsMatch = line.match(/^    min_sessions:\s*(\d+)$/);
    if (minSessionsMatch) {
      currentRule.min_sessions = parseInt(minSessionsMatch[1], 10);
      continue;
    }

    const confidenceMatch = line.match(/^    confidence:\s*(\w+)$/);
    if (confidenceMatch) {
      currentRule.confidence = confidenceMatch[1] as 'low' | 'medium' | 'high';
      continue;
    }

    // "actions:" section start
    if (trimmed === 'actions:') {
      inActions = true;
      continue;
    }

    if (inActions) {
      // New action entry
      const actionTypeMatch = line.match(/^      - type:\s*(.+)$/);
      if (actionTypeMatch) {
        if (currentAction && currentRule.actions) {
          currentRule.actions.push(currentAction as { type: string; description: string });
        }
        currentAction = { type: actionTypeMatch[1].trim() };
        continue;
      }

      const actionDescMatch = line.match(/^        description:\s*"(.+)"$/);
      if (actionDescMatch && currentAction) {
        currentAction.description = actionDescMatch[1];
        continue;
      }
    }
  }

  // Flush last rule/action
  if (currentRule) {
    if (currentAction && currentRule.actions) {
      currentRule.actions.push(currentAction as { type: string; description: string });
    }
    rules.push(currentRule as ImprovementRule);
  }

  return { rules };
}

function countUserFeedbackSuggestions(suggestions: ImprovementSuggestion[]): number {
  return suggestions.filter((s) => s.evidence.metric === 'user_feedback').length;
}

function formatTable(suggestions: ImprovementSuggestion[], routingMiss: RoutingMissPattern): string {
  const lines: string[] = ['Improvement Suggestions', '='.repeat(80), ''];
  const userFeedbackCount = countUserFeedbackSuggestions(suggestions);
  if (userFeedbackCount > 0) {
    lines.push(`User feedback issues included: ${userFeedbackCount}`, '');
  }

  if (suggestions.length === 0) {
    lines.push('No improvement suggestions found (insufficient data or all metrics within thresholds).');
  } else {
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      lines.push(
        `[${i + 1}] ${s.target} (${s.targetType}) — ${s.actionType.toUpperCase()}`,
        `    Confidence: ${s.confidence.toUpperCase()}`,
        `    ${s.description}`,
        `    Evidence: ${s.evidence.metric}=${(s.evidence.value * 100).toFixed(1)}% (threshold: ${(s.evidence.threshold * 100).toFixed(0)}%, n=${s.evidence.sessionCount})`,
        ''
      );
    }
    lines.push(`Total: ${suggestions.length} suggestion(s)`);
  }

  lines.push('', 'Routing Miss Analysis', '─'.repeat(40));
  lines.push(`Total invocations: ${routingMiss.totalInvocations}`);
  lines.push(`General-purpose fallbacks: ${routingMiss.generalPurposeCount}`);
  lines.push(`Explore fallbacks: ${routingMiss.exploreCount}`);
  lines.push(`Miss rate: ${(routingMiss.missRate * 100).toFixed(1)}%`);
  if (routingMiss.recentMisses.length > 0) {
    lines.push('Recent misses (latest 5):');
    for (const miss of routingMiss.recentMisses) {
      lines.push(`  [${miss.agentType}] ${miss.description || '(no description)'}`);
    }
  }

  return lines.join('\n');
}

function formatMarkdown(suggestions: ImprovementSuggestion[], routingMiss: RoutingMissPattern): string {
  const userFeedbackCount = countUserFeedbackSuggestions(suggestions);
  const lines: string[] = [
    '# Improvement Suggestions',
    '',
    `Generated: ${new Date().toISOString()}`,
    ...(userFeedbackCount > 0 ? [`User feedback issues included: ${userFeedbackCount}`, ''] : ['']),
  ];

  if (suggestions.length === 0) {
    lines.push('> No improvement suggestions found.', '');
  } else {
    lines.push(
      '| # | Target | Type | Action | Confidence | Evidence |',
      '|---|--------|------|--------|------------|---------|'
    );

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const evidenceStr = `${s.evidence.metric}=${(s.evidence.value * 100).toFixed(1)}% (n=${s.evidence.sessionCount})`;
      lines.push(
        `| ${i + 1} | \`${s.target}\` | ${s.targetType} | ${s.actionType} | **${s.confidence}** | ${evidenceStr} |`
      );
    }

    lines.push('', '## Details', '');
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      lines.push(
        `### ${i + 1}. ${s.target}`,
        '',
        `**Action**: ${s.actionType}  `,
        `**Confidence**: ${s.confidence}  `,
        '',
        s.description,
        ''
      );
    }
  }

  lines.push('## Routing Miss Analysis', '');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total invocations | ${routingMiss.totalInvocations} |`);
  lines.push(`| General-purpose fallbacks | ${routingMiss.generalPurposeCount} |`);
  lines.push(`| Explore fallbacks | ${routingMiss.exploreCount} |`);
  lines.push(`| Miss rate | ${(routingMiss.missRate * 100).toFixed(1)}% |`);

  if (routingMiss.recentMisses.length > 0) {
    lines.push('', '### Recent Misses', '');
    lines.push('| Agent Type | Description |');
    lines.push('|------------|-------------|');
    for (const miss of routingMiss.recentMisses) {
      lines.push(`| \`${miss.agentType}\` | ${miss.description || '(no description)'} |`);
    }
  }

  return lines.join('\n');
}

export const analyzeCommand = new Command('analyze')
  .description('Analyze session feedback and generate improvement suggestions')
  .option('--since <date>', 'Analyze data since this date (ISO 8601)')
  .option('--min-sessions <n>', 'Minimum sessions required to generate suggestions', '5')
  .option('--format <format>', 'Output format: table | json | markdown', 'table')
  .option('--db-path <path>', 'Database file path')
  .option('--save', 'Save suggestions to improvement_actions table')
  .action(async (options: AnalyzeCliOptions) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    const minSessions = parseInt(options.minSessions ?? '5', 10);
    if (Number.isNaN(minSessions) || minSessions < 1) {
      console.error('Error: --min-sessions must be a positive integer');
      process.exit(1);
    }
    const format = options.format ?? 'table';

    // Auto-migrate to ensure improvement_actions table exists
    runMigrations(dbPath);

    const db = createDb(dbPath);

    // Load and display rules if available
    const rulesFile = loadImprovementRules();
    if (rulesFile && format !== 'json') {
      console.log(
        `Loaded ${rulesFile.rules.length} improvement rule(s) from improvement-rules.yml`
      );
    }

    const [suggestions, routingMiss] = await Promise.all([
      getImprovementSuggestions(db, { since: options.since, minSessions }),
      getRoutingMissPatterns(db, { since: options.since }),
    ]);

    if (format === 'json') {
      const userFeedbackCount = countUserFeedbackSuggestions(suggestions);
      console.log(JSON.stringify({ suggestions, routingMiss, rules: rulesFile?.rules ?? [], userFeedbackCount }, null, 2));
    } else if (format === 'markdown') {
      console.log(formatMarkdown(suggestions, routingMiss));
    } else {
      console.log(formatTable(suggestions, routingMiss));
    }

    if (options.save && suggestions.length > 0) {
      await saveImprovementActions(db, suggestions);
      console.log(`\nSaved ${suggestions.length} suggestion(s) to improvement_actions table.`);
    }
  });
