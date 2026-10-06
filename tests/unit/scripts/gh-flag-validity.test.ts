import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Tier-1 결정론 검사 (#1757 제안 1): 실행 경로 텍스트(스킬, 워크플로 YAML, CI)에 적힌
// `gh <noun> <verb> ... --flag` 명령의 플래그가 실제 `gh <noun> <verb> --help`의
// FLAGS / INHERITED FLAGS 절에 존재하는지 대조한다. 존재하지 않는 플래그
// (예: `gh issue edit --assignee`)는 런타임에서야 "unknown flag"로 드러나므로 정적으로 잡는다.
//
// 외부 프로세스는 `Bun.spawnSync`로 실행한다. 다른 테스트 파일의
// `mock.module('node:child_process')`가 같은 프로세스 안에서 누수되어도
// (spawnSync가 stdout 없는 객체로 교체됨) 영향을 받지 않는다.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');

/**
 * 스캔 대상 (git 추적 파일). 사용자에게 배포되는 templates 사본도 포함한다.
 * rules/wiki/guides/docs는 의도적으로 제외한다.
 */
const SCAN_PATHSPECS = [
  '.claude/skills',
  'workflows/*.yaml',
  '.github/workflows',
  'templates/.claude/skills',
  'templates/workflows/*.yaml',
] as const;

/** 검사 대상 gh 명사(noun). `gh api`는 verb 서브커맨드가 없으므로 포함하지 않는다. */
const GH_COMMAND_PATTERN =
  /(?<![\w-])gh (issue|pr|release|run|label|repo|secret|workflow|search) ([a-z][a-z-]*)([^\n|;&`]*)/g;

/** 캡처된 꼬리(tail)에서 플래그를 뽑는 패턴. */
const FLAG_PATTERN = /(?<![\w-])--[a-z][a-z-]+/g;

export interface GhCommandRef {
  file: string;
  line: number;
  noun: string;
  verb: string;
  flags: string[];
  text: string;
}

export interface FlagMismatch {
  file: string;
  line: number;
  command: string;
  flag: string;
  /** help 조회 실패 / 존재하지 않는 verb / 존재하지 않는 플래그 */
  reason: 'missing-flag' | 'help-unavailable' | 'unknown-verb';
}

/**
 * 명령 치환 `$(...)` 내부는 별개의 명령(git, jq 등)이므로 플래그 추출 전에 제거한다.
 * 괄호 깊이를 추적하며, 닫히지 않으면 줄 끝까지 제거한다.
 */
export function stripCommandSubstitutions(line: string): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('$(', i)) {
      i = skipSubstitution(line, i + 2);
      out += ' ';
    } else {
      out += line[i];
      i++;
    }
  }
  return out;
}

/** `$(` 직후 위치에서 시작해 대응하는 `)` 다음 위치(없으면 줄 끝)를 반환한다. */
function skipSubstitution(line: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < line.length && depth > 0) {
    if (line[i] === '(') depth++;
    if (line[i] === ')') depth--;
    i++;
  }
  return i;
}

/** 줄 연결(`\` + 개행) 처리 후의 논리적 한 줄. `line`은 원본 파일의 시작 줄 번호(1-base). */
interface LogicalLine {
  line: number;
  text: string;
}

/**
 * 줄 끝 `\` 연속을 이어 붙여 논리적 줄 목록을 만든다 (`\\\n\s*` -> 공백 1칸).
 * 셸 스크립트와 YAML `run: |` 블록 모두 동일하게 적용되며, 줄 번호는 첫 물리 줄 기준이다.
 */
export function joinLineContinuations(content: string): LogicalLine[] {
  const physical = content.split('\n');
  const out: LogicalLine[] = [];
  let i = 0;
  while (i < physical.length) {
    const startLine = i + 1;
    let text = physical[i] ?? '';
    while (/\\\s*$/.test(text) && i + 1 < physical.length) {
      i++;
      text = `${text.replace(/\\\s*$/, '')} ${(physical[i] ?? '').trimStart()}`;
    }
    out.push({ line: startLine, text });
    i++;
  }
  return out;
}

/** 텍스트 한 덩어리에서 gh 명령 참조를 (줄 연속을 이은 논리적 줄 단위로) 추출한다. */
export function extractGhCommands(file: string, content: string): GhCommandRef[] {
  const refs: GhCommandRef[] = [];
  for (const logical of joinLineContinuations(content)) {
    const lineText = stripCommandSubstitutions(logical.text);
    for (const match of lineText.matchAll(GH_COMMAND_PATTERN)) {
      const noun = match[1] ?? '';
      const verb = match[2] ?? '';
      const tail = match[3] ?? '';
      const flags = [...tail.matchAll(FLAG_PATTERN)].map((m) => m[0].replace(/-+$/, ''));
      refs.push({
        file,
        line: logical.line,
        noun,
        verb,
        flags,
        text: `gh ${noun} ${verb}${tail}`.trimEnd(),
      });
    }
  }
  return refs;
}

/** 대문자 섹션 제목 줄(`FLAGS`, `INHERITED FLAGS`, `USAGE` ...)이면 제목을, 아니면 null을 반환한다. */
function sectionHeading(line: string): string | null {
  const m = /^([A-Z][A-Z ]*[A-Z])$/.exec(line.trimEnd());
  return m ? (m[1] ?? null) : null;
}

/**
 * help 텍스트의 FLAGS / INHERITED FLAGS 절에서 선언된 긴 플래그 집합을 뽑는다.
 * 설명 산문에 언급만 된 플래그(예: `release create`의 `--tags`)는 제외된다.
 */
export function parseHelpFlags(helpText: string): Set<string> {
  const flags = new Set<string>();
  let inFlagSection = false;
  for (const line of helpText.split('\n')) {
    const heading = sectionHeading(line);
    if (heading !== null) {
      inFlagSection = heading === 'FLAGS' || heading === 'INHERITED FLAGS';
      continue;
    }
    if (!inFlagSection) continue;
    const m = /^\s+(?:-[A-Za-z], )?(--[a-z][a-z0-9-]*)/.exec(line);
    if (m?.[1]) flags.add(m[1]);
  }
  return flags;
}

/** help의 FLAGS / INHERITED FLAGS 절에 플래그가 선언돼 있는지 확인한다. */
export function helpHasFlag(helpText: string, flag: string): boolean {
  return parseHelpFlags(helpText).has(flag);
}

/**
 * help의 USAGE가 실제 하위 명령(`gh <noun> <something>`)을 가리키는지 확인한다.
 * `gh issue nonsense --help`는 종료코드 0으로 부모 help(`gh issue <command> [flags]`)를
 * 출력하므로, USAGE가 `<command>` 형태이거나 USAGE가 없으면 존재하지 않는 verb로 본다.
 * 별칭(`gh issue ls`)은 원본 명령(`gh issue list`)의 USAGE를 출력하므로 통과한다.
 */
export function helpResolvesVerb(helpText: string, noun: string): boolean {
  let inUsage = false;
  for (const line of helpText.split('\n')) {
    const heading = sectionHeading(line);
    if (heading !== null) {
      inUsage = heading === 'USAGE';
      continue;
    }
    if (!inUsage) continue;
    const m = new RegExp(`^\\s+gh ${noun} (\\S+)`).exec(line);
    if (m?.[1]) return m[1] !== '<command>';
  }
  return false;
}

/** 추출 결과를 help 조회 함수로 대조해 불일치 목록을 만든다. */
export function findFlagMismatches(
  refs: GhCommandRef[],
  getHelp: (noun: string, verb: string) => string | null
): FlagMismatch[] {
  const mismatches: FlagMismatch[] = [];
  for (const ref of refs) {
    if (ref.flags.length === 0) continue;
    const help = getHelp(ref.noun, ref.verb);
    const base = { file: ref.file, line: ref.line, command: ref.text };
    if (help === null) {
      for (const flag of ref.flags) {
        mismatches.push({ ...base, flag, reason: 'help-unavailable' });
      }
      continue;
    }
    if (!helpResolvesVerb(help, ref.noun)) {
      mismatches.push({ ...base, flag: ref.flags.join(' '), reason: 'unknown-verb' });
      continue;
    }
    const declared = parseHelpFlags(help);
    for (const flag of ref.flags) {
      if (!declared.has(flag)) {
        mismatches.push({ ...base, flag, reason: 'missing-flag' });
      }
    }
  }
  return mismatches;
}

export function formatMismatch(m: FlagMismatch): string {
  const why =
    m.reason === 'missing-flag'
      ? `flag ${m.flag} not found in FLAGS of \`gh --help\``
      : m.reason === 'unknown-verb'
        ? `unknown verb (\`gh --help\` printed the parent help) for ${m.flag}`
        : `\`gh --help\` unavailable for flag ${m.flag}`;
  return `${m.file}:${m.line}  \`${m.command}\`  -> ${why}`;
}

// ---------------------------------------------------------------------------
// 외부 명령 실행 헬퍼 (실제 저장소 스캔용, Bun.spawnSync 기반)
// ---------------------------------------------------------------------------

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** 실행 자체가 실패한 경우(바이너리 없음 등)의 사유 */
  error?: string;
}

function runCommand(cmd: string[], cwd?: string): CommandResult {
  // Only Git corpus commands need the parent's repository/config state removed.
  const env =
    cmd[0] === 'git'
      ? Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
      : process.env;
  try {
    const proc = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
    return {
      ok: proc.exitCode === 0,
      stdout: proc.stdout?.toString() ?? '',
      stderr: proc.stderr?.toString() ?? '',
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, stdout: '', stderr: '', error: reason };
  }
}

const ghProbe = runCommand(['gh', '--version']);
const ghAvailable = ghProbe.ok;
const ghUnavailableReason =
  ghProbe.error ?? (ghProbe.stderr.trim() || 'gh --version exited non-zero');

if (!ghAvailable) {
  console.warn(
    `[gh-flag-validity] gh CLI unavailable (${ghUnavailableReason}); real-repo flag scan is skipped.`
  );
}

const helpCache = new Map<string, string | null>();

function getGhHelp(noun: string, verb: string): string | null {
  const key = `${noun} ${verb}`;
  if (helpCache.has(key)) return helpCache.get(key) ?? null;
  const result = runCommand(['gh', noun, verb, '--help']);
  // gh는 --help 출력을 stdout으로 내지만, 버전에 따라 stderr일 수 있어 둘 다 합친다.
  const help = result.ok ? `${result.stdout}\n${result.stderr}` : null;
  helpCache.set(key, help);
  return help;
}

function listTrackedScanFiles(): string[] {
  const result = runCommand(['git', 'ls-files', '--', ...SCAN_PATHSPECS], REPO_ROOT);
  if (!result.ok) {
    throw new Error(`git ls-files failed: ${result.error ?? result.stderr}`);
  }
  return result.stdout.split('\n').filter((f) => f.length > 0);
}

// ---------------------------------------------------------------------------
// 추출기/검사기 단위 테스트 (인라인 픽스처, gh 불필요)
// ---------------------------------------------------------------------------

describe('extractGhCommands', () => {
  test('extracts noun, verb, flags and line number', () => {
    const refs = extractGhCommands('x.yaml', 'a\n  run: gh issue edit 1 --assignee @me\n');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      file: 'x.yaml',
      line: 2,
      noun: 'issue',
      verb: 'edit',
      flags: ['--assignee'],
    });
  });

  test('handles placeholders (<N>, {n}, $var) and multiple flags', () => {
    const text = 'gh issue edit <N> --add-label "in-progress" --remove-label $LABEL {n}';
    const refs = extractGhCommands('x.md', text);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.flags).toEqual(['--add-label', '--remove-label']);
  });

  test('ignores gh api (no verb subcommand) and unrelated nouns', () => {
    const refs = extractGhCommands(
      'x.md',
      'gh api repos/x/y --jq .id\ngh auth status --show-token'
    );
    expect(refs).toHaveLength(0);
  });

  test('stops the tail at pipe / semicolon / ampersand', () => {
    const refs = extractGhCommands('x.md', 'gh pr view 1 --json state | jq --raw-output .state');
    expect(refs[0]?.flags).toEqual(['--json']);
  });

  test('ignores flags inside $(...) command substitution but keeps later gh flags', () => {
    const line =
      'gh issue list --search "closed:>$(git log -1 --format=%ci $T | cut -d" ")" --json number';
    const refs = extractGhCommands('x.md', line);
    expect(refs[0]?.flags).toEqual(['--search', '--json']);
  });

  test('does not match inside a longer word (e.g. xgh issue)', () => {
    expect(extractGhCommands('x.md', 'xgh issue edit --foo')).toHaveLength(0);
  });
});

