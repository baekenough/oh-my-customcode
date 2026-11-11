/**
 * `omcustom update` retiring ontology-rag in an existing install (#1960), and `components: []`
 * meaning a full update everywhere (#1958 item 1).
 *
 * Each test seeds a temp project as an install that had ontology-rag: shipped
 * `.claude/ontology/**` files owned by the old lock, init's `ontology-rag` server in `.mcp.json`
 * and, where needed, a `.venv` with it installed.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
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
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { printUpdateResults, reportProjectUpdateResult } from '../../../src/cli/update.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { _setRegistryDirForTesting } from '../../../src/core/registry.js';
import type { RetiredTemplatePathEntry } from '../../../src/core/retired-template-paths.js';
import * as retiredModule from '../../../src/core/retired-template-paths.js';
import {
  type UpdateComponent,
  type UpdateOptions,
  type UpdateResult,
  update,
} from '../../../src/core/updater.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const SHIPPED = 'shipped ontology content\n';
const AGENTS = '.claude/ontology/agents.yaml';
const ROUTING = '.claude/ontology/graphs/routing.json';
const RULES = '.claude/ontology/rules.yaml';
const CACHE = '.claude/ontology/.cache/queries.db';

const VENV_ENTRY = {
  type: 'stdio',
  command: '.venv/bin/python',
  args: ['-m', 'ontology_rag.mcp_server'],
  env: { ONTOLOGY_DIR: '.claude/ontology' },
};
const ERASER = { type: 'stdio', command: 'npx', args: ['eraser-mcp'] };
const MCP_WITH_ENTRY = `${JSON.stringify(
  { mcpServers: { eraser: ERASER, 'ontology-rag': VENV_ENTRY } },
  null,
  2
)}\n`;
const MCP_WITHOUT_ENTRY = `${JSON.stringify({ mcpServers: { eraser: ERASER } }, null, 2)}\n`;

const RETIRED: RetiredTemplatePathEntry[] = [AGENTS, ROUTING, RULES].map((path) => ({
  path,
  sha256: [sha256(SHIPPED)],
}));

let root: string;
let project: string;
const spies: Array<{ mockRestore(): void }> = [];

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(project, path)), { recursive: true });
  await writeFile(join(project, path), content);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(join(project, path));
    return true;
  } catch {
    return false;
  }
}

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(project, path), 'utf-8');
}

async function manifestVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(import.meta.dir, '../../../templates/manifest.json'), 'utf8')
  ) as { version: string };
  return manifest.version;
}

/**
 * An install with ontology-rag. `current` makes the config up to date (the no-updates path);
 * otherwise it is an old version, so update applies component updates.
 */
async function seedInstall(
  options: { mcp?: string | null; preserveFiles?: string[]; current?: boolean } = {}
): Promise<void> {
  const config = getDefaultConfig();
  if (options.current) {
    const version = await manifestVersion();
    config.version = version;
    config.componentVersions = Object.fromEntries(
      ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts'].map((c) => [c, version])
    );
  } else {
    config.version = '0.1.0';
  }
  config.preserveFiles = options.preserveFiles ?? [];
  await saveConfig(project, config);

  await put(AGENTS, SHIPPED);
  await put(ROUTING, SHIPPED);
  await put(RULES, 'user edits\n');
  await put(CACHE, 'not shipped\n');
  const mcp = options.mcp === undefined ? MCP_WITH_ENTRY : options.mcp;
  if (mcp !== null) await put('.mcp.json', mcp);

  const entry = { templateHash: sha256(SHIPPED), size: SHIPPED.length, component: 'ontology' };
  await writeFile(
    join(project, '.omcustom.lock.json'),
    JSON.stringify({
      lockfileVersion: 1,
      generatorVersion: '0.1.0',
      templateVersion: '0.1.0',
      generatedAt: '2025-01-01T00:00:00.000Z',
      files: { [AGENTS]: entry, [ROUTING]: entry, [RULES]: entry },
    })
  );
}

/** The `.omcustom-backup-*` directories at the project root. */
async function backupDirs(): Promise<string[]> {
  return (await readdir(project)).filter((name) => name.startsWith('.omcustom-backup-'));
}

/** Every path below `dir`, sorted (directories included). */
async function listTree(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.map(String).sort();
}

