// Quick design-review screenshots. Usage: node scripts/screenshot.mjs <tag> [mode]
import { chromium } from 'playwright';

const tag = process.argv[2] || 'shot';
const mode = process.argv[3] || 'full';
const base = 'http://localhost:5173/';

const browser = await chromium.launch();

if (mode === 'full') {
  for (const s of [
    { name: `${tag}-desktop`, width: 1440, height: 900 },
    { name: `${tag}-mobile`, width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `/tmp/shot-${s.name}.png`, fullPage: true });
    console.log('wrote', `/tmp/shot-${s.name}.png`);
    await page.close();
  }
} else if (mode === 'zoom') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // top: header + filters (viewport only)
  await page.screenshot({ path: `/tmp/shot-${tag}-top.png` });
  console.log('wrote top');
  // a single card
  const card = page.locator('[data-model-card]').first();
  if (await card.count()) {
    await card.screenshot({ path: `/tmp/shot-${tag}-card.png` });
    console.log('wrote card');
  }
  await page.close();
}
await browser.close();
