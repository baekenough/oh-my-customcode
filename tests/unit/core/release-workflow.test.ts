/**
 * Tests for the release workflow (.github/workflows/release.yml), issue #1792.
 *
 * The `test` job skips its duplicate suite only when the step
 * "Detect tree already verified by PR CI" can prove the tag's tree already passed PR CI.
 *
 * Part A: structural contract tests (release.yml + the ci.yml coupling the proof relies on).
 * Part B: offline behavioural tests — the step's shell script is extracted and run against a
 *         fixture git repository with a PATH-shimmed `gh`. No network, no real GitHub API.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const RELEASE_WORKFLOW = resolve(import.meta.dir, '../../../.github/workflows/release.yml');
const CI_WORKFLOW = resolve(import.meta.dir, '../../../.github/workflows/ci.yml');

const PROVEN_STEP_NAME = 'Detect tree already verified by PR CI';
const TEST_STEP_NAME = 'Run tests with coverage';
const CI_TEST_STEP_NAME = 'Run tests with coverage and check threshold';
const SKIP_TRUE_LINE = 'echo "skip=true" >> "$GITHUB_OUTPUT"';

// ---------------------------------------------------------------------------
// Workflow model + helpers
// ---------------------------------------------------------------------------

interface WorkflowStep {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
  'continue-on-error'?: boolean;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  needs?: string[] | string;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

interface Workflow {
  name?: string;
  jobs?: Record<string, WorkflowJob | undefined>;
}

async function loadWorkflow(path: string): Promise<Workflow> {
  const text = await readFile(path, 'utf-8');
  return parse(text) as Workflow;
}

function findStep(job: WorkflowJob | undefined, predicate: (s: WorkflowStep) => boolean) {
  return job?.steps?.find(predicate);
}

// ---------------------------------------------------------------------------
// Part A — contract tests
// ---------------------------------------------------------------------------

describe('release.yml — test job contract', () => {
  it('keeps job names and the publish/verify dependency chain', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    expect(wf.jobs?.test?.name).toBe('Test');
    expect(wf.jobs?.publish?.needs).toEqual(['test', 'docs-validate']);
    expect(wf.jobs?.['verify-release']?.needs).toEqual(['publish']);
  });

  it('checks out with fetch-depth 0 (second parent + ancestry need full history)', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const checkout = findStep(wf.jobs?.test, (s) => s.name === 'Checkout');
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  it('grants checks/actions read while keeping the original write scopes', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const perms = wf.jobs?.test?.permissions;
    expect(perms?.checks).toBe('read');
    expect(perms?.actions).toBe('read');
    expect(perms?.contents).toBe('write');
    expect(perms?.packages).toBe('write');
    expect(perms?.['id-token']).toBe('write');
  });

  it('runs the prverified step as non-blocking, before the test step', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const steps = wf.jobs?.test?.steps ?? [];
    const proofIdx = steps.findIndex((s) => s.id === 'prverified');
    const testIdx = steps.findIndex((s) => s.name === TEST_STEP_NAME);
    expect(proofIdx).toBeGreaterThanOrEqual(0);
    expect(testIdx).toBeGreaterThanOrEqual(0);
    expect(proofIdx).toBeLessThan(testIdx);
    expect(steps[proofIdx]?.name).toBe(PROVEN_STEP_NAME);
    expect(steps[proofIdx]?.['continue-on-error']).toBe(true);
  });

  it('gates the test step on steps.prverified.outputs.skip', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const testStep = findStep(wf.jobs?.test, (s) => s.name === TEST_STEP_NAME);
    expect(testStep?.if).toBe("steps.prverified.outputs.skip != 'true'");
  });

  it('writes skip=true on exactly one line (comments mentioning it do not count)', async () => {
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const proof = findStep(wf.jobs?.test, (s) => s.id === 'prverified');
    const lines = (proof?.run ?? '').split('\n').map((l) => l.trim());
    expect(lines.filter((l) => l === SKIP_TRUE_LINE)).toHaveLength(1);
  });
});

describe('ci.yml — coupling the proof relies on', () => {
  it('keeps workflow "CI", job "Test" and the real test step name', async () => {
    const ci = await loadWorkflow(CI_WORKFLOW);
    expect(ci.name).toBe('CI');
    expect(ci.jobs?.test?.name).toBe('Test');
    const step = findStep(ci.jobs?.test, (s) => s.name === CI_TEST_STEP_NAME);
    expect(step).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Part B — offline behavioural tests of the extracted step script
// ---------------------------------------------------------------------------

/** Selects the fixture JSON the `gh` shim serves ('fail' makes every gh call exit non-zero). */
type FixtureMode = string;