async function seedVenv(withOntologyRag: boolean): Promise<void> {
  const site = join(project, '.venv', 'lib', 'python3.12', 'site-packages');
  await mkdir(join(site, 'requests-2.0.dist-info'), { recursive: true });
  if (withOntologyRag) {
    await mkdir(join(site, 'ontology_rag-0.1.0.dist-info'), { recursive: true });
    await writeFile(join(site, 'ontology_rag-0.1.0.dist-info', 'RECORD'), 'x\n');
  }
  await mkdir(join(project, '.venv', 'bin'), { recursive: true });
  await writeFile(join(project, '.venv', 'bin', 'python'), '#!/bin/sh\n');
}

function run(overrides: Partial<UpdateOptions> = {}): Promise<UpdateResult> {
  return update({ targetDir: project, preserveCustomizations: true, ...overrides });
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'omcustom-ontology-update-')));
  project = join(root, 'project');
  await mkdir(project);
  _setRegistryDirForTesting(join(root, 'registry'));
  spies.push(
    spyOn(retiredModule, 'loadRetiredTemplatePaths').mockResolvedValue(
      RETIRED.map((item) => ({ ...item, sha256: [...item.sha256] }))
    ),
    spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden')),
    spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('external synchronous command forbidden');
    }),
    spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
    spyOn(codexInstaller, 'installCodex').mockReturnValue(false)
  );
});

afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  _setRegistryDirForTesting(undefined);
  await rm(root, { recursive: true, force: true });
});