describe('joinLineContinuations / continuation-aware extraction (M1)', () => {
  test('joins backslash continuations and keeps the first physical line number', () => {
    const logical = joinLineContinuations('a\ngh issue edit 1 \\\n  --assignee @me\nb');
    expect(logical.map((l) => l.line)).toEqual([1, 2, 4]);
    expect(logical[1]?.text).toBe('gh issue edit 1  --assignee @me');
  });

  test('flag on a continuation line is extracted (shell and YAML run block)', () => {
    const md = 'gh issue edit 1 \\\n  --assignee @me';
    expect(extractGhCommands('x.md', md)[0]?.flags).toEqual(['--assignee']);
    const yaml =
      'steps:\n  - run: |\n      gh pr create \\\n        --title t \\\n        --bogus x\n';
    const refs = extractGhCommands('x.yaml', yaml);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ line: 3, flags: ['--title', '--bogus'] });
  });
});

describe('findFlagMismatches (inline fixtures)', () => {
  // gh issue edit의 help를 흉내 낸 최소 픽스처 (상속 플래그 --repo 포함)
  const editHelp = [
    'Edit an issue. Unlike --assignee-style flags of other tools, use the add/remove forms.',
    '',
    'USAGE',
    '  gh issue edit {<numbers> | <urls>} [flags]',
    '',
    'FLAGS',
    '      --add-assignee login   Add assigned users',
    '      --add-label name       Add labels',
    '  -t, --title string         Set the new title',
    '',
    'INHERITED FLAGS',
    '  -R, --repo [HOST/]OWNER/REPO   Select another repository',
    '',
    'LEARN MORE',
    '  Use `gh help formatting` or pass --tags for more.',
  ].join('\n');
  const parentHelp = ['Work with GitHub issues.', '', 'USAGE', '  gh issue <command> [flags]'].join(
    '\n'
  );
  const fakeHelp = (noun: string, verb: string): string | null => {
    if (noun !== 'issue') return null;
    if (verb === 'edit') return editHelp;
    // 존재하지 않는 verb: gh는 종료코드 0으로 부모 help를 출력한다 (L2)
    if (verb === 'nonsense') return parentHelp;
    return null;
  };

  test('positive: `gh issue edit 1 --assignee @me` is reported as missing', () => {
    const refs = extractGhCommands('fixture.yaml', 'gh issue edit 1 --assignee @me');
    const mismatches = findFlagMismatches(refs, fakeHelp);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      file: 'fixture.yaml',
      line: 1,
      flag: '--assignee',
      reason: 'missing-flag',
    });
    expect(formatMismatch(mismatches[0] as FlagMismatch)).toContain('fixture.yaml:1');
  });

  test('positive (M1): missing flag on a continuation line is reported at the first line', () => {
    const refs = extractGhCommands('fixture.md', 'x\ngh issue edit 1 \\\n  --assignee @me');
    const mismatches = findFlagMismatches(refs, fakeHelp);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ line: 2, flag: '--assignee', reason: 'missing-flag' });
  });

  test('negative: `gh issue edit 1 --add-assignee @me` passes', () => {
    const refs = extractGhCommands('fixture.yaml', 'gh issue edit 1 --add-assignee @me');
    expect(findFlagMismatches(refs, fakeHelp)).toEqual([]);
  });

  test('inherited flags listed in help (--repo) are accepted', () => {
    const refs = extractGhCommands('fixture.yaml', 'gh issue edit 1 --repo o/r --add-label x');
    expect(findFlagMismatches(refs, fakeHelp)).toEqual([]);
  });

  test('prefix flag is not a match for a longer flag (--add vs --add-label)', () => {
    const help = ['FLAGS', '      --add-label name   Add labels'].join('\n');
    expect(helpHasFlag(help, '--add')).toBe(false);
    expect(helpHasFlag(help, '--add-label')).toBe(true);
  });

  test('positive (L5): flag mentioned only in prose (outside FLAGS) is missing', () => {
    // `--tags`는 소개/LEARN MORE 산문에만 나오고 FLAGS에는 없다
    const refs = extractGhCommands('fixture.md', 'gh issue edit 1 --tags v1');
    const mismatches = findFlagMismatches(refs, fakeHelp);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ flag: '--tags', reason: 'missing-flag' });
    expect(helpHasFlag(editHelp, '--assignee')).toBe(false);
  });

  test('positive (L2): unknown verb whose help is the parent help -> unknown-verb', () => {
    const refs = extractGhCommands('fixture.md', 'gh issue nonsense --help');
    const mismatches = findFlagMismatches(refs, fakeHelp);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.reason).toBe('unknown-verb');
  });

  test('negative (L2): alias help (USAGE names the real verb) is accepted', () => {
    const aliasHelp = [
      'USAGE',
      '  gh issue list [flags]',
      '',
      'FLAGS',
      '  -L, --limit int  Max',
    ].join('\n');
    const refs = extractGhCommands('fixture.md', 'gh issue ls --limit 5');
    expect(findFlagMismatches(refs, () => aliasHelp)).toEqual([]);
  });

  test('unavailable help for (noun, verb) with flags is reported as help-unavailable', () => {
    const refs = extractGhCommands('fixture.md', 'gh issue unknownverb --foo');
    const mismatches = findFlagMismatches(refs, fakeHelp);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.reason).toBe('help-unavailable');
  });
});

