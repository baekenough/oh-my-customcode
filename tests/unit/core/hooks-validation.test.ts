import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const HOOKS_FILE = resolve(import.meta.dir, '../../../templates/.claude/hooks/hooks.json');

interface CommandHook {
  type: 'command';
  command: string;
}

interface PromptHook {
  type: 'prompt';
  prompt: string;
}

type HookCommand = CommandHook | PromptHook;

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
  description: string;
}

interface HooksStructure {
  $schema?: string;
  hooks: {
    PreToolUse?: HookEntry[];
    SessionStart?: HookEntry[];
    UserPromptSubmit?: HookEntry[];
    SubagentStart?: HookEntry[];
    SubagentStop?: HookEntry[];
    CwdChanged?: HookEntry[];
    FileChanged?: HookEntry[];
    Notification?: HookEntry[];
    TeammateIdle?: HookEntry[];
    TaskCreated?: HookEntry[];
    TaskCompleted?: HookEntry[];
    PostCompact?: HookEntry[];
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
  };
}

async function loadHooksJson(): Promise<{ raw: string; parsed: unknown }> {
  const raw = await readFile(HOOKS_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return { raw, parsed };
}

function getAllEntries(data: HooksStructure): HookEntry[] {
  const h = data.hooks;
  const eventTypes: (keyof HooksStructure['hooks'])[] = [
    'PreToolUse',
    'SessionStart',
    'UserPromptSubmit',
    'SubagentStart',
    'SubagentStop',
    'CwdChanged',
    'FileChanged',
    'Notification',
    'TeammateIdle',
    'TaskCreated',
    'TaskCompleted',
    'PostCompact',
    'PostToolUse',
    'Stop',
  ];
  return eventTypes.flatMap((key) => h[key] ?? []);
}

describe('Hooks Validation', () => {
  describe('JSON validity', () => {
    it('should be valid JSON', async () => {
      const raw = await readFile(HOOKS_FILE, 'utf-8');

      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('should not be empty', async () => {
      const raw = await readFile(HOOKS_FILE, 'utf-8');

      expect(raw.trim().length).toBeGreaterThan(0);
    });
  });

  describe('Schema structure', () => {
    it('should have a $schema field', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as Record<string, unknown>;

      expect(data).toHaveProperty('$schema');
      expect(typeof data.$schema).toBe('string');
    });

    it('should have a top-level hooks object', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as Record<string, unknown>;

      expect(data).toHaveProperty('hooks');
      expect(typeof data.hooks).toBe('object');
      expect(data.hooks).not.toBeNull();
    });

    it('should have PreToolUse as an array', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(Array.isArray(data.hooks.PreToolUse)).toBe(true);
    });

    it('should have PostToolUse as an array', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(Array.isArray(data.hooks.PostToolUse)).toBe(true);
    });

    it('should have Stop as an array', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(Array.isArray(data.hooks.Stop)).toBe(true);
    });
  });

  describe('Hook categories complete', () => {
    it('should have non-empty PreToolUse category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.PreToolUse).toBeDefined();
      expect((data.hooks.PreToolUse ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty PostToolUse category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.PostToolUse).toBeDefined();
      expect((data.hooks.PostToolUse ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty Stop category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.Stop).toBeDefined();
      expect((data.hooks.Stop ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty SessionStart category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.SessionStart).toBeDefined();
      expect((data.hooks.SessionStart ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty UserPromptSubmit category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.UserPromptSubmit).toBeDefined();
      expect((data.hooks.UserPromptSubmit ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty SubagentStart category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.SubagentStart).toBeDefined();
      expect((data.hooks.SubagentStart ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty SubagentStop category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.SubagentStop).toBeDefined();
      expect((data.hooks.SubagentStop ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty PostCompact category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.PostCompact).toBeDefined();
      expect((data.hooks.PostCompact ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty CwdChanged category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.CwdChanged).toBeDefined();
      expect((data.hooks.CwdChanged ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty FileChanged category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.FileChanged).toBeDefined();
      expect((data.hooks.FileChanged ?? []).length).toBeGreaterThan(0);
    });

    it('should have non-empty Notification category', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      expect(data.hooks.Notification).toBeDefined();
      expect((data.hooks.Notification ?? []).length).toBeGreaterThan(0);
    });
  });

  describe('Hook entry format', () => {
    it('should have required fields on every PreToolUse entry', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      for (const entry of entries) {
        expect(entry).toHaveProperty('matcher');
        expect(typeof entry.matcher).toBe('string');
        expect(entry).toHaveProperty('hooks');
        expect(Array.isArray(entry.hooks)).toBe(true);
        expect(entry).toHaveProperty('description');
        expect(typeof entry.description).toBe('string');
      }
    });

    it('should have required fields on every PostToolUse entry', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PostToolUse ?? [];

      for (const entry of entries) {
        expect(entry).toHaveProperty('matcher');
        expect(typeof entry.matcher).toBe('string');
        expect(entry).toHaveProperty('hooks');
        expect(Array.isArray(entry.hooks)).toBe(true);
        expect(entry).toHaveProperty('description');
        expect(typeof entry.description).toBe('string');
      }
    });

    it('should have required fields on every Stop entry', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.Stop ?? [];

      for (const entry of entries) {
        expect(entry).toHaveProperty('matcher');
        expect(typeof entry.matcher).toBe('string');
        expect(entry).toHaveProperty('hooks');
        expect(Array.isArray(entry.hooks)).toBe(true);
        expect(entry).toHaveProperty('description');
        expect(typeof entry.description).toBe('string');
      }
    });

    it('should have non-empty description on all entries', async () => {
      const { parsed } = await loadHooksJson();
      const allEntries = getAllEntries(parsed as HooksStructure);
      for (const entry of allEntries) {
        expect(entry.description.trim().length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty matcher on all entries', async () => {
      const { parsed } = await loadHooksJson();
      const allEntries = getAllEntries(parsed as HooksStructure);
      for (const entry of allEntries) {
        expect(entry.matcher.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('Hook command format', () => {
    function getAllHookCmds(data: HooksStructure): HookCommand[] {
      const allEntries: HookEntry[] = [
        ...(data.hooks.PreToolUse ?? []),
        ...(data.hooks.SessionStart ?? []),
        ...(data.hooks.UserPromptSubmit ?? []),
        ...(data.hooks.SubagentStart ?? []),
        ...(data.hooks.SubagentStop ?? []),
        ...(data.hooks.CwdChanged ?? []),
        ...(data.hooks.FileChanged ?? []),
        ...(data.hooks.Notification ?? []),
        ...(data.hooks.TeammateIdle ?? []),
        ...(data.hooks.TaskCreated ?? []),
        ...(data.hooks.TaskCompleted ?? []),
        ...(data.hooks.PostCompact ?? []),
        ...(data.hooks.PostToolUse ?? []),
        ...(data.hooks.Stop ?? []),
      ];
      return allEntries.flatMap((entry) => entry.hooks);
    }

    it('should have type and required payload fields on every hook command', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      for (const hookCmd of getAllHookCmds(data)) {
        expect(hookCmd).toHaveProperty('type');
        expect(typeof hookCmd.type).toBe('string');
        // 'command' type requires command field; 'prompt' type requires prompt field
        if (hookCmd.type === 'command') {
          expect(hookCmd).toHaveProperty('command');
          expect(typeof hookCmd.command).toBe('string');
        }
        if (hookCmd.type === 'prompt') {
          expect(hookCmd).toHaveProperty('prompt');
          expect(typeof hookCmd.prompt).toBe('string');
        }
      }
    });

    it('should have non-empty payload strings on all hook commands', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;

      for (const hookCmd of getAllHookCmds(data)) {
        if (hookCmd.type === 'command') expect(hookCmd.command.trim().length).toBeGreaterThan(0);
        if (hookCmd.type === 'prompt') expect(hookCmd.prompt.trim().length).toBeGreaterThan(0);
      }
    });

    it('should have valid type values on all hook commands', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const validTypes = new Set(['command', 'prompt']);

      for (const hookCmd of getAllHookCmds(data)) {
        expect(validTypes.has(hookCmd.type)).toBe(true);
      }
    });
  });

  describe('No duplicate matchers in PreToolUse', () => {
    it('should warn about duplicate matchers in PreToolUse (no duplicates expected)', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      const matcherCounts = new Map<string, number>();
      for (const entry of entries) {
        const count = matcherCounts.get(entry.matcher) ?? 0;
        matcherCounts.set(entry.matcher, count + 1);
      }

      const duplicates = [...matcherCounts.entries()].filter(([, count]) => count > 1);

      // Duplicates are allowed but we verify the detection logic works
      // This test documents any intentional duplicates explicitly
      expect(duplicates).toEqual([]);
    });
  });

  describe('Stage-based hook', () => {
    it('should have the stage-based tool blocking hook in PreToolUse', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      const stageBlockingHook = entries.find(
        (entry) => entry.matcher === 'tool == "Write" || tool == "Edit"'
      );

      expect(stageBlockingHook).toBeDefined();
    });

    it('should have the stage-based hook with a command type', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      const stageBlockingHook = entries.find(
        (entry) => entry.matcher === 'tool == "Write" || tool == "Edit"'
      );

      expect(stageBlockingHook).toBeDefined();
      expect(stageBlockingHook?.hooks.length).toBeGreaterThan(0);
      expect(stageBlockingHook?.hooks[0].type).toBe('command');
    });

    it('should have the stage-based hook command referencing stage-blocker script', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      const stageBlockingHook = entries.find(
        (entry) => entry.matcher === 'tool == "Write" || tool == "Edit"'
      );

      expect(stageBlockingHook).toBeDefined();
      const hookCmd = stageBlockingHook?.hooks[0];
      const command = hookCmd?.type === 'command' ? hookCmd.command : '';
      expect(command).toContain('stage-blocker.sh');

      // Read the script file to verify it references /tmp/.claude-dev-stage
      const scriptPath = resolve(
        import.meta.dir,
        '../../../templates/.claude/hooks/scripts/stage-blocker.sh'
      );
      const scriptContent = await readFile(scriptPath, 'utf-8');
      expect(scriptContent).toContain('/tmp/.claude-dev-stage');
    });

    it('should block Write/Edit in plan, verify-plan, verify-impl, and compound stages', async () => {
      // Read the stage-blocker script to verify stage names
      const scriptPath = resolve(
        import.meta.dir,
        '../../../templates/.claude/hooks/scripts/stage-blocker.sh'
      );
      const scriptContent = await readFile(scriptPath, 'utf-8');

      expect(scriptContent).toContain('plan');
      expect(scriptContent).toContain('verify-plan');
      expect(scriptContent).toContain('verify-impl');
      expect(scriptContent).toContain('compound');
      expect(scriptContent).toContain('done');
    });

    it('should have a description for the stage-based hook', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.PreToolUse ?? [];

      const stageBlockingHook = entries.find(
        (entry) => entry.matcher === 'tool == "Write" || tool == "Edit"'
      );

      expect(stageBlockingHook?.description.trim().length).toBeGreaterThan(0);
    });
  });

  describe('Stop hook', () => {
    it('should reference stop-console-audit.sh script', async () => {
      const { parsed } = await loadHooksJson();
      const data = parsed as HooksStructure;
      const entries = data.hooks.Stop ?? [];

      const stopHook = entries.find((entry) => entry.matcher === '*');
      expect(stopHook).toBeDefined();
      const hookCmd = stopHook?.hooks[0];
      const command = hookCmd?.type === 'command' ? hookCmd.command : '';
      expect(command).toContain('stop-console-audit.sh');
    });

    it('should have the stop-console-audit script file', async () => {
      const scriptPath = resolve(
        import.meta.dir,
        '../../../templates/.claude/hooks/scripts/stop-console-audit.sh'
      );
      const scriptContent = await readFile(scriptPath, 'utf-8');
      expect(scriptContent).toContain('console');
      expect(scriptContent).toContain('exit 0');
    });

    it('should have session diagnostics in stop script', async () => {
      const scriptPath = resolve(
        import.meta.dir,
        '../../../templates/.claude/hooks/scripts/stop-console-audit.sh'
      );
      const scriptContent = await readFile(scriptPath, 'utf-8');
      expect(scriptContent).toContain('Session safe to terminate');
      expect(scriptContent).toContain('audit');
    });
  });
});
