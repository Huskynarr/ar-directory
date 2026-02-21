import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';

const CSV_PATH = 'public/data/ar_glasses.csv';
const METADATA_PATH = 'public/data/ar_glasses.metadata.json';
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CANDIDATES_TO_PROBE = 16;
const MIN_CONTENT_LENGTH = 2_000;

const BAD_IMAGE_HINTS = [
  'logo',
  'icon',
  'favicon',
  'sprite',
  'avatar',
  'badge',
  'placeholder',
  'loader',
  'apple-touch',
  'maskable',
  'site-icon',
  'manifest',
  'new-tab',
  'pwa',
];

const SOCIAL_HOST_HINTS = ['facebook.com', 'fbcdn.net', 'twitter.com', 'x.com', 'linkedin.com'];
const HARD_BLOCK_IMAGE_HINTS = ['favicon', 'apple-touch', 'maskable', '/icons/', '/icon/'];
const DISALLOWED_SOURCE_HOST_HINTS = ['wikipedia.org', 'wikimedia.org', 'kickstarter.com', 'indiegogo.com'];
const IMAGE_EXTENSION_REGEX = /\.(jpg|jpeg|png|webp|avif)(\?|$)/i;

const CURATED_IMAGE_OVERRIDES_BY_ID = {
  vH20M2KPj: 'https://www.ajnalens.com/_next/static/media/Rec3467860.81d5d5c9.svg',
  UR8rXYX7t:
    'https://static.wixstatic.com/media/86f41c_ff8e1bdf90e1402b98efcb9c7dc5e98c~mv2.png/v1/fit/w_1920,h_1440,q_90,enc_avif,quality_auto/86f41c_ff8e1bdf90e1402b98efcb9c7dc5e98c~mv2.png',
  '6z7r29ojZ':
    'https://images.prismic.io/julbo/Zw5sh4F3NbkBXduo_adilheadermobile.jpg?auto=format,compress&rect=0,375,1748,1748&w=580&h=580&fit=crop',
  '0iz9ksGZA':
    'https://static.xx.fbcdn.net/mci_ab/public/cms/?ab_b=e&ab_page=CMS&ab_entry=2061368471315981&version=1765379917&transcode_extension=webp',
  vn_zQOTOV:
    'https://ztedevices.com/content/dam/zte-devices/global/products/accessories/wearable/nubia-neovision-glass/nubia%20Neovision%20Glass.png',
  pOfzEGXDw:
    'https://xyz-reality.transforms.svdcdn.com/production/assets/Page-Images/Onsite-deployment/Ontime-delivery-3.jpg?w=1200&h=630&q=82&auto=format&fit=crop&dm=1738945418&s=9a14dac00700f9b0f5a72140d5d5c816',
};

const SECOND_LEVEL_TLDS = new Set([
  'co.uk',
  'org.uk',
  'com.au',
  'co.jp',
  'com.br',
  'com.mx',
  'com.tr',
  'co.kr',
  'com.cn',
  'com.tw',
  'com.sg',
  'com.hk',
  'co.in',
]);

const PAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const IMAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]+/g;

