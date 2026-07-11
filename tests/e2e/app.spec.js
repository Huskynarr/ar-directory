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
  await expect(page.locator('.result-count')).toContainText('348 Modelle');
  await expect(page.getByRole('link', { name: /AR-\/XR-Brille finden/ }).first()).toBeVisible();
  await expect(page.locator('[data-model-card]').first()).toHaveAttribute('data-card-density', 'compact');
  expect(runtimeErrors).toEqual([]);
});

test('mobile prioritizes search and reveals secondary filters on demand', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only information hierarchy');
  expect((await page.locator('.filter-toolbar').boundingBox()).height).toBeLessThan(50);
  await expect(page.getByLabel('Kategorie')).toBeHidden();
  await page.locator('#toggle-advanced-filters').click();
  await expect(page.getByLabel('Kategorie')).toBeVisible();
  await expect(page.locator('#manufacturer-filter')).toBeVisible();
  await expect(page.locator('#sort-filter')).toBeVisible();
  await expect(page.locator('.advanced-filter-details > summary')).toBeVisible();
  await expect(page.locator('.advanced-filter-details')).not.toHaveAttribute('open', '');
});

test('search, reset and manufacturer-link filter change the actual result set', async ({ page }, testInfo) => {
  const search = page.getByRole('searchbox');
  await search.fill('Meta Glasses');
  await expect(page.locator('[data-model-card]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Meta Glasses', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Filter zurücksetzen/ }).click();
  await expect(page.locator('[data-model-card]')).toHaveCount(expectedPageSize(testInfo));
  await page.locator('#toggle-advanced-filters').click();
  const advancedFilters = page.locator('.advanced-filter-details');
  if (!(await advancedFilters.evaluate((element) => element.open))) {
    await advancedFilters.locator('summary').click();
  }
  await page.getByLabel(/Mit Herstellerseite/).check();
  await expect(page.locator('.result-count')).toContainText('333 Modelle von 348');
});

test('view and utility controls remain stationary while switching layouts', async ({ page }) => {
  const positions = async () =>
    Object.fromEntries(
      await Promise.all(
        ['.view-switch', '#toggle-focus-mode', '#clear-filters', '#toggle-advanced-filters'].map(async (selector) => {
          const box = await page.locator(selector).boundingBox();
          return [selector, box];
        }),
      ),
    );

  const cardsPositions = await positions();
  await page.locator('#view-table').click();
  await expect(page.locator('tbody tr')).toHaveCount(348);
  const tablePositions = await positions();

  for (const selector of Object.keys(cardsPositions)) {
    expect(Math.abs(tablePositions[selector].x - cardsPositions[selector].x), `${selector} horizontal position`).toBeLessThan(0.5);
    expect(Math.abs(tablePositions[selector].y - cardsPositions[selector].y), `${selector} vertical position`).toBeLessThan(0.5);
  }

  await page.locator('#toggle-focus-mode').click();
  await expect(page.locator('.ui-table')).toHaveAttribute('data-table-density', 'comfortable');
});

test('legacy AR/XR links migrate to a visible category filter', async ({ page }, testInfo) => {
  await page.goto('/?flagAr=1');
  await expect(page.locator('[data-model-card]')).toHaveCount(expectedPageSize(testInfo));
  if (testInfo.project.name.includes('mobile')) {
    await page.locator('#toggle-advanced-filters').click();
  }
  await expect(page.getByLabel('Kategorie')).toHaveValue('AR');
  await expect(page).toHaveURL(/category=AR/);
  expect(page.url()).not.toContain('flagAr');
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
  await page.getByRole('button', { name: /Vergleich öffnen/ }).click();
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

test('initial shell is complete and styled before application hydration', async ({ page }) => {
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations || []).map((registration) => registration.unregister()));
  });
  await page.route('**/src/bootstrap.js', (route) => route.abort());
  await page.goto('/?boot-shell-test=1', { waitUntil: 'domcontentloaded' });

  expect(await page.evaluate(() => window.__AR_DIRECTORY_READY__)).not.toBe(true);
  await expect(page.getByRole('status')).toContainText('Brillendaten werden geladen');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#static-catalog')).toBeHidden();
  const geometry = await page.locator('.brand-mark svg').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(geometry.width).toBeGreaterThan(20);
  expect(geometry.width).toBeLessThan(24);
  expect(geometry.height).toBeGreaterThan(20);
  expect(await page.locator('.hero-title').evaluate((element) => getComputedStyle(element).fontSize)).not.toBe('16px');
});

test('native select arrows keep a usable inset from the right edge', async ({ page }, testInfo) => {
  if (testInfo.project.name.includes('mobile')) await page.locator('#toggle-advanced-filters').click();
  const styles = await page.locator('#category-filter').evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      appearance: computed.appearance,
      backgroundPosition: computed.backgroundPosition,
      paddingRight: Number.parseFloat(computed.paddingRight),
    };
  });
  expect(styles.appearance).toBe('none');
  expect(styles.backgroundPosition).toContain('calc(100% - 14.4px)');
  expect(styles.paddingRight).toBeGreaterThanOrEqual(44);
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

test('finder reuses the catalog width, header, footer and surface language', async ({ page }) => {
  const catalogWidth = await page.locator('#main-content').evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole('link', { name: /Brille finden/ }).first().click();
  await expect(page).toHaveURL(/\/finder\/$/);

  const finderWidth = await page.locator('#finder-main').evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(finderWidth - catalogWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('header.app-hero .brand-lockup')).toBeVisible();
  await expect(page.locator('header.app-hero #toggle-language')).toBeVisible();
  await expect(page.locator('header.app-hero #theme-toggle')).toBeVisible();
  await expect(page.locator('footer.site-footer')).toBeVisible();
  expect(await page.locator('.finder-workspace').evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('gradient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('footer keeps a clear visual pause after pagination', async ({ page }) => {
  const pagination = page.getByRole('navigation', { name: 'Seitennavigation' });
  const footer = page.locator('footer.site-footer');
  const [paginationBox, footerBox] = await Promise.all([pagination.boundingBox(), footer.boundingBox()]);
  expect(paginationBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox.y - (paginationBox.y + paginationBox.height)).toBeGreaterThanOrEqual(32);
});

test('generated information, legal and device pages are reachable', async ({ request }) => {
  for (const path of ['/faq.html', '/data.html', '/glossar.html', '/impressum.html', '/datenschutz.html', '/asset-notices.html', '/meta/glasses/']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toContain('<!doctype html>');
  }
});

test('FAQ uses accessible accordions and dataset statistics have their own page', async ({ page }) => {
  await page.goto('/faq.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Häufige Fragen');
  const firstQuestion = page.locator('details.faq').first();
  await expect(firstQuestion).toHaveAttribute('open', '');
  await firstQuestion.locator('summary').click();
  await expect(firstQuestion).not.toHaveAttribute('open', '');

  await page.goto('/data.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Datenübersicht');
  await expect(page.locator('.metrics')).toContainText('348');
});

test('footer exposes one compact, build-derived version', async ({ page }) => {
  await expect(page.locator('.build-version')).toHaveCount(1);
  await expect(page.locator('.build-version')).toHaveText(/^v\d+\.\d+\.\d+ · (?:[0-9a-f]{7}|local)$/);
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