describe('update retires ontology-rag (#1960)', () => {
  it('moves unmodified shipped files and removes init entry from .mcp.json, with a byte-identical backup', async () => {
    await seedInstall();

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).not.toContain('ontology');
    const retiredDir = result.retiredBackupDir ?? '';
    expect(retiredDir).toMatch(/\.omcustom-backup-[^/]+\/retired$/);

    // .claude/ontology: unmodified shipped files moved, emptied graphs/ removed, the rest stays.
    expect(result.orphanRetirement?.removed.sort()).toEqual([AGENTS, ROUTING].sort());
    expect(await exists(AGENTS)).toBe(false);
    expect(await exists('.claude/ontology/graphs')).toBe(false);
    expect(await readFile(join(retiredDir, 'claude/ontology/agents.yaml'), 'utf-8')).toBe(SHIPPED);
    expect(await readFile(join(retiredDir, 'claude/ontology/graphs/routing.json'), 'utf-8')).toBe(
      SHIPPED
    );
    expect(await readProjectFile(RULES)).toBe('user edits\n');
    expect(await readProjectFile(CACHE)).toBe('not shipped\n');
    expect(result.orphanRetirement?.preserved).toEqual([
      { path: RULES, reason: 'user-modified file' },
    ]);

    // .mcp.json: only the ontology-rag server is gone; the original is in the same backup.
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITHOUT_ENTRY);
    expect(result.ontologyRagRetirement).toEqual({
      mcpServer: { status: 'removed', backupPath: join(retiredDir, 'mcp.json') },
      ontologyDirLeft: true,
    });
    expect(await readFile(join(retiredDir, 'mcp.json'), 'utf-8')).toBe(MCP_WITH_ENTRY);
    expect(await backupDirs()).toHaveLength(1);

    const lock = JSON.parse(await readProjectFile('.omcustom.lock.json')) as {
      files: Record<string, unknown>;
    };
    expect(Object.keys(lock.files).filter((path) => path.startsWith('.claude/ontology'))).toEqual(
      []
    );
  });

  it('removes the emptied .claude/ontology and reports nothing to delete manually', async () => {
    await seedInstall({ mcp: null });
    await rm(join(project, RULES));
    await rm(join(project, '.claude/ontology/.cache'), { recursive: true });

    const result = await run();

    expect(result.success).toBe(true);
    expect(await exists('.claude/ontology')).toBe(false);
    expect(await exists('.claude')).toBe(true);
    expect(result.ontologyRagRetirement).toBeUndefined();
  });

  it('keeps a user-edited entry byte-identical without backing up .mcp.json', async () => {
    const edited = `${JSON.stringify({ mcpServers: { 'ontology-rag': { ...VENV_ENTRY, cwd: '.' } } })}\n`;
    await seedInstall({ mcp: edited });

    const result = await run();

    expect(result.ontologyRagRetirement?.mcpServer).toEqual({ status: 'kept', reason: 'modified' });
    expect(await readProjectFile('.mcp.json')).toBe(edited);
    expect(await exists(join(result.retiredBackupDir ?? '', 'mcp.json'))).toBe(false);
  });

  it('reports nothing about .mcp.json when there is none', async () => {
    await seedInstall({ mcp: null });
    const result = await run();
    expect(result.success).toBe(true);
    expect(result.ontologyRagRetirement?.mcpServer).toBeUndefined();
    expect(await exists('.mcp.json')).toBe(false);
  });

  it('leaves malformed JSON alone and the update still succeeds', async () => {
    await seedInstall({ mcp: '{"mcpServers": {' });
    const result = await run();
    expect(result.success).toBe(true);
    expect(result.ontologyRagRetirement?.mcpServer?.status).toBe('unreadable');
    expect(await readProjectFile('.mcp.json')).toBe('{"mcpServers": {');
  });

  it('dry run reports would-remove and changes nothing', async () => {
    await seedInstall();
    await seedVenv(true);

    const result = await run({ dryRun: true });

    expect(result.success).toBe(true);
    expect(result.ontologyRagRetirement).toEqual({
      mcpServer: { status: 'would-remove' },
      venvHasOntologyRag: true,
    });
    expect(result.orphanRetirement?.wouldRemove.sort()).toEqual([AGENTS, ROUTING].sort());
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
    expect(await readProjectFile(AGENTS)).toBe(SHIPPED);
    expect(await backupDirs()).toEqual([]);
    expect(result.retiredBackupDir).toBeUndefined();
  });

  it('a second run finds nothing left to remove', async () => {
    await seedInstall();
    await run();
    const after = await readProjectFile('.mcp.json');

    const second = await run();

    expect(second.success).toBe(true);
    expect(second.ontologyRagRetirement?.mcpServer).toBeUndefined();
    expect(await readProjectFile('.mcp.json')).toBe(after);
    expect(await backupDirs()).toHaveLength(1);
  });

  it('a partial update leaves .mcp.json, .claude/ontology and .venv alone', async () => {
    await seedInstall();
    await seedVenv(true);

    const result = await run({ components: ['rules'] });

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toEqual(['rules']);
    expect(result.ontologyRagRetirement).toBeUndefined();
    expect(result.orphanRetirement?.removed ?? []).toEqual([]);
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
    expect(await readProjectFile(AGENTS)).toBe(SHIPPED);
  });

  it('components: [] is a full update everywhere (#1958)', async () => {
    await seedInstall();

    const result = await run({ components: [] });

    expect(result.success).toBe(true);
    expect(result.updatedComponents.sort()).toEqual(
      (['agents', 'contexts', 'guides', 'hooks', 'rules', 'skills'] as UpdateComponent[]).sort()
    );
    expect(result.ontologyRagRetirement?.mcpServer?.status).toBe('removed');
    expect(result.orphanRetirement?.removed.sort()).toEqual([AGENTS, ROUTING].sort());
    // The root-file sync of a full update ran too.
    expect(await exists('CLAUDE.md')).toBe(true);
  });

  it('components: [] skips every component on the no-updates path', async () => {
    await seedInstall({ current: true });
    const result = await run({ components: [] });
    expect(result.skippedComponents.sort()).toEqual(
      (['agents', 'contexts', 'guides', 'hooks', 'rules', 'skills'] as UpdateComponent[]).sort()
    );
    expect(result.ontologyRagRetirement?.mcpServer?.status).toBe('removed');
  });

  it('retires on the no-updates path too', async () => {
    await seedInstall({ current: true });

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toEqual([]);
    expect(result.orphanRetirement?.removed.sort()).toEqual([AGENTS, ROUTING].sort());
    expect(result.ontologyRagRetirement?.mcpServer?.status).toBe('removed');
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITHOUT_ENTRY);
    expect(await readFile(join(result.retiredBackupDir ?? '', 'mcp.json'), 'utf-8')).toBe(
      MCP_WITH_ENTRY
    );
  });

  it('notes an ontology-rag install in .venv and never touches .venv', async () => {
    await seedInstall({ mcp: null });
    await seedVenv(true);
    const before = await listTree(join(project, '.venv'));

    const result = await run();

    expect(result.ontologyRagRetirement?.venvHasOntologyRag).toBe(true);
    expect(await listTree(join(project, '.venv'))).toEqual(before);
  });

  it('has no .venv note without an ontology_rag dist-info', async () => {
    await seedInstall({ mcp: null });
    await seedVenv(false);
    const before = await listTree(join(project, '.venv'));

    const result = await run();

    expect(result.ontologyRagRetirement?.venvHasOntologyRag).toBeUndefined();
    expect(await listTree(join(project, '.venv'))).toEqual(before);
  });

  it('keeps .mcp.json covered by the preserve settings', async () => {
    await seedInstall({ preserveFiles: ['.mcp.json'] });
    const result = await run();
    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'kept',
      reason: 'preserved',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
  });

  it('lets the preserve settings win over a dry run', async () => {
    await seedInstall({ preserveFiles: ['.mcp.json'] });
    const result = await run({ dryRun: true });
    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'kept',
      reason: 'preserved',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
    expect(await backupDirs()).toEqual([]);
  });

  it('keeps .mcp.json with its own reason when the customization manifest is unreadable', async () => {
    await seedInstall();
    await writeFile(join(project, '.omcustom-customizations.json'), '{ not json');

    // Like the orphan tests: forceOverwriteAll reaches the deletions with the manifest unreadable.
    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'kept',
      reason: 'manifest-unreadable',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
  });

  it('gives the backup of a 0600 .mcp.json the same 0600 mode', async () => {
    await seedInstall({ current: true });
    await chmod(join(project, '.mcp.json'), 0o600);
    // The mode the backup was created with, seen before its chmod narrows or sets it.
    const createdModes: number[] = [];
    const realChmod = fsPromises.chmod;
    const chmodSpy = spyOn(fsPromises, 'chmod').mockImplementation((async (path, mode) => {
      if (/retired\/mcp\.json$/.test(String(path))) {
        createdModes.push((await lstat(path)).mode & 0o777);
      }
      return realChmod(path, mode);
    }) as typeof realChmod);
    let result: UpdateResult;
    try {
      result = await run();
    } finally {
      chmodSpy.mockRestore();
    }

    expect(result.ontologyRagRetirement?.mcpServer?.status).toBe('removed');
    expect(createdModes).toHaveLength(1);
    expect(createdModes[0] & ~0o600).toBe(0);
    const backupPath = join(result.retiredBackupDir ?? '', 'mcp.json');
    expect(await readFile(backupPath, 'utf-8')).toBe(MCP_WITH_ENTRY);
    expect((await lstat(backupPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(join(project, '.mcp.json'))).mode & 0o777).toBe(0o600);
  });

  it('keeps a symlinked .mcp.json and its target', async () => {
    await seedInstall({ mcp: null });
    const target = join(root, 'shared-mcp.json');
    await writeFile(target, MCP_WITH_ENTRY);
    await symlink(target, join(project, '.mcp.json'));

    const result = await run();

    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'kept',
      reason: 'not-regular',
    });
    expect((await lstat(join(project, '.mcp.json'))).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf-8')).toBe(MCP_WITH_ENTRY);
  });

  it('fails the .mcp.json step, not the update, when its backup location is taken', async () => {
    await seedInstall({ current: true });

    // The confirmation runs before any move; a directory at <backup>/mcp.json blocks the copy.
    const result = await run({
      confirmOrphanRemoval: async (_paths, context) => {
        await mkdir(join(context.backupDir, 'mcp.json'), { recursive: true });
        return true;
      },
    });

    expect(result.success).toBe(true);
    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'failed',
      detail: 'backup failed: a file already exists at the backup location',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
  });
});