// ---------------------------------------------------------------------------
// 실제 저장소 스캔 (gh 필요)
// ---------------------------------------------------------------------------

describe('gh flag validity in execution-path text (#1757)', () => {
  test('scans this repository execution texts even with inherited Git state', () => {
    expect(listTrackedScanFiles()).toContain('.claude/skills/fsd/SKILL.md');
  });

  // L1: 조용한 skip 금지 -- CI에서 gh가 없으면 skip이 아니라 실패한다 (R020 Test-Skip Is Not Completion)
  test('gh CLI is available (mandatory in CI, warn-only locally)', () => {
    if (!ghAvailable) {
      const message = `gh CLI unavailable: ${ghUnavailableReason}`;
      if (process.env.CI === 'true') {
        throw new Error(`${message} -- the flag validity scan cannot be skipped in CI`);
      }
      console.warn(`[gh-flag-validity] ${message}; real-repo scan skipped locally.`);
    }
    expect(ghAvailable || process.env.CI !== 'true').toBe(true);
  });

  test.skipIf(!ghAvailable)(
    'every `gh <noun> <verb> --flag` in skills / workflows / CI exists in `gh --help`',
    () => {
      const refs: GhCommandRef[] = [];
      for (const file of listTrackedScanFiles()) {
        let content: string;
        try {
          content = readFileSync(resolve(REPO_ROOT, file), 'utf-8');
        } catch {
          // 병렬 편집 중 삭제/이동된 파일은 건너뛴다
          continue;
        }
        refs.push(...extractGhCommands(file, content));
      }

      // 스캔이 공허하게 통과하지 않도록 최소한의 명령이 추출됐는지 확인한다
      expect(refs.length).toBeGreaterThan(0);

      const mismatches = findFlagMismatches(refs, getGhHelp);
      const report = mismatches.map(formatMismatch).join('\n');
      expect(mismatches.length === 0 ? '' : `\n${report}\n`).toBe('');
    },
    120_000
  );
});
