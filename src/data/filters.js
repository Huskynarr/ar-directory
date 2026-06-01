import {
  safeExternalUrl,
  toNumber,
  parsePrice,
  normalizeText,
  parseResolutionWidth,
  uniqueSorted,
} from '../utils.js';
import { locale } from '../i18n.js';
import { state } from '../state.js';
import {
  getShopInfo,
  isEol,
  isLikelyActive,
  getHorizontalFov,
  isXrRow,
  isArRow,
} from './model.js';

export const getFilterOptions = () => ({
  manufacturers: uniqueSorted(state.rows.map((row) => row.manufacturer), locale()),
  displayTypes: uniqueSorted(state.rows.map((row) => row.display_type), locale()),
  optics: uniqueSorted(state.rows.map((row) => row.optics), locale()),
  tracking: uniqueSorted(state.rows.map((row) => row.tracking), locale()),
  eyeTracking: uniqueSorted(state.rows.map((row) => row.eye_tracking), locale()),
  handTracking: uniqueSorted(state.rows.map((row) => row.hand_tracking), locale()),
  passthrough: uniqueSorted(state.rows.map((row) => row.passthrough), locale()),
  activeStatuses: uniqueSorted(state.rows.map((row) => row.active_distribution), locale()),
  eolStatuses: uniqueSorted(state.rows.map((row) => row.eol_status), locale()),
  software: uniqueSorted(state.rows.map((row) => row.software), locale()),
  computeUnits: uniqueSorted(state.rows.map((row) => row.compute_unit), locale()),
});

const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), locale(), { sensitivity: 'base' });

const compareNumbers = (left, right) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
};

const compareDates = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : -1;
  const safeRight = Number.isFinite(rightTime) ? rightTime : -1;
  return safeLeft - safeRight;
};

const compareDefaultPriority = (left, right) => {
  const leftEol = isEol(left);
  const rightEol = isEol(right);
  if (leftEol !== rightEol) {
    return leftEol ? 1 : -1;
  }

  const releaseOrder = compareDates(right.release_date || right.announced_date, left.release_date || left.announced_date);
  if (releaseOrder !== 0) {
    return releaseOrder;
  }

  const activeOrder = compareNumbers(isLikelyActive(right) ? 1 : 0, isLikelyActive(left) ? 1 : 0);
  if (activeOrder !== 0) {
    return activeOrder;
  }

  return compareText(left.name, right.name);
};

export const sortRows = (rows) => {
  const sorted = [...rows];
  switch (state.sort) {
    case 'priority_default':
      sorted.sort((left, right) => compareDefaultPriority(left, right));
      return sorted;
    case 'price_desc':
      sorted.sort((left, right) => compareNumbers(parsePrice(right.price_usd), parsePrice(left.price_usd)));
      return sorted;
    case 'price_asc':
      sorted.sort((left, right) => compareNumbers(parsePrice(left.price_usd), parsePrice(right.price_usd)));
      return sorted;
    case 'release_desc':
      sorted.sort((left, right) =>
        compareDates(right.release_date || right.announced_date, left.release_date || left.announced_date),
      );
      return sorted;
    case 'fov_desc':
      sorted.sort((left, right) => compareNumbers(getHorizontalFov(right), getHorizontalFov(left)));
      return sorted;
    case 'weight_asc':
      sorted.sort((left, right) => compareNumbers(toNumber(left.weight_g), toNumber(right.weight_g)));
      return sorted;
    case 'refresh_desc':
      sorted.sort((left, right) => compareNumbers(toNumber(right.refresh_hz), toNumber(left.refresh_hz)));
      return sorted;
    case 'manufacturer_asc':
      sorted.sort((left, right) => compareText(left.manufacturer, right.manufacturer));
      return sorted;
    case 'name_asc':
    default:
      sorted.sort((left, right) => compareText(left.name, right.name));
      return sorted;
  }
};

const matchesSelectFilter = (value, selected) => {
  if (selected === 'all') {
    return true;
  }
  return normalizeText(value) === normalizeText(selected);
};

export const matchesFilters = (row) => {
  const query = normalizeText(state.query);
  if (query) {
    const haystack = normalizeText(
      [
        row.name,
        row.manufacturer,
        row.display_type,
        row.software,
        row.optics,
        row.compute_unit,
        row.tracking,
        row.eye_tracking,
        row.hand_tracking,
        row.passthrough,
        row.xr_category,
        row.lifecycle_notes,
        row.lifecycle_source,
      ].join(' '),
    );
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.every((token) => haystack.includes(token))) {
      return false;
    }
  }

  if (!matchesSelectFilter(row.xr_category, state.category)) {
    return false;
  }
  if (!matchesSelectFilter(row.manufacturer, state.manufacturer)) {
    return false;
  }
  if (!matchesSelectFilter(row.display_type, state.displayType)) {
    return false;
  }
  if (!matchesSelectFilter(row.optics, state.optics)) {
    return false;
  }
  if (!matchesSelectFilter(row.tracking, state.tracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.eye_tracking, state.eyeTracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.hand_tracking, state.handTracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.passthrough, state.passthrough)) {
    return false;
  }
  if (!matchesSelectFilter(row.active_distribution, state.active)) {
    return false;
  }
  if (!matchesSelectFilter(row.eol_status, state.eol)) {
    return false;
  }
  if (!matchesSelectFilter(row.software, state.software)) {
    return false;
  }
  if (!matchesSelectFilter(row.compute_unit, state.computeUnit)) {
    return false;
  }
  if (state.onlyPrice && !parsePrice(row.price_usd)) {
    return false;
  }
  if (state.onlyShop && !getShopInfo(row).url) {
    return false;
  }
  if (state.onlyAvailable && !isLikelyActive(row)) {
    return false;
  }
  if (state.onlyWithImage && !safeExternalUrl(row.image_url)) {
    return false;
  }
  if (state.onlyFavorites && !state.favorites.includes(row.__rowId)) {
    return false;
  }
  if (state.flagAr && state.flagXr) {
    // both selected means no additional category restriction
  } else if (state.flagAr && !isArRow(row)) {
    return false;
  } else if (state.flagXr && !isXrRow(row)) {
    return false;
  }

  const minFov = toNumber(state.minFov);
  if (minFov !== null) {
    const fov = getHorizontalFov(row);
    if (fov === null || fov < minFov) {
      return false;
    }
  }

  const minRefresh = toNumber(state.minRefresh);
  if (minRefresh !== null) {
    const refresh = toNumber(row.refresh_hz);
    if (refresh === null || refresh < minRefresh) {
      return false;
    }
  }

  const maxPrice = toNumber(state.maxPrice);
  if (maxPrice !== null) {
    const price = parsePrice(row.price_usd);
    if (!price || price > maxPrice) {
      return false;
    }
  }

  const maxWeight = toNumber(state.maxWeight);
  if (maxWeight !== null) {
    const weight = toNumber(row.weight_g);
    if (weight === null || weight > maxWeight) {
      return false;
    }
  }

  const minRes = toNumber(state.minResolutionWidth);
  if (minRes !== null) {
    const res = parseResolutionWidth(row.resolution_per_eye);
    if (res === null || res < minRes) {
      return false;
    }
  }

  return true;
};

export const getSelectedRows = () => {
  const byId = new Map(state.rows.map((row) => [row.__rowId, row]));
  return state.selectedIds.map((id) => byId.get(id)).filter(Boolean);
};
