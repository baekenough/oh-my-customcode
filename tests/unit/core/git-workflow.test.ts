import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectGitWorkflow,
  type GitWorkflowResult,
  getDefaultWorkflow,
  isGitRepo,
  renderGitWorkflowEN,
  renderGitWorkflowKO,
} from '../../../src/core/git-workflow.js';

/**
 * #1795: env for every git call that builds a fixture repo (the `git()` helper and the two `clone`
 * calls). It is read from process.env at call time. Every inherited GIT_* variable is dropped,
 * then two are set.
 *
 * Dropped:
 * - Repo-location variables exported by a parent git context. A pre-commit hook running bun test
 *   gets GIT_INDEX_FILE; for `git commit -a` it is the absolute path of the real repo's
 *   .git/index.lock, so a fixture git call that honoured it would overwrite the index being
 *   committed.
 * - Config injected through the environment. `git -c k=v commit` exports GIT_CONFIG_PARAMETERS,
 *   and GIT_CONFIG_COUNT / GIT_CONFIG_KEY_<n> / GIT_CONFIG_VALUE_<n> work the same way. Both apply
 *   on top of any config file, so GIT_CONFIG_GLOBAL cannot neutralise them; they must be removed.
 *
 * Then set:
 * - GIT_CONFIG_GLOBAL=/dev/null + GIT_CONFIG_NOSYSTEM=1 stop git from reading the user's
 *   global (~/.gitconfig and $XDG_CONFIG_HOME/git/config) and system config files, so settings
 *   such as commit.gpgsign=true or init.defaultBranch cannot change how fixtures are created.
 * Dropping the whole GIT_ prefix rather than a list of names also covers variables not named
 * here, such as GIT_OBJECT_DIRECTORY or GIT_COMMON_DIR. Same policy as gitFixtureEnv() in
 * tests/unit/core/hooks-scripts.test.ts; keep the two in sync.
 */
function gitFixtureEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) {
      env[key] = value;
    }
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
}

/**
 * #1795: plant in process.env the git variables a parent git context can export, run `body`, then
 * restore process.env. GIT_INDEX_FILE points at a file that must never be created, and config
 * injected both ways (GIT_CONFIG_PARAMETERS and GIT_CONFIG_COUNT/KEY/VALUE) turns on commit
 * signing with a signer that always fails (`false`), so a commit that inherits it fails fast.
 */
async function withInheritedGitBait(body: (baitIndex: string) => Promise<void>): Promise<void> {
  const baitDir = mkdtempSync(join(tmpdir(), 'omcustom-git-bait-'));
  const baitIndex = join(baitDir, 'index');
  const bait: Record<string, string> = {
    GIT_INDEX_FILE: baitIndex,
    GIT_CONFIG_PARAMETERS: "'commit.gpgsign=true' 'gpg.program=false'",
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'commit.gpgsign',
    GIT_CONFIG_VALUE_0: 'true',
    GIT_CONFIG_KEY_1: 'gpg.program',
    GIT_CONFIG_VALUE_1: 'false',
  };
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(bait)) {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await body(baitIndex);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(baitDir, { recursive: true, force: true });
  }
}

/**
 * Helper to run git commands in the test directory with the isolated gitFixtureEnv().
 */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: gitFixtureEnv(),
  }).trim();
}

/**
 * Initialize a test git repo with an initial commit.
 * Disables hooks to prevent parent repo's pre-commit hook from interfering.
 */
async function initTestRepo(dir: string): Promise<void> {
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'core.hooksPath', '/dev/null'], dir);
  await writeFile(join(dir, 'README.md'), '# Test\n');
  git(['add', '.'], dir);
  git(['commit', '-m', 'initial'], dir);
}

/**
 * Assert result is non-null and return narrowed type
 */
function assertDetected(result: GitWorkflowResult | null): GitWorkflowResult {
  expect(result).not.toBeNull();
  // biome-ignore lint/style/noNonNullAssertion: test assertion guarantees non-null
  return result!;
}

