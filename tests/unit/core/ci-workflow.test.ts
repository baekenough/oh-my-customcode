/**
 * Tests for the CI GitHub Actions workflow (.github/workflows/ci.yml).
 *
 * These tests validate workflow structure, logic correctness, and the PR-merge
 * duplicate-CI-skip gate by parsing the YAML directly — no actual GitHub Actions
 * runner required.
 *
 * Background (#1550): ci.yml runs on both `pull_request` and `push` (develop),
 * causing a PR merge to trigger CI twice (once on the PR, once again on the
 * resulting merge commit pushed to develop). A `merge_commit` detection gate was
 * added to `changes` job to skip the redundant push-triggered run — but ONLY when
 * the push is a genuine PR-merge commit. This file guards the hard constraint that
 * motivated the gate: feature commits pushed directly to develop must NEVER be
 * skipped, and no job may end up permanently "skipped" for required status checks
 * (which would leave branch protection stuck pending forever).
 */

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const CI_WORKFLOW = resolve(import.meta.dir, '../../../.github/workflows/ci.yml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readWorkflow(): Promise<string> {
  return readFile(CI_WORKFLOW, 'utf-8');
}

interface WorkflowStep {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
}

interface WorkflowJob {
  if?: string;
  outputs?: Record<string, string>;
  steps?: WorkflowStep[];
}

async function loadJobs(): Promise<Record<string, WorkflowJob>> {
  const doc = parse(await readWorkflow()) as { jobs: Record<string, WorkflowJob> };
  return doc.jobs;
}

const RUN_GATE = "needs.changes.outputs.merge_commit != 'true'";
const SKIP_GATE = "needs.changes.outputs.merge_commit == 'true'";
const PR_ONLY_RUN_GATE = `github.event_name == 'pull_request' && ${RUN_GATE}`;
const PR_ONLY_SKIP_GATE = `github.event_name != 'pull_request' || ${SKIP_GATE}`;

interface JobGateSpec {
  /** The step that does the job's real work: required by name, on the exact run gate, with this `run` fragment. */
  keyStep: string;
  keyRun: string;
  noticeName: string;
  skipGate: string;
  runGate: string;
}

const MERGE_NOTICE = 'PR-merge skip notice';
const mergeGated = (keyStep: string, keyRun: string): JobGateSpec => ({
  keyStep,
  keyRun,
  noticeName: MERGE_NOTICE,
  skipGate: SKIP_GATE,
  runGate: RUN_GATE,
});

/**
 * Every job except `changes` (the job that computes merge_commit), each gated on merge_commit.
 * `retired-paths-fresh` additionally runs on pull requests only. Adding a job to ci.yml without
 * listing it here fails the completeness assertion below.
 */
const MERGE_GATED_JOBS: Record<string, JobGateSpec> = {
  'lockfile-sync': mergeGated('Verify lockfile consistency', 'bun install --frozen-lockfile'),
  lint: mergeGated('Run Biome lint', 'bun run lint'),
  'validate-docs': mergeGated('Validate documentation', 'validate-docs.ts --programmatic-only'),
  test: mergeGated(
    'Run tests with coverage and check threshold',
    'bun test --coverage 2>&1 | tee /tmp/coverage-output.txt'
  ),
  'version-sync': mergeGated(
    'Verify package.json / manifest.json / lockfile versions match',
    'verify-version-sync.sh'
  ),
  'retired-paths-fresh': {
    keyStep: 'Verify templates/retired-template-paths.json is up to date',
    keyRun: 'generate-retired-template-paths.ts --check',
    noticeName: 'Skip notice',
    skipGate: PR_ONLY_SKIP_GATE,
    runGate: PR_ONLY_RUN_GATE,
  },
  'template-sync': mergeGated(
    'Verify .claude/ and templates/.claude/ are in sync',
    'src_skills=$(find .claude/skills'
  ),
};

/** Extract the top-level `on:` trigger block (between `on:` and `jobs:`). */
function extractTriggerBlock(content: string): string {
  const lines = content.split('\n');
  const onSection = lines.findIndex((l) => l.startsWith('on:'));
  const jobsSection = lines.findIndex((l) => l.startsWith('jobs:'));
  expect(onSection).toBeGreaterThan(-1);
  expect(jobsSection).toBeGreaterThan(onSection);
  return lines.slice(onSection, jobsSection).join('\n');
}

// ---------------------------------------------------------------------------
// A. File existence and basic structure
// ---------------------------------------------------------------------------

