/* ==========================================================
   TEXT UTILITIES
   ========================================================== */

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix for truncated text (default: '...')
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength, suffix = '...') {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Slugify text (for URLs/IDs)
 * @param {string} text - Text to slugify
 * @returns {string} Slugified text
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Capitalize first letter
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Format number with locale
 * @param {number} num - Number to format
 * @param {string} locale - Locale (default: de-DE)
 * @returns {string} Formatted number
 */
export function formatNumber(num, locale = 'de-DE') {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Pad number with zeros
 * @param {number} num - Number to pad
 * @param {number} length - Target length (default: 3)
 * @returns {string} Padded number
 */
export function padNumber(num, length = 3) {
  return String(num).padStart(length, '0');
}
