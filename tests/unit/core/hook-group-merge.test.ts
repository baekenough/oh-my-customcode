/**
 * Tests for the user-hook-preserving merge of generated omcustom hook blocks (#1768).
 *
 * Pure module: no file system, no mocks. Fixtures mimic the shape of
 * templates/.claude/hooks/hooks.json (event -> matcher groups with a `description`).
 */

import { describe, expect, it } from 'bun:test';
import {
  LEGACY_OMCUSTOM_DESCRIPTIONS,
  mergeHookBlocks,
  retireRtkHookBlocks,
} from '../../../src/core/hook-group-merge.js';

const anchored = (script: string): string =>
  `bash "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${script}"`;

const INLINE_COMMAND =
  'input=$(cat)\nif printf "%s" "$input" | jq -e . >/dev/null; then exit 0; fi';

/** Generated blocks: stands in for the parsed hooks.json `hooks` object. */
function makeGenerated(): Record<string, unknown[]> {
  return {
    SessionStart: [
      {
        matcher: '*',
        description: 'Re-inject CLAUDE.md',
        hooks: [{ type: 'command', command: anchored('scripts/claude-md-reinject.sh') }],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        description: 'Filter secrets',
        hooks: [{ type: 'command', command: anchored('scripts/secret-filter.sh') }],
      },
      {
        matcher: 'Bash',
        description: 'Inline guard',
        hooks: [{ type: 'command', command: INLINE_COMMAND }],
      },
    ],
    SubagentStop: [
      {
        matcher: '*',
        description: 'Record outcomes',
        hooks: [
          { type: 'command', command: anchored('scripts/task-outcome-recorder.sh') },
          { type: 'prompt', prompt: 'Decide whether to continue.' },
        ],
      },
    ],
  };
}

/** Shapes the derivation must tolerate without owning anything (never round-tripped). */
function makeOddGenerated(): Record<string, unknown[]> {
  return {
    Stop: [
      'not-an-object',
      { matcher: '*', hooks: 'not-an-array' },
      { matcher: '*', hooks: [null, { type: 'command', command: 42 }] },
    ],
  };
}

const userGroup = (command: string, extra: Record<string, unknown> = {}) => ({
  matcher: 'Bash',
  hooks: [{ type: 'command', command }],
  ...extra,
});

