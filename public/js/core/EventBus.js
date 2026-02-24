/* ==========================================================
   EVENT BUS - Global Event System
   ========================================================== */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to event
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to event once
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   */
  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from event
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   */
  off(event, callback) {
    if (!this.events.has(event)) return;
    
    const callbacks = this.events.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.events.has(event)) return;
    
    const callbacks = this.events.get(event);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
  }

  /**
   * Clear all listeners for event
   * @param {string} event - Event name (optional, clears all if not provided)
   */
  clear(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

export default new EventBus();
