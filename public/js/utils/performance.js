/* ==========================================================
   PERFORMANCE UTILITIES
   ========================================================== */

/**
 * Create Intersection Observer for lazy loading
 * @param {Function} callback - Callback when element intersects
 * @param {Object} options - Observer options
 * @returns {IntersectionObserver}
 */
export function createLazyObserver(callback, options = {}) {
  const defaultOptions = {
    root: null,
    rootMargin: '200px',
    threshold: 0
  };
  
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback(entry.target);
      }
    });
  }, { ...defaultOptions, ...options });
}

/**
 * Lazy load elements with data-src attribute
 * @param {string} selector - CSS selector for elements
 */
export function lazyLoadImages(selector = '[data-src]') {
  const images = document.querySelectorAll(selector);
  
  const observer = createLazyObserver((img) => {
    if (img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      observer.unobserve(img);
    }
  });
  
  images.forEach(img => observer.observe(img));
  
  return observer;
}

/**
 * Batch DOM updates for better performance
 * @param {Function} callback - Function with DOM updates
 */
export function batchDOMUpdates(callback) {
  requestAnimationFrame(() => {
    callback();
  });
}

/**
 * Measure performance of function
 * @param {string} label - Performance label
 * @param {Function} fn - Function to measure
 * @returns {*} Function result
 */
export function measurePerformance(label, fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

/**
 * Check if user prefers reduced motion
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get connection quality (if available)
 * @returns {string} 'fast', 'slow', or 'unknown'
 */
export function getConnectionQuality() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  if (!connection) return 'unknown';
  
  if (connection.effectiveType === '4g' || connection.effectiveType === 'wifi') {
    return 'fast';
  }
  
  if (connection.effectiveType === '3g' || connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
    return 'slow';
  }
  
  return 'unknown';
}