describe('exact RTK hook retirement', () => {
  const retiredDescription =
    'RTK auto-intercept — transparently rewrites CLI commands through RTK proxy when available (R013 advisory)';
  const legacyCommands = [
    '.claude/hooks/scripts/rtk-intercept.sh',
    'bash .claude/hooks/scripts/rtk-intercept.sh',
    'bash ./.claude/hooks/scripts/rtk-intercept.sh',
    'bash ".claude/hooks/scripts/rtk-intercept.sh"',
    'bash "./.claude/hooks/scripts/rtk-intercept.sh"',
    anchored('scripts/rtk-intercept.sh'),
  ];

  it.each(legacyCommands)('retires only the recognized standalone command %s', (command) => {
    const sibling = { type: 'command', command: 'bash ~/team/audit.sh --strict' };
    const group = {
      matcher: 'Bash',
      description: retiredDescription,
      timeout: 7,
      hooks: [{ type: 'command', command }, sibling],
    };
    const existing = { PreToolUse: [group] };
    const snapshot = structuredClone(existing);
    const expected = { ...group, hooks: [sibling] };
    const retired = retireRtkHookBlocks(existing);
    expect(retired).toEqual({ PreToolUse: [expected] });
    expect(retireRtkHookBlocks(retired)).toBe(retired);
    const generated = makeGenerated();
    const merged = mergeHookBlocks(existing, generated);
    expect(merged.PreToolUse).toEqual([expected]);
    expect(merged.PostToolUse).toEqual(generated.PostToolUse);
    expect(mergeHookBlocks(merged, generated)).toEqual(merged);
    expect(existing).toEqual(snapshot);
  });

  it('drops an empty retired group but preserves unrelated LEGACY groups in retirement-only mode', () => {
    const legacy = {
      matcher: '*',
      description: LEGACY_OMCUSTOM_DESCRIPTIONS[0],
      hooks: [{ type: 'prompt', prompt: 'legacy user data' }],
    };
    const existing = {
      PreToolUse: [userGroup(legacyCommands[0] as string)],
      SubagentStop: [legacy],
      unknown: 'unchanged',
    };
    const retired = retireRtkHookBlocks(existing) as typeof existing;
    expect(retired.PreToolUse).toEqual([]);
    expect(retired.SubagentStop).toBe(existing.SubagentStop);
    expect(retired.unknown).toBe('unchanged');
    expect(retireRtkHookBlocks(retired)).toBe(retired);
    // Full merge still applies its original legacy ownership and generated groups.
    expect(mergeHookBlocks(existing, makeGenerated()).SubagentStop).toEqual(
      makeGenerated().SubagentStop
    );
  });

  it.each([
    ['different event', 'PostToolUse', 'Bash', legacyCommands[0]],
    ['different matcher', 'PreToolUse', 'MyTool', legacyCommands[0]],
    ['combined matcher', 'PreToolUse', 'Bash|Edit', legacyCommands[0]],
    ['absent matcher', 'PreToolUse', undefined, legacyCommands[0]],
    ['pipeline', 'PreToolUse', 'Bash', 'bash .claude/hooks/scripts/rtk-intercept.sh | tee log'],
    ['arguments', 'PreToolUse', 'Bash', 'bash .claude/hooks/scripts/rtk-intercept.sh --user'],
    ['suffix', 'PreToolUse', 'Bash', 'bash .claude/hooks/scripts/rtk-intercept.sh.backup'],
    [
      'absolute user',
      'PreToolUse',
      'Bash',
      'bash /opt/project/.claude/hooks/scripts/rtk-intercept.sh',
    ],
    ['different interpreter', 'PreToolUse', 'Bash', 'sh .claude/hooks/scripts/rtk-intercept.sh'],
    ['unbalanced quote', 'PreToolUse', 'Bash', 'bash ".claude/hooks/scripts/rtk-intercept.sh'],
    ['unknown script', 'PreToolUse', 'Bash', 'bash .claude/hooks/scripts/rtk-custom.sh'],
  ])('preserves %s even under the old RTK description', (_label, event, matcher, command) => {
    const group = {
      matcher,
      description: retiredDescription,
      hooks: [{ type: 'command', command }],
    };
    const existing = { [event as string]: [group] };
    expect(retireRtkHookBlocks(existing)).toBe(existing);
    const generated = makeGenerated();
    expect(mergeHookBlocks(existing, generated)[event as string]).toContain(group);
  });

  it('preserves unknown shapes and non-command siblings rather than guessing ownership', () => {
    const shapes = [null, 'unknown', { matcher: 'Bash', hooks: 'unknown' }, { hooks: [] }];
    const sibling = { type: 'prompt', command: legacyCommands[0], prompt: 'user prompt' };
    const existing = {
      PreToolUse: [...shapes, { matcher: 'Bash', hooks: [null, 5, sibling] }],
      OtherEvent: { malformed: 'kept' },
    };
    expect(retireRtkHookBlocks(existing)).toBe(existing);
    expect(mergeHookBlocks(existing, makeGenerated()).PreToolUse).toEqual(existing.PreToolUse);
    for (const unusable of [undefined, null, 'unknown', 5, []]) {
      expect(retireRtkHookBlocks(unusable)).toBe(unusable);
    }
  });
});

const LEGACY_SUBAGENT_STOP =
  'Record agent outcomes + auto-continue workflow + R007/R008 drift advisory on subagent completion (autonomous-loop re-entry, #1545)';
const LEGACY_SESSION_START =
  'Re-inject project CLAUDE.md into model context on session start/resume/clear and compact re-entry — matcher "*" covers all SessionStart sources including "compact" (#1617)';

