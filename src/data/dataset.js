import Papa from 'papaparse';
import { toNumber } from '../utils.js';
import { state, RATE_SOURCE_URL, setFallbackUsdRate } from '../state.js';

export const parseCsv = (text) =>
  new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const fields = Array.isArray(meta?.fields) ? meta.fields : [];
        resolve({ data, fields });
      },
      error: reject,
    });
  });

export const fetchUsdToEurRate = async () => {
  try {
    const response = await fetch(RATE_SOURCE_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const rate = toNumber(payload?.rate ?? payload?.rates?.EUR);
    if (!rate || rate <= 0) {
      throw new Error('FX payload missing EUR rate');
    }
    state.usdToEurRate = rate;
    state.usdToEurFetchedAt = String(payload?.date ?? new Date().toISOString());
    state.usdToEurSource = RATE_SOURCE_URL;
  } catch {
    setFallbackUsdRate();
  }
};
