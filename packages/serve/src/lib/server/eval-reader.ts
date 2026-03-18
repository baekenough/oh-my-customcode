import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '~';
const EVAL_DIR = join(HOME, '.omcustom', 'evaluations');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Evaluation {
	id: string;
	sessionId: string;
	turnId?: string;
	score: number; // 1-5
	verdict: string; // pass | fail | needs_refinement
	tags: string[];
	comment: string;
	evaluatedAt: string;
}

export interface SessionSummary {
	sessionId: string;
	startedAt: string;
	agentCount: number;
	evaluationCount: number;
	avgScore: number | null;
}

export interface TaskOutcome {
	agent_type?: string;
	outcome?: string;
	model?: string;
	timestamp?: string;
	session_id?: string;
}

// ---------------------------------------------------------------------------
// Evaluations — JSON file per evaluation in ~/.omcustom/evaluations/
// ---------------------------------------------------------------------------

async function ensureEvalDir(): Promise<void> {
	try {
		await mkdir(EVAL_DIR, { recursive: true });
	} catch {
		// already exists or unwritable — ignore
	}
}

export async function getEvaluations(): Promise<Evaluation[]> {
	await ensureEvalDir();

	let files: string[];
	try {
		files = await readdir(EVAL_DIR);
	} catch {
		return [];
	}

	const evaluations: Evaluation[] = [];
	for (const file of files) {
		if (!file.endsWith('.json')) continue;
		try {
			const content = await readFile(join(EVAL_DIR, file), 'utf-8');
			const parsed = JSON.parse(content) as Evaluation;
			evaluations.push(parsed);
		} catch {
			// Skip malformed files
		}
	}

	// Sort newest first
	return evaluations.sort(
		(a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
	);
}

export async function getEvaluation(id: string): Promise<Evaluation | null> {
	// Sanitize id — no path traversal
	const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '');
	const filePath = join(EVAL_DIR, `${safeId}.json`);
	try {
		const content = await readFile(filePath, 'utf-8');
		return JSON.parse(content) as Evaluation;
	} catch {
		return null;
	}
}

export async function saveEvaluation(
	data: Omit<Evaluation, 'id'>
): Promise<Evaluation> {
	await ensureEvalDir();
	const id = randomUUID();
	const evaluation: Evaluation = { id, ...data };
	const filePath = join(EVAL_DIR, `${id}.json`);
	await writeFile(filePath, JSON.stringify(evaluation, null, 2), 'utf-8');
	return evaluation;
}

// ---------------------------------------------------------------------------
// Session summaries — derived from /tmp/.claude-task-outcomes-* JSONL files
// ---------------------------------------------------------------------------

function readTaskOutcomesSync(): TaskOutcome[] {
	const outcomes: TaskOutcome[] = [];
	try {
		// Find all JSONL files matching the pattern
		const tmpDir = '/tmp';
		let tmpFiles: string[];
		try {
			tmpFiles = readdirSync(tmpDir);
		} catch {
			return outcomes;
		}

		const matchingFiles = tmpFiles.filter((f) => f.startsWith('.claude-task-outcomes-'));

		for (const file of matchingFiles) {
			try {
				const content = readFileSync(join(tmpDir, file), 'utf-8');
				for (const line of content.split('\n')) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						outcomes.push(JSON.parse(trimmed) as TaskOutcome);
					} catch {
						// Skip malformed lines
					}
				}
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// Return empty on any error
	}
	return outcomes;
}

export async function getSessionSummaries(): Promise<SessionSummary[]> {
	const outcomes = readTaskOutcomesSync();
	const evaluations = await getEvaluations();

	// Group outcomes by session_id
	const sessionMap = new Map<string, TaskOutcome[]>();
	for (const outcome of outcomes) {
		const sid = outcome.session_id ?? 'unknown';
		if (!sessionMap.has(sid)) sessionMap.set(sid, []);
		sessionMap.get(sid)!.push(outcome);
	}

	// Build evaluation index by sessionId
	const evalsBySession = new Map<string, Evaluation[]>();
	for (const ev of evaluations) {
		if (!evalsBySession.has(ev.sessionId)) evalsBySession.set(ev.sessionId, []);
		evalsBySession.get(ev.sessionId)!.push(ev);
	}

	// Include sessions that have evaluations but no JSONL data
	for (const ev of evaluations) {
		if (!sessionMap.has(ev.sessionId)) {
			sessionMap.set(ev.sessionId, []);
		}
	}

	const summaries: SessionSummary[] = [];
	for (const [sessionId, sessionOutcomes] of sessionMap) {
		const timestamps = sessionOutcomes
			.map((o) => o.timestamp)
			.filter(Boolean)
			.sort() as string[];
		const startedAt = timestamps[0] ?? new Date().toISOString();
		const sessionEvals = evalsBySession.get(sessionId) ?? [];
		const scores = sessionEvals.map((e) => e.score).filter((s) => s >= 1 && s <= 5);
		const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

		summaries.push({
			sessionId,
			startedAt,
			agentCount: sessionOutcomes.length,
			evaluationCount: sessionEvals.length,
			avgScore
		});
	}

	// Sort by startedAt descending (most recent first)
	return summaries
		.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
		.slice(0, 20); // Show latest 20 sessions
}