describe('ci.yml — file existence', () => {
  it('should exist at .github/workflows/ci.yml', async () => {
    const content = await readWorkflow();
    expect(content.length).toBeGreaterThan(0);
  });

  it('should be valid UTF-8 text (no binary content)', async () => {
    const content = await readWorkflow();
    expect(() => content.toString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// B. Trigger preservation (hard-constraint guard)
// ---------------------------------------------------------------------------

describe('ci.yml — trigger preservation', () => {
  it('should keep the push trigger on develop — removing it leaves feature commits unverified', async () => {
    const content = await readWorkflow();
    const triggerBlock = extractTriggerBlock(content);
    expect(triggerBlock).toMatch(/^ {2}push:/m);
    // develop must be listed under the push trigger's branches
    const pushIndex = triggerBlock.indexOf('push:');
    const pullRequestIndex = triggerBlock.indexOf('pull_request:');
    const pushBlock =
      pullRequestIndex > pushIndex
        ? triggerBlock.slice(pushIndex, pullRequestIndex)
        : triggerBlock.slice(pushIndex);
    expect(pushBlock).toContain('develop');
  });

  it('should trigger on pull_request for develop and release/** branches', async () => {
    const content = await readWorkflow();
    const triggerBlock = extractTriggerBlock(content);
    expect(triggerBlock).toMatch(/^ {2}pull_request:/m);
    const pullRequestIndex = triggerBlock.indexOf('pull_request:');
    const pushIndex = triggerBlock.indexOf('push:');
    const pullRequestBlock =
      pushIndex > pullRequestIndex && pushIndex > -1
        ? triggerBlock.slice(pullRequestIndex, pushIndex)
        : triggerBlock.slice(pullRequestIndex);
    expect(pullRequestBlock).toContain('develop');
    expect(pullRequestBlock).toContain('release/**');
  });
});

// ---------------------------------------------------------------------------
// C. merge-commit gate logic
// ---------------------------------------------------------------------------

describe('ci.yml — merge-commit gate logic', () => {
  it('should declare a merge_commit output on the changes job', async () => {
    const content = await readWorkflow();
    expect(content).toMatch(
      /merge_commit:\s*\$\{\{\s*steps\.mergecheck\.outputs\.merge_commit\s*\}\}/
    );
  });

  it('should have a mergecheck step', async () => {
    const content = await readWorkflow();
    expect(content).toContain('id: mergecheck');
  });

  it('should combine a structural signal (rev-list --parents) AND a textual signal (Merge pull request #) with &&', async () => {
    const content = await readWorkflow();
    // Structural signal: parent-count check via rev-list --parents
    expect(content).toContain('rev-list --parents');
    // Textual signal: commit subject pattern
    expect(content).toContain('Merge pull request #');
    // The two signals must be combined with a logical AND — not used independently
    expect(content).toMatch(
      /if\s*\[\s*"\$PARENTS"\s*=\s*"3"\s*\]\s*&&\s*\[\s*"\$TEXTUAL"\s*=\s*"true"\s*\]/
    );
  });

  it('should default merge_commit=false (fail-safe) when the event is not a push', async () => {
    const content = await readWorkflow();
    const mergecheckIndex = content.indexOf('id: mergecheck');
    expect(mergecheckIndex).toBeGreaterThan(-1);
    // The mergecheck step body extends to the next top-level step ("- name:")
    const afterMergecheck = content.slice(mergecheckIndex);
    const nextStepIndex = afterMergecheck.indexOf('\n      - name:');
    const mergecheckBlock =
      nextStepIndex > -1 ? afterMergecheck.slice(0, nextStepIndex) : afterMergecheck;
    expect(mergecheckBlock).toMatch(/github\.event_name.*!=\s*"push"/);
    expect(mergecheckBlock).toContain('merge_commit=false');
  });
});

// ---------------------------------------------------------------------------
// D. Structural safeguards (most critical)
// ---------------------------------------------------------------------------

describe('ci.yml — structural safeguards', () => {
  it('should have ZERO job-level `if` conditions — job-level if leaves required checks permanently pending when skipped', async () => {
    const content = await readWorkflow();
    // Job-level properties (name, runs-on, needs, outputs, steps, if) are indented
    // exactly 4 spaces under "  <job-id>:" (2-space indent). Step-level `if:` is
    // nested inside a step list item and is indented 8 spaces (or more).
    // A job-level `if:` would appear as an exactly-4-space-indented "if:" line.
    const jobLevelIfPattern = /^ {4}if:/m;
    const matches = content.match(jobLevelIfPattern);
    expect(matches).toBeNull();
    // Parsed check too: a re-indented job body (valid YAML) can evade the text pattern above.
    const jobs = await loadJobs();
    for (const [jobId, job] of Object.entries(jobs)) {
      expect([jobId, 'if' in job]).toEqual([jobId, false]);
    }
  });

  it('should preserve the exact job names used as required status checks', async () => {
    const content = await readWorkflow();
    // 'Rust Tests' is intentionally absent: the rust-test job was removed with ontology-rag (#1960).
    const requiredNames = ['Lint', 'Test', 'Version Sync', 'Template Sync'];
    for (const name of requiredNames) {
      // Anchor to end-of-line so a rename like "Lint" -> "Linting" does NOT
      // satisfy this check via substring containment.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(content).toMatch(new RegExp(`name: ${escaped}$`, 'm'));
    }
  });

  it('should never gate the changes job itself on merge_commit (it computes the output, so it must always run)', async () => {
    const content = await readWorkflow();
    const changesIndex = content.indexOf('  changes:');
    expect(changesIndex).toBeGreaterThan(-1);
    const nextJobIndex = content.indexOf('\n  lockfile-sync:');
    expect(nextJobIndex).toBeGreaterThan(changesIndex);
    const changesJobBlock = content.slice(changesIndex, nextJobIndex);
    expect(changesJobBlock).not.toContain('merge_commit ==');
    expect(changesJobBlock).not.toContain('merge_commit !=');
  });
});

// ---------------------------------------------------------------------------
// E. Gate application scope
// ---------------------------------------------------------------------------

// Scope: this block pins the gates (exact `if` strings), the set of jobs, each skip notice's position and
// keys, the presence of each key step, and that its `run` contains its real command fragment. It does not
// check step order, other step keys (e.g. `continue-on-error`), or the shell semantics of a `run`
// (e.g. `|| true`, or the fragment placed inside an echo or a comment).
describe('ci.yml — gate application scope', () => {
  it('should list every job except changes in the merge-gated set (no unchecked job)', async () => {
    const jobs = await loadJobs();
    const checked = Object.keys(MERGE_GATED_JOBS).sort();
    const actual = Object.keys(jobs)
      .filter((id) => id !== 'changes')
      .sort();
    expect(actual).toEqual(checked);
  });

  it('should gate every step of every merge-gated job on exactly its gate and nothing else', async () => {
    const jobs = await loadJobs();
    // rust-test was a merge-gated job too; it was removed with ontology-rag (#1960).
    for (const [jobId, spec] of Object.entries(MERGE_GATED_JOBS)) {
      const steps = jobs[jobId]?.steps ?? [];
      // Each job must keep its real work step: on the exact run gate, with the fragment of its real command
      // in `run`. This is a presence check only; it does not evaluate shell semantics (e.g. `|| true`).
      const keyStep = steps.find((st) => st.name === spec.keyStep);
      expect(`${jobId} / ${spec.keyStep}: ${keyStep?.if}`).toBe(
        `${jobId} / ${spec.keyStep}: ${spec.runGate}`
      );
      expect(keyStep?.run ?? '').toContain(spec.keyRun);
      // Exactly one skip notice, first, with the exact skip gate and only the keys if/name/run; its `run` must
      // be a single `echo "..."` with no `$`, backtick, backslash or inner double quote.
      const notices = steps.filter((st) => st.name === spec.noticeName);
      expect(notices.length).toBe(1);
      const notice = steps[0] ?? {};
      expect(notice.name).toBe(spec.noticeName);
      expect(notice.if).toBe(spec.skipGate);
      expect(Object.keys(notice).sort()).toEqual(['if', 'name', 'run']);
      expect(notice.run ?? '').toMatch(/^echo "[^"$`\\]*"$/);
      // Every other step runs on the exact run gate: no extra term, other output, or missing `if`.
      for (const step of steps.slice(1)) {
        expect(`${jobId} / ${step.name ?? step.uses ?? step.run}: ${step.if}`).toBe(
          `${jobId} / ${step.name ?? step.uses ?? step.run}: ${spec.runGate}`
        );
      }
    }
  });

  it('should expose only merge_commit as an output of the changes job', async () => {
    const jobs = await loadJobs();
    expect(Object.keys(jobs.changes?.outputs ?? {})).toEqual(['merge_commit']);
  });

  it('should have no docs-only path classification: the changes job only computes merge_commit', async () => {
    const content = await readWorkflow();
    expect(content).not.toContain('outputs.code');
    expect(content).not.toMatch(/Docs-only skip notice/i);
    expect(content).not.toContain('id: filter');
    expect(content).not.toContain('pkg_version_only');
  });

  it('should have validate-docs, version-sync, and template-sync depend on the changes job', async () => {
    const content = await readWorkflow();
    const alwaysRunJobs = ['validate-docs:', 'version-sync:', 'template-sync:'];
    for (const jobId of alwaysRunJobs) {
      const jobIndex = content.indexOf(`\n  ${jobId}`);
      expect(jobIndex).toBeGreaterThan(-1);
      const rest = content.slice(jobIndex + 1);
      const nextJobMatch = rest.slice(1).match(/\n {2}[a-z-]+:\n/);
      const jobBlock = nextJobMatch ? rest.slice(0, (nextJobMatch.index ?? rest.length) + 1) : rest;
      expect(jobBlock).toMatch(/needs:\s*\[[^\]]*changes[^\]]*\]/);
      expect(jobBlock).toContain("needs.changes.outputs.merge_commit != 'true'");
    }
  });
});
