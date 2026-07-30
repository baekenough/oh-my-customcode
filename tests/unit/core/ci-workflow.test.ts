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

const CI_WORKFLOW = resolve(import.meta.dir, '../../../.github/workflows/ci.yml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readWorkflow(): Promise<string> {
  return readFile(CI_WORKFLOW, 'utf-8');
}

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
  });

  it('should preserve the exact job names used as required status checks', async () => {
    const content = await readWorkflow();
    const requiredNames = ['Lint', 'Test', 'Rust Tests', 'Version Sync', 'Template Sync'];
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

describe('ci.yml — gate application scope', () => {
  it('should apply the merge_commit gate to the execution steps of all 4 code-gated jobs', async () => {
    const content = await readWorkflow();
    const codeGatedJobs = ['lockfile-sync:', 'lint:', 'test:', 'rust-test:'];
    for (const jobId of codeGatedJobs) {
      const jobIndex = content.indexOf(`\n  ${jobId}`);
      expect(jobIndex).toBeGreaterThan(-1);
      // Slice up to the following job header (next line starting with exactly 2-space job id)
      const rest = content.slice(jobIndex + 1);
      const nextJobMatch = rest.slice(1).match(/\n {2}[a-z-]+:\n/);
      const jobBlock = nextJobMatch ? rest.slice(0, (nextJobMatch.index ?? rest.length) + 1) : rest;
      expect(jobBlock).toMatch(
        /needs\.changes\.outputs\.code == 'true' && needs\.changes\.outputs\.merge_commit != 'true'/
      );
    }
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