const WRONG_SHA = 'f'.repeat(40);
const NO_CHECK_RUN_REASON = 'no single completed successful Test check run on PR head';
const NO_REAL_STEP_REASON = 'did not run the real test step to success';

interface FixtureCase {
  label: string;
  mode: string;
  reason: string;
}

// Each mode differs from the valid ("ok") evidence in exactly one field, so it fails exactly one
// proof step of the script; a deleted/loosened proof step then turns the run into skip=true.
const CHECK_RUN_FAULTS: FixtureCase[] = [
  {
    label: 'check run from another app (app.id 999)',
    mode: 'cr-app-id',
    reason: NO_CHECK_RUN_REASON,
  },
  { label: 'check run still in_progress', mode: 'cr-in-progress', reason: NO_CHECK_RUN_REASON },
  { label: 'check run completed with failure', mode: 'cr-failure', reason: NO_CHECK_RUN_REASON },
  {
    label: 'two otherwise-valid Test check runs',
    mode: 'cr-two-runs',
    reason: NO_CHECK_RUN_REASON,
  },
  {
    label: 'check run head_sha differs from the PR head',
    mode: 'cr-head-sha',
    reason: NO_CHECK_RUN_REASON,
  },
  { label: 'check_runs is null', mode: 'cr-null', reason: NO_CHECK_RUN_REASON },
];

const JOB_FAULTS: FixtureCase[] = [
  { label: 'job from workflow "Release"', mode: 'job-workflow-name', reason: NO_REAL_STEP_REASON },
  { label: 'job concluded failure', mode: 'job-failure', reason: NO_REAL_STEP_REASON },
  {
    label: 'job head_sha differs from the PR head',
    mode: 'job-head-sha',
    reason: NO_REAL_STEP_REASON,
  },
  {
    label: 'real test step name duplicated',
    mode: 'job-step-duplicated',
    reason: NO_REAL_STEP_REASON,
  },
  { label: 'real test step renamed', mode: 'job-step-renamed', reason: NO_REAL_STEP_REASON },
];

interface CaseResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

