import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  checkWiki,
  createWikiIndex,
  extractLinks,
  fileSystem,
  isContained,
  type Link,
  resolveDestination,
  resolveLink,
  runCli,
  sourcePosition,
} from '../../../scripts/verify-wiki-links';

let sandbox: string;
let root: string;
let wiki: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'wiki-links-test-')));
  root = join(sandbox, 'repo');
  wiki = join(root, 'wiki');
  mkdirSync(wiki, { recursive: true });
});

afterEach(() => {
  if (
    dirname(sandbox) !== realpathSync(tmpdir()) ||
    !sandbox.split('/').at(-1)?.startsWith('wiki-links-test-')
  ) {
    throw new Error('Refusing cleanup outside owned wiki fixture');
  }
  rmSync(sandbox, { recursive: true, force: true });
});

function put(path: string, source = '# Page'): string {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  return target;
}

function standard(target: string): Link {
  return { kind: 'standard', target, rawTarget: target, offset: 0 };
}

function wikiLink(target: string): Link {
  return { ...standard(target), kind: 'wiki' };
}

function cli(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const home = join(sandbox, 'home');
  const temp = join(sandbox, 'tmp');
  mkdirSync(home, { recursive: true });
  mkdirSync(temp, { recursive: true });
  const child = Bun.spawnSync({
    cmd: [
      process.execPath,
      resolve(import.meta.dir, '../../../scripts/verify-wiki-links.ts'),
      ...args,
    ],
    cwd: sandbox,
    env: { ...env, HOME: home, TMPDIR: temp, NO_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}

describe('wiki link extraction contracts', () => {
  it('uses the first normalized reference definition at full, collapsed and shortcut use sites', () => {
    const source =
      '[shown][MiXeD] [mixed][] [MIXED]\r\n\r\n[mixed]: good.md\r\n[MIXED]: broken.md\r\n[unused]: absent.md';
    const result = extractLinks(source, 'wiki/Home.md');
    expect(result.diagnostics).toEqual([]);
    expect(result.links.map((link) => link.target)).toEqual(['good.md', 'good.md', 'good.md']);
    expect(result.links.map((link) => link.rawTarget)).toEqual([
      '[shown][MiXeD]',
      '[mixed][]',
      '[MIXED]',
    ]);
    expect(result.links.map((link) => link.offset)).toEqual([0, 15, 25]);
  });

  it('keeps CRLF use-site positions instead of definition positions', () => {
    put('wiki/Home.md', 'first\r\n  [bad][id]\r\n\r\n[id]: absent.md');
    const result = checkWiki(root);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ file: 'wiki/Home.md', line: 2, column: 3, rawTarget: '[bad][id]' }),
    ]);
    expect(sourcePosition('first\r\n  X', 9)).toEqual({ line: 2, column: 3 });
    expect(sourcePosition('first\r  X', 8)).toEqual({ line: 2, column: 3 });
  });

  it.each([
    '`[[ignored]]` [[real]]',
    '``multi\n[[ignored]]`` [[real]]',
    '```md\n[[ignored]] [x](absent.md)\n```\n[[real]]',
    '~~~\n[[ignored]]\n~~~\n[[real]]',
    '    [[ignored]]\n\n[[real]]',
    '<!-- [[ignored]]\n[x](absent.md) -->\n[[real]]',
    '<div>\n[[ignored]]\n</div>\n\n[[real]]',
    '\\[[ignored]] [[real]]',
    '![[ignored]](image.png) [[real]]',
  ])('masks excluded syntax while retaining its adjacent link: %s', (source) => {
    expect(extractLinks(source, 'p.md').links.map((link) => link.target)).toEqual(['real']);
  });

  it('masks wikilink-shaped labels inside standard links and preserves destinations', () => {
    const result = extractLinks('[[ignored]](good.md) [ordinary](other.md)', 'p.md');
    expect(result.links.map((link) => [link.kind, link.target])).toEqual([
      ['standard', 'good.md'],
      ['standard', 'other.md'],
    ]);
  });

  it('uses related-only raw YAML ranges, aliases and CST comments', () => {
    const source =
      '---\r\naliases: [One, "Two"]\r\ntitle: "[[outside]]"\r\nrelated:\r\n  - [[r001]] # [[comment]]\r\n  - "[[r002#heading|display]]"\r\n---\r\n[[body]]';
    const result = extractLinks(source, 'p.md');
    expect(result.diagnostics).toEqual([]);
    expect(result.aliases).toEqual(['One', 'Two']);
    expect(result.links.map((link) => link.target)).toEqual(['r001', 'r002#heading', 'body']);
    expect(result.links[0].offset).toBe(source.indexOf('[[r001]]'));
    expect(sourcePosition(source, result.links[0].offset)).toEqual({ line: 5, column: 5 });
    expect(result.excluded['metadata-outside-related']).toBe(1);
  });

  it.each(['alias', '[One, Two]', '[]'])('accepts declared aliases value %s', (aliases) => {
    expect(extractLinks(`---\naliases: ${aliases}\n---\n`, 'p.md').diagnostics).toEqual([]);
  });

  it.each([
    '42',
    'null',
    '[One, 42]',
    '" "',
    '[""]',
  ])('rejects invalid aliases value %s', (aliases) => {
    expect(extractLinks(`---\naliases: ${aliases}\n---\n`, 'p.md').diagnostics).toEqual([
      expect.objectContaining({ classification: 'metadata', line: 2 }),
    ]);
  });

  it.each([
    'aliases: [unclosed',
    'title: One\ntitle: Two',
    '- not a mapping',
    'title: !unsupported data',
  ])('fails closed on malformed closed metadata %s', (metadata) => {
    expect(extractLinks(`---\n${metadata}\n---\n`, 'p.md').diagnostics.length).toBeGreaterThan(0);
  });

  it('treats leading thematic break and colon paragraph without envelope as CommonMark', () => {
    const source = '---\ntitle: ordinary [link](page.md)\n';
    const result = extractLinks(source, 'p.md');
    expect(result.aliases).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.links.map((link) => link.target)).toEqual(['page.md']);
  });

  it('accepts a BOM-prefixed empty envelope and YAML document-end closing delimiter', () => {
    expect(extractLinks('\uFEFF---\r\n...\r\n[[page]]', 'p.md').links[0].target).toBe('page');
    expect(extractLinks('---\nrelated: "[[page]]"\n...\n', 'p.md').links[0].target).toBe('page');
  });

  it.each([
    '[[unclosed',
    '[[nested[[page]]',
    '[[]]',
    '[[a]b]]',
  ])('rejects malformed declared wikilink %s', (source) => {
    expect(extractLinks(source, 'p.md').diagnostics).toEqual([
      expect.objectContaining({ classification: 'malformed-wikilink', line: 1, column: 1 }),
    ]);
  });
});

