import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUsdToEurRate } from '../data/dataset.js';
import { getShopInfo, isEol, isRecentRelease } from '../data/model.js';
import { state } from '../state.js';

describe('device model helpers', () => {
  it('treats official URLs as manufacturer pages without inventing a shop fallback', () => {
    expect(getShopInfo({ official_url: 'https://example.com/product' })).toMatchObject({
      url: 'https://example.com/product',
      official: true,
    });
    expect(getShopInfo({ name: 'Example Glasses', manufacturer: 'Example' })).toMatchObject({
      url: '',
      official: false,
    });
  });

  it('does not mistake the active lifecycle label for EOL', () => {
    expect(isEol({ eol_status: 'Aktiv oder ohne EOL-Angabe' })).toBe(false);
    expect(isEol({ eol_status: 'EOL / Discontinued' })).toBe(true);
  });

  it('marks only already released recent products as new', () => {
    const now = new Date('2026-07-11T00:00:00Z').getTime();
    expect(isRecentRelease({ release_date: '2026-06-23' }, now)).toBe(true);
    expect(isRecentRelease({ release_date: '2026-08-01' }, now)).toBe(false);
  });
});

describe('exchange-rate loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts the current Frankfurter v2 single-rate response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: '2026-07-11', base: 'USD', quote: 'EUR', rate: 0.87396 }),
    }));
    await fetchUsdToEurRate();
    expect(state.usdToEurRate).toBe(0.87396);
    expect(state.usdToEurFetchedAt).toBe('2026-07-11');
  });
});