const sanitize = (value) =>
  String(value ?? '')
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const safeHttpUrl = (value) => {
  const text = sanitize(value);
  if (!text) {
    return '';
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

const withTimeout = async (fn, ms = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchText = async (url) => {
  const response = await withTimeout((signal) =>
    fetch(url, {
      signal,
      redirect: 'follow',
      headers: PAGE_HEADERS,
    }),
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch page ${url} (${response.status})`);
  }
  return await response.text();
};

const parseAttributes = (tag) => {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = String(match[1] ?? '').toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attrs[key] = value;
  }
  return attrs;
};

const extractTags = (html, tagName) => {
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const tags = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    tags.push(match[0]);
  }
  return tags;
};

const extractTagBlocks = (html, tagName) => {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push({
      openTag: `<${tagName}${match[1] ?? ''}>`,
      body: match[2] ?? '',
    });
  }
  return blocks;
};

const parseSrcsetUrls = (value) =>
  String(value ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [url, descriptor = ''] = segment.split(/\s+/, 2);
      const normalizedDescriptor = descriptor.toLowerCase();
      let weight = 0;
      if (normalizedDescriptor.endsWith('w')) {
        const width = Number(normalizedDescriptor.slice(0, -1));
        weight = Number.isFinite(width) ? width : 0;
      } else if (normalizedDescriptor.endsWith('x')) {
        const multiple = Number(normalizedDescriptor.slice(0, -1));
        weight = Number.isFinite(multiple) ? multiple * 1000 : 0;
      }
      return { url, weight };
    })
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.url)
    .filter(Boolean);

const extractImageLikeUrlsFromText = (text) => {
  const value = String(text ?? '');
  if (!value) {
    return [];
  }
  const absoluteMatches = value.match(/https?:\/\/[^"'\s)\\<>]+/gi) ?? [];
  const relativeMatches = value.match(/\/[^"'\s)\\<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s)\\<>]*)?/gi) ?? [];
  return [...absoluteMatches, ...relativeMatches];
};

const toAbsoluteUrl = (candidate, baseUrl) => {
  const text = sanitize(candidate);
  if (!text || text.startsWith('data:') || text.startsWith('javascript:')) {
    return '';
  }
  try {
    const absolute = new URL(text, baseUrl);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      return '';
    }
    return absolute.toString();
  } catch {
    return '';
  }
};

const normalizeRootDomain = (hostname) => {
  const parts = String(hostname ?? '')
    .toLowerCase()
    .split('.')
    .filter(Boolean);
  if (parts.length <= 2) {
    return parts.join('.');
  }
  const lastTwo = parts.slice(-2).join('.');
  if (SECOND_LEVEL_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
};

const hasHostHint = (hostname, hostHint) => hostname === hostHint || hostname.endsWith(`.${hostHint}`);

const domainAffinityScore = (candidateHost, officialHost) => {
  const candidate = normalizeRootDomain(candidateHost);
  const official = normalizeRootDomain(officialHost);
  if (!candidate || !official) {
    return 0;
  }
  if (candidate === official) {
    return 60;
  }
  if (candidateHost.endsWith(`.${official}`) || officialHost.endsWith(`.${candidate}`)) {
    return 35;
  }
  return 0;
};

const tokenizeRow = (row) => {
  const nameTokens = sanitize(row.name)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
  const shortNameTokens = sanitize(row.short_name)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
  return [...new Set([...nameTokens, ...shortNameTokens])];
};

const staticCandidateScore = (candidate, officialHost, rowTokens) => {
  const url = candidate.url.toLowerCase();
  let score = 0;

  const typeWeight = {
    og: 70,
    twitter: 62,
    itemprop: 56,
    link: 44,
    source: 30,
    img: 24,
    jsonld: 22,
    raw: 12,
  };
  score += typeWeight[candidate.kind] ?? 0;

  try {
    const parsed = new URL(candidate.url);
    score += domainAffinityScore(parsed.hostname, officialHost);
    if (SOCIAL_HOST_HINTS.some((host) => parsed.hostname.includes(host))) {
      score -= 120;
    }

    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (IMAGE_EXTENSION_REGEX.test(path)) {
      score += 14;
    } else if (path.includes('/images/') || path.includes('/media/') || path.includes('/assets/')) {
      score += 4;
    }
    if (/\.svg(\?|$)/i.test(path)) {
      score -= 24;
    }
    if (BAD_IMAGE_HINTS.some((hint) => path.includes(hint))) {
      score -= 160;
    }

    const tokenHits = rowTokens.reduce((total, token) => (path.includes(token) ? total + 1 : total), 0);
    score += Math.min(tokenHits * 9, 36);

    const dimMatch = path.match(/(\d{3,4})x(\d{3,4})/);
    if (dimMatch) {
      const width = Number(dimMatch[1]);
      const height = Number(dimMatch[2]);
      if (Number.isFinite(width) && Number.isFinite(height) && width >= 500 && height >= 300) {
        score += 10;
      }
    }
  } catch {
    score -= 999;
  }

  return score;
};

const probeImage = async (url) => {
  const probeHead = async () => {
    const response = await withTimeout((signal) =>
      fetch(url, {
        method: 'HEAD',
        signal,
        redirect: 'follow',
        headers: IMAGE_HEADERS,
      }),
    );

    if (!response.ok) {
      return null;
    }
    const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return null;
    }
    const length = Number(response.headers.get('content-length'));
    return {
      contentType,
      contentLength: Number.isFinite(length) ? length : 0,
    };
  };

  const probeGet = async () => {
    const response = await withTimeout((signal) =>
      fetch(url, {
        method: 'GET',
        signal,
        redirect: 'follow',
        headers: {
          ...IMAGE_HEADERS,
          range: 'bytes=0-1',
        },
      }),
    );
    if (!response.ok && response.status !== 206) {
      return null;
    }
    const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return null;
    }
    const length = Number(response.headers.get('content-length'));
    return {
      contentType,
      contentLength: Number.isFinite(length) ? length : 0,
    };
  };

  try {
    const head = await probeHead();
    if (head) {
      return head;
    }
  } catch {
    // fallback to GET probe
  }

  try {
    return await probeGet();
  } catch {
    return null;
  }
};

const collectImageCandidates = (html, officialUrl) => {
  const candidates = [];
  const pushCandidate = (url, kind) => {
    const absoluteUrl = toAbsoluteUrl(url, officialUrl);
    if (!absoluteUrl) {
      return;
    }
    candidates.push({ url: absoluteUrl, kind });
  };

  for (const metaTag of extractTags(html, 'meta')) {
    const attrs = parseAttributes(metaTag);
    const property = String(attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    const content = attrs.content ?? '';
    if (!content) {
      continue;
    }
    if (property === 'og:image' || property === 'og:image:url' || property === 'og:image:secure_url') {
      pushCandidate(content, 'og');
    } else if (property === 'twitter:image' || property === 'twitter:image:src') {
      pushCandidate(content, 'twitter');
    } else if (property === 'image') {
      pushCandidate(content, 'itemprop');
    }
  }

  for (const linkTag of extractTags(html, 'link')) {
    const attrs = parseAttributes(linkTag);
    const rel = String(attrs.rel ?? '').toLowerCase();
    const asType = String(attrs.as ?? '').toLowerCase();
    const href = attrs.href ?? '';
    if (!href) {
      continue;
    }
    if (rel.includes('image_src')) {
      pushCandidate(href, 'link');
    } else if (rel.includes('preload') && asType === 'image') {
      pushCandidate(href, 'link');
    }
  }

  for (const sourceTag of extractTags(html, 'source')) {
    const attrs = parseAttributes(sourceTag);
    const srcset = attrs.srcset || attrs['data-srcset'] || '';
    const srcsetUrls = parseSrcsetUrls(srcset);
    for (const srcsetUrl of srcsetUrls.slice(0, 2)) {
      pushCandidate(srcsetUrl, 'source');
    }
    const src = attrs.src || attrs['data-src'] || '';
    if (src) {
      pushCandidate(src, 'source');
    }
  }

  let imgCount = 0;
  for (const imgTag of extractTags(html, 'img')) {
    const attrs = parseAttributes(imgTag);
    const src = attrs.src || attrs['data-src'] || attrs['data-original'] || '';
    if (src) {
      pushCandidate(src, 'img');
      imgCount += 1;
    }
    const srcset = attrs.srcset || attrs['data-srcset'] || attrs['data-lazy-srcset'] || '';
    const srcsetUrls = parseSrcsetUrls(srcset);
    for (const srcsetUrl of srcsetUrls.slice(0, 2)) {
      pushCandidate(srcsetUrl, 'img');
    }
    if (imgCount >= 80) {
      break;
    }
  }

  for (const block of extractTagBlocks(html, 'script')) {
    const attrs = parseAttributes(block.openTag);
    const type = String(attrs.type ?? '').toLowerCase();
    const body = String(block.body ?? '');
    if (!body.trim()) {
      continue;
    }
    if (type.includes('ld+json')) {
      for (const candidate of extractImageLikeUrlsFromText(body)) {
        pushCandidate(candidate, 'jsonld');
      }
      continue;
    }
    for (const candidate of extractImageLikeUrlsFromText(body)) {
      if (
        IMAGE_EXTENSION_REGEX.test(candidate) ||
        candidate.includes('/images/') ||
        candidate.includes('/media/') ||
        candidate.includes('/assets/')
      ) {
        pushCandidate(candidate, 'raw');
      }
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
};

const resolveImageForRow = async (row) => {
  const officialUrl = safeHttpUrl(row.official_url);
  if (!officialUrl) {
    return '';
  }

  let officialHost = '';
  let officialOrigin = '';
  try {
    const parsed = new URL(officialUrl);
    officialHost = parsed.hostname.toLowerCase();
    officialOrigin = parsed.origin;
  } catch {
    return '';
  }
  if (DISALLOWED_SOURCE_HOST_HINTS.some((hostHint) => hasHostHint(officialHost, hostHint))) {
    return '';
  }

  const rowTokens = tokenizeRow(row);
  const sourcePages = [officialUrl];
  if (officialOrigin && officialOrigin !== officialUrl) {
    sourcePages.push(officialOrigin);
  }

  const candidates = [];
  for (const sourcePage of sourcePages) {
    try {
      const html = await fetchText(sourcePage);
      candidates.push(...collectImageCandidates(html, sourcePage));
    } catch {
      // continue with remaining fallback pages
    }
  }
  if (!candidates.length) {
    return '';
  }

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      score: staticCandidateScore(candidate, officialHost, rowTokens),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CANDIDATES_TO_PROBE);

  for (const candidate of ranked) {
    const candidateUrlLower = candidate.url.toLowerCase();
    if (HARD_BLOCK_IMAGE_HINTS.some((hint) => candidateUrlLower.includes(hint))) {
      continue;
    }
    const probe = await probeImage(candidate.url);
    if (!probe) {
      continue;
    }
    if (probe.contentLength > 0 && probe.contentLength < MIN_CONTENT_LENGTH) {
      continue;
    }
    const sizeBonus =
      probe.contentLength >= 250_000 ? 12 : probe.contentLength >= 80_000 ? 8 : probe.contentLength >= 12_000 ? 4 : 0;
    const effectiveScore = candidate.score + sizeBonus;
    if (effectiveScore >= 20) {
      return candidate.url;
    }
  }

  return '';
};

const runPool = async (items, worker, concurrency) => {
  const results = new Array(items.length);
  let cursor = 0;

  const runner = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runner());
  await Promise.all(workers);
  return results;
};

const parseCsv = async () => {
  const csv = await readFile(CSV_PATH, 'utf8');
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0].message);
  }
  return {
    rows: Array.isArray(parsed.data) ? parsed.data : [],
    fields: Array.isArray(parsed.meta?.fields) ? parsed.meta.fields : [],
  };
};

const inferColumns = (rows) => {
  const fields = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (key) {
        fields.add(key);
      }
    }
  }
  return [...fields];
};

const sanitizeRowsForCsv = (rows, fields) =>
  rows.map((row) => {
    const output = {};
    for (const field of fields) {
      output[field] = sanitize(row?.[field]);
    }
    return output;
  });

const writeCsv = async (rows, fields) => {
  const outputFields = fields.length ? fields : inferColumns(rows);
  const outputRows = sanitizeRowsForCsv(rows, outputFields);
  const csv = Papa.unparse(outputRows, { columns: outputFields.length ? outputFields : undefined });
  await writeFile(CSV_PATH, `${csv}\n`, 'utf8');
};

const updateMetadata = async (rows, stats = {}) => {
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(METADATA_PATH, 'utf8'));
  } catch {
    metadata = {};
  }
  metadata.manufacturer_image_enriched_at = new Date().toISOString();
  metadata.manufacturer_image_links = rows.filter((row) => safeHttpUrl(row.image_url)).length;
  metadata.manufacturer_image_curated_overrides = Number(stats.curatedCount ?? 0);
  metadata.manufacturer_image_manufacturer_fallbacks = Number(stats.manufacturerFallbackCount ?? 0);
  metadata.manufacturer_image_note =
    'Image links are derived from official manufacturer pages with curated per-model overrides and same-manufacturer fallback when needed.';
  await writeFile(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
};

const main = async () => {
  const { rows, fields } = await parseCsv();
  const workRows = rows.map((row) => ({ ...row }));
  for (const row of workRows) {
    row.image_url = '';
  }
  const candidates = workRows.filter((row) => safeHttpUrl(row.official_url));

  let updatedCount = 0;
  let curatedCount = 0;
  let manufacturerFallbackCount = 0;
  let failedCount = 0;

  const results = await runPool(
    candidates,
    async (row, index) => {
      const label = `${index + 1}/${candidates.length} ${sanitize(row.name) || sanitize(row.short_name) || row.id}`;
      const curatedOverride = safeHttpUrl(CURATED_IMAGE_OVERRIDES_BY_ID[String(row.id ?? '').trim()]);
      if (curatedOverride) {
        row.image_url = curatedOverride;
        updatedCount += 1;
        curatedCount += 1;
        console.log(`[image] ${label} -> curated override`);
        return row;
      }
      try {
        const imageUrl = await resolveImageForRow(row);
        if (imageUrl) {
          row.image_url = imageUrl;
          updatedCount += 1;
          console.log(`[image] ${label} -> OK`);
        } else {
          console.log(`[image] ${label} -> no suitable candidate`);
        }
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[image] ${label} -> failed (${message})`);
      }
      return row;
    },
    CONCURRENCY,
  );

  const byId = new Map(results.map((row) => [String(row.id ?? '').trim(), row]));
  for (const row of workRows) {
    const id = String(row.id ?? '').trim();
    const updated = byId.get(id);
    if (updated) {
      row.image_url = sanitize(updated.image_url);
    }
  }

  const manufacturerFallbacks = new Map();
  for (const row of workRows) {
    const manufacturerKey = sanitize(row.manufacturer).toLowerCase();
    const imageUrl = safeHttpUrl(row.image_url);
    if (manufacturerKey && imageUrl && !manufacturerFallbacks.has(manufacturerKey)) {
      manufacturerFallbacks.set(manufacturerKey, imageUrl);
    }
  }
  for (const row of workRows) {
    if (safeHttpUrl(row.image_url)) {
      continue;
    }
    const manufacturerKey = sanitize(row.manufacturer).toLowerCase();
    const fallbackImage = manufacturerFallbacks.get(manufacturerKey);
    if (fallbackImage) {
      row.image_url = fallbackImage;
      updatedCount += 1;
      manufacturerFallbackCount += 1;
    }
  }

  await writeCsv(workRows, fields);
  await updateMetadata(workRows, { curatedCount, manufacturerFallbackCount });

  console.log(
    `Done. Updated image_url for ${updatedCount}/${candidates.length} rows (${curatedCount} curated, ${manufacturerFallbackCount} manufacturer-fallback, ${failedCount} failed requests).`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
