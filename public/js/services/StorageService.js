/* ==========================================================
   STORAGE SERVICE - LocalStorage Abstraction
   ========================================================== */

class StorageService {
  constructor() {
    this.prefix = 'uplink:';
  }

  /**
   * Get item from storage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if not found
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch (e) {
      console.warn(`Failed to get item "${key}":`, e);
      return defaultValue;
    }
  }

  /**
   * Set item in storage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {boolean} Success status
   */
  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`Failed to set item "${key}":`, e);
      return false;
    }
  }

  /**
   * Remove item from storage
   * @param {string} key - Storage key
   */
  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (e) {
      console.warn(`Failed to remove item "${key}":`, e);
    }
  }

  /**
   * Clear all uplink storage
   */
  clear() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Storage key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(this.prefix + key) !== null;
  }
}

export default new StorageService();