describe('wiki resolution and filesystem boundaries', () => {
  it('resolves case-folded aliases and qualified names without global duplicate-basename failure', () => {
    put('wiki/a/r001.md', '---\naliases: Friendly Name\n---\n');
    put('wiki/b/r001.md');
    put('wiki/Home.md', '[[A/R001|display]] [[FRIENDLY NAME]]');
    expect(checkWiki(root)).toEqual(
      expect.objectContaining({ documents: 3, checked: 2, diagnostics: [] })
    );
    put('wiki/Home.md', '[[r001]]');
    expect(checkWiki(root).diagnostics).toEqual([
      expect.objectContaining({ classification: 'ambiguous' }),
    ]);
  });

  it('fails a used alias collision without confusing aliases with page display labels', () => {
    put('wiki/a.md', '---\naliases: Alias\n---\n');
    put('wiki/b.md', '---\naliases: ALIAS\n---\n');
    put('wiki/Home.md', '[[a|Alias]]');
    expect(checkWiki(root).diagnostics).toEqual([]);
    put('wiki/Home.md', '[[alias]]');
    expect(checkWiki(root).diagnostics[0].classification).toBe('ambiguous');
  });

  it.each([
    ['https://example.invalid/x', 'external'],
    ['mailto:a@example.invalid', 'external'],
    ['//example.invalid/x', 'external'],
    ['#heading', 'anchor'],
    ['?view=1#heading', 'anchor'],
    ['%ZZ.md', 'percent-encoding'],
    ['%00.md', 'invalid-path'],
    ['bad\\name.md', 'invalid-path'],
    ['../../outside.md', 'escape'],
  ])('classifies destination %s as %s', (target, classification) => {
    const result = resolveDestination(
      standard(target),
      join(wiki, 'Home.md'),
      createWikiIndex(root, [])
    );
    expect(result).toEqual(expect.objectContaining({ classification }));
    if (classification === 'external' || classification === 'anchor') {
      expect(result).toEqual(expect.objectContaining({ skipped: true }));
    }
  });

  it('decodes percent once and separates raw query/fragment before decoding', () => {
    put('wiki/%20.md');
    put('wiki/a#b.md');
    const index = createWikiIndex(root, []);
    expect(
      resolveLink(standard('%2520.md?ignored=%ZZ#heading'), join(wiki, 'Home.md'), index)
        .classification
    ).toBe('resolved');
    expect(
      resolveLink(standard('a%23b.md#heading'), join(wiki, 'Home.md'), index).classification
    ).toBe('resolved');
  });

  it('checks standard relative/repository-root targets with literal segment case', () => {
    put('wiki/Rules/Page.md');
    put('README.md');
    put('wiki/Home.md', '[relative](Rules/Page.md) [root](/README.md)');
    expect(checkWiki(root).diagnostics).toEqual([]);
    put('wiki/Home.md', '[wrong](rules/Page.md)');
    expect(checkWiki(root).diagnostics[0].classification).toBe('missing-or-case');
  });

  it('rejects lexical wiki escape and sibling-prefix containment', () => {
    expect(isContained(root, `${root}-other/page.md`)).toBe(false);
    const result = resolveDestination(
      wikiLink('../outside'),
      join(wiki, 'Home.md'),
      createWikiIndex(root, [])
    );
    expect(result).toEqual(expect.objectContaining({ classification: 'escape' }));
  });

  it('accepts internal file symlinks and reports directory symlink cycles without traversing them', () => {
    const page = put('wiki/page.md');
    symlinkSync(page, join(wiki, 'internal.md'));
    symlinkSync(wiki, join(wiki, 'cycle'), 'dir');
    put('wiki/Home.md', '[[internal]] [source](internal.md)');
    const result = checkWiki(root);
    expect(result.diagnostics).toEqual([]);
    expect(result.documents).toBe(3);
    expect(result.skipped['directory-symlink']).toBe(1);
  });

  it('blocks external input alias poisoning before reading, including sibling-prefix targets', () => {
    const outside = join(sandbox, 'repo-other');
    mkdirSync(outside);
    writeFileSync(join(outside, 'poison.md'), '---\naliases: Poison\n---\n');
    const input = join(wiki, 'external.md');
    symlinkSync(join(outside, 'poison.md'), input);
    put('wiki/Home.md', '[[Poison]]');
    const reads: string[] = [];
    const result = checkWiki(root, {
      ...fileSystem,
      readFile(path) {
        reads.push(path);
        return fileSystem.readFile(path);
      },
    });
    expect(reads).not.toContain(input);
    expect(result.diagnostics.map((entry) => entry.classification)).toEqual([
      'missing',
      'input-io',
    ]);
  });

  it('rejects dangling input and external/dangling target symlinks', () => {
    symlinkSync(join(root, 'absent'), join(wiki, 'dangling.md'));
    const outside = join(sandbox, 'outside.md');
    writeFileSync(outside, '# Outside');
    symlinkSync(outside, join(root, 'external.md'));
    symlinkSync(join(root, 'absent'), join(root, 'dangling.md'));
    put('wiki/Home.md', '[escape](/external.md) [missing](/dangling.md)');
    expect(checkWiki(root).diagnostics.map((entry) => entry.classification)).toEqual([
      'escape',
      'target-io',
      'input-io',
    ]);
  });

  it.each([
    'read',
    'enumeration',
    'realpath',
  ] as const)('fails closed on injected %s errors', (operation) => {
    const path = put('wiki/Home.md');
    const adapter = { ...fileSystem };
    if (operation === 'read') {
      adapter.readFile = () => {
        throw new Error('injected read failure');
      };
    } else if (operation === 'enumeration') {
      adapter.entries = () => {
        throw new Error('injected enumeration failure');
      };
    } else {
      adapter.realpath = (target) => {
        if (target === path) {
          throw new Error('injected realpath failure');
        }
        return fileSystem.realpath(target);
      };
    }
    const result = checkWiki(root, adapter);
    expect(result.diagnostics.some((entry) => entry.message.includes('injected'))).toBe(true);
    expect(result.documents).toBe(0);
    expect(result.diagnostics.some((entry) => entry.classification === 'empty-corpus')).toBe(true);
  });

  it('reports missing/empty wiki and invalid repository root', () => {
    expect(checkWiki(root).diagnostics[0].classification).toBe('empty-corpus');
    rmSync(wiki, { recursive: true });
    expect(checkWiki(root).diagnostics.map((entry) => entry.classification)).toEqual([
      'empty-corpus',
      'input-io',
    ]);
    expect(checkWiki('relative').diagnostics[0].classification).toBe('root-io');
    expect(checkWiki(put('not-a-directory')).diagnostics[0].classification).toBe('root-io');
  });

  it('rejects nonregular Markdown inputs before invoking their read adapter', () => {
    const path = put('wiki/Home.md');
    let reads = 0;
    const result = checkWiki(root, {
      ...fileSystem,
      stat(target) {
        return target === path
          ? { isDirectory: () => false, isFile: () => false }
          : fileSystem.stat(target);
      },
      readFile(target) {
        reads++;
        return fileSystem.readFile(target);
      },
    });
    expect(reads).toBe(0);
    expect(result.diagnostics.some((entry) => entry.message.includes('not a regular file'))).toBe(
      true
    );
  });

  it('does not follow an external directory symlink or a symlinked wiki root', () => {
    put('wiki/Home.md');
    const outside = join(sandbox, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'poison.md'), '[[missing]]');
    symlinkSync(outside, join(wiki, 'external-directory'), 'dir');
    expect(checkWiki(root)).toEqual(
      expect.objectContaining({
        documents: 1,
        diagnostics: [],
        skipped: { 'directory-symlink': 1 },
      })
    );
    rmSync(wiki, { recursive: true });
    symlinkSync(outside, wiki, 'dir');
    const result = checkWiki(root);
    expect(result.documents).toBe(0);
    expect(result.skipped['directory-symlink']).toBe(1);
    expect(result.diagnostics[0].classification).toBe('empty-corpus');
  });

  it('counts explicit remote/anchor skips and sorts multiple diagnostics by source location', () => {
    put('wiki/z.md', '[[absent]]');
    put('wiki/a.md', '[[missing]] [[absent]] [remote](https://example.invalid) [anchor](#x)');
    const result = checkWiki(root);
    expect(result.skipped).toEqual({ external: 1, anchor: 1 });
    expect(result.diagnostics.map((entry) => [entry.file, entry.column])).toEqual([
      ['wiki/a.md', 1],
      ['wiki/a.md', 13],
      ['wiki/z.md', 1],
    ]);
  });
});