describe('the .mcp.json backup inside the run backup (#1960)', () => {
  const realWriteFile = fsPromises.writeFile;
  const isBackupCopy = (path: unknown): boolean => /retired\/mcp\.json$/.test(String(path));

  /** Replace the write of the backup copy; every other write goes through. */
  function interceptBackupWrite(
    replacement: (path: string, data: Parameters<typeof realWriteFile>[1]) => Promise<void>
  ): void {
    spies.push(
      spyOn(fsPromises, 'writeFile').mockImplementation(((path, data, options) =>
        isBackupCopy(path)
          ? replacement(String(path), data)
          : realWriteFile(path, data, options)) as typeof realWriteFile)
    );
  }

  it('leaves .mcp.json and no backup copy when the copy cannot be written', async () => {
    await seedInstall({ current: true });
    interceptBackupWrite(async (path) => {
      await realWriteFile(path, 'partial');
      throw Object.assign(new Error('EIO: simulated'), { code: 'EIO' });
    });

    const result = await run();

    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'failed',
      detail: 'backup failed: EIO: simulated',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
    expect(await exists(join(result.retiredBackupDir ?? '', 'mcp.json'))).toBe(false);
  });

  it('rejects a backup copy that does not match the original', async () => {
    await seedInstall({ current: true });
    interceptBackupWrite(async (path) => realWriteFile(path, 'different bytes', { flag: 'wx' }));

    const result = await run();

    expect(result.ontologyRagRetirement?.mcpServer).toEqual({
      status: 'failed',
      detail: 'backup failed: the backup copy does not match the original',
    });
    expect(await readProjectFile('.mcp.json')).toBe(MCP_WITH_ENTRY);
    expect(await exists(join(result.retiredBackupDir ?? '', 'mcp.json'))).toBe(false);
  });

  it('discards the backup copy when .mcp.json changes meanwhile', async () => {
    await seedInstall({ mcp: MCP_WITH_ENTRY, current: true });
    await rm(join(project, AGENTS));
    await rm(join(project, ROUTING));
    interceptBackupWrite(async (path, data) => {
      await realWriteFile(path, data, { flag: 'wx' });
      await realWriteFile(join(project, '.mcp.json'), `${MCP_WITH_ENTRY} `);
    });

    const result = await run();

    expect(result.ontologyRagRetirement?.mcpServer).toEqual({ status: 'kept', reason: 'changed' });
    expect(await readProjectFile('.mcp.json')).toBe(`${MCP_WITH_ENTRY} `);
    // Nothing else was moved, so the run leaves no backup folder at all.
    expect(result.retiredBackupDir).toBeUndefined();
    expect(await backupDirs()).toEqual([]);
  });
});