describe('git-workflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `omcustom-git-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('builds fixtures without an inherited GIT_INDEX_FILE or env-injected git config (#1795)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omcustom-git-bait-repo-'));
    try {
      await withInheritedGitBait(async (baitIndex) => {
        // Throws at the commit if the injected commit.gpgsign + gpg.program=false reached git.
        await initTestRepo(repo);
        // Created if git honoured the inherited GIT_INDEX_FILE.
        expect(existsSync(baitIndex)).toBe(false);
      });
      expect(git(['rev-list', '--count', 'HEAD'], repo)).toBe('1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  describe('isGitRepo', () => {
    it('should return true for a git repository', async () => {
      await initTestRepo(tempDir);
      expect(isGitRepo(tempDir)).toBe(true);
    });

    it('should return false for a non-git directory', () => {
      expect(isGitRepo(tempDir)).toBe(false);
    });
  });

  describe('detectGitWorkflow', () => {
    it('should return null for non-git directories', () => {
      expect(detectGitWorkflow(tempDir)).toBeNull();
    });

    it('should detect trunk-based workflow (main only, no feature branches)', async () => {
      await initTestRepo(tempDir);

      const result = assertDetected(detectGitWorkflow(tempDir));
      expect(result.type).toBe('trunk-based');
      expect(result.defaultBranch).toBe('main');
      expect(result.hasDevelop).toBe(false);
      expect(result.branchPatterns).toEqual([]);
    });

    it('should detect github-flow workflow (main + feature branches)', async () => {
      await initTestRepo(tempDir);
      git(['checkout', '-b', 'feature/add-login'], tempDir);
      git(['checkout', 'main'], tempDir);

      const result = assertDetected(detectGitWorkflow(tempDir));
      expect(result.type).toBe('github-flow');
      expect(result.defaultBranch).toBe('main');
      expect(result.hasDevelop).toBe(false);
      expect(result.branchPatterns).toContain('feature/*');
    });

    it('should detect git-flow workflow (develop + feature/release/hotfix)', async () => {
      await initTestRepo(tempDir);
      git(['checkout', '-b', 'develop'], tempDir);
      git(['checkout', '-b', 'feature/user-auth'], tempDir);
      git(['checkout', 'develop'], tempDir);
      git(['checkout', '-b', 'release/1.0.0'], tempDir);
      git(['checkout', 'develop'], tempDir);
      git(['checkout', '-b', 'hotfix/fix-crash'], tempDir);
      git(['checkout', 'develop'], tempDir);

      const result = assertDetected(detectGitWorkflow(tempDir));
      expect(result.type).toBe('git-flow');
      expect(result.hasDevelop).toBe(true);
      expect(result.branchPatterns).toContain('feature/*');
      expect(result.branchPatterns).toContain('release/*');
      expect(result.branchPatterns).toContain('hotfix/*');
    });

    it('should detect git-flow when develop exists without flow patterns', async () => {
      await initTestRepo(tempDir);
      git(['checkout', '-b', 'develop'], tempDir);

      const result = assertDetected(detectGitWorkflow(tempDir));
      expect(result.type).toBe('git-flow');
      expect(result.hasDevelop).toBe(true);
    });

    it('should detect master as default branch when no main exists', async () => {
      const dir = tempDir;
      git(['init', '-b', 'master'], dir);
      git(['config', 'user.email', 'test@test.com'], dir);
      git(['config', 'user.name', 'Test'], dir);
      git(['config', 'core.hooksPath', '/dev/null'], dir);
      await writeFile(join(dir, 'README.md'), '# Test\n');
      git(['add', '.'], dir);
      git(['commit', '-m', 'initial'], dir);

      const result = assertDetected(detectGitWorkflow(dir));
      expect(result.defaultBranch).toBe('master');
    });

    it('should detect bugfix branch pattern', async () => {
      await initTestRepo(tempDir);
      git(['checkout', '-b', 'bugfix/typo'], tempDir);
      git(['checkout', 'main'], tempDir);

      const result = assertDetected(detectGitWorkflow(tempDir));
      expect(result.branchPatterns).toContain('bugfix/*');
    });

    it('should detect default branch from remote HEAD (line 72)', async () => {
      // Create a bare repo that acts as origin
      const bareDir = join(tmpdir(), `omcustom-git-bare-${Date.now()}`);
      await mkdir(bareDir, { recursive: true });
      try {
        git(['init', '--bare', '-b', 'main'], bareDir);

        // Clone the bare repo — this sets up refs/remotes/origin/HEAD
        const cloneDir = join(tmpdir(), `omcustom-git-clone-${Date.now()}`);
        await mkdir(cloneDir, { recursive: true });
        try {
          execFileSync('git', ['clone', bareDir, cloneDir], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: gitFixtureEnv(),
          });
          git(['config', 'user.email', 'test@test.com'], cloneDir);
          git(['config', 'user.name', 'Test'], cloneDir);
          git(['config', 'core.hooksPath', '/dev/null'], cloneDir);
          await writeFile(join(cloneDir, 'README.md'), '# Test\n');
          git(['add', '.'], cloneDir);
          git(['commit', '-m', 'initial'], cloneDir);
          git(['push', 'origin', 'main'], cloneDir);

          // Explicitly set origin/HEAD so refs/remotes/origin/HEAD is a symbolic ref
          git(['remote', 'set-head', 'origin', 'main'], cloneDir);

          // Verify refs/remotes/origin/HEAD exists (prerequisite for line 72)
          const remoteHead = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cloneDir);
          expect(remoteHead).toBeTruthy();

          const result = assertDetected(detectGitWorkflow(cloneDir));
          // Line 72: remoteHead.replace('refs/remotes/origin/', '') → 'main'
          expect(result.defaultBranch).toBe('main');
        } finally {
          await rm(cloneDir, { recursive: true, force: true });
        }
      } finally {
        await rm(bareDir, { recursive: true, force: true });
      }
    });

    it('should fall back to HEAD branch when no common branch names exist (lines 84-86)', async () => {
      // Create repo on a non-standard branch (not main/master/develop)
      // so the common-name loop (lines 77-81) finds nothing,
      // and HEAD symbolic-ref (lines 84-86) becomes the fallback
      const dir = tempDir;
      git(['init', '-b', 'trunk'], dir);
      git(['config', 'user.email', 'test@test.com'], dir);
      git(['config', 'user.name', 'Test'], dir);
      git(['config', 'core.hooksPath', '/dev/null'], dir);
      await writeFile(join(dir, 'README.md'), '# Test\n');
      git(['add', '.'], dir);
      git(['commit', '-m', 'initial'], dir);

      const result = assertDetected(detectGitWorkflow(dir));
      // Lines 84-86: symbolic-ref --short HEAD returns 'trunk'
      expect(result.defaultBranch).toBe('trunk');
      expect(result.type).toBe('trunk-based');
    });

    it('should fall back to "main" when HEAD is detached and no common branches exist (lines 87, 89)', async () => {
      // Create repo on a non-standard branch with a commit, then detach HEAD
      // so symbolic-ref --short HEAD fails (returns ''), triggering the final fallback
      const dir = tempDir;
      git(['init', '-b', 'trunk'], dir);
      git(['config', 'user.email', 'test@test.com'], dir);
      git(['config', 'user.name', 'Test'], dir);
      git(['config', 'core.hooksPath', '/dev/null'], dir);
      await writeFile(join(dir, 'README.md'), '# Test\n');
      git(['add', '.'], dir);
      git(['commit', '-m', 'initial'], dir);

      // Detach HEAD by checking out the commit hash directly
      const commitHash = git(['rev-parse', 'HEAD'], dir);
      git(['checkout', commitHash], dir);

      const result = assertDetected(detectGitWorkflow(dir));
      // Line 89: return 'main' (final fallback when HEAD is detached)
      expect(result.defaultBranch).toBe('main');
    });

    it('should parse remote branches correctly (lines 107-111)', async () => {
      // Create a bare repo and clone, then push multiple branches so
      // getRemoteBranches can exercise split/filter/map/filter(HEAD)
      const bareDir = join(tmpdir(), `omcustom-git-bare2-${Date.now()}`);
      await mkdir(bareDir, { recursive: true });
      try {
        git(['init', '--bare', '-b', 'main'], bareDir);

        const cloneDir = join(tmpdir(), `omcustom-git-clone2-${Date.now()}`);
        await mkdir(cloneDir, { recursive: true });
        try {
          execFileSync('git', ['clone', bareDir, cloneDir], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: gitFixtureEnv(),
          });
          git(['config', 'user.email', 'test@test.com'], cloneDir);
          git(['config', 'user.name', 'Test'], cloneDir);
          git(['config', 'core.hooksPath', '/dev/null'], cloneDir);
          await writeFile(join(cloneDir, 'README.md'), '# Test\n');
          git(['add', '.'], cloneDir);
          git(['commit', '-m', 'initial'], cloneDir);
          git(['push', 'origin', 'main'], cloneDir);

          // Create and push a feature branch to exercise remote branch listing
          git(['checkout', '-b', 'feature/remote-test'], cloneDir);
          git(['push', 'origin', 'feature/remote-test'], cloneDir);
          git(['checkout', 'main'], cloneDir);

          // detectGitWorkflow calls getRemoteBranches which exercises lines 107-111
          const result = assertDetected(detectGitWorkflow(cloneDir));
          // Remote branches should include 'feature/remote-test' (stripped of origin/ prefix)
          // and 'HEAD' entry should be filtered out
          expect(result.branchPatterns).toContain('feature/*');
          expect(result.type).toBe('github-flow');
        } finally {
          await rm(cloneDir, { recursive: true, force: true });
        }
      } finally {
        await rm(bareDir, { recursive: true, force: true });
      }
    });
  });

  describe('getDefaultWorkflow', () => {
    it('should return github-flow with main branch', () => {
      const result = getDefaultWorkflow();
      expect(result.type).toBe('github-flow');
      expect(result.defaultBranch).toBe('main');
      expect(result.hasDevelop).toBe(false);
      expect(result.branchPatterns).toContain('feature/*');
    });
  });

  describe('renderGitWorkflowEN', () => {
    it('should render git-flow section with detected patterns', () => {
      const result: GitWorkflowResult = {
        type: 'git-flow',
        defaultBranch: 'develop',
        hasDevelop: true,
        branchPatterns: ['feature/*', 'hotfix/*', 'release/*'],
      };

      const rendered = renderGitWorkflowEN(result);
      expect(rendered).toContain('## Git Workflow (MUST follow)');
      expect(rendered).toContain('`develop`');
      expect(rendered).toContain('`feature/*`');
      expect(rendered).toContain('`release/*`');
      expect(rendered).toContain('`hotfix/*`');
      expect(rendered).toContain('Create feature branches from `develop`');
    });

    it('should render git-flow section with bugfix pattern', () => {
      const result: GitWorkflowResult = {
        type: 'git-flow',
        defaultBranch: 'develop',
        hasDevelop: true,
        branchPatterns: ['bugfix/*', 'feature/*'],
      };
      const rendered = renderGitWorkflowEN(result);
      expect(rendered).toContain('`bugfix/*`');
      expect(rendered).toContain('Bug fixes');
    });

    it('should render github-flow section', () => {
      const result: GitWorkflowResult = {
        type: 'github-flow',
        defaultBranch: 'main',
        hasDevelop: false,
        branchPatterns: ['feature/*'],
      };

      const rendered = renderGitWorkflowEN(result);
      expect(rendered).toContain('## Git Workflow (MUST follow)');
      expect(rendered).toContain('Production-ready code');
      expect(rendered).toContain('All changes go through PR to `main`');
    });

    it('should render trunk-based section', () => {
      const result: GitWorkflowResult = {
        type: 'trunk-based',
        defaultBranch: 'main',
        hasDevelop: false,
        branchPatterns: [],
      };

      const rendered = renderGitWorkflowEN(result);
      expect(rendered).toContain('## Git Workflow (MUST follow)');
      expect(rendered).toContain('Main trunk');
      expect(rendered).toContain('short-lived branches');
    });
  });

  describe('renderGitWorkflowKO', () => {
    it('should render git-flow section in Korean', () => {
      const result: GitWorkflowResult = {
        type: 'git-flow',
        defaultBranch: 'develop',
        hasDevelop: true,
        branchPatterns: ['feature/*', 'release/*'],
      };

      const rendered = renderGitWorkflowKO(result);
      expect(rendered).toContain('## Git 워크플로우 (반드시 준수)');
      expect(rendered).toContain('메인 개발 브랜치');
      expect(rendered).toContain('feature 브랜치 생성');
    });

    it('should render git-flow section with hotfix pattern in Korean', () => {
      const result: GitWorkflowResult = {
        type: 'git-flow',
        defaultBranch: 'develop',
        hasDevelop: true,
        branchPatterns: ['hotfix/*', 'feature/*'],
      };
      const rendered = renderGitWorkflowKO(result);
      expect(rendered).toContain('`hotfix/*`');
      expect(rendered).toContain('긴급 수정');
    });

    it('should render git-flow section with bugfix pattern in Korean', () => {
      const result: GitWorkflowResult = {
        type: 'git-flow',
        defaultBranch: 'develop',
        hasDevelop: true,
        branchPatterns: ['bugfix/*', 'feature/*'],
      };
      const rendered = renderGitWorkflowKO(result);
      expect(rendered).toContain('`bugfix/*`');
      expect(rendered).toContain('버그 수정');
    });

    it('should render github-flow section in Korean', () => {
      const result: GitWorkflowResult = {
        type: 'github-flow',
        defaultBranch: 'main',
        hasDevelop: false,
        branchPatterns: ['feature/*'],
      };

      const rendered = renderGitWorkflowKO(result);
      expect(rendered).toContain('프로덕션 준비 코드');
      expect(rendered).toContain('PR을 통해 진행');
    });

    it('should render trunk-based section in Korean', () => {
      const result: GitWorkflowResult = {
        type: 'trunk-based',
        defaultBranch: 'main',
        hasDevelop: false,
        branchPatterns: [],
      };

      const rendered = renderGitWorkflowKO(result);
      expect(rendered).toContain('메인 트렁크');
      expect(rendered).toContain('단기 브랜치 사용');
    });
  });
});