describe('wiki checker CLI', () => {
  it('returns the same clean, broken and usage status through its exported CLI API', () => {
    put('wiki/Home.md');
    expect(runCli(['--root', root])).toBe(0);
    put('wiki/Home.md', '[[missing]]');
    expect(runCli(['--root', root])).toBe(1);
    expect(runCli(['--root', 'relative'])).toBe(2);
  });
  it('accepts explicit absolute root from an unrelated cwd and exits zero for a clean corpus', () => {
    put('wiki/Home.md');
    const result = cli(['--root', root]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ documents: 1, checked: 0, skipped: {}, errors: 0 });
  });

  it('exits nonzero with structured source diagnostics for broken references', () => {
    put('wiki/Home.md', 'heading\r\n[[missing]]');
    const result = cli(['--root', root]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual(
      expect.objectContaining({
        file: 'wiki/Home.md',
        line: 2,
        column: 1,
        classification: 'missing',
      })
    );
    expect(JSON.parse(result.stdout).errors).toBe(1);
  });

  it.each([
    { args: ['--root', 'relative'] },
    { args: ['--root'] },
    { args: ['--unknown', '/absolute'] },
    { args: ['--root', '/absolute', 'extra'] },
  ])('rejects invalid CLI arguments %j', ({ args }) => {
    const result = cli([...args]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(result.stdout).toBe('');
  });
});
