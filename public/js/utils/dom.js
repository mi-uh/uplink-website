/* ==========================================================
   DOM UTILITIES
   ========================================================== */

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {Array|string} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.substring(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  
  // Add children
  if (typeof children === 'string') {
    element.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof HTMLElement) {
        element.appendChild(child);
      }
    });
  }
  
  return element;
}

/**
 * Query selector helper
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (default: document)
 * @returns {HTMLElement|null}
 */
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Query selector all helper
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (default: document)
 * @returns {Array<HTMLElement>}
 */
export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

/**
 * Add event listener with automatic cleanup
 * @param {HTMLElement} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 * @returns {Function} Cleanup function
 */
export function on(element, event, handler, options = {}) {
  element.addEventListener(event, handler, options);
  return () => element.removeEventListener(event, handler, options);
}

/**
 * Delegate event handling
 * @param {HTMLElement} parent - Parent element
 * @param {string} selector - Child selector
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Cleanup function
 */
export function delegate(parent, selector, event, handler) {
  const wrappedHandler = (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler.call(target, e);
    }
  };
  
  parent.addEventListener(event, wrappedHandler);
  return () => parent.removeEventListener(event, wrappedHandler);
}
