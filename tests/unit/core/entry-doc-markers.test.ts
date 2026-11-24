import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDefaultConfig, loadConfig, saveConfig } from '../../../src/core/config.js';
import {
  GIT_WORKFLOW_PLACEHOLDER,
  injectGitWorkflowSection,
  renderGitWorkflowSection,
} from '../../../src/core/git-workflow.js';
import { install } from '../../../src/core/installer.js';
import { getEntryTemplateName } from '../../../src/core/layout.js';
import { _setRegistryDirForTesting } from '../../../src/core/registry.js';
import { update } from '../../../src/core/updater.js';
import { resolveTemplatePath } from '../../../src/utils/fs.js';

const START = '<!-- omcustom:start -->';
const END = '<!-- omcustom:end -->';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** First `# ` heading outside fenced code blocks */
function firstH1(content: string): string {
  let fenced = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) fenced = !fenced;
    if (!fenced && /^# \S/.test(line)) return line.trimEnd();
  }
  throw new Error('template has no H1');
}

describe('entry doc markers and git workflow rendering (#1991)', () => {
  let tempDir: string;
  const spies: Array<ReturnType<typeof spyOn>> = [];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-entry-markers-test-'));
    _setRegistryDirForTesting(join(tempDir, '.registry'));
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(spyOn(console, method).mockImplementation(() => {}));
    }
  });

  afterEach(async () => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    _setRegistryDirForTesting(undefined);
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Make the next update() see an older installed version so it runs */
  async function markInstalledVersionOld(): Promise<void> {
    const config = await loadConfig(tempDir);
    config.version = '0.1.0';
    await saveConfig(tempDir, config);
  }

  describe('injectGitWorkflowSection', () => {
    it('replaces the placeholder with the rendered section for the language', () => {
      const content = `before\n${GIT_WORKFLOW_PLACEHOLDER}\nafter`;

      const en = injectGitWorkflowSection(content, tempDir, 'en');
      const ko = injectGitWorkflowSection(content, tempDir, 'ko');

      expect(en).toBe(`before\n${renderGitWorkflowSection(tempDir, 'en')}\nafter`);
      expect(ko).toBe(`before\n${renderGitWorkflowSection(tempDir, 'ko')}\nafter`);
      expect(en).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
    });

    it('returns content without the placeholder unchanged', () => {
      expect(injectGitWorkflowSection('no placeholder here', tempDir, 'en')).toBe(
        'no placeholder here'
      );
    });
  });

  for (const language of ['ko', 'en'] as const) {
    describe(`language ${language}`, () => {
      it('init writes CLAUDE.md wrapped in exactly one managed block, placeholder rendered', async () => {
        const result = await install({ targetDir: tempDir, language, skipConfirm: true });

        expect(result.success).toBe(true);
        const content = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
        expect(count(content, START)).toBe(1);
        expect(count(content, END)).toBe(1);
        expect(content.startsWith(`${START}\n`)).toBe(true);
        expect(content.trimEnd().endsWith(END)).toBe(true);
        expect(content).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
        expect(content).toContain(renderGitWorkflowSection(tempDir, language));
      });

      it('the first update after init merges inside the block (no duplicated template)', async () => {
        const templateRaw = await readFile(
          resolveTemplatePath(getEntryTemplateName(language)),
          'utf-8'
        );
        // Precondition: the shipped template carries the placeholder this test is about
        expect(templateRaw).toContain(GIT_WORKFLOW_PLACEHOLDER);
        const h1 = firstH1(templateRaw);

        await install({ targetDir: tempDir, language, skipConfirm: true });
        const entryPath = join(tempDir, 'CLAUDE.md');
        const userEdited = `${await readFile(entryPath, 'utf-8')}\n\n## Project Notes\nkeep me\n`;
        await writeFile(entryPath, userEdited);
        await markInstalledVersionOld();

        const result = await update({ targetDir: tempDir });

        expect(result.success).toBe(true);
        const updated = await readFile(entryPath, 'utf-8');
        // Update renders the template exactly as init did, so nothing else changed
        expect(updated).toBe(userEdited);
        expect(count(updated, START)).toBe(1);
        expect(
          count(
            updated
              .split('\n')
              .map((l) => l.trimEnd())
              .join('\n'),
            `\n${h1}\n`
          )
        ).toBe(1);
        expect(updated).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
      });

      it('update renders the placeholder inside an existing managed block', async () => {
        const config = getDefaultConfig();
        config.version = '0.1.0';
        config.language = language;
        await saveConfig(tempDir, config);
        const entryPath = join(tempDir, 'CLAUDE.md');
        await writeFile(entryPath, `${START}\nold template\n${END}\n\n## Mine\nmine\n`);

        const result = await update({ targetDir: tempDir });

        expect(result.success).toBe(true);
        const updated = await readFile(entryPath, 'utf-8');
        expect(updated).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
        expect(updated).toContain(renderGitWorkflowSection(tempDir, language));
        expect(updated).not.toContain('old template');
        expect(updated).toContain('## Mine\nmine');
      });
    });
  }

  it('update reports the duplication warning for a marker-less legacy copy of the template', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(tempDir, config);
    const templateRaw = await readFile(resolveTemplatePath(getEntryTemplateName('en')), 'utf-8');
    await writeFile(join(tempDir, 'CLAUDE.md'), `${templateRaw}\n\n## Project Notes\nkeep\n`);

    const result = await update({ targetDir: tempDir });

    expect(result.success).toBe(true);
    const warned = (console.warn as unknown as ReturnType<typeof spyOn>).mock.calls
      .flat()
      .join('\n');
    expect(warned).toContain('appears to be duplicated');
  });

  it('update --force writes the rendered template inside managed markers', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(tempDir, config);
    const entryPath = join(tempDir, 'CLAUDE.md');
    await writeFile(entryPath, 'marker-less old file');

    const result = await update({ targetDir: tempDir, force: true });

    expect(result.success).toBe(true);
    const updated = await readFile(entryPath, 'utf-8');
    expect(updated).not.toContain('marker-less old file');
    expect(count(updated, START)).toBe(1);
    expect(count(updated, END)).toBe(1);
    expect(updated.startsWith(`${START}\n`)).toBe(true);
    expect(updated).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
  });

  it('update creates a missing entry doc with markers and the placeholder rendered', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(tempDir, config);

    const result = await update({ targetDir: tempDir });

    expect(result.success).toBe(true);
    const created = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(count(created, START)).toBe(1);
    expect(created).not.toContain(GIT_WORKFLOW_PLACEHOLDER);
  });
});
