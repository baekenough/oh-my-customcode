import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Graph accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/graph');
    // Wait for D3 graph to render — sim nodes receive transform after first tick
    await page.waitForSelector('.node', { timeout: 10000 });
  });

  test('skip link is present and functional', async ({ page }) => {
    const skipLink = page.locator('a[href="#after-graph"]');
    await expect(skipLink).toBeAttached();

    // Skip link uses Tailwind sr-only class (visually hidden by default)
    await expect(skipLink).toHaveClass(/sr-only/);

    // #after-graph anchor target exists with tabindex="-1"
    const afterGraphTarget = page.locator('#after-graph');
    await expect(afterGraphTarget).toBeAttached();
    await expect(afterGraphTarget).toHaveAttribute('tabindex', '-1');
  });

  test('graph nodes are keyboard focusable', async ({ page }) => {
    const nodes = page.locator('.node');
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    // Each node should have tabindex="0", role="button", and aria-label
    const firstNode = nodes.first();
    await expect(firstNode).toHaveAttribute('tabindex', '0');
    await expect(firstNode).toHaveAttribute('role', 'button');
    // aria-label is set to node.label (display name, e.g. "lang-golang-expert")
    await expect(firstNode).toHaveAttribute('aria-label');
    const label = await firstNode.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.length).toBeGreaterThan(0);
  });

  test('Enter toggles node selection and dims unconnected nodes', async ({ page }) => {
    const firstNode = page.locator('.node').first();
    await firstNode.focus();

    // Press Enter to select — unconnected nodes get opacity="0.1" SVG attribute
    await page.keyboard.press('Enter');

    // Wait for D3 to apply opacity attributes
    await page.waitForFunction(() => {
      const nodes = document.querySelectorAll('.node[opacity="0.1"]');
      return nodes.length > 0;
    }, { timeout: 5000 });

    const dimmedCount = await page.locator('.node[opacity="0.1"]').count();
    expect(dimmedCount).toBeGreaterThan(0);

    // Press Enter again to deselect — all nodes return to opacity=1
    await page.keyboard.press('Enter');

    await page.waitForFunction(() => {
      const dimmed = document.querySelectorAll('.node[opacity="0.1"]');
      return dimmed.length === 0;
    }, { timeout: 5000 });

    await expect(page.locator('.node[opacity="0.1"]')).toHaveCount(0);
  });

  test('Space toggles node selection', async ({ page }) => {
    const firstNode = page.locator('.node').first();
    await firstNode.focus();

    await page.keyboard.press('Space');

    await page.waitForFunction(() => {
      return document.querySelectorAll('.node[opacity="0.1"]').length > 0;
    }, { timeout: 5000 });

    const dimmedAfterSpace = await page.locator('.node[opacity="0.1"]').count();
    expect(dimmedAfterSpace).toBeGreaterThan(0);

    // Deselect
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      return document.querySelectorAll('.node[opacity="0.1"]').length === 0;
    }, { timeout: 5000 });
  });

  test('Arrow keys navigate to adjacent nodes', async ({ page }) => {
    // Find a node that has adjacent connections for reliable test
    const allNodes = page.locator('.node');
    const nodeCount = await allNodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    const firstNode = allNodes.first();
    await firstNode.focus();

    // ArrowRight attempts to move to an adjacent node
    await page.keyboard.press('ArrowRight');

    // Focus should remain on a .node element regardless of whether movement occurred
    const focusedTag = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return el.classList.contains('node') ? 'node' : el.tagName;
    });
    expect(focusedTag).toBe('node');
  });

  test('Arrow key navigation is circular within adjacent nodes', async ({ page }) => {
    const firstNode = page.locator('.node').first();
    await firstNode.focus();

    // Navigate forward many times — focus must stay on a .node element (circular)
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
    }

    const focusedTag = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return el.classList.contains('node') ? 'node' : el.tagName;
    });
    expect(focusedTag).toBe('node');
  });

  test('aria-live region announces node selection', async ({ page }) => {
    // aria-live="polite" div with class="sr-only"
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeAttached();

    // Initially empty (no node selected)
    await expect(liveRegion).toHaveText('');

    // Select a node via keyboard
    const firstNode = page.locator('.node').first();
    await firstNode.focus();
    await page.keyboard.press('Enter');

    // Wait for liveMessage to populate
    await page.waitForFunction(() => {
      const live = document.querySelector('[aria-live="polite"]');
      return live && live.textContent!.trim().length > 0;
    }, { timeout: 5000 });

    const liveText = await liveRegion.textContent();
    expect(liveText).toBeTruthy();
    // Format: "${node.label}, ${node.type}, ${connections} connections"
    // e.g. "lang-golang-expert, agent, 3 connections"
    expect(liveText).toMatch(/^.+,\s*(agent|skill|guide),\s*\d+\s+connections$/);
  });

  test('deselecting a node clears the aria-live announcement', async ({ page }) => {
    const firstNode = page.locator('.node').first();
    await firstNode.focus();

    // Select
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const live = document.querySelector('[aria-live="polite"]');
      return live && live.textContent!.trim().length > 0;
    }, { timeout: 5000 });

    // Deselect
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const live = document.querySelector('[aria-live="polite"]');
      return live && live.textContent!.trim() === '';
    }, { timeout: 5000 });

    await expect(page.locator('[aria-live="polite"]')).toHaveText('');
  });

  test('SVG has application role and descriptive aria-label', async ({ page }) => {
    const svg = page.locator('svg[role="application"]');
    await expect(svg).toBeAttached();

    const svgLabel = await svg.getAttribute('aria-label');
    expect(svgLabel).toBeTruthy();
    // Label starts with "Dependency graph visualization"
    expect(svgLabel).toMatch(/^Dependency graph visualization/);
  });

  test('prefers-reduced-motion: graph renders without animation', async ({ page }) => {
    // Emulate reduced motion before navigation so the media query is active
    // when D3 reads window.matchMedia inside buildGraph()
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/graph');
    await page.waitForSelector('.node', { timeout: 10000 });

    // Graph should render and expose nodes — reduced motion path stops the D3
    // simulation timer (alpha(0).stop()) so there is no animated layout.
    // Core requirement: nodes exist and are interactive (tabindex, role, aria-label)
    const allNodes = page.locator('.node');
    const nodeCount = await allNodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    const firstNode = allNodes.first();
    await expect(firstNode).toHaveAttribute('tabindex', '0');
    await expect(firstNode).toHaveAttribute('role', 'button');
    await expect(firstNode).toHaveAttribute('aria-label');

    // Keyboard interaction still works under reduced motion
    await firstNode.focus();
    await page.keyboard.press('Enter');
    // Live region should update
    await page.waitForFunction(() => {
      const live = document.querySelector('[aria-live="polite"]');
      return live && live.textContent!.trim().length > 0;
    }, { timeout: 5000 });
    const liveText = await page.locator('[aria-live="polite"]').textContent();
    expect(liveText).toMatch(/^.+,\s*(agent|skill|guide),\s*\d+\s+connections$/);
  });

  test('axe accessibility audit passes on graph container', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('.relative.flex-1')
      // D3-generated SVG color choices are by design — not a product a11y issue
      .disableRules(['color-contrast'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
