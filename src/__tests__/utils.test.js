import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  safeExternalUrl,
  toNumber,
  parsePrice,
  normalizeText,
  parseResolutionWidth,
  parseBooleanParam,
  isUnknownValue,
  toInitials,
  debounce,
  uniqueSorted,
} from '../utils.js';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('handles null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('handles undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles numbers', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('handles strings with no special chars', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes multiple special chars together', () => {
    expect(escapeHtml('<a href="x&y">it\'s</a>')).toBe(
      '&lt;a href=&quot;x&amp;y&quot;&gt;it&#39;s&lt;/a&gt;',
    );
  });
});

describe('safeExternalUrl', () => {
  it('accepts http URLs', () => {
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com/');
  });

  it('accepts https URLs', () => {
    expect(safeExternalUrl('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1',
    );
  });

  it('rejects javascript: protocol', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects ftp: protocol', () => {
    expect(safeExternalUrl('ftp://files.example.com')).toBe('');
  });

  it('rejects data: protocol', () => {
    expect(safeExternalUrl('data:text/html,<h1>hi</h1>')).toBe('');
  });

  it('returns empty for malformed URLs', () => {
    expect(safeExternalUrl('not a url')).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(safeExternalUrl('')).toBe('');
  });

  it('returns empty for null', () => {
    expect(safeExternalUrl(null)).toBe('');
  });

  it('returns empty for undefined', () => {
    expect(safeExternalUrl(undefined)).toBe('');
  });
});

