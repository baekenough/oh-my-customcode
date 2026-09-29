/**
 * Tier-1 위생 검사: `node:child_process` 모듈 목(mock)의 누수 방지 (#1760)
 *
 * bun의 `mock.module()`은 파일 경계를 넘어 같은 프로세스 안에서 유지되고
 * `mock.restore()`로도 복원되지 않는다. `node:child_process`를 목킹한 테스트 파일이
 * `afterAll`에서 원본으로 다시 등록하지 않으면, 이후 실행되는 다른 파일의 `spawnSync` 등이
 * 목으로 대체되어 전체 스위트에서만 실패하는 문제가 생긴다.
 * 또한 "원본 캡처 후 복원" 패턴은 앞선 파일이 누수시킨 모듈을 캡처하면 무효가 되므로,
 * 스위트 내 모든 child_process 모듈 목이 복원해야만 안전하다 (Adversarial M1).
 *
 * 이 검사는 git 추적 테스트 파일을 정적으로 스캔해, child_process 모듈 목이 있는데
 * `afterAll` 안에서 같은 모듈을 다시 등록하지 않는 파일을 file:line 으로 보고한다.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 스캐너
// ---------------------------------------------------------------------------

/** child_process 모듈 목 호출 (node: 접두 유무 모두 허용) */
const CHILD_PROCESS_MOCK_PATTERN = /mock\.module\(\s*(['"`])(?:node:)?child_process\1/g;

export interface MockViolation {
  /** 1-기반 줄 번호 (복원이 없는 첫 목 등록 위치) */
  line: number;
}

/** 문자열/템플릿 리터럴이 `index`에서 시작하면 닫는 따옴표 다음 위치를, 아니면 `index`를 반환 */
function stringEnd(code: string, index: number): number {
  const quote = code.charAt(index);
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return index;
  }
  let i = index + 1;
  while (i < code.length && code.charAt(i) !== quote) {
    i += code.charAt(i) === '\\' ? 2 : 1;
  }
  return Math.min(i + 1, code.length);
}

/** 주석이 `index`에서 시작하면 주석 끝 다음 위치를, 아니면 `index`를 반환 */
function commentEnd(code: string, index: number): number {
  const pair = code.slice(index, index + 2);
  if (pair === '//') {
    const newline = code.indexOf('\n', index);
    return newline === -1 ? code.length : newline;
  }
  if (pair === '/*') {
    const close = code.indexOf('*/', index + 2);
    return close === -1 ? code.length : close + 2;
  }
  return index;
}

/**
 * 주석을 공백으로 치환한다(줄바꿈은 보존하여 줄 번호 유지).
 * 문자열/템플릿 리터럴 내부의 `//` 는 주석으로 오인하지 않는다.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const commentStop = commentEnd(source, i);
    if (commentStop > i) {
      out += source.slice(i, commentStop).replace(/[^\n]/g, ' ');
      i = commentStop;
      continue;
    }
    const stringStop = stringEnd(source, i);
    if (stringStop > i) {
      out += source.slice(i, stringStop);
      i = stringStop;
      continue;
    }
    out += source.charAt(i);
    i++;
  }
  return out;
}

/** `from`(여는 괄호 직후)부터 짝이 맞는 닫는 괄호 다음 위치를 반환. 문자열 내부 괄호는 무시한다. */
function closingParenEnd(code: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < code.length && depth > 0) {
    const stringStop = stringEnd(code, i);
    if (stringStop > i) {
      i = stringStop;
      continue;
    }
    const ch = code.charAt(i);
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    i++;
  }
  return i;
}

/** `afterAll(` 호출의 괄호 범위 [start, end) 목록 */
function findAfterAllRanges(code: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const opener = /\bafterAll\s*\(/g;
  let match: RegExpExecArray | null = opener.exec(code);
  while (match !== null) {
    ranges.push([match.index, closingParenEnd(code, match.index + match[0].length)]);
    match = opener.exec(code);
  }
  return ranges;
}

function lineOf(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (code.charAt(i) === '\n') {
      line++;
    }
  }
  return line;
}

/**
 * child_process 모듈 목이 있는데 `afterAll` 안에서 재등록하지 않으면 위반으로 보고한다.
 * 목이 없으면 빈 배열, 복원이 있으면 빈 배열.
 */
export function findUnrestoredChildProcessMocks(source: string): MockViolation[] {
  const code = stripComments(source);
  const mockIndexes: number[] = [];
  CHILD_PROCESS_MOCK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = CHILD_PROCESS_MOCK_PATTERN.exec(code);
  while (match !== null) {
    mockIndexes.push(match.index);
    match = CHILD_PROCESS_MOCK_PATTERN.exec(code);
  }
  if (mockIndexes.length === 0) {
    return [];
  }

  const ranges = findAfterAllRanges(code);
  const restored = mockIndexes.some((idx) =>
    ranges.some(([start, end]) => idx > start && idx < end)
  );
  if (restored) {
    return [];
  }
  const first = mockIndexes[0] ?? 0;
  return [{ line: lineOf(code, first) }];
}

// ---------------------------------------------------------------------------
// 단위 픽스처 (인라인 문자열 — 양성/음성 짝)
// ---------------------------------------------------------------------------

describe('findUnrestoredChildProcessMocks (fixtures)', () => {
  it('reports a child_process mock without afterAll restore (positive)', () => {
    const src = [
      "import { mock } from 'bun:test';",
      '',
      "mock.module('node:child_process', () => ({ execSync: () => '' }));",
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 3 }]);
  });

  it('reports the bare "child_process" specifier and double quotes (positive)', () => {
    const src = 'mock.module("child_process", () => ({}));';
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 1 }]);
  });

  it('reports when afterAll exists but does not re-register the module (positive)', () => {
    const src = [
      "mock.module('node:child_process', () => ({}));",
      'afterAll(() => {',
      '  cleanup();',
      '});',
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 1 }]);
  });

  it('accepts a mock that re-registers the module inside afterAll (negative)', () => {
    const src = [
      "const real = { ...(await import('node:child_process')) };",
      "mock.module('node:child_process', () => ({ execSync: () => '' }));",
      'afterAll(() => {',
      "  mock.module('node:child_process', () => real);",
      '});',
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([]);
  });

  it('ignores mentions in line and block comments (negative)', () => {
    const src = [
      "// mock.module('node:child_process', () => ({}))",
      '/*',
      " * mock.module('node:child_process', () => ({}))",
      ' */',
      'const x = 1;',
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([]);
  });

  it('ignores mocks of other modules (negative)', () => {
    const src = "mock.module('../../../src/core/updater.js', () => ({}));";
    expect(findUnrestoredChildProcessMocks(src)).toEqual([]);
  });

  it('does not treat // inside a string as a comment', () => {
    const src = [
      "const url = 'http://example.com';",
      "mock.module('node:child_process', () => ({}));",
    ].join('\n');
    expect(findUnrestoredChildProcessMocks(src)).toEqual([{ line: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// 저장소 스캔 (git 추적 테스트 파일)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SELF_PATH = 'tests/unit/scripts/child-process-mock-hygiene.test.ts';

const TEST_FILE_PATTERNS: RegExp[] = [
  /^tests\/.*\.[jt]sx?$/,
  /^packages\/[^/]+\/src\/(?:.*\/)?__tests__\/.*\.[jt]sx?$/,
];

function listTrackedTestFiles(): string[] {
  // child_process를 쓰지 않도록 Bun.spawnSync 사용 (모듈 목의 영향을 받지 않는다)
  const result = Bun.spawnSync(['git', 'ls-files', '--', 'tests', 'packages'], {
    cwd: REPO_ROOT,
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  }
  return result.stdout
    .toString()
    .split('\n')
    .filter((file) => file.length > 0)
    .filter((file) => file !== SELF_PATH) // 자기 자신의 픽스처 문자열은 제외
    .filter((file) => TEST_FILE_PATTERNS.some((pattern) => pattern.test(file)));
}

describe('child_process module mock hygiene (repository scan)', () => {
  it('every child_process module mock is restored in afterAll', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of listTrackedTestFiles()) {
      const fullPath = join(REPO_ROOT, file);
      if (!existsSync(fullPath)) {
        continue; // 추적 중이나 작업 트리에서 삭제된 파일
      }
      scanned++;
      const violations = findUnrestoredChildProcessMocks(readFileSync(fullPath, 'utf-8'));
      for (const violation of violations) {
        offenders.push(`${file}:${violation.line}`);
      }
    }

    expect(scanned).toBeGreaterThan(0);
    expect(
      offenders,
      `node:child_process 모듈 목이 afterAll 복원 없이 등록됨 (#1760): ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
