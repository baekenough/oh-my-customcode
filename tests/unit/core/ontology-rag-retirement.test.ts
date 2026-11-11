/**
 * Pure helpers of the ontology-rag retirement (#1960): which `.mcp.json` server entries are
 * init's, how the file is rewritten, the file flow, and the `.venv` dist-info check.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasOntologyRagInVenv,
  isOmcustomOntologyRagEntry,
  type McpConfigBackup,
  type McpConfigRetirementOptions,
  planMcpConfigRewrite,
  retireOntologyRagMcpServer,
} from '../../../src/core/ontology-rag-retirement.js';

/** The shape init wrote from bf24062b (2026-02-17). */
const VENV_ENTRY = {
  type: 'stdio',
  command: '.venv/bin/python',
  args: ['-m', 'ontology_rag.mcp_server'],
  env: { ONTOLOGY_DIR: '.claude/ontology' },
};
/** The shape init wrote from 78046c8d (2026-02-13). */
const PYTHON_ENTRY = { ...VENV_ENTRY, command: 'python' };
const ERASER = { type: 'stdio', command: 'npx', args: ['eraser-mcp'] };

let dir: string;

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'omcustom-ontology-retire-')));
});

afterEach(async () => {
  await chmod(dir, 0o755).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe('isOmcustomOntologyRagEntry', () => {
  it('accepts exactly the two shapes init wrote', () => {
    expect(isOmcustomOntologyRagEntry(VENV_ENTRY)).toBe(true);
    expect(isOmcustomOntologyRagEntry(PYTHON_ENTRY)).toBe(true);
    // Key order does not matter, only the key sets and values.
    const { env, args, command, type } = VENV_ENTRY;
    expect(isOmcustomOntologyRagEntry({ env, args, command, type })).toBe(true);
  });

  it('accepts .codex/ontology only with the python command (Codex layout predates .venv)', () => {
    const codexEnv = { ONTOLOGY_DIR: '.codex/ontology' };
    expect(isOmcustomOntologyRagEntry({ ...PYTHON_ENTRY, env: codexEnv })).toBe(true);
    expect(isOmcustomOntologyRagEntry({ ...VENV_ENTRY, env: codexEnv })).toBe(false);
  });

  it.each([
    ['an extra key', { ...VENV_ENTRY, cwd: '.' }],
    ['reordered args', { ...VENV_ENTRY, args: ['ontology_rag.mcp_server', '-m'] }],
    ['an extra arg', { ...VENV_ENTRY, args: ['-m', 'ontology_rag.mcp_server', '--x'] }],
    ['args not an array', { ...VENV_ENTRY, args: '-m ontology_rag.mcp_server' }],
    ['an extra env key', { ...VENV_ENTRY, env: { ONTOLOGY_DIR: '.claude/ontology', X: '1' } }],
    ['a different ONTOLOGY_DIR', { ...VENV_ENTRY, env: { ONTOLOGY_DIR: 'ontology' } }],
    ['a non-string ONTOLOGY_DIR', { ...VENV_ENTRY, env: { ONTOLOGY_DIR: 1 } }],
    ['env not an object', { ...VENV_ENTRY, env: ['.claude/ontology'] }],
    ['another command', { ...VENV_ENTRY, command: 'python3' }],
    ['a missing type', { command: VENV_ENTRY.command, args: VENV_ENTRY.args, env: VENV_ENTRY.env }],
    ['type http', { ...VENV_ENTRY, type: 'http' }],
    ['null', null],
    ['an array', [VENV_ENTRY]],
    ['a string', 'ontology-rag'],
  ])('rejects %s', (_label, entry) => {
    expect(isOmcustomOntologyRagEntry(entry)).toBe(false);
  });
});

describe('planMcpConfigRewrite', () => {
  const text = (value: unknown): string => JSON.stringify(value, null, 2);

  it('removes the entry and keeps the other servers in order', () => {
    const plan = planMcpConfigRewrite(
      text({ mcpServers: { eraser: ERASER, 'ontology-rag': VENV_ENTRY, zeta: ERASER } })
    );
    expect(plan).toEqual({
      kind: 'remove',
      content: `${text({ mcpServers: { eraser: ERASER, zeta: ERASER } })}\n`,
    });
  });

  it('keeps an emptied mcpServers as {}', () => {
    expect(planMcpConfigRewrite(text({ mcpServers: { 'ontology-rag': PYTHON_ENTRY } }))).toEqual({
      kind: 'remove',
      content: '{\n  "mcpServers": {}\n}\n',
    });
  });

  it('keeps the other top-level keys in their order', () => {
    const plan = planMcpConfigRewrite(
      text({ before: 1, mcpServers: { 'ontology-rag': VENV_ENTRY }, after: { a: [1] } })
    );
    expect(plan).toEqual({
      kind: 'remove',
      content: `${text({ before: 1, mcpServers: {}, after: { a: [1] } })}\n`,
    });
  });

  it('keeps a user-edited entry', () => {
    expect(
      planMcpConfigRewrite(text({ mcpServers: { 'ontology-rag': { ...VENV_ENTRY, cwd: '.' } } }))
    ).toEqual({ kind: 'kept' });
  });

  it.each([
    ['no mcpServers', { other: true }],
    ['mcpServers not an object', { mcpServers: 'ontology-rag' }],
    ['mcpServers an array', { mcpServers: [VENV_ENTRY] }],
    ['no ontology-rag server', { mcpServers: { eraser: ERASER } }],
  ])('reports %s as absent', (_label, value) => {
    expect(planMcpConfigRewrite(text(value))).toEqual({ kind: 'absent' });
  });

  it('reports malformed JSON and a non-object top level as unreadable', () => {
    expect(planMcpConfigRewrite('{"mcpServers": ').kind).toBe('unreadable');
    expect(planMcpConfigRewrite(text([{ mcpServers: {} }]))).toEqual({
      kind: 'unreadable',
      detail: 'not a JSON object',
    });
    expect(planMcpConfigRewrite('null')).toEqual({
      kind: 'unreadable',
      detail: 'not a JSON object',
    });
  });
});

describe('retireOntologyRagMcpServer', () => {
  const ORIGINAL = `${JSON.stringify(
    { mcpServers: { 'ontology-rag': VENV_ENTRY, eraser: ERASER } },
    null,
    2
  )}\n`;
  const mcpPath = (): string => join(dir, '.mcp.json');

  /** A backup into `<dir>/backup/mcp.json` that records its calls. */
  function recordingOptions(overrides: Partial<McpConfigRetirementOptions> = {}): {
    options: McpConfigRetirementOptions;
    calls: { backups: Buffer[]; modes: number[]; discarded: number };
  } {
    const calls = { backups: [] as Buffer[], modes: [] as number[], discarded: 0 };
    const options: McpConfigRetirementOptions = {
      dryRun: false,
      preservedBy: null,
      backup: async (original, mode): Promise<McpConfigBackup> => {
        calls.backups.push(original);
        calls.modes.push(mode);
        await mkdir(join(dir, 'backup'), { recursive: true });
        const path = join(dir, 'backup', 'mcp.json');
        await writeFile(path, original);
        return {
          path,
          discard: async () => {
            calls.discarded++;
          },
        };
      },
      ...overrides,
    };
    return { options, calls };
  }

  it('returns null without a .mcp.json, or when the project path is a file', async () => {
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toBeNull();
    await writeFile(join(dir, 'file'), 'x');
    expect(
      await retireOntologyRagMcpServer(join(dir, 'file'), recordingOptions().options)
    ).toBeNull();
  });

  it('removes init entry: backs up the original bytes and keeps the mode', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    await chmod(mcpPath(), 0o600);
    const { options, calls } = recordingOptions();

    const outcome = await retireOntologyRagMcpServer(dir, options);

    expect(outcome).toEqual({ status: 'removed', backupPath: join(dir, 'backup', 'mcp.json') });
    expect(await readFile(mcpPath(), 'utf-8')).toBe(
      `${JSON.stringify({ mcpServers: { eraser: ERASER } }, null, 2)}\n`
    );
    expect(calls.backups.map((bytes) => bytes.toString('utf-8'))).toEqual([ORIGINAL]);
    expect(calls.modes.map((mode) => mode & 0o777)).toEqual([0o600]);
    expect(calls.discarded).toBe(0);
    expect((await lstat(mcpPath())).mode & 0o777).toBe(0o600);
    // No temporary file is left next to it.
    expect((await readdir(dir)).sort()).toEqual(['.mcp.json', 'backup']);
  });

  it('never makes the temporary file of a 0600 .mcp.json wider than 0600', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    await chmod(mcpPath(), 0o600);
    // The mode the temporary file was created with, seen before its chmod.
    const createdModes: number[] = [];
    const realChmod = fsPromises.chmod;
    const chmodSpy = spyOn(fsPromises, 'chmod').mockImplementation((async (path, mode) => {
      if (String(path).endsWith('.tmp')) {
        createdModes.push((await lstat(path)).mode & 0o777);
      }
      return realChmod(path, mode);
    }) as typeof realChmod);
    try {
      const outcome = await retireOntologyRagMcpServer(dir, recordingOptions().options);
      expect(outcome?.status).toBe('removed');
    } finally {
      chmodSpy.mockRestore();
    }
    expect(createdModes).toHaveLength(1);
    expect(createdModes[0] & ~0o600).toBe(0);
    expect((await lstat(mcpPath())).mode & 0o777).toBe(0o600);
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    await retireOntologyRagMcpServer(dir, recordingOptions().options);
    const after = await readFile(mcpPath(), 'utf-8');
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toBeNull();
    expect(await readFile(mcpPath(), 'utf-8')).toBe(after);
  });

  it('keeps a user-edited entry, a preserved file, and reports a dry run without writing', async () => {
    const edited = JSON.stringify({ mcpServers: { 'ontology-rag': { ...VENV_ENTRY, cwd: '.' } } });
    await writeFile(mcpPath(), edited);
    const first = recordingOptions();
    expect(await retireOntologyRagMcpServer(dir, first.options)).toEqual({
      status: 'kept',
      reason: 'modified',
    });

    await writeFile(mcpPath(), ORIGINAL);
    const preserved = recordingOptions({ preservedBy: 'preserve-settings' });
    expect(await retireOntologyRagMcpServer(dir, preserved.options)).toEqual({
      status: 'kept',
      reason: 'preserved',
    });
    const unreadableManifest = recordingOptions({ preservedBy: 'unreadable-manifest' });
    expect(await retireOntologyRagMcpServer(dir, unreadableManifest.options)).toEqual({
      status: 'kept',
      reason: 'manifest-unreadable',
    });
    const dry = recordingOptions({ dryRun: true });
    expect(await retireOntologyRagMcpServer(dir, dry.options)).toEqual({ status: 'would-remove' });

    expect(await readFile(mcpPath(), 'utf-8')).toBe(ORIGINAL);
    const runs = [first, preserved, unreadableManifest, dry];
    expect(runs.map(({ calls }) => calls.backups.length)).toEqual([0, 0, 0, 0]);
  });

  it('lets the preserve settings win over a dry run', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    const settings = recordingOptions({ dryRun: true, preservedBy: 'preserve-settings' });
    expect(await retireOntologyRagMcpServer(dir, settings.options)).toEqual({
      status: 'kept',
      reason: 'preserved',
    });
    const manifest = recordingOptions({ dryRun: true, preservedBy: 'unreadable-manifest' });
    expect(await retireOntologyRagMcpServer(dir, manifest.options)).toEqual({
      status: 'kept',
      reason: 'manifest-unreadable',
    });
  });

  it('reports malformed JSON as unreadable and leaves it', async () => {
    await writeFile(mcpPath(), '{"mcpServers": {');
    const outcome = await retireOntologyRagMcpServer(dir, recordingOptions().options);
    expect(outcome?.status).toBe('unreadable');
    expect(await readFile(mcpPath(), 'utf-8')).toBe('{"mcpServers": {');
  });

  it('reports bytes that are not valid UTF-8 as unreadable instead of rewriting them', async () => {
    // A Latin-1 "é" (0xe9) in another server's entry, next to init's entry.
    const bytes = Buffer.concat([
      Buffer.from(
        `{"mcpServers": {"ontology-rag": ${JSON.stringify(VENV_ENTRY)}, "x": {"note": "caf`
      ),
      Buffer.from([0xe9]),
      Buffer.from('"}}}\n'),
    ]);
    await writeFile(mcpPath(), bytes);
    const recorded = recordingOptions();

    expect(await retireOntologyRagMcpServer(dir, recorded.options)).toEqual({
      status: 'unreadable',
      detail: 'not valid UTF-8',
    });
    expect((await readFile(mcpPath())).equals(bytes)).toBe(true);
    expect(recorded.calls.backups).toHaveLength(0);
  });

  it('keeps a UTF-8 BOM in the text, so a file with one stays unreadable', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ORIGINAL)]);
    await writeFile(mcpPath(), bytes);
    const outcome = await retireOntologyRagMcpServer(dir, recordingOptions().options);
    expect(outcome?.status).toBe('unreadable');
    expect((await readFile(mcpPath())).equals(bytes)).toBe(true);
  });

  it('keeps an entry behind a symlink and ignores symlinks without one', async () => {
    const target = join(dir, 'real-mcp.json');
    await writeFile(target, ORIGINAL);
    await symlink(target, mcpPath());
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toEqual({
      status: 'kept',
      reason: 'not-regular',
    });
    expect(await readFile(target, 'utf-8')).toBe(ORIGINAL);
    expect((await lstat(mcpPath())).isSymbolicLink()).toBe(true);

    await writeFile(target, '{ broken');
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toBeNull();
  });

  it('ignores a .mcp.json directory', async () => {
    await mkdir(mcpPath());
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toBeNull();
  });

  it('reports an unreadable file and an unreadable project directory as failed', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    await chmod(mcpPath(), 0o000);
    expect(await retireOntologyRagMcpServer(dir, recordingOptions().options)).toEqual({
      status: 'failed',
      detail: 'cannot read .mcp.json',
    });
    await chmod(mcpPath(), 0o644);

    await chmod(dir, 0o000);
    const outcome = await retireOntologyRagMcpServer(dir, recordingOptions().options);
    await chmod(dir, 0o755);
    expect(outcome?.status).toBe('failed');
  });

  it('leaves the file when the backup fails', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    const outcome = await retireOntologyRagMcpServer(
      dir,
      recordingOptions({
        backup: async () => {
          throw new Error('disk full');
        },
      }).options
    );
    expect(outcome).toEqual({ status: 'failed', detail: 'backup failed: disk full' });
    expect(await readFile(mcpPath(), 'utf-8')).toBe(ORIGINAL);
  });

  it('keeps a file that changed during the backup and discards the backup', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    const recorded = recordingOptions();
    const backup = recorded.options.backup;
    recorded.options.backup = async (original, mode) => {
      const made = await backup(original, mode);
      await writeFile(mcpPath(), `${ORIGINAL} `);
      return made;
    };
    expect(await retireOntologyRagMcpServer(dir, recorded.options)).toEqual({
      status: 'kept',
      reason: 'changed',
    });
    expect(recorded.calls.discarded).toBe(1);
    expect(await readFile(mcpPath(), 'utf-8')).toBe(`${ORIGINAL} `);
  });

  it('keeps a .mcp.json replaced by a symlink during the backup and writes nothing through it', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    // The link target has the very same bytes, so only the lstat().isFile() guard keeps it.
    const target = join(dir, 'linked-mcp.json');
    await writeFile(target, ORIGINAL);
    const recorded = recordingOptions();
    const backup = recorded.options.backup;
    recorded.options.backup = async (original, mode) => {
      const made = await backup(original, mode);
      await unlink(mcpPath());
      await symlink(target, mcpPath());
      return made;
    };

    expect(await retireOntologyRagMcpServer(dir, recorded.options)).toEqual({
      status: 'kept',
      reason: 'changed',
    });
    expect(recorded.calls.discarded).toBe(1);
    expect((await lstat(mcpPath())).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf-8')).toBe(ORIGINAL);
    expect((await readdir(dir)).sort()).toEqual(['.mcp.json', 'backup', 'linked-mcp.json']);
  });

  it('reports a failed rewrite, removes its temporary file and discards the backup', async () => {
    await writeFile(mcpPath(), ORIGINAL);
    const recorded = recordingOptions();
    const backup = recorded.options.backup;
    recorded.options.backup = async (original, mode) => {
      const made = await backup(original, mode);
      await chmod(dir, 0o555);
      return made;
    };
    const outcome = await retireOntologyRagMcpServer(dir, recorded.options);
    await chmod(dir, 0o755);
    expect(outcome?.status).toBe('failed');
    expect(recorded.calls.discarded).toBe(1);
    expect(await readFile(mcpPath(), 'utf-8')).toBe(ORIGINAL);
    expect((await readdir(dir)).sort()).toEqual(['.mcp.json', 'backup']);
  });
});

