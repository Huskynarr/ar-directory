import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';

const CSV_PATH = 'public/data/ar_glasses.csv';
const METADATA_PATH = 'public/data/ar_glasses.metadata.json';
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CANDIDATES_TO_PROBE = 16;
const MIN_CONTENT_LENGTH = 8_000;

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
    img: 24,
  };
  score += typeWeight[candidate.kind] ?? 0;

  try {
    const parsed = new URL(candidate.url);
    score += domainAffinityScore(parsed.hostname, officialHost);
    if (SOCIAL_HOST_HINTS.some((host) => parsed.hostname.includes(host))) {
      score -= 120;
    }

    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(path)) {
      score += 14;
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

  let imgCount = 0;
  for (const imgTag of extractTags(html, 'img')) {
    const attrs = parseAttributes(imgTag);
    const src = attrs.src || attrs['data-src'] || attrs['data-original'] || '';
    if (src) {
      pushCandidate(src, 'img');
      imgCount += 1;
    }
    if (imgCount >= 80) {
      break;
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

const updateMetadata = async (rows) => {
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(METADATA_PATH, 'utf8'));
  } catch {
    metadata = {};
  }
  metadata.manufacturer_image_enriched_at = new Date().toISOString();
  metadata.manufacturer_image_links = rows.filter((row) => safeHttpUrl(row.image_url)).length;
  metadata.manufacturer_image_note = 'Image links derived from official manufacturer pages.';
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
  let failedCount = 0;

  const results = await runPool(
    candidates,
    async (row, index) => {
      const label = `${index + 1}/${candidates.length} ${sanitize(row.name) || sanitize(row.short_name) || row.id}`;
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

  await writeCsv(workRows, fields);
  await updateMetadata(workRows);

  console.log(
    `Done. Updated image_url for ${updatedCount}/${candidates.length} rows (${failedCount} failed requests).`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