describe('toNumber', () => {
  it('parses integers', () => {
    expect(toNumber('42')).toBe(42);
  });

  it('parses floats with dot', () => {
    expect(toNumber('3.14')).toBe(3.14);
  });

  it('parses floats with comma (European format)', () => {
    expect(toNumber('3,14')).toBe(3.14);
  });

  it('parses negative numbers', () => {
    expect(toNumber('-5')).toBe(-5);
  });

  it('parses zero', () => {
    expect(toNumber('0')).toBe(0);
  });

  it('returns null for empty string', () => {
    expect(toNumber('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(toNumber('   ')).toBeNull();
  });

  it('returns null for null', () => {
    expect(toNumber(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toNumber(undefined)).toBeNull();
  });

  it('returns null for NaN-producing strings', () => {
    expect(toNumber('abc')).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(toNumber('Infinity')).toBeNull();
  });

  it('handles numeric input directly', () => {
    expect(toNumber(99)).toBe(99);
  });

  it('trims whitespace around numbers', () => {
    expect(toNumber('  42  ')).toBe(42);
  });
});

describe('parsePrice', () => {
  it('returns positive prices', () => {
    expect(parsePrice('499')).toBe(499);
  });

  it('returns null for zero', () => {
    expect(parsePrice('0')).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(parsePrice('-100')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parsePrice('free')).toBeNull();
  });

  it('parses decimal prices', () => {
    expect(parsePrice('29.99')).toBe(29.99);
  });
});

describe('normalizeText', () => {
  it('lowercases text', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('handles null', () => {
    expect(normalizeText(null)).toBe('');
  });

  it('handles undefined', () => {
    expect(normalizeText(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('handles numbers', () => {
    expect(normalizeText(42)).toBe('42');
  });

  it('lowercases and trims combined', () => {
    expect(normalizeText('  MIXED Case  ')).toBe('mixed case');
  });
});

describe('parseResolutionWidth', () => {
  it('parses standard resolution "1440x1440"', () => {
    expect(parseResolutionWidth('1440x1440')).toBe(1440);
  });

  it('parses with uppercase X "1920X1080"', () => {
    expect(parseResolutionWidth('1920X1080')).toBe(1920);
  });

  it('returns the larger dimension', () => {
    expect(parseResolutionWidth('1080x1920')).toBe(1920);
  });

  it('handles spaces around separator', () => {
    expect(parseResolutionWidth('1920 x 1080')).toBe(1920);
  });

  it('returns null for invalid format', () => {
    expect(parseResolutionWidth('invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseResolutionWidth('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseResolutionWidth(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseResolutionWidth(undefined)).toBeNull();
  });

  it('returns null for single number', () => {
    expect(parseResolutionWidth('1920')).toBeNull();
  });
});

describe('parseBooleanParam', () => {
  it('returns true for "1"', () => {
    expect(parseBooleanParam('1')).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(parseBooleanParam('true')).toBe(true);
  });

  it('returns true for "yes"', () => {
    expect(parseBooleanParam('yes')).toBe(true);
  });

  it('returns true for "on"', () => {
    expect(parseBooleanParam('on')).toBe(true);
  });

  it('returns true for "TRUE" (case-insensitive)', () => {
    expect(parseBooleanParam('TRUE')).toBe(true);
  });

  it('returns false for "0"', () => {
    expect(parseBooleanParam('0')).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(parseBooleanParam('false')).toBe(false);
  });

  it('returns false for "no"', () => {
    expect(parseBooleanParam('no')).toBe(false);
  });

  it('returns false for "off"', () => {
    expect(parseBooleanParam('off')).toBe(false);
  });

  it('returns fallback for empty string', () => {
    expect(parseBooleanParam('')).toBe(false);
    expect(parseBooleanParam('', true)).toBe(true);
  });

  it('returns fallback for null', () => {
    expect(parseBooleanParam(null)).toBe(false);
  });

  it('returns fallback for unknown value', () => {
    expect(parseBooleanParam('maybe')).toBe(false);
    expect(parseBooleanParam('maybe', true)).toBe(true);
  });
});

describe('isUnknownValue', () => {
  it('returns true for empty string', () => {
    expect(isUnknownValue('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isUnknownValue(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isUnknownValue(undefined)).toBe(true);
  });

  it('returns true for "n/a"', () => {
    expect(isUnknownValue('n/a')).toBe(true);
  });

  it('returns true for "N/A" (case-insensitive)', () => {
    expect(isUnknownValue('N/A')).toBe(true);
  });

  it('returns true for "unknown"', () => {
    expect(isUnknownValue('unknown')).toBe(true);
  });

  it('returns true for "unbekannt"', () => {
    expect(isUnknownValue('unbekannt')).toBe(true);
  });

  it('returns true for "k. a."', () => {
    expect(isUnknownValue('k. a.')).toBe(true);
  });

  it('returns true for "-"', () => {
    expect(isUnknownValue('-')).toBe(true);
  });

  it('returns true for "none"', () => {
    expect(isUnknownValue('none')).toBe(true);
  });

  it('returns true for "null"', () => {
    expect(isUnknownValue('null')).toBe(true);
  });

  it('returns true for partial marker "keine angaben"', () => {
    expect(isUnknownValue('Es gibt keine Angaben dazu')).toBe(true);
  });

  it('returns true for partial marker "nicht bekannt"', () => {
    expect(isUnknownValue('Wert nicht bekannt')).toBe(true);
  });

  it('returns false for valid known values', () => {
    expect(isUnknownValue('Meta Quest 3')).toBe(false);
  });

  it('returns false for numeric strings', () => {
    expect(isUnknownValue('42')).toBe(false);
  });
});

describe('toInitials', () => {
  it('returns initials of two words', () => {
    expect(toInitials('Meta Quest')).toBe('MQ');
  });

  it('returns single initial for one word', () => {
    expect(toInitials('Apple')).toBe('A');
  });

  it('limits to two initials for three or more words', () => {
    expect(toInitials('The Big Company')).toBe('TB');
  });

  it('returns "AR" for empty string', () => {
    expect(toInitials('')).toBe('AR');
  });

  it('returns "AR" for null', () => {
    expect(toInitials(null)).toBe('AR');
  });

  it('returns "AR" for undefined', () => {
    expect(toInitials(undefined)).toBe('AR');
  });

  it('uppercases initials', () => {
    expect(toInitials('meta quest')).toBe('MQ');
  });

  it('handles extra whitespace', () => {
    expect(toInitials('  Meta   Quest  ')).toBe('MQ');
  });

  it('returns "AR" for whitespace-only string', () => {
    expect(toInitials('   ')).toBe('AR');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets the timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a', 'b');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('uses the last call arguments when debounced', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('uses default delay of 200ms', () => {
    const fn = vi.fn();
    const debounced = debounce(fn);

    debounced();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('uniqueSorted', () => {
  it('removes duplicates', () => {
    expect(uniqueSorted(['b', 'a', 'b', 'c', 'a'], 'en-US')).toEqual(['a', 'b', 'c']);
  });

  it('sorts alphabetically', () => {
    expect(uniqueSorted(['cherry', 'apple', 'banana'], 'en-US')).toEqual([
      'apple',
      'banana',
      'cherry',
    ]);
  });

  it('filters out empty strings', () => {
    expect(uniqueSorted(['a', '', 'b', '  ', 'c'], 'en-US')).toEqual(['a', 'b', 'c']);
  });

  it('handles null/undefined values in the array', () => {
    expect(uniqueSorted(['b', null, 'a', undefined], 'en-US')).toEqual(['a', 'b']);
  });

  it('trims whitespace from values', () => {
    expect(uniqueSorted(['  a  ', 'b ', ' c'], 'en-US')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for empty input', () => {
    expect(uniqueSorted([], 'en-US')).toEqual([]);
  });

  it('uses locale-aware sorting with German locale', () => {
    const result = uniqueSorted(['Zebra', 'apfel', 'Banane'], 'de-DE');
    expect(result).toEqual(['apfel', 'Banane', 'Zebra']);
  });

  it('defaults to de-DE locale when not specified', () => {
    const result = uniqueSorted(['b', 'a', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('treats trimmed duplicates as the same value', () => {
    expect(uniqueSorted(['  hello  ', 'hello'], 'en-US')).toEqual(['hello']);
  });
});
