/* ==========================================================
   DATE UTILITIES
   ========================================================== */

/**
 * Format date string to German locale
 * @param {string} dateString - ISO date string (YYYY-MM-DD)
 * @param {string} locale - Locale (default: de-DE)
 * @returns {string} Formatted date
 */
export function formatDate(dateString, locale = 'de-DE') {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Generate timestamp for message index
 * @param {number} index - Message index
 * @param {number} baseHour - Base hour (default: 3)
 * @param {number} baseMin - Base minute (default: 14)
 * @returns {string} Formatted timestamp (HH:MM:SS)
 */
export function getTimestamp(index, baseHour = 3, baseMin = 14) {
  const min = String(baseMin + index * 2 + Math.floor(index * 0.7)).padStart(2, '0');
  const sec = String((index * 17 + 8) % 60).padStart(2, '0');
  const hour = String(baseHour).padStart(2, '0');
  return `${hour}:${min}:${sec}`;
}

/**
 * Format ISO datetime to HH:MM (24h, German locale)
 * Falls back to empty string on invalid date.
 * @param {string} isoString
 * @param {string} locale
 * @returns {string}
 */
export function formatTime(isoString, locale = 'de-DE') {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format ISO datetime to DD.MM.YYYY, HH:MM
 * @param {string} isoString
 * @param {string} locale
 * @returns {string}
 */
export function formatDateTime(isoString, locale = 'de-DE') {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Parse date from ISO string
 * @param {string} dateString - ISO date string
 * @returns {Date}
 */
export function parseDate(dateString) {
  return new Date(dateString + 'T00:00:00');
}

/**
 * Get relative time string (e.g., "vor 2 Tagen")
 * @param {string|Date} date - Date to compare
 * @returns {string} Relative time string
 */
export function getRelativeTime(date) {
  const now = new Date();
  const then = date instanceof Date ? date : parseDate(date);
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  if (diffDays < 30) return `Vor ${Math.floor(diffDays / 7)} Wochen`;
  return formatDate(date);
}