describe('mergeHookBlocks', () => {
  describe('generated-only and unusable input', () => {
    it('returns the generated blocks when existing is the generated output', () => {
      const generated = makeGenerated();
      expect(mergeHookBlocks(structuredClone(generated), generated)).toEqual(generated);
    });

    it.each([
      [undefined],
      [null],
      ['text'],
      [7],
      [[]],
    ])('returns a copy of generated when existing is %p', (existing) => {
      const generated = makeGenerated();
      const merged = mergeHookBlocks(existing, generated);
      expect(merged).toEqual(generated);
      expect(merged.PostToolUse).not.toBe(generated.PostToolUse);
    });

    it('documents malformed input replacement and unknown-shape preservation (#1784 A-L3)', () => {
      const generated = makeGenerated();
      const unknownGroup = {
        matcher: 'Bash',
        description: 'Inline guard',
        hooks: 'not-an-array',
      };
      const existing = {
        PostToolUse: 'not-an-array',
        Elicitation: 'user-blob',
        SessionStart: [unknownGroup],
      };
      const merged = mergeHookBlocks(existing, generated);

      // The parameterized cases above also cover other unusable top-level values.
      expect(mergeHookBlocks(null, generated)).toEqual(generated);
      expect(merged.PostToolUse).toEqual(generated.PostToolUse);
      expect(merged.Elicitation).toBe(existing.Elicitation);
      // Even a recognized description does not own a group with malformed hooks.
      expect(merged.SessionStart).toEqual([...generated.SessionStart, unknownGroup]);
    });

    it('tolerates generated groups of unknown shape without owning anything', () => {
      const generated = makeOddGenerated();
      const user = userGroup('bash .claude/hooks/scripts/secret-filter.sh');
      const merged = mergeHookBlocks({ Stop: [user], Elicitation: [user] }, generated);
      expect(merged.Stop).toEqual([...generated.Stop, user]);
      expect(merged.Elicitation).toEqual([user]);
    });

    it('does not mutate its inputs', () => {
      const generated = makeGenerated();
      const existing = {
        PostToolUse: [userGroup('bash ~/team/audit.sh')],
        Elicitation: [userGroup('bash ~/team/notify.sh')],
      };
      const generatedSnapshot = structuredClone(generated);
      const existingSnapshot = structuredClone(existing);
      mergeHookBlocks(existing, generated);
      expect(generated).toEqual(generatedSnapshot);
      expect(existing).toEqual(existingSnapshot);
    });
  });

  describe('user hooks are kept', () => {
    it('keeps a user group on a generated event, after the generated groups', () => {
      const generated = makeGenerated();
      const user = userGroup('bash ~/team/audit.sh');
      const merged = mergeHookBlocks({ PostToolUse: [user] }, generated);
      expect(merged.PostToolUse).toEqual([...generated.PostToolUse, user]);
    });

    it('keeps a user group on an event the generator does not use', () => {
      const user = userGroup('bash ~/team/notify.sh');
      const merged = mergeHookBlocks({ Elicitation: [user] }, makeGenerated());
      expect(merged.Elicitation).toEqual([user]);
      expect(Object.keys(merged)).toEqual([
        'SessionStart',
        'PostToolUse',
        'SubagentStop',
        'Elicitation',
      ]);
    });

    it('keeps a user group that merely has its own description', () => {
      const user = userGroup('bash ~/team/audit.sh', { description: 'Team audit' });
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toContain(user);
    });

    it('keeps user prompt hooks that carry no omcustom description', () => {
      const user = { matcher: '*', hooks: [{ type: 'prompt', prompt: 'Be careful.' }] };
      const merged = mergeHookBlocks({ SubagentStop: [user] }, makeGenerated());
      expect(merged.SubagentStop).toContain(user);
    });

    it('keeps a mixed group as its user residual only', () => {
      const mixed = {
        matcher: '*',
        description: 'My team hooks',
        hooks: [
          { type: 'command', command: 'bash .claude/hooks/scripts/secret-filter.sh' },
          { type: 'command', command: 'bash ~/team/audit.sh' },
        ],
      };
      const merged = mergeHookBlocks({ PostToolUse: [mixed] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([
        ...makeGenerated().PostToolUse,
        {
          matcher: '*',
          description: 'My team hooks',
          hooks: [{ type: 'command', command: 'bash ~/team/audit.sh' }],
        },
      ]);
    });

    it('keeps non-array event values for events the generator does not use', () => {
      const merged = mergeHookBlocks({ Elicitation: 'custom-blob' }, makeGenerated());
      expect(merged.Elicitation).toBe('custom-blob');
    });

    it('lets generated win over a non-array value on a generated event', () => {
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ PostToolUse: 'custom-blob' }, generated);
      expect(merged.PostToolUse).toEqual(generated.PostToolUse);
    });

    it('keeps groups of unknown shape (non-object, non-array hooks, odd entries)', () => {
      const odd = [
        null,
        'text',
        { matcher: '*', hooks: 'nope' },
        { matcher: '*', hooks: [null, 5] },
      ];
      const merged = mergeHookBlocks({ Elicitation: odd }, makeGenerated());
      expect(merged.Elicitation).toEqual(odd);
    });

    it('keeps a group with an empty hooks array', () => {
      const empty = { matcher: '*', hooks: [] };
      const merged = mergeHookBlocks({ Elicitation: [empty] }, makeGenerated());
      expect(merged.Elicitation).toEqual([empty]);
    });
  });

  describe('omcustom-owned groups are replaced, not duplicated', () => {
    it.each([
      ['old relative', 'bash .claude/hooks/scripts/secret-filter.sh'],
      ['old relative with ./', 'bash ./.claude/hooks/scripts/secret-filter.sh'],
      ['old relative without interpreter', '.claude/hooks/scripts/secret-filter.sh'],
      ['quoted relative', 'bash ".claude/hooks/scripts/secret-filter.sh"'],
      ['quoted ./ relative', 'bash "./.claude/hooks/scripts/secret-filter.sh"'],
      ['new anchored', anchored('scripts/secret-filter.sh')],
    ])('drops a %s command for a script shipped under the same event', (_label, command) => {
      const generated = makeGenerated();
      const merged = mergeHookBlocks(
        { PostToolUse: [userGroup(command, { matcher: '*' })] },
        generated
      );
      expect(merged.PostToolUse).toEqual(generated.PostToolUse);
    });

    it('replaces appended commands in owned groups but keeps a separate user group (#1784 A-M2)', () => {
      const generated = makeGenerated();
      const appended = { type: 'command', command: 'echo mine' };
      const owned = {
        matcher: 'Bash',
        description: 'Inline guard',
        hooks: [{ type: 'command', command: INLINE_COMMAND }, appended],
      };
      const separate = userGroup(appended.command, { description: 'Team append' });

      expect(mergeHookBlocks({ PostToolUse: [owned] }, generated).PostToolUse).toEqual(
        generated.PostToolUse
      );
      expect(mergeHookBlocks({ PostToolUse: [owned, separate] }, generated).PostToolUse).toEqual([
        ...generated.PostToolUse,
        separate,
      ]);
      expect(owned.hooks).toContain(appended);
    });

    it('drops a group whose description is owned, even if the inline text changed', () => {
      const stale = {
        matcher: 'Bash',
        description: 'Inline guard',
        hooks: [{ type: 'command', command: 'input=$(cat)\nold inline text' }],
      };
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ PostToolUse: [stale] }, generated);
      expect(merged.PostToolUse).toEqual(generated.PostToolUse);
    });

    it('drops an exact generated inline command even without a matching description', () => {
      const renamed = userGroup(INLINE_COMMAND, { description: 'renamed upstream' });
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ PostToolUse: [renamed] }, generated);
      expect(merged.PostToolUse).toEqual(generated.PostToolUse);
    });

    it('drops an owned prompt group by description', () => {
      const old = {
        matcher: '*',
        description: 'Record outcomes',
        hooks: [{ type: 'prompt', prompt: 'old prompt text' }],
      };
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ SubagentStop: [old] }, generated);
      expect(merged.SubagentStop).toEqual(generated.SubagentStop);
    });

    it('does not create an empty array for a non-generated event that was fully owned', () => {
      const old = { matcher: '*', description: 'Record outcomes', hooks: [] };
      const merged = mergeHookBlocks({ PreCompact: [old] }, makeGenerated());
      expect('PreCompact' in merged).toBe(false);
    });
  });

  describe('idempotence', () => {
    const existing = () => ({
      PostToolUse: [
        userGroup('bash ~/team/audit.sh'),
        userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: '*' }),
      ],
      SessionStart: [
        userGroup('bash .claude/hooks/scripts/claude-md-reinject.sh', { matcher: '*' }),
      ],
      Elicitation: [userGroup('bash ~/team/notify.sh')],
      SubagentStop: [
        {
          matcher: '*',
          description: LEGACY_SUBAGENT_STOP,
          hooks: [{ type: 'prompt', prompt: 'x' }],
        },
      ],
    });

    it('a second merge is identical to the first', () => {
      const generated = makeGenerated();
      const first = mergeHookBlocks(existing(), generated);
      const second = mergeHookBlocks(first, generated);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('never duplicates generated groups across repeated merges', () => {
      const generated = makeGenerated();
      let current: unknown = existing();
      for (let i = 0; i < 3; i++) {
        current = mergeHookBlocks(current, generated);
      }
      const merged = current as Record<string, unknown[]>;
      expect(merged.SessionStart).toEqual(generated.SessionStart);
      expect(merged.PostToolUse).toHaveLength(generated.PostToolUse.length + 1);
      expect(merged.SubagentStop).toEqual(generated.SubagentStop);
    });
  });

  // R1: groups that omcustom shipped in the past and no longer generates.
  describe('retired omcustom group descriptions (R1)', () => {
    it('registers exactly the descriptions found in git history', () => {
      expect(LEGACY_OMCUSTOM_DESCRIPTIONS).toContain(LEGACY_SUBAGENT_STOP);
      expect(LEGACY_OMCUSTOM_DESCRIPTIONS).toContain(LEGACY_SESSION_START);
      expect(LEGACY_OMCUSTOM_DESCRIPTIONS).toHaveLength(2);
    });

    it('drops the v1.1.53-v1.1.55 SubagentStop auto-continue prompt group', () => {
      const legacy = {
        matcher: '*',
        description: LEGACY_SUBAGENT_STOP,
        hooks: [
          { type: 'command', command: 'bash .claude/hooks/scripts/task-outcome-recorder.sh' },
          { type: 'prompt', prompt: 'auto-continue the workflow' },
        ],
      };
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ SubagentStop: [legacy] }, generated);
      expect(merged.SubagentStop).toEqual(generated.SubagentStop);
    });

    it('drops the v1.1.53-v1.1.56 SessionStart re-inject group', () => {
      const legacy = {
        matcher: '*',
        description: LEGACY_SESSION_START,
        hooks: [{ type: 'command', command: 'echo retired inline text' }],
      };
      const generated = makeGenerated();
      const merged = mergeHookBlocks({ SessionStart: [legacy] }, generated);
      expect(merged.SessionStart).toEqual(generated.SessionStart);
    });
  });

  // R2: command ownership is scoped per event and requires balanced quotes.
  describe('command ownership negatives (R2)', () => {
    it('keeps a user hook wiring an omcustom script under a different event', () => {
      const notification = userGroup('bash .claude/hooks/scripts/secret-filter.sh', {
        matcher: '*',
      });
      const merged = mergeHookBlocks({ Notification: [notification] }, makeGenerated());
      expect(merged.Notification).toEqual([notification]);
    });

    it('drops the same script wired under the event that ships it (control)', () => {
      const merged = mergeHookBlocks(
        {
          PostToolUse: [userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: '*' })],
        },
        makeGenerated()
      );
      expect(merged.PostToolUse).toEqual(makeGenerated().PostToolUse);
    });

    // M1 (#1768 review): ownership is scoped to event AND matcher.
    it('keeps a same-event user group that wires a shipped script under a different matcher', () => {
      const user = userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: 'MyTool' });
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([...makeGenerated().PostToolUse, user]);
    });

    it('keeps a user copy of an exact generated command under a different matcher', () => {
      const user = userGroup(INLINE_COMMAND, { matcher: 'MyTool' });
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([...makeGenerated().PostToolUse, user]);
    });

    it('still replaces a same-event same-matcher group (control for the matcher scope)', () => {
      const merged = mergeHookBlocks(
        {
          PostToolUse: [
            userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: '*' }),
            userGroup(INLINE_COMMAND, { matcher: 'Bash' }),
          ],
        },
        makeGenerated()
      );
      expect(merged.PostToolUse).toEqual(makeGenerated().PostToolUse);
    });

    it('treats a missing matcher and an empty matcher as the same matcher', () => {
      const generated = {
        Notification: [{ hooks: [{ type: 'command', command: anchored('scripts/notify.sh') }] }],
      };
      const missing = {
        hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/notify.sh' }],
      };
      const empty = {
        matcher: '',
        hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/notify.sh' }],
      };
      expect(mergeHookBlocks({ Notification: [missing] }, generated).Notification).toEqual(
        generated.Notification
      );
      expect(mergeHookBlocks({ Notification: [empty] }, generated).Notification).toEqual(
        generated.Notification
      );
      const other = { matcher: 'X', hooks: missing.hooks };
      expect(mergeHookBlocks({ Notification: [other] }, generated).Notification).toEqual([
        ...generated.Notification,
        other,
      ]);
    });

    it('is idempotent for a different-matcher user group', () => {
      const generated = makeGenerated();
      const existing = {
        PostToolUse: [
          userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: 'MyTool' }),
          userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: '*' }),
        ],
      };
      const first = mergeHookBlocks(existing, generated);
      const second = mergeHookBlocks(first, generated);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(first.PostToolUse).toEqual([
        ...generated.PostToolUse,
        userGroup('bash .claude/hooks/scripts/secret-filter.sh', { matcher: 'MyTool' }),
      ]);
    });

    it('keeps a shipped script wired under a generated event that does not ship it', () => {
      const wrongEvent = userGroup('bash .claude/hooks/scripts/secret-filter.sh');
      const merged = mergeHookBlocks({ SessionStart: [wrongEvent] }, makeGenerated());
      expect(merged.SessionStart).toEqual([...makeGenerated().SessionStart, wrongEvent]);
    });

    it.each([
      ['leading quote only', 'bash "./.claude/hooks/scripts/secret-filter.sh'],
      ['trailing quote only', 'bash ./.claude/hooks/scripts/secret-filter.sh"'],
      [
        'anchored with leading quote only',
        `bash "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/secret-filter.sh`,
      ],
      [
        'unquoted anchored form',
        `bash \${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/secret-filter.sh`,
      ],
    ])('keeps a command with unbalanced quotes (%s)', (_label, command) => {
      const user = userGroup(command);
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([...makeGenerated().PostToolUse, user]);
    });

    it.each([
      ['a script omcustom does not ship', 'bash .claude/hooks/my-custom.sh'],
      ['a different interpreter', 'sh .claude/hooks/scripts/secret-filter.sh'],
      ['extra arguments', 'bash .claude/hooks/scripts/secret-filter.sh --verbose'],
      ['a pipeline', 'bash .claude/hooks/scripts/secret-filter.sh | tee /tmp/log'],
      ['a nested directory', 'bash .claude/hooks/scripts/sub/secret-filter.sh'],
      ['an absolute path', 'bash /opt/.claude/hooks/scripts/secret-filter.sh'],
    ])('keeps a user command with %s', (_label, command) => {
      const user = userGroup(command);
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([...makeGenerated().PostToolUse, user]);
    });

    it('does not treat a non-command hook type as a command', () => {
      const user = {
        matcher: '*',
        hooks: [{ type: 'prompt', command: 'bash .claude/hooks/scripts/secret-filter.sh' }],
      };
      const merged = mergeHookBlocks({ PostToolUse: [user] }, makeGenerated());
      expect(merged.PostToolUse).toEqual([...makeGenerated().PostToolUse, user]);
    });
  });
});
