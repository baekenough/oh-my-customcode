/**
 * Git workflow detection module
 *
 * Detects the git branch structure of a project and determines
 * the workflow type (git-flow, github-flow, trunk-based).
 */

import { execFileSync } from 'node:child_process';

/**
 * Detected git workflow type
 */
export type GitWorkflowType = 'git-flow' | 'github-flow' | 'trunk-based';

/**
 * Result of git workflow detection
 */
export interface GitWorkflowResult {
  /** Detected workflow type */
  type: GitWorkflowType;
  /** Default/main branch name */
  defaultBranch: string;
  /** Whether a develop branch exists */
  hasDevelop: boolean;
  /** Detected branch patterns (e.g., feature/*, release/*) */
  branchPatterns: string[];
}

/**
 * Execute a git command in the given directory.
 *
 * Clears GIT_DIR/GIT_WORK_TREE env vars to ensure git inspects the
 * target directory's own repo, not a parent repo (e.g., during pre-commit hooks).
 *
 * @param args - Git command arguments
 * @param cwd - Working directory
 * @returns stdout trimmed, or empty string on failure
 */
function execGit(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined },
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Check if the directory is inside a git repository
 */
export function isGitRepo(cwd: string): boolean {
  return execGit(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
}

/**
 * Detect the default branch name
 *
 * Tries in order:
 * 1. Remote HEAD (origin/HEAD) - most reliable
 * 2. Check for common branch names (main, master, develop)
 * 3. Current HEAD branch
 * 4. Fallback to 'main'
 */
function detectDefaultBranch(cwd: string): string {
  // Try remote HEAD first (most reliable for default branch detection)
  const remoteHead = execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
  if (remoteHead) {
    return remoteHead.replace('refs/remotes/origin/', '');
  }

  // Check which common branches exist locally
  const branches = getLocalBranches(cwd);
  for (const candidate of ['main', 'master', 'develop']) {
    if (branches.includes(candidate)) {
      return candidate;
    }
  }

  // Try current HEAD
  const head = execGit(['symbolic-ref', '--short', 'HEAD'], cwd);
  if (head) {
    return head;
  }

  return 'main';
}

/**
 * Get all local branch names
 */
function getLocalBranches(cwd: string): string[] {
  const output = execGit(['branch', '--format=%(refname:short)'], cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

/**
 * Get all remote branch names (without remote prefix)
 */
function getRemoteBranches(cwd: string): string[] {
  const output = execGit(['branch', '-r', '--format=%(refname:short)'], cwd);
  if (!output) return [];
  return output
    .split('\n')
    .filter(Boolean)
    .map((b) => b.replace(/^origin\//, ''))
    .filter((b) => b !== 'HEAD');
}

/**
 * Detect branch patterns from existing branches
 *
 * Looks for common prefix patterns like feature/, release/, hotfix/
 */
function detectBranchPatterns(branches: string[]): string[] {
  const prefixes = new Set<string>();
  const knownPrefixes = ['feature', 'release', 'hotfix', 'bugfix', 'fix', 'chore', 'docs'];

  for (const branch of branches) {
    const slashIdx = branch.indexOf('/');
    if (slashIdx > 0) {
      const prefix = branch.substring(0, slashIdx);
      if (knownPrefixes.includes(prefix)) {
        prefixes.add(`${prefix}/*`);
      }
    }
  }

  return [...prefixes].sort();
}

/**
 * Determine the workflow type based on detected branch structure
 */
function determineWorkflowType(
  hasDevelop: boolean,
  branchPatterns: string[],
  allBranches: string[]
): GitWorkflowType {
  // git-flow: has develop + feature/release/hotfix patterns
  const hasFlowPatterns = branchPatterns.some(
    (p) => p === 'feature/*' || p === 'release/*' || p === 'hotfix/*'
  );
  if (hasDevelop && hasFlowPatterns) {
    return 'git-flow';
  }

  // github-flow: has feature branches but no develop
  const hasFeatureBranches = allBranches.some((b) => b.includes('/'));
  if (!hasDevelop && hasFeatureBranches) {
    return 'github-flow';
  }

  // trunk-based: main/master only, no feature branches
  if (!hasDevelop && !hasFeatureBranches) {
    return 'trunk-based';
  }

  // If develop exists but no flow patterns, still classify as git-flow (develop-based).
  // At this point hasDevelop is always true: all !hasDevelop cases returned above.
  return 'git-flow';
}

/**
 * Detect the git workflow used in a project
 *
 * @param cwd - Project directory (must be a git repository)
 * @returns Detection result, or null if not a git repository
 */
export function detectGitWorkflow(cwd: string): GitWorkflowResult | null {
  if (!isGitRepo(cwd)) {
    return null;
  }

  const localBranches = getLocalBranches(cwd);
  const remoteBranches = getRemoteBranches(cwd);
  const allBranches = [...new Set([...localBranches, ...remoteBranches])];

  const defaultBranch = detectDefaultBranch(cwd);
  const hasDevelop = localBranches.includes('develop') || remoteBranches.includes('develop');
  const branchPatterns = detectBranchPatterns(allBranches);
  const type = determineWorkflowType(hasDevelop, branchPatterns, allBranches);

  return {
    type,
    defaultBranch,
    hasDevelop,
    branchPatterns,
  };
}

/**
 * Generate Git Workflow markdown section (English)
 */
export function renderGitWorkflowEN(result: GitWorkflowResult): string {
  switch (result.type) {
    case 'git-flow':
      return renderGitFlowEN(result);
    case 'github-flow':
      return renderGithubFlowEN(result);
    case 'trunk-based':
      return renderTrunkBasedEN(result);
  }
}

/**
 * Generate Git Workflow markdown section (Korean)
 */
export function renderGitWorkflowKO(result: GitWorkflowResult): string {
  switch (result.type) {
    case 'git-flow':
      return renderGitFlowKO(result);
    case 'github-flow':
      return renderGithubFlowKO(result);
    case 'trunk-based':
      return renderTrunkBasedKO(result);
  }
}

function renderGitFlowEN(r: GitWorkflowResult): string {
  const lines = [
    '## Git Workflow (MUST follow)',
    '',
    '| Branch | Purpose |',
    '|--------|---------|',
    `| \`${r.defaultBranch}\` | Main development branch (default) |`,
  ];

  if (r.branchPatterns.includes('feature/*')) {
    lines.push(`| \`feature/*\` | New features -> PR to ${r.defaultBranch} |`);
  }
  if (r.branchPatterns.includes('release/*')) {
    lines.push('| `release/*` | Release preparation -> **npm publish here only** |');
  }
  if (r.branchPatterns.includes('hotfix/*')) {
    lines.push(
      `| \`hotfix/*\` | Critical fixes -> tag -> publish -> merge to ${r.defaultBranch} |`
    );
  }
  if (r.branchPatterns.includes('bugfix/*')) {
    lines.push(`| \`bugfix/*\` | Bug fixes -> PR to ${r.defaultBranch} |`);
  }

  lines.push('');
  lines.push('**Key rules:**');
  lines.push(`- Create feature branches from \`${r.defaultBranch}\``);
  lines.push('- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`');
  lines.push('- Include "Closes #N" in commit message to auto-close issues');

  return lines.join('\n');
}

function renderGithubFlowEN(r: GitWorkflowResult): string {
  const lines = [
    '## Git Workflow (MUST follow)',
    '',
    '| Branch | Purpose |',
    '|--------|---------|',
    `| \`${r.defaultBranch}\` | Production-ready code (default) |`,
    `| \`feature/*\` | New features -> PR to ${r.defaultBranch} |`,
    '',
    '**Key rules:**',
    `- Create feature branches from \`${r.defaultBranch}\``,
    `- All changes go through PR to \`${r.defaultBranch}\``,
    '- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`',
    '- Include "Closes #N" in commit message to auto-close issues',
  ];

  return lines.join('\n');
}

function renderTrunkBasedEN(r: GitWorkflowResult): string {
  const lines = [
    '## Git Workflow (MUST follow)',
    '',
    '| Branch | Purpose |',
    '|--------|---------|',
    `| \`${r.defaultBranch}\` | Main trunk (default) |`,
    '',
    '**Key rules:**',
    `- Commit directly to \`${r.defaultBranch}\` or use short-lived branches`,
    '- Keep branches short-lived (merge within 1-2 days)',
    '- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`',
  ];

  return lines.join('\n');
}

function renderGitFlowKO(r: GitWorkflowResult): string {
  const lines = [
    '## Git 워크플로우 (반드시 준수)',
    '',
    '| 브랜치 | 용도 |',
    '|--------|------|',
    `| \`${r.defaultBranch}\` | 메인 개발 브랜치 (기본) |`,
  ];

  if (r.branchPatterns.includes('feature/*')) {
    lines.push(`| \`feature/*\` | 새 기능 -> ${r.defaultBranch}으로 PR |`);
  }
  if (r.branchPatterns.includes('release/*')) {
    lines.push('| `release/*` | 릴리스 준비 -> **npm 배포는 여기서만** |');
  }
  if (r.branchPatterns.includes('hotfix/*')) {
    lines.push(`| \`hotfix/*\` | 긴급 수정 -> 태그 -> 배포 -> ${r.defaultBranch} 머지 |`);
  }
  if (r.branchPatterns.includes('bugfix/*')) {
    lines.push(`| \`bugfix/*\` | 버그 수정 -> ${r.defaultBranch}으로 PR |`);
  }

  lines.push('');
  lines.push('**핵심 규칙:**');
  lines.push(`- \`${r.defaultBranch}\`에서 feature 브랜치 생성`);
  lines.push('- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`');
  lines.push('- 커밋 메시지에 "Closes #N" 포함시 이슈 자동 종료');

  return lines.join('\n');
}

function renderGithubFlowKO(r: GitWorkflowResult): string {
  const lines = [
    '## Git 워크플로우 (반드시 준수)',
    '',
    '| 브랜치 | 용도 |',
    '|--------|------|',
    `| \`${r.defaultBranch}\` | 프로덕션 준비 코드 (기본) |`,
    `| \`feature/*\` | 새 기능 -> ${r.defaultBranch}으로 PR |`,
    '',
    '**핵심 규칙:**',
    `- \`${r.defaultBranch}\`에서 feature 브랜치 생성`,
    `- 모든 변경은 \`${r.defaultBranch}\`으로 PR을 통해 진행`,
    '- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`',
    '- 커밋 메시지에 "Closes #N" 포함시 이슈 자동 종료',
  ];

  return lines.join('\n');
}

function renderTrunkBasedKO(r: GitWorkflowResult): string {
  const lines = [
    '## Git 워크플로우 (반드시 준수)',
    '',
    '| 브랜치 | 용도 |',
    '|--------|------|',
    `| \`${r.defaultBranch}\` | 메인 트렁크 (기본) |`,
    '',
    '**핵심 규칙:**',
    `- \`${r.defaultBranch}\`에 직접 커밋하거나 단기 브랜치 사용`,
    '- 브랜치는 단기 유지 (1-2일 내 머지)',
    '- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`',
  ];

  return lines.join('\n');
}

/**
 * Default fallback workflow result when not in a git repo
 */
export function getDefaultWorkflow(): GitWorkflowResult {
  return {
    type: 'github-flow',
    defaultBranch: 'main',
    hasDevelop: false,
    branchPatterns: ['feature/*'],
  };
}
