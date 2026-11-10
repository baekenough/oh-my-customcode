/**
 * Unit tests for the interactive init wizard. The prompt library (`@clack/prompts`, which reads
 * the real TTY) is replaced by a scripted fake; every other part of the wizard runs for real.
 * The real module is re-registered in afterAll so the fake does not leak into other test files
 * (#1772).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { initI18n } from '../../../src/i18n/index.js';

const realClack = { ...(await import('@clack/prompts')) };

const CANCEL = Symbol('test-cancel');

interface SelectCall {
  message: string;
  options: Array<{ value: string; label: string }>;
}

interface ConfirmCall {
  message: string;
  initialValue: boolean;
}

/** Scripted answers consumed in order by the fake prompts. */
let selectAnswers: unknown[] = [];
let confirmAnswers: unknown[] = [];
const selectCalls: SelectCall[] = [];
const confirmCalls: ConfirmCall[] = [];
const introCalls: string[] = [];
const outroCalls: string[] = [];

const fakeClack = {
  ...realClack,
  intro: mock((title?: string) => {
    introCalls.push(String(title));
  }),
  outro: mock((message?: string) => {
    outroCalls.push(String(message));
  }),
  select: mock(async (opts: SelectCall) => {
    selectCalls.push(opts);
    return selectAnswers.shift();
  }),
  confirm: mock(async (opts: ConfirmCall) => {
    confirmCalls.push(opts);
    return confirmAnswers.shift();
  }),
  isCancel: (value: unknown) => value === CANCEL,
};

let wizard: typeof import('../../../src/cli/wizard.js');

beforeAll(async () => {
  mock.module('@clack/prompts', () => fakeClack);
  wizard = await import('../../../src/cli/wizard.js');
  await initI18n('en');
});

afterAll(() => {
  mock.module('@clack/prompts', () => realClack);
});

