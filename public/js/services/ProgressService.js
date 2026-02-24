/* ==========================================================
   PROGRESS SERVICE - Reading Progress Tracking
   ========================================================== */

import StorageService from './StorageService.js';
import EventBus from '../core/EventBus.js';

class ProgressService {
  constructor() {
    this.lastReadKey = 'last_read_episode';
    this.bookmarksKey = 'bookmarks';
  }

  /**
   * Get last read episode
   * @returns {number|null} Episode number
   */
  getLastRead() {
    return StorageService.get(this.lastReadKey, null);
  }

  /**
   * Set last read episode
   * @param {number} episodeNum - Episode number
   */
  setLastRead(episodeNum) {
    StorageService.set(this.lastReadKey, episodeNum);
    EventBus.emit('progress:updated', { episodeNum });
  }

  /**
   * Track episode view
   * @param {number} episodeNum - Episode number
   */
  trackEpisodeView(episodeNum) {
    const lastRead = this.getLastRead();
    if (!lastRead || episodeNum > lastRead) {
      this.setLastRead(episodeNum);
    }
  }

  /**
   * Get bookmarks
   * @returns {Array<number>} Array of episode numbers
   */
  getBookmarks() {
    return StorageService.get(this.bookmarksKey, []);
  }

  /**
   * Toggle bookmark
   * @param {number} episodeNum - Episode number
   * @returns {boolean} New bookmark state
   */
  toggleBookmark(episodeNum) {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(episodeNum);
    
    if (index > -1) {
      bookmarks.splice(index, 1);
      StorageService.set(this.bookmarksKey, bookmarks);
      EventBus.emit('bookmark:removed', { episodeNum });
      return false;
    } else {
      bookmarks.push(episodeNum);
      StorageService.set(this.bookmarksKey, bookmarks);
      EventBus.emit('bookmark:added', { episodeNum });
      return true;
    }
  }

  /**
   * Check if episode is bookmarked
   * @param {number} episodeNum - Episode number
   * @returns {boolean}
   */
  isBookmarked(episodeNum) {
    const bookmarks = this.getBookmarks();
    return bookmarks.includes(episodeNum);
  }

  /**
   * Clear all progress
   */
  clearAll() {
    StorageService.remove(this.lastReadKey);
    StorageService.remove(this.bookmarksKey);
    EventBus.emit('progress:cleared');
  }
}

export default new ProgressService();
