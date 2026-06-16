import { chromium } from 'playwright';
import fs from 'node:fs';

// Candidate event slugs (USA + EU across years). Non-existent / empty ones are skipped.
const SLUGS = process.argv.slice(2);
const browser = await chromium.launch();
const result = {};
for (const slug of SLUGS) {
  const url = `https://www.awexr.com/${slug}/exhibitors`;
  const page = await browser.newPage({ viewport:{width:1400,height:1200} });
  try {
    await page.goto(url, { waitUntil:'networkidle', timeout:45000 });
    await page.waitForTimeout(2500);
    // scroll to trigger any lazy rendering
    for (let i=0;i<6;i++){ await page.mouse.wheel(0, 4000); await page.waitForTimeout(400); }
    const text = await page.evaluate(()=>document.body.innerText);
    const lines = text.split('\n').map(l=>l.trim());
    const names = [];
    for (let i=0;i<lines.length-1;i++){
      if (/^Booth\b/i.test(lines[i+1]) && lines[i] && !/^Booth\b/i.test(lines[i])) names.push(lines[i]);
    }
    result[slug] = [...new Set(names)];
    console.log(slug, '->', result[slug].length, 'exhibitors');
  } catch(e){ console.log(slug, 'ERROR', e.message); result[slug]=[]; }
  await page.close();
}
await browser.close();
fs.writeFileSync('scripts/research/awe-raw.json', JSON.stringify(result,null,1));
const all = new Set(); for(const s of Object.keys(result)) result[s].forEach(n=>all.add(n));
console.log('TOTAL unique exhibitors across events:', all.size);