describe('wizard', () => {
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  let originalCI: string | undefined;
  let originalGithubActions: string | undefined;

  function setTTY(value: boolean | undefined): void {
    Object.defineProperty(process.stdout, 'isTTY', {
      value,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    originalCI = process.env.CI;
    originalGithubActions = process.env.GITHUB_ACTIONS;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    setTTY(true);
    selectAnswers = [];
    confirmAnswers = [];
    selectCalls.length = 0;
    confirmCalls.length = 0;
    introCalls.length = 0;
    outroCalls.length = 0;
  });

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }
    if (originalGithubActions === undefined) {
      delete process.env.GITHUB_ACTIONS;
    } else {
      process.env.GITHUB_ACTIONS = originalGithubActions;
    }
    if (originalIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
  });

  describe('isInteractiveMode', () => {
    it('is interactive on a TTY outside CI', () => {
      expect(wizard.isInteractiveMode()).toBe(true);
      expect(wizard.isInteractiveMode(false)).toBe(true);
    });

    it('is not interactive with --yes', () => {
      expect(wizard.isInteractiveMode(true)).toBe(false);
    });

    it('is not interactive when stdout is not a TTY', () => {
      setTTY(false);
      expect(wizard.isInteractiveMode()).toBe(false);

      setTTY(undefined);
      expect(wizard.isInteractiveMode()).toBe(false);
    });

    it('is not interactive when CI is set', () => {
      process.env.CI = 'true';
      expect(wizard.isInteractiveMode()).toBe(false);
    });

    it('is not interactive under GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(wizard.isInteractiveMode()).toBe(false);
    });
  });

  describe('getDefaultWizardResult', () => {
    it('defaults to English, no domain, team mode off, not cancelled', () => {
      expect(wizard.getDefaultWizardResult({})).toEqual({
        lang: 'en',
        domain: undefined,
        teamMode: false,
        cancelled: false,
      });
    });

    it('carries the lang and domain options through', () => {
      expect(wizard.getDefaultWizardResult({ lang: 'ko', domain: 'backend' })).toEqual({
        lang: 'ko',
        domain: 'backend',
        teamMode: false,
        cancelled: false,
      });
    });

    it('ignores --yes itself', () => {
      expect(wizard.getDefaultWizardResult({ yes: true }).lang).toBe('en');
    });
  });

  describe('runInitWizard (non-interactive)', () => {
    it('returns the defaults without prompting when --yes is given', async () => {
      const result = await wizard.runInitWizard({ yes: true, lang: 'ko', domain: 'frontend' });

      expect(result).toEqual({
        lang: 'ko',
        domain: 'frontend',
        teamMode: false,
        cancelled: false,
      });
      expect(introCalls).toEqual([]);
      expect(selectCalls).toEqual([]);
      expect(confirmCalls).toEqual([]);
    });

    it('returns the defaults without prompting when stdout is not a TTY', async () => {
      setTTY(false);

      const result = await wizard.runInitWizard({});

      expect(result).toEqual({ lang: 'en', domain: undefined, teamMode: false, cancelled: false });
      expect(selectCalls).toEqual([]);
    });

    it('returns the defaults without prompting in CI', async () => {
      process.env.CI = '1';

      const result = await wizard.runInitWizard({ lang: 'ko' });

      expect(result.lang).toBe('ko');
      expect(selectCalls).toEqual([]);
    });
  });

  describe('runInitWizard (interactive)', () => {
    it('asks language, domain and team mode and returns the answers', async () => {
      selectAnswers = ['ko', 'backend'];
      confirmAnswers = [true];

      const result = await wizard.runInitWizard({});

      expect(result).toEqual({
        lang: 'ko',
        domain: 'backend',
        teamMode: true,
        cancelled: false,
      });
      expect(introCalls).toEqual(['Welcome to oh-my-customcode setup!']);
      expect(outroCalls).toEqual(['Ready to install with these settings:']);
    });

    it('offers Korean and English for the language prompt', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [false];

      await wizard.runInitWizard({});

      expect(selectCalls[0]?.message).toBe('Select your preferred language');
      expect(selectCalls[0]?.options).toEqual([
        { value: 'ko', label: '한국어' },
        { value: 'en', label: 'English' },
      ]);
    });

    it('offers every domain with its translated label', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [false];

      await wizard.runInitWizard({});

      expect(selectCalls[1]?.message).toBe("Select your team's primary domain");
      expect(selectCalls[1]?.options).toEqual([
        { value: 'all', label: 'All domains (full install)' },
        { value: 'backend', label: 'Backend (Go, Python, Java, Spring, FastAPI, etc.)' },
        { value: 'frontend', label: 'Frontend (TypeScript, Vue, Svelte, Flutter, Vercel)' },
        {
          value: 'data-engineering',
          label: 'Data Engineering (Airflow, dbt, Spark, Kafka, etc.)',
        },
        { value: 'devops', label: 'DevOps / Infrastructure (Docker, AWS, CI/CD)' },
      ]);
    });

    it('defaults the team mode confirmation to No', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({});

      expect(confirmCalls).toEqual([{ message: 'Enable team mode?', initialValue: false }]);
      expect(result.teamMode).toBe(false);
    });

    it('maps the "all" domain answer to undefined', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({});

      expect(result.domain).toBeUndefined();
      expect(result.cancelled).toBe(false);
    });

    it('keeps a concrete domain answer', async () => {
      selectAnswers = ['en', 'data-engineering'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({});

      expect(result.domain).toBe('data-engineering');
    });

    it('skips the language prompt when --lang is en or ko', async () => {
      selectAnswers = ['devops'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({ lang: 'ko' });

      expect(selectCalls).toHaveLength(1);
      expect(selectCalls[0]?.message).toBe("Select your team's primary domain");
      expect(result.lang).toBe('ko');
      expect(result.domain).toBe('devops');
    });

    it('prompts for the language when --lang is unsupported', async () => {
      selectAnswers = ['ko', 'all'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({ lang: 'fr' });

      expect(selectCalls).toHaveLength(2);
      expect(selectCalls[0]?.message).toBe('Select your preferred language');
      expect(result.lang).toBe('ko');
    });

    it('skips the domain prompt when --domain is given', async () => {
      selectAnswers = ['en'];
      confirmAnswers = [true];

      const result = await wizard.runInitWizard({ domain: 'frontend' });

      expect(selectCalls).toHaveLength(1);
      expect(selectCalls[0]?.message).toBe('Select your preferred language');
      expect(result.domain).toBe('frontend');
      expect(result.teamMode).toBe(true);
    });

    it('treats --domain all as no domain filter without prompting', async () => {
      selectAnswers = ['en'];
      confirmAnswers = [false];

      const result = await wizard.runInitWizard({ domain: 'all' });

      expect(selectCalls).toHaveLength(1);
      expect(result.domain).toBeUndefined();
    });

    it('only asks about team mode when lang and domain are both given', async () => {
      confirmAnswers = [true];

      const result = await wizard.runInitWizard({ lang: 'en', domain: 'backend' });

      expect(selectCalls).toEqual([]);
      expect(confirmCalls).toHaveLength(1);
      expect(result).toEqual({ lang: 'en', domain: 'backend', teamMode: true, cancelled: false });
    });
  });

  describe('runInitWizard (cancellation)', () => {
    it('returns a cancelled result with defaults when the language prompt is cancelled', async () => {
      selectAnswers = [CANCEL];

      const result = await wizard.runInitWizard({});

      expect(result).toEqual({ lang: 'en', domain: undefined, teamMode: false, cancelled: true });
      expect(outroCalls).toEqual(['Setup cancelled.']);
      expect(selectCalls).toHaveLength(1);
      expect(confirmCalls).toEqual([]);
    });

    it('keeps the chosen language when the domain prompt is cancelled', async () => {
      selectAnswers = ['ko', CANCEL];

      const result = await wizard.runInitWizard({});

      expect(result).toEqual({ lang: 'ko', domain: undefined, teamMode: false, cancelled: true });
      expect(outroCalls).toEqual(['Setup cancelled.']);
      expect(confirmCalls).toEqual([]);
    });

    it('keeps the chosen language and domain when the team mode prompt is cancelled', async () => {
      selectAnswers = ['ko', 'backend'];
      confirmAnswers = [CANCEL];

      const result = await wizard.runInitWizard({});

      expect(result).toEqual({ lang: 'ko', domain: 'backend', teamMode: false, cancelled: true });
      expect(outroCalls).toEqual(['Setup cancelled.']);
    });

    it('does not print the confirmation outro when cancelled', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [CANCEL];

      await wizard.runInitWizard({});

      expect(outroCalls).not.toContain('Ready to install with these settings:');
    });
  });
});
