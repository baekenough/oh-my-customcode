import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SessionStats {
	today: number;
	thisWeek: number;
	thisMonth: number;
}

export interface AgentInvocation {
	agentType: string;
	count: number;
	successRate: number;
	lastUsed: string;
}

export interface SkillInvocation {
	skill: string;
	count: number;
}

export interface AnalyticsData {
	sessions: SessionStats;
	agentInvocations: AgentInvocation[];
	skillInvocations: SkillInvocation[];
	totalInvocations: number;
	successRate: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TaskOutcomeRecord {
	timestamp: string;
	agent_type: string;
	model: string;
	outcome: string;
	pattern_used: string;
	skill: string;
	description: string;
	error_summary: string;
}

interface AgentAccumulator {
	count: number;
	successCount: number;
	lastUsed: string;
}

// ---------------------------------------------------------------------------
// JSONL file discovery — /tmp/.claude-task-outcomes-<PPID>
// ---------------------------------------------------------------------------

async function findOutcomeFiles(): Promise<string[]> {
	try {
		const entries = await readdir('/tmp');
		return entries
			.filter((e) => e.startsWith('.claude-task-outcomes-'))
			.map((e) => join('/tmp', e));
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

function parseRecord(line: string): TaskOutcomeRecord | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		const r = parsed as Record<string, unknown>;
		return {
			timestamp: typeof r.timestamp === 'string' ? r.timestamp : '',
			agent_type: typeof r.agent_type === 'string' ? r.agent_type : '',
			model: typeof r.model === 'string' ? r.model : '',
			outcome: typeof r.outcome === 'string' ? r.outcome : '',
			pattern_used: typeof r.pattern_used === 'string' ? r.pattern_used : '',
			skill: typeof r.skill === 'string' ? r.skill : '',
			description: typeof r.description === 'string' ? r.description : '',
			error_summary: typeof r.error_summary === 'string' ? r.error_summary : ''
		};
	} catch {
		return null;
	}
}

async function readOutcomeFile(filePath: string): Promise<TaskOutcomeRecord[]> {
	try {
		const content = await readFile(filePath, 'utf-8');
		return content
			.split('\n')
			.map(parseRecord)
			.filter((r): r is TaskOutcomeRecord => r !== null);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Date window helpers
// ---------------------------------------------------------------------------

interface DateWindows {
	todayStart: Date;
	weekStart: Date;
	monthStart: Date;
}

function getDateWindows(): DateWindows {
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekStart = new Date(todayStart);
	weekStart.setDate(weekStart.getDate() - 7);
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	return { todayStart, weekStart, monthStart };
}

// ---------------------------------------------------------------------------
// MEMORY.md Metrics table parsing
// Format: | Agent Type | Tasks | Success Rate | Avg Model | Last Used |
// ---------------------------------------------------------------------------

interface MemoryMetricRow {
	agentType: string;
	count: number;
	successRate: number;
	lastUsed: string;
}

function parseMetricsTable(content: string): MemoryMetricRow[] {
	const metricsMatch = content.match(/^## Metrics.*$([\s\S]*?)(?=^## |\s*$)/m);
	if (!metricsMatch) return [];

	const rows: MemoryMetricRow[] = [];
	const tableLines = metricsMatch[1].split('\n');

	for (const line of tableLines) {
		// Match table data rows: | agent-type | 12 | 92% | sonnet | 2026-03-15 |
		const cellMatch = line.match(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)%?\s*\|/);
		if (!cellMatch) continue;

		const agentType = cellMatch[1].trim();
		// Skip header and separator rows
		if (agentType === 'Agent Type' || agentType.startsWith('-') || agentType.startsWith('=')) continue;

		const count = parseInt(cellMatch[2], 10);
		const successRateRaw = parseFloat(cellMatch[3]);
		// Handle both "92" (percent) and "0.92" (ratio)
		const successRate = successRateRaw > 1 ? successRateRaw / 100 : successRateRaw;

		// Extract last used date from last column if present
		const lastUsedMatch = line.match(/\|\s*(\d{4}-\d{2}-\d{2})\s*\|?\s*$/);
		const lastUsed = lastUsedMatch ? lastUsedMatch[1] : '';

		if (agentType && !isNaN(count) && !isNaN(successRate)) {
			rows.push({ agentType, count, successRate, lastUsed });
		}
	}

	return rows;
}

async function readMemoryMetrics(root: string): Promise<MemoryMetricRow[]> {
	const memoryBaseDir = join(root, '.claude', 'agent-memory');
	let agentDirs: string[];
	try {
		agentDirs = await readdir(memoryBaseDir);
	} catch {
		return [];
	}

	const allRows: MemoryMetricRow[] = [];
	for (const agentDir of agentDirs) {
		const memoryPath = join(memoryBaseDir, agentDir, 'MEMORY.md');
		try {
			const content = await readFile(memoryPath, 'utf-8');
			const rows = parseMetricsTable(content);
			allRows.push(...rows);
		} catch {
			// No MEMORY.md or unreadable — skip
		}
	}

	return allRows;
}

// ---------------------------------------------------------------------------
// Aggregation from JSONL records
// ---------------------------------------------------------------------------

interface JsonlAggregation {
	sessions: SessionStats;
	agentMap: Map<string, AgentAccumulator>;
	skillMap: Map<string, number>;
	totalInvocations: number;
	totalSuccess: number;
}

async function aggregateFromJsonl(): Promise<JsonlAggregation> {
	const files = await findOutcomeFiles();
	const { todayStart, weekStart, monthStart } = getDateWindows();

	const sessions: SessionStats = { today: 0, thisWeek: 0, thisMonth: 0 };
	const agentMap = new Map<string, AgentAccumulator>();
	const skillMap = new Map<string, number>();
	let totalInvocations = 0;
	let totalSuccess = 0;

	for (const file of files) {
		const records = await readOutcomeFile(file);
		if (records.length === 0) continue;

		// Each file = one session; use earliest timestamp for date bucketing
		const earliest = records.reduce(
			(min, r) => (r.timestamp < min ? r.timestamp : min),
			records[0].timestamp
		);
		const sessionDate = new Date(earliest);
		if (!isNaN(sessionDate.getTime())) {
			if (sessionDate >= todayStart) sessions.today++;
			if (sessionDate >= weekStart) sessions.thisWeek++;
			if (sessionDate >= monthStart) sessions.thisMonth++;
		}

		for (const record of records) {
			totalInvocations++;
			const isSuccess = record.outcome === 'success';
			if (isSuccess) totalSuccess++;

			// Agent accumulation
			if (record.agent_type && record.agent_type !== 'unknown') {
				const existing = agentMap.get(record.agent_type);
				if (existing) {
					existing.count++;
					if (isSuccess) existing.successCount++;
					if (record.timestamp > existing.lastUsed) existing.lastUsed = record.timestamp;
				} else {
					agentMap.set(record.agent_type, {
						count: 1,
						successCount: isSuccess ? 1 : 0,
						lastUsed: record.timestamp
					});
				}
			}

			// Skill accumulation
			if (record.skill) {
				skillMap.set(record.skill, (skillMap.get(record.skill) ?? 0) + 1);
			}
		}
	}

	return { sessions, agentMap, skillMap, totalInvocations, totalSuccess };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function getAnalytics(root: string): Promise<AnalyticsData> {
	try {
		const jsonl = await aggregateFromJsonl();

		let agentInvocations: AgentInvocation[];
		let skillInvocations: SkillInvocation[];
		let totalInvocations: number;
		let successRate: number;
		const sessions = jsonl.sessions;

		if (jsonl.totalInvocations > 0) {
			// Live JSONL data available — use as primary source
			agentInvocations = Array.from(jsonl.agentMap.entries())
				.map(([agentType, acc]): AgentInvocation => ({
					agentType,
					count: acc.count,
					successRate: acc.count > 0 ? acc.successCount / acc.count : 0,
					lastUsed: acc.lastUsed
				}))
				.sort((a, b) => b.count - a.count);

			skillInvocations = Array.from(jsonl.skillMap.entries())
				.map(([skill, count]): SkillInvocation => ({ skill, count }))
				.sort((a, b) => b.count - a.count);

			totalInvocations = jsonl.totalInvocations;
			successRate = jsonl.totalSuccess / jsonl.totalInvocations;
		} else {
			// Fallback to MEMORY.md metrics written by sys-memory-keeper
			const memoryRows = await readMemoryMetrics(root);

			agentInvocations = memoryRows
				.map((row): AgentInvocation => ({
					agentType: row.agentType,
					count: row.count,
					successRate: row.successRate,
					lastUsed: row.lastUsed
				}))
				.sort((a, b) => b.count - a.count);

			skillInvocations = [];

			totalInvocations = memoryRows.reduce((sum, r) => sum + r.count, 0);
			const totalSuccessFromMemory = memoryRows.reduce(
				(sum, r) => sum + Math.round(r.count * r.successRate),
				0
			);
			successRate = totalInvocations > 0 ? totalSuccessFromMemory / totalInvocations : 0;
		}

		return { sessions, agentInvocations, skillInvocations, totalInvocations, successRate };
	} catch {
		return emptyAnalytics();
	}
}

function emptyAnalytics(): AnalyticsData {
	return {
		sessions: { today: 0, thisWeek: 0, thisMonth: 0 },
		agentInvocations: [],
		skillInvocations: [],
		totalInvocations: 0,
		successRate: 0
	};
}