describe('release.yml — prverified step script (offline fixture repo)', () => {
  let root = '';
  let repoDir = '';
  let shimDir = '';
  let fixtureDir = '';
  let stepScript = '';
  const shas = {
    merge: '',
    nonMerge: '',
    treeDiffers: '',
    treeDiffersAncestorOk: '',
    ancestryMasked: '',
    ancestryMaskedHead: '',
  };

  const gitEnv = (): Record<string, string> => ({
    PATH: process.env.PATH ?? '',
    HOME: root,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  });

  function git(...args: string[]): string {
    const res = spawnSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { cwd: repoDir, env: gitEnv(), encoding: 'utf-8' }
    );
    if (res.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
    }
    return res.stdout.trim();
  }

  async function commitFile(file: string, content: string, message: string): Promise<void> {
    await writeFile(join(repoDir, file), content);
    git('add', file);
    git('commit', '-m', message);
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'release-workflow-test-'));
    repoDir = join(root, 'repo');
    shimDir = join(root, 'shim');
    fixtureDir = join(root, 'fixtures');
    await Promise.all([mkdir(repoDir), mkdir(shimDir), mkdir(fixtureDir)]);

    // Extract the step script from the real workflow.
    const wf = await loadWorkflow(RELEASE_WORKFLOW);
    const proof = findStep(wf.jobs?.test, (s) => s.id === 'prverified');
    if (!proof?.run) {
      throw new Error('prverified step run script not found in release.yml');
    }
    stepScript = join(root, 'step.sh');
    await writeFile(stepScript, proof.run);

    // Fixture history: A (main) -> B (head) ; M = merge(main, head) ; M2 = merge(C, head).
    git('init', '-q', '-b', 'main');
    await commitFile('base.txt', 'base\n', 'A');
    git('branch', 'main2');
    git('branch', 'main3');
    git('checkout', '-q', '-b', 'pr-head');
    await commitFile('feature.txt', 'feature\n', 'B');
    shas.nonMerge = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    git('merge', '--no-ff', '-q', '-m', 'M', 'pr-head');
    shas.merge = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main2');
    await commitFile('other.txt', 'other\n', 'C');
    git('merge', '--no-ff', '-q', '-m', 'M2', 'pr-head');
    shas.treeDiffers = git('rev-parse', 'HEAD');

    // "Evil merge": base IS an ancestor of the PR head, but the merge commit adds an extra file,
    // so only the tree-equality check (not the ancestry check) can reject it.
    git('checkout', '-q', 'main3');
    git('merge', '--no-ff', '--no-commit', '-q', 'pr-head');
    await writeFile(join(repoDir, 'smuggled.txt'), 'not in the PR head\n');
    git('add', 'smuggled.txt');
    git('commit', '-q', '-m', 'M3');
    shas.treeDiffersAncestorOk = git('rev-parse', 'HEAD');

    // M4 (ancestry-only fault): main4 adds dup.txt; pr-head2 (branched before that) adds an
    // identical dup.txt plus its own file. The --no-ff merge tree equals the PR-head tree, but the
    // first parent is not an ancestor of the PR head, so only the ancestry check can reject it.
    git('checkout', '-q', '-b', 'main4', git('rev-parse', 'main2'));
    await commitFile('dup.txt', 'dup\n', 'D');
    git('checkout', '-q', '-b', 'pr-head2', git('rev-parse', 'main2'));
    await commitFile('dup.txt', 'dup\n', 'D-identical');
    await commitFile('feature2.txt', 'feature2\n', 'E');
    shas.ancestryMaskedHead = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main4');
    git('merge', '--no-ff', '-q', '-m', 'M4', 'pr-head2');
    shas.ancestryMasked = git('rev-parse', 'HEAD');

    // gh shim: serves fixture JSON chosen by GH_FIXTURE_MODE.
    const shim = [
      '#!/usr/bin/env bash',
      'mode="$GH_FIXTURE_MODE"',
      'if [ "$mode" = "fail" ]; then',
      '  echo "gh: HTTP 403: Resource not accessible by integration" >&2',
      '  exit 1',
      'fi',
      'case "$2" in',
      '  *check-runs*) cat "$GH_FIXTURE_DIR/$mode.check-runs.json" ;;',
      '  *actions/jobs/*) cat "$GH_FIXTURE_DIR/$mode.job.json" ;;',
      '  *) echo "gh shim: unexpected args: $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n');
    await writeFile(join(shimDir, 'gh'), shim, { mode: 0o755 });

    const checkRun = (head: string, over: Record<string, unknown> = {}) => ({
      id: 123,
      name: 'Test',
      app: { id: 15368 },
      head_sha: head,
      status: 'completed',
      conclusion: 'success',
      ...over,
    });
    const checkRuns = (runs: unknown) => ({ total_count: 1, check_runs: runs });
    const job = (head: string, over: Record<string, unknown> = {}) => ({
      workflow_name: 'CI',
      name: 'Test',
      head_sha: head,
      conclusion: 'success',
      steps: [{ name: CI_TEST_STEP_NAME, conclusion: 'success' }],
      ...over,
    });

    const head = shas.nonMerge;
    const modes: Record<string, { runs: unknown; job: unknown }> = {
      ok: { runs: checkRuns([checkRun(head)]), job: job(head) },
      // valid evidence for the M4 PR head (ancestry is then the only failing proof step)
      'ok-m4': {
        runs: checkRuns([checkRun(shas.ancestryMaskedHead)]),
        job: job(shas.ancestryMaskedHead),
      },
      vacuous: {
        runs: checkRuns([checkRun(head)]),
        job: job(head, { steps: [{ name: CI_TEST_STEP_NAME, conclusion: 'skipped' }] }),
      },
      // check-run faults (job evidence stays valid)
      'cr-app-id': { runs: checkRuns([checkRun(head, { app: { id: 999 } })]), job: job(head) },
      'cr-in-progress': {
        runs: checkRuns([checkRun(head, { status: 'in_progress', conclusion: 'success' })]),
        job: job(head),
      },
      'cr-failure': {
        runs: checkRuns([checkRun(head, { conclusion: 'failure' })]),
        job: job(head),
      },
      'cr-two-runs': {
        runs: checkRuns([checkRun(head), checkRun(head, { id: 124 })]),
        job: job(head),
      },
      'cr-head-sha': {
        runs: checkRuns([checkRun(WRONG_SHA)]),
        job: job(head),
      },
      'cr-null': { runs: checkRuns(null), job: job(head) },
      // job faults (check-run evidence stays valid)
      'job-workflow-name': {
        runs: checkRuns([checkRun(head)]),
        job: job(head, { workflow_name: 'Release' }),
      },
      'job-failure': {
        runs: checkRuns([checkRun(head)]),
        job: job(head, { conclusion: 'failure' }),
      },
      'job-head-sha': {
        runs: checkRuns([checkRun(head)]),
        job: job(WRONG_SHA),
      },
      'job-step-duplicated': {
        runs: checkRuns([checkRun(head)]),
        job: job(head, {
          steps: [
            { name: CI_TEST_STEP_NAME, conclusion: 'success' },
            { name: CI_TEST_STEP_NAME, conclusion: 'success' },
          ],
        }),
      },
      'job-step-renamed': {
        runs: checkRuns([checkRun(head)]),
        job: job(head, { steps: [{ name: 'Run tests', conclusion: 'success' }] }),
      },
    };
    for (const [mode, fixture] of Object.entries(modes)) {
      await writeFile(join(fixtureDir, `${mode}.check-runs.json`), JSON.stringify(fixture.runs));
      await writeFile(join(fixtureDir, `${mode}.job.json`), JSON.stringify(fixture.job));
    }
  }, 60_000);

  afterAll(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function runCase(label: string, sha: string, mode: FixtureMode): Promise<CaseResult> {
    const outFile = join(root, `out-${label}`);
    const res = spawnSync('bash', [stepScript], {
      cwd: repoDir,
      encoding: 'utf-8',
      env: {
        ...gitEnv(),
        PATH: `${shimDir}:${process.env.PATH ?? ''}`,
        GITHUB_OUTPUT: outFile,
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_SHA: sha,
        GH_FIXTURE_MODE: mode,
        GH_FIXTURE_DIR: fixtureDir,
      },
    });
    const output = await readFile(outFile, 'utf-8').catch(() => '');
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, output };
  }

  it('fixture sanity: merge tree equals PR-head tree, base is an ancestor', () => {
    expect(git('rev-parse', `${shas.merge}^{tree}`)).toBe(
      git('rev-parse', `${shas.nonMerge}^{tree}`)
    );
    expect(git('rev-parse', `${shas.treeDiffers}^{tree}`)).not.toBe(
      git('rev-parse', `${shas.nonMerge}^{tree}`)
    );
  });

  it('skips when the merge tree was proven by a successful real PR test step', async () => {
    const r = await runCase('positive', shas.merge, 'ok');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=true');
    expect(r.output).not.toContain('skip=false');
    expect(r.stdout).toContain('skipping duplicate test run');
  });

  it('runs the suite for a non-merge commit', async () => {
    const r = await runCase('non-merge', shas.nonMerge, 'ok');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('not a 2-parent merge commit (fields=2)');
  });

  it('runs the suite when the merge tree differs from the PR-head tree', async () => {
    const r = await runCase('tree-differs', shas.treeDiffers, 'ok');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('differs from PR-head tree');
  });

  it('runs the suite when the merge adds changes even though the base is an ancestor', async () => {
    const r = await runCase('tree-differs-ancestor', shas.treeDiffersAncestorOk, 'ok');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('differs from PR-head tree');
  });

  it('runs the suite when the gh API lookup fails', async () => {
    const r = await runCase('gh-fail', shas.merge, 'fail');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('check-runs lookup failed');
  });

  it('runs the suite when the PR Test job never ran the real test step to success', async () => {
    const r = await runCase('vacuous', shas.merge, 'vacuous');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('did not run the real test step to success');
  });

  it('fixture sanity: M4 tree equals PR-head tree while the base is not an ancestor', () => {
    expect(git('rev-parse', `${shas.ancestryMasked}^{tree}`)).toBe(
      git('rev-parse', `${shas.ancestryMaskedHead}^{tree}`)
    );
    expect(git('rev-parse', `${shas.ancestryMasked}^2`)).toBe(shas.ancestryMaskedHead);
    const res = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', `${shas.ancestryMasked}^1`, shas.ancestryMaskedHead],
      { cwd: repoDir, env: gitEnv(), encoding: 'utf-8' }
    );
    expect(res.status).toBe(1);
  });

  it('runs the suite when the tree is equal but the base is not an ancestor of the PR head (M4)', async () => {
    const r = await runCase('ancestry', shas.ancestryMasked, 'ok-m4');
    expect(r.status).toBe(0);
    expect(r.output).toContain('skip=false');
    expect(r.output).not.toContain('skip=true');
    expect(r.stdout).toContain('not an ancestor of the PR head');
  });

  for (const c of CHECK_RUN_FAULTS) {
    it(`runs the suite on a single-fault check-run response: ${c.label}`, async () => {
      const r = await runCase(c.mode, shas.merge, c.mode);
      expect(r.status).toBe(0);
      expect(r.output).toContain('skip=false');
      expect(r.output).not.toContain('skip=true');
      expect(r.stdout).toContain(c.reason);
    });
  }

  for (const c of JOB_FAULTS) {
    it(`runs the suite on a single-fault job response: ${c.label}`, async () => {
      const r = await runCase(c.mode, shas.merge, c.mode);
      expect(r.status).toBe(0);
      expect(r.output).toContain('skip=false');
      expect(r.output).not.toContain('skip=true');
      expect(r.stdout).toContain(c.reason);
    });
  }
});
