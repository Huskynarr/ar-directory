import { state } from './state.js';

export const exportFilteredCsv = (rows) => {
  if (!rows.length) {
    return;
  }
  const fields = state.csvFields.length ? state.csvFields : Object.keys(rows[0]).filter((k) => !k.startsWith('__'));
  const escapeCsvField = (val) => {
    const text = String(val ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const header = fields.map(escapeCsvField).join(',');
  const body = rows.map((row) => fields.map((f) => escapeCsvField(row[f])).join(',')).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ar_xr_glasses_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export const copyShareUrl = () => {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  }
};