describe('committed retired template list (#1960)', () => {
  it('lists the 8 files .claude/ontology shipped', async () => {
    const committed = JSON.parse(
      await readFile(
        join(import.meta.dir, '../../../templates/retired-template-paths.json'),
        'utf8'
      )
    ) as { paths: RetiredTemplatePathEntry[] };
    expect(
      committed.paths
        .map((entry) => entry.path)
        .filter((path) => path.startsWith('.claude/ontology/'))
    ).toEqual([
      '.claude/ontology/agents.yaml',
      '.claude/ontology/graphs/agent-skill.json',
      '.claude/ontology/graphs/full-graph.json',
      '.claude/ontology/graphs/routing.json',
      '.claude/ontology/graphs/skill-rule.json',
      '.claude/ontology/rules.yaml',
      '.claude/ontology/schema.yaml',
      '.claude/ontology/skills.yaml',
    ]);
  });
});

describe('update output for the ontology-rag retirement (#1960)', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  function makeResult(overrides: Partial<UpdateResult> = {}): UpdateResult {
    return {
      success: true,
      updatedComponents: [],
      skippedComponents: [],
      preservedFiles: [],
      backedUpPaths: [],
      previousVersion: '2.0.23',
      newVersion: '2.0.24',
      warnings: [],
      syncedRootFiles: [],
      removedDeprecatedFiles: [],
      namespaceSynced: [],
      ...overrides,
    };
  }

  const printed = (): string[] => [
    ...logSpy.mock.calls.map((call: unknown[]) => String(call[0])),
    ...warnSpy.mock.calls.map((call: unknown[]) => String(call[0])),
  ];

  beforeEach(async () => {
    await initI18n('en');
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('prints each status once, in a single update and in --all', () => {
    const result = makeResult({
      ontologyRagRetirement: {
        mcpServer: { status: 'removed', backupPath: '/p/.omcustom-backup-x/retired/mcp.json' },
        ontologyDirLeft: true,
        venvHasOntologyRag: true,
      },
    });
    const expected = [
      i18n.t('cli.update.ontologyRagMcpRemoved', {
        path: '/p/.omcustom-backup-x/retired/mcp.json',
      }),
      i18n.t('cli.update.ontologyDirLeft'),
      i18n.t('cli.update.ontologyRagVenvNotice'),
    ];

    printUpdateResults(result);
    for (const line of expected) {
      expect(printed().filter((item) => item === line)).toHaveLength(1);
    }

    logSpy.mockClear();
    warnSpy.mockClear();
    reportProjectUpdateResult({ name: 'p', version: '2.0.23' }, result, '2.0.24');
    for (const line of expected) {
      expect(printed().filter((item) => item === line)).toHaveLength(1);
    }
  });

  it.each([
    [{ status: 'would-remove' as const }, 'cli.update.ontologyRagMcpWouldRemove', {}],
    [
      { status: 'kept' as const, reason: 'modified' as const },
      'cli.update.ontologyRagMcpKeptModified',
      {},
    ],
    [
      { status: 'kept' as const, reason: 'preserved' as const },
      'cli.update.ontologyRagMcpKeptPreserved',
      {},
    ],
    [
      { status: 'kept' as const, reason: 'manifest-unreadable' as const },
      'cli.update.ontologyRagMcpKeptManifestUnreadable',
      {},
    ],
    [
      { status: 'kept' as const, reason: 'not-regular' as const },
      'cli.update.ontologyRagMcpKeptNotRegular',
      {},
    ],
    [
      { status: 'kept' as const, reason: 'changed' as const },
      'cli.update.ontologyRagMcpKeptChanged',
      {},
    ],
  ])('prints %o as a log line', (mcpServer, key, vars) => {
    printUpdateResults(makeResult({ ontologyRagRetirement: { mcpServer } }));
    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toContain(i18n.t(key, vars));
  });

  it('prints the unreadable-manifest keep once, in a single update and in --all', () => {
    const result = makeResult({
      ontologyRagRetirement: { mcpServer: { status: 'kept', reason: 'manifest-unreadable' } },
    });
    const line = i18n.t('cli.update.ontologyRagMcpKeptManifestUnreadable');
    expect(line).not.toBe(i18n.t('cli.update.ontologyRagMcpKeptPreserved'));

    printUpdateResults(result);
    expect(printed().filter((item) => item === line)).toHaveLength(1);

    logSpy.mockClear();
    warnSpy.mockClear();
    reportProjectUpdateResult({ name: 'p', version: '2.0.23' }, result, '2.0.24');
    expect(printed().filter((item) => item === line)).toHaveLength(1);
  });

  it('prints unreadable and failed as warnings', () => {
    printUpdateResults(
      makeResult({ ontologyRagRetirement: { mcpServer: { status: 'unreadable', detail: 'bad' } } })
    );
    printUpdateResults(
      makeResult({ ontologyRagRetirement: { mcpServer: { status: 'failed', detail: 'nope' } } })
    );
    const warned = warnSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(warned).toContain(i18n.t('cli.update.ontologyRagMcpUnreadable', { reason: 'bad' }));
    expect(warned).toContain(i18n.t('cli.update.ontologyRagMcpFailed', { reason: 'nope' }));
  });

  it('prints nothing about ontology-rag when the result has no entry', () => {
    printUpdateResults(makeResult());
    reportProjectUpdateResult({ name: 'p', version: null }, makeResult(), '2.0.24');
    expect(printed().some((line) => line.includes('ontology'))).toBe(false);
  });

  it('has every new key in Korean too', async () => {
    const keys = [
      'ontologyRagMcpRemoved',
      'ontologyRagMcpWouldRemove',
      'ontologyRagMcpKeptModified',
      'ontologyRagMcpKeptPreserved',
      'ontologyRagMcpKeptManifestUnreadable',
      'ontologyRagMcpKeptNotRegular',
      'ontologyRagMcpKeptChanged',
      'ontologyRagMcpUnreadable',
      'ontologyRagMcpFailed',
      'ontologyDirLeft',
      'ontologyRagVenvNotice',
    ].map((key) => `cli.update.${key}`);
    const english = keys.map((key) => i18n.t(key));
    await initI18n('ko');
    const korean = keys.map((key) => i18n.t(key));
    await initI18n('en');
    keys.forEach((key, index) => {
      expect(korean[index]).not.toBe(key);
      expect(korean[index]).not.toBe(english[index]);
    });
  });
});
