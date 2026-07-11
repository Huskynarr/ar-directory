import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

const waitForApp = async (page) => {
  await page.waitForFunction(() => window.__AR_DIRECTORY_READY__ === true);
  await page.locator('[data-model-card]').first().waitFor();
};

const expectNoWcagViolations = async (page, label) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })),
    label,
  ).toEqual([]);
};

test.beforeEach(async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ date: '2026-07-11', base: 'USD', quote: 'EUR', rate: 0.87396 }),
    }),
  );
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5173).+\.(?:png|jpe?g|webp|svg)(?:\?.*)?$/i, (route) => route.abort());
});

test('catalog, filters and modal pass WCAG 2.2 AA in dark and light themes', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    await page.addInitScript((value) => localStorage.setItem('ar_directory_theme', value), theme);
    await page.goto('/');
    await waitForApp(page);
    await page.locator('#toggle-advanced-filters').click();
    const details = page.locator('.advanced-filter-details');
    if ((await details.count()) && !(await details.evaluate((element) => element.open))) {
      await details.locator('summary').click();
    }
    await expectNoWcagViolations(page, `${theme} catalog and filters`);

    await page.locator('[data-detail-open]').first().click();
    await page.locator('.detail-modal-overlay').waitFor();
    await page.waitForTimeout(250);
    await expectNoWcagViolations(page, `${theme} detail modal`);
    await page.keyboard.press('Escape');
  }
});

test('finder, FAQ and dataset overview pass WCAG 2.2 AA', async ({ page }) => {
  for (const theme of ['dark', 'light']) {
    await page.goto('/finder/');
    await page.evaluate((value) => localStorage.setItem('ar_directory_theme', value), theme);
    await page.reload();
    await page.locator('#finder-main').waitFor();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
    await expectNoWcagViolations(page, `${theme} finder`);
  }

  for (const path of ['/faq.html', '/data.html']) {
    await page.goto(path);
    await expectNoWcagViolations(page, path);
  }
});