describe('hasOntologyRagInVenv', () => {
  const sitePackages = (version: string): string =>
    join(dir, '.venv', 'lib', version, 'site-packages');

  it('is false without a .venv', async () => {
    expect(await hasOntologyRagInVenv(dir)).toBe(false);
  });

  it('is true with an ontology_rag dist-info in any python* site-packages', async () => {
    await mkdir(join(dir, '.venv', 'lib', 'python3.11'), { recursive: true });
    await mkdir(join(dir, '.venv', 'lib', 'not-python'), { recursive: true });
    await mkdir(join(sitePackages('python3.12'), 'ontology_rag-0.1.0.dist-info'), {
      recursive: true,
    });
    expect(await hasOntologyRagInVenv(dir)).toBe(true);
  });

  it('is false with other packages only, or a dist-info outside a python* directory', async () => {
    await mkdir(join(sitePackages('python3.12'), 'requests-2.0.dist-info'), { recursive: true });
    await mkdir(join(sitePackages('pypy'), 'ontology_rag-0.1.0.dist-info'), { recursive: true });
    expect(await hasOntologyRagInVenv(dir)).toBe(false);
  });

  it('is false when .venv/lib is a file', async () => {
    await mkdir(join(dir, '.venv'), { recursive: true });
    await writeFile(join(dir, '.venv', 'lib'), 'not a directory');
    expect(await hasOntologyRagInVenv(dir)).toBe(false);
  });
});
