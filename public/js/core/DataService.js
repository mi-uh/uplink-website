/* ==========================================================
   DATA SERVICE - Data Fetching & Caching
   ========================================================== */

class DataService {
  constructor() {
    this.cache = new Map();
    this.loading = new Map();
    this.cacheVersion = '1.2';
  }

  /**
   * Fetch data with caching
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<*>} Data
   */
  async fetch(url, options = {}) {
    const {
      cache = true,
      cacheDuration = 3600000, // 1 hour default
      validator = null,
      transform = null,
      retries = 3,
      fetchOptions = { cache: 'default' }
    } = options;

    const cacheKey = url;
    const fetchUrl = this.addVersion(url);

    // Return cached data if valid
    if (cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < cacheDuration) {
        return cached.data;
      }
    }

    // Check LocalStorage cache
    if (cache) {
      const localCached = this.getFromLocalStorage(cacheKey);
      if (localCached && Date.now() - localCached.timestamp < cacheDuration) {
        this.cache.set(cacheKey, localCached);
        return localCached.data;
      }
    }

    // Prevent duplicate requests
    if (this.loading.has(cacheKey)) {
      return this.loading.get(cacheKey);
    }

    // Fetch with retries
    const fetchPromise = this.fetchWithRetry(fetchUrl, retries, fetchOptions)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        // Validate
        if (validator && !validator(data)) {
          throw new Error(`Validation failed for ${url}`);
        }

        // Transform
        const finalData = transform ? transform(data) : data;

        // Cache in memory
        if (cache) {
          const cacheEntry = {
            data: finalData,
            timestamp: Date.now()
          };
          this.cache.set(cacheKey, cacheEntry);
          
          // Cache in LocalStorage
          this.saveToLocalStorage(cacheKey, cacheEntry);
        }

        this.loading.delete(cacheKey);
        return finalData;
      })
      .catch(error => {
        this.loading.delete(cacheKey);
        throw error;
      });

    this.loading.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Fetch with retry logic
   * @param {string} url - URL to fetch
   * @param {number} retries - Number of retries
   * @returns {Promise<Response>}
   */
  async fetchWithRetry(url, retries, fetchOptions = {}) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fetch(url, fetchOptions);
      } catch (error) {
        if (i === retries - 1) throw error;
        await this.delay(Math.pow(2, i) * 1000); // Exponential backoff
      }
    }
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Append a cache-busting version parameter to the URL
   * @param {string} url - Original URL
   * @returns {string} Versioned URL
   */
  addVersion(url) {
    if (!this.cacheVersion) return url;
    const hasVersion = /([?&])v=/.test(url);
    if (hasVersion) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(this.cacheVersion)}`;
  }

  /**
   * Invalidate cache
   * @param {string} url - URL to invalidate (optional)
   */
  invalidate(url) {
    if (url) {
      this.cache.delete(url);
      localStorage.removeItem(`uplink_cache_${url}`);
    } else {
      this.cache.clear();
      // Clear all uplink cache from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('uplink_cache_')) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  /**
   * Save to LocalStorage
   * @param {string} key - Cache key
   * @param {Object} data - Data to save
   */
  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(
        `uplink_cache_${key}`,
        JSON.stringify({
          version: this.cacheVersion,
          ...data
        })
      );
    } catch (e) {
      console.warn('Failed to save to LocalStorage:', e);
    }
  }

  /**
   * Get from LocalStorage
   * @param {string} key - Cache key
   * @returns {Object|null}
   */
  getFromLocalStorage(key) {
    try {
      const stored = localStorage.getItem(`uplink_cache_${key}`);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      if (parsed.version !== this.cacheVersion) {
        localStorage.removeItem(`uplink_cache_${key}`);
        return null;
      }

      return {
        data: parsed.data,
        timestamp: parsed.timestamp
      };
    } catch (e) {
      console.warn('Failed to read from LocalStorage:', e);
      return null;
    }
  }
}

export default new DataService();
