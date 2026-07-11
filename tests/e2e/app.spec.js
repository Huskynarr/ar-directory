import { expect, test } from '@playwright/test';

const expectedPageSize = (testInfo) => (testInfo.project.name.includes('mobile') ? 4 : 12);

test.beforeEach(async ({ page }, testInfo) => {
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ date: '2026-07-11', base: 'USD', quote: 'EUR', rate: 0.87396 }),
    }),
  );
  // External product images are not part of app correctness and would make CI flaky.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5173).+\.(?:png|jpe?g|webp|svg)(?:\?.*)?$/i, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('[data-model-card]')).toHaveCount(expectedPageSize(testInfo));
});

test('loads the catalog without runtime errors and exposes its core content', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await expect(page).toHaveTitle(/348 Modelle/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/AR-Brillen.*XR-Glasses/i);
  await expect(page.getByText(/Datenbestand:\s*348/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Brille finden/ }).first()).toBeVisible();
  await expect(page.locator('[data-model-card]').first()).toHaveAttribute('data-card-density', 'compact');
  expect(runtimeErrors).toEqual([]);
});

test('mobile prioritizes search and reveals secondary filters on demand', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only information hierarchy');
  await expect(page.getByLabel('Kategorie')).toBeHidden();
  await page.getByRole('button', { name: /Alle Filter/ }).click();
  await expect(page.getByLabel('Kategorie')).toBeVisible();
  await expect(page.locator('#manufacturer-filter')).toBeVisible();
  await expect(page.locator('#sort-filter')).toBeVisible();
});

test('search, reset and manufacturer-link filter change the actual result set', async ({ page }, testInfo) => {
  const search = page.getByRole('searchbox');
  await search.fill('Meta Glasses');
  await expect(page.locator('[data-model-card]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Meta Glasses', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Filter zurücksetzen/ }).click();
  await expect(page.locator('[data-model-card]')).toHaveCount(expectedPageSize(testInfo));
  await page.getByRole('button', { name: /Alle Filter|Mehr Filter/ }).click();
  await page.getByLabel(/Nur mit Herstellerlink/).check();
  await expect(page.getByText(/Sichtbar:\s*333/)).toBeVisible();
});

test('table, detail modal and comparison flow are interactive', async ({ page }) => {
  await page.getByRole('button', { name: /Liste|Tabelle/, exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(348);

  await page.getByRole('button', { name: 'Karten', exact: true }).click();
  const firstCard = page.locator('[data-model-card]').first();
  await page.getByRole('button', { name: /Ausführliche Karten anzeigen/ }).click();
  await expect(firstCard).toHaveAttribute('data-card-density', 'detailed');
  await page.getByRole('button', { name: /Kompakte Karten anzeigen/ }).click();
  await expect(firstCard).toHaveAttribute('data-card-density', 'compact');
  await firstCard.locator('[data-detail-open]').first().click();
  await expect(page.locator('.detail-modal-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-modal-overlay')).toHaveCount(0);

  await firstCard.locator('[data-compare-toggle]').check();
  await expect(page.locator('[data-compare-toggle]:checked')).toHaveCount(1);
  await page.getByRole('button', { name: /Compare-Modus/ }).click();
  await expect(page.getByText(/Direktvergleich/).first()).toBeVisible();
});

test('theme and language persist across reloads', async ({ page }) => {
  await page.getByRole('button', { name: /Darstellung:/ }).click();
  const selectedTheme = await page.evaluate(() => localStorage.getItem('ar_directory_theme'));
  expect(['auto', 'dark', 'light']).toContain(selectedTheme);

  await page.getByRole('button', { name: /Sprache wechseln/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Comparison');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => localStorage.getItem('ar_directory_theme'))).toBe(selectedTheme);
});

test('automatic theme follows the operating-system preference', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ar_directory_theme', 'auto'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await expect(page.locator('body')).toHaveAttribute('data-theme-preference', 'auto');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveClass(/theme-light/);
});

test('finder completes all questions and returns recommendations', async ({ page }) => {
  await page.getByRole('link', { name: /Brille finden/ }).first().click();
  await expect(page).toHaveURL(/\/finder\/$/);

  const restart = page.locator('[data-finder-restart]');
  if (await restart.count()) await restart.click();

  for (let step = 0; step < 6; step += 1) {
    await page.locator('[data-finder-option]').first().click();
  }

  await expect(page.locator('[data-finder-apply]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Deine besten Treffer/ })).toBeVisible();
  await expect(page.locator('article').first()).toBeVisible();
});

test('generated legal, asset and device pages are reachable', async ({ request }) => {
  for (const path of ['/impressum.html', '/datenschutz.html', '/asset-notices.html', '/meta/glasses/']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toContain('<!doctype html>');
  }
});

test('viewport has no horizontal overflow and controls have accessible names', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const unnamedControls = await page.locator('button, input, select, a[href]').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const label = element.closest('label')?.textContent || '';
        return !(
          element.getAttribute('aria-label') ||
          element.getAttribute('aria-labelledby') ||
          element.getAttribute('title') ||
          label.trim() ||
          element.textContent?.trim() ||
          element.getAttribute('placeholder')
        );
      })
      .map((element) => element.outerHTML),
  );
  expect(unnamedControls).toEqual([]);
  expect(await page.locator('#theme-toggle').evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
});
