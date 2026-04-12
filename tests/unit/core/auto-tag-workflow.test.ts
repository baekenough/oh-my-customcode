/**
 * Tests for the auto-tag GitHub Actions workflow (.github/workflows/auto-tag.yml).
 *
 * These tests validate workflow structure, logic correctness, and security properties
 * by parsing the YAML directly — no actual GitHub Actions runner required.
 *
 * The workflow automates version tag creation when a release/* PR is merged to develop.
 */

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const AUTO_TAG_WORKFLOW = resolve(import.meta.dir, '../../../.github/workflows/auto-tag.yml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readWorkflow(): Promise<string> {
  return readFile(AUTO_TAG_WORKFLOW, 'utf-8');
}

// ---------------------------------------------------------------------------
// Workflow file existence and basic structure
// ---------------------------------------------------------------------------

describe('auto-tag.yml — file existence', () => {
  it('should exist at .github/workflows/auto-tag.yml', async () => {
    const content = await readWorkflow();
    expect(content.length).toBeGreaterThan(0);
  });

  it('should be valid UTF-8 text (no binary content)', async () => {
    const content = await readWorkflow();
    expect(() => content.toString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Trigger conditions
// ---------------------------------------------------------------------------

describe('auto-tag.yml — trigger conditions', () => {
  it('should trigger on pull_request events with type [closed]', async () => {
    const content = await readWorkflow();
    expect(content).toContain('pull_request:');
    expect(content).toContain('types: [closed]');
  });

  it('should only target the develop branch', async () => {
    const content = await readWorkflow();
    expect(content).toContain('branches: [develop]');
  });

  it('should NOT trigger on push events (prevents duplicate runs with release.yml)', async () => {
    const content = await readWorkflow();
    // Ensure there is no top-level "push:" trigger
    const lines = content.split('\n');
    const onSection = lines.findIndex((l) => l.startsWith('on:'));
    const jobsSection = lines.findIndex((l) => l.startsWith('jobs:'));
    const triggerBlock = lines.slice(onSection, jobsSection).join('\n');
    expect(triggerBlock).not.toMatch(/^ {2}push:/m);
  });

  it('should NOT trigger on workflow_dispatch (automation only)', async () => {
    const content = await readWorkflow();
    const lines = content.split('\n');
    const onSection = lines.findIndex((l) => l.startsWith('on:'));
    const jobsSection = lines.findIndex((l) => l.startsWith('jobs:'));
    const triggerBlock = lines.slice(onSection, jobsSection).join('\n');
    expect(triggerBlock).not.toContain('workflow_dispatch');
  });
});

// ---------------------------------------------------------------------------
// Job condition guards
// ---------------------------------------------------------------------------

describe('auto-tag.yml — job condition guards', () => {
  it('should require github.event.pull_request.merged == true', async () => {
    const content = await readWorkflow();
    expect(content).toContain('github.event.pull_request.merged == true');
  });

  it('should only run for release/* branches using startsWith check', async () => {
    const content = await readWorkflow();
    expect(content).toContain("startsWith(github.event.pull_request.head.ref, 'release/')");
  });

  it('should NOT trigger for feature/* branches (condition is strict release/ prefix)', async () => {
    const content = await readWorkflow();
    // Must NOT have a condition that matches feature/ branches
    expect(content).not.toContain("startsWith(github.event.pull_request.head.ref, 'feature/')");
  });

  it('should NOT trigger for hotfix/* branches (manual tag push required for hotfixes)', async () => {
    const content = await readWorkflow();
    expect(content).not.toContain("startsWith(github.event.pull_request.head.ref, 'hotfix/')");
  });
});

// ---------------------------------------------------------------------------
// Security: permissions and token usage
// ---------------------------------------------------------------------------

describe('auto-tag.yml — security', () => {
  it('should declare contents: write permission', async () => {
    const content = await readWorkflow();
    expect(content).toContain('contents: write');
  });

  it('should NOT have any other elevated permissions (read-write scope minimization)', async () => {
    const content = await readWorkflow();
    // contents: write is expected; everything else should be absent
    expect(content).not.toContain('actions: write');
    expect(content).not.toContain('packages: write');
    expect(content).not.toContain('deployments: write');
  });

  it('should use RELEASE_PAT (not GITHUB_TOKEN) for tag push to trigger downstream CI', async () => {
    const content = await readWorkflow();
    // GITHUB_TOKEN-created events do not trigger downstream workflows (GitHub policy).
    // The PAT is required to trigger release.yml after the tag is pushed.
    expect(content).toContain('secrets.RELEASE_PAT');
  });

  it('should NOT use plain GITHUB_TOKEN for the tag push step', async () => {
    const content = await readWorkflow();
    // Find the "Create and push tag" step context
    const createPushIndex = content.indexOf('Create and push tag');
    expect(createPushIndex).toBeGreaterThan(-1);
    const afterCreatePush = content.slice(createPushIndex);
    // Find where the next step starts (next "- " at the same indent level)
    const nextStepIndex = afterCreatePush.indexOf('\n      - ');
    const pushStepBlock =
      nextStepIndex > -1 ? afterCreatePush.slice(0, nextStepIndex) : afterCreatePush;
    // The push step must NOT set GITHUB_TOKEN env var.
    // RELEASE_PAT is now wired via the checkout step's token: parameter, so the remote
    // URL already carries the PAT. Setting GITHUB_TOKEN here is no longer needed and
    // would be misleading (it doesn't override the remote URL anyway).
    expect(pushStepBlock).not.toContain('GITHUB_TOKEN');
  });

  /**
   * CRITICAL ISSUE DOCUMENTED: The checkout step does NOT pass token: ${{ secrets.RELEASE_PAT }}
   *
   * When actions/checkout runs without an explicit `token:` parameter, it configures the git
   * remote with the default GITHUB_TOKEN embedded in the remote URL:
   *   https://x-access-token:<GITHUB_TOKEN>@github.com/...
   *
   * Setting GITHUB_TOKEN as an environment variable in the "Create and push tag" step does NOT
   * override the remote URL that was already configured by actions/checkout. The `git push origin`
   * command will use the token from the remote URL (the default GITHUB_TOKEN), NOT the env var.
   *
   * Fix: Pass `token: ${{ secrets.RELEASE_PAT }}` to actions/checkout so the remote URL is
   * configured with the PAT from the start:
   *
   *   - uses: actions/checkout@...
   *     with:
   *       fetch-depth: 0
   *       token: ${{ secrets.RELEASE_PAT }}   # <-- add this
   *
   * Then remove the GITHUB_TOKEN env var override from the "Create and push tag" step.
   *
   * This test documents the DESIRED behavior (checkout should use PAT).
   * It currently FAILS, indicating the bug is present.
   */
  it('CRITICAL: checkout step should use RELEASE_PAT so git push inherits PAT from remote URL', async () => {
    const content = await readWorkflow();
    // The checkout step must reference RELEASE_PAT via the token: parameter
    const checkoutIndex = content.indexOf('actions/checkout@');
    expect(checkoutIndex).toBeGreaterThan(-1);
    const afterCheckout = content.slice(checkoutIndex);
    // Find where the next step starts (next "- " at the same indent level)
    const nextStepIndex = afterCheckout.indexOf('\n      - ');
    const checkoutBlock =
      nextStepIndex > -1 ? afterCheckout.slice(0, nextStepIndex) : afterCheckout;
    expect(checkoutBlock).toContain('RELEASE_PAT');
  });
});

// ---------------------------------------------------------------------------
// Version extraction logic
// ---------------------------------------------------------------------------

describe('auto-tag.yml — version extraction', () => {
  it('should extract version from package.json using node -p', async () => {
    const content = await readWorkflow();
    expect(content).toContain("require('./package.json').version");
  });

  it('should prefix version with "v" to form the tag', async () => {
    const content = await readWorkflow();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional string concat to avoid template literal evaluation
    expect(content).toContain('TAG="v' + '${VERSION}"');
  });

  it('should output the tag via GITHUB_OUTPUT', async () => {
    const content = await readWorkflow();
    expect(content).toContain('echo "tag=$TAG" >> $GITHUB_OUTPUT');
  });

  it('should log the extracted version for audit purposes', async () => {
    const content = await readWorkflow();
    expect(content).toContain('Extracted version:');
  });

  it('should use step id "version" for downstream reference', async () => {
    const content = await readWorkflow();
    expect(content).toContain('id: version');
  });
});

// ---------------------------------------------------------------------------
// Idempotency: existing tag check
// ---------------------------------------------------------------------------

describe('auto-tag.yml — idempotency (existing tag guard)', () => {
  it('should check for existing tags before creating', async () => {
    const content = await readWorkflow();
    expect(content).toContain('git rev-parse');
  });

  it('should set exists=true when tag already exists', async () => {
    const content = await readWorkflow();
    expect(content).toContain('exists=true');
  });

  it('should set exists=false when tag does not exist', async () => {
    const content = await readWorkflow();
    expect(content).toContain('exists=false');
  });

  it('should skip tag creation when exists=true', async () => {
    const content = await readWorkflow();
    expect(content).toContain("if: steps.check.outputs.exists == 'false'");
  });

  it('should use step id "check" for exists output', async () => {
    const content = await readWorkflow();
    expect(content).toContain('id: check');
  });

  it('should use git rev-parse with stderr suppression to avoid noise', async () => {
    const content = await readWorkflow();
    expect(content).toContain('>/dev/null 2>&1');
  });
});

// ---------------------------------------------------------------------------
// Tag creation correctness
// ---------------------------------------------------------------------------

describe('auto-tag.yml — tag creation', () => {
  it('should create an annotated tag (not lightweight)', async () => {
    const content = await readWorkflow();
    // -a flag creates annotated tags, which is the standard for releases
    expect(content).toContain('git tag -a');
  });

  it('should include a release message in the annotated tag', async () => {
    const content = await readWorkflow();
    expect(content).toContain('-m "Release $TAG"');
  });

  it('should configure git user name as github-actions[bot]', async () => {
    const content = await readWorkflow();
    expect(content).toContain('github-actions[bot]');
    expect(content).toContain('git config user.name');
  });

  it('should configure git user email as noreply address', async () => {
    const content = await readWorkflow();
    expect(content).toContain('github-actions[bot]@users.noreply.github.com');
    expect(content).toContain('git config user.email');
  });

  it('should push tag to origin', async () => {
    const content = await readWorkflow();
    expect(content).toContain('git push origin "$TAG"');
  });
});

// ---------------------------------------------------------------------------
// Checkout configuration
// ---------------------------------------------------------------------------

describe('auto-tag.yml — checkout configuration', () => {
  it('should use fetch-depth: 0 to fetch full history (required for tag resolution)', async () => {
    const content = await readWorkflow();
    expect(content).toContain('fetch-depth: 0');
  });

  it('should use a pinned SHA for actions/checkout (supply chain security)', async () => {
    const content = await readWorkflow();
    // Pinned SHA comment like "# v6" must follow the SHA
    expect(content).toMatch(/actions\/checkout@[a-f0-9]{40}/);
  });

  it('should use a pinned SHA for actions/setup-node (supply chain security)', async () => {
    const content = await readWorkflow();
    expect(content).toMatch(/actions\/setup-node@[a-f0-9]{40}/);
  });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

describe('auto-tag.yml — runner configuration', () => {
  it('should run on ubuntu-latest (not macos for cost efficiency)', async () => {
    const content = await readWorkflow();
    expect(content).toContain('runs-on: ubuntu-latest');
  });

  it('should NOT run on macos-latest (no macOS-specific requirement for git tag)', async () => {
    const content = await readWorkflow();
    expect(content).not.toContain('runs-on: macos-latest');
  });
});

// ---------------------------------------------------------------------------
// CONTRIBUTING.md documentation consistency
// ---------------------------------------------------------------------------

describe('CONTRIBUTING.md — hotfix documentation consistency', () => {
  const CONTRIBUTING = resolve(import.meta.dir, '../../../CONTRIBUTING.md');

  it('should clearly state that hotfix branches do NOT trigger auto-tag', async () => {
    const content = await readFile(CONTRIBUTING, 'utf-8');
    // The Note block in the hotfix section explains auto-tag doesn't run for hotfix branches.
    // Exact wording: "so `auto-tag` will NOT\n   > trigger automatically"
    expect(content).toContain('`auto-tag` will NOT');
  });

  it('should document the manual tag push process for hotfixes', async () => {
    const content = await readFile(CONTRIBUTING, 'utf-8');
    expect(content).toContain('git tag vx.y.(z+1)');
    expect(content).toContain('git push origin vx.y.(z+1)');
  });

  it('should document the auto-tag workflow in the release process section', async () => {
    const content = await readFile(CONTRIBUTING, 'utf-8');
    // Release section should describe the automated flow (line 184 text)
    expect(content).toContain('the `auto-tag` workflow automatically');
  });

  /**
   * DOCUMENTATION BUG: Line ~231 says "After merge, auto-tag automatically creates the tag"
   * immediately before explaining that auto-tag does NOT trigger for hotfixes.
   * The sentence is misleading in the hotfix context.
   *
   * The fix: Remove or qualify the sentence on line 231 so it doesn't imply auto-tag
   * works for hotfix/* branches. Only release/* branches trigger auto-tag.
   *
   * This test documents the desired state (no misleading affirmative in hotfix section).
   * It currently FAILS, indicating the documentation inconsistency is present.
   */
  it('DOCUMENTATION: hotfix section should not claim auto-tag triggers before clarifying it does not', async () => {
    const content = await readFile(CONTRIBUTING, 'utf-8');
    // Find the hotfix process section
    const hotfixIndex = content.indexOf('#### Hotfix Process');
    expect(hotfixIndex).toBeGreaterThan(-1);
    const hotfixSection = content.slice(hotfixIndex, hotfixIndex + 1000);
    // The misleading "After merge, auto-tag automatically creates the tag" sentence
    // should NOT appear in the hotfix section (it should only appear in the release section)
    expect(hotfixSection).not.toContain(
      'After merge, `auto-tag` automatically creates the tag and triggers npm publish.'
    );
  });
});
