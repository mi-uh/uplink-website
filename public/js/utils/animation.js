/* ==========================================================
   ANIMATION UTILITIES
   ========================================================== */

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit time in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Animate value from start to end
 * @param {number} from - Start value
 * @param {number} to - End value
 * @param {number} duration - Duration in ms
 * @param {Function} callback - Callback with current value
 * @returns {Function} Cancel function
 */
export function animateValue(from, to, duration, callback) {
  const start = performance.now();
  let animationFrame;
  
  function update(currentTime) {
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (easeOutCubic)
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    
    callback(current);
    
    if (progress < 1) {
      animationFrame = requestAnimationFrame(update);
    }
  }
  
  animationFrame = requestAnimationFrame(update);
  
  // Return cancel function
  return () => cancelAnimationFrame(animationFrame);
}

/**
 * Wait for specified time
 * @param {number} ms - Time to wait in ms
 * @returns {Promise}
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Request animation frame promisified
 * @returns {Promise}
 */
export function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}
