/* ==========================================================
   EPISODE SERVICE - Episode Operations
   ========================================================== */

import DataService from '../core/DataService.js';

class EpisodeService {
  constructor() {
    this.dataUrl = '/data/dialogs.json';
    this.episodes = null;
  }

  normalizeEpisodes(rawEpisodes) {
    if (!Array.isArray(rawEpisodes)) return [];
    return rawEpisodes
      .map((ep, idx) => this.normalizeEpisode(ep, idx))
      .filter(Boolean);
  }

  normalizeEpisode(episode, index) {
    if (!episode) return null;
    const date = episode.date || null;
    const messages = Array.isArray(episode.messages) ? episode.messages : [];

    const normalizedMessages = messages.map((msg, i) => {
      const ts = msg.timestamp || this.syntheticTimestamp(date, i);
      return { ...msg, timestamp: ts };
    });

    return {
      ...episode,
      date,
      episode: episode.episode || index + 1,
      messages: normalizedMessages,
      terminal_blocks: episode.terminal_blocks || [],
      score_delta: episode.score_delta || episode.scoreDelta || {},
      metrics_update: episode.metrics_update || episode.metricsUpdate || {},
      state_snapshot: episode.state_snapshot || episode.stateSnapshot || null
    };
  }

  syntheticTimestamp(dateString, index) {
    const baseDate = dateString ? new Date(`${dateString}T03:14:00Z`) : new Date(Date.now());
    if (Number.isNaN(baseDate.getTime())) return null;
    baseDate.setMinutes(baseDate.getMinutes() + index * 3);
    return baseDate.toISOString();
  }

  /**
   * Get all episodes
   * @returns {Promise<Array>}
   */
  async getAllEpisodes() {
    if (this.episodes) return this.episodes;
    
    this.episodes = await DataService.fetch(this.dataUrl, {
      cache: true,
      cacheDuration: 300000, // 5 minutes
      validator: (data) => Array.isArray(data),
      transform: (data) => this.normalizeEpisodes(data)
    });
    
    return this.episodes;
  }

  /**
   * Get latest episode
   * @returns {Promise<Object|null>}
   */
  async getLatestEpisode() {
    const episodes = await this.getAllEpisodes();
    return episodes[episodes.length - 1] || null;
  }

  /**
   * Get episode by number
   * @param {number} episodeNum - Episode number (1-indexed)
   * @returns {Promise<Object|null>}
   */
  async getEpisodeByNumber(episodeNum) {
    const episodes = await this.getAllEpisodes();
    return episodes[episodeNum - 1] || null;
  }

  /**
   * Get episodes by phase
   * @param {string} phaseId - Phase ID
   * @returns {Promise<Array>}
   */
  async getEpisodesByPhase(phaseId) {
    const episodes = await this.getAllEpisodes();
    return episodes.filter(ep => ep.phase === phaseId);
  }

  /**
   * Sort episodes
   * @param {Array} episodes - Episodes array
   * @param {string} order - 'newest' or 'chrono'
   * @returns {Array}
   */
  sortEpisodes(episodes, order = 'newest') {
    const sorted = [...episodes];
    return order === 'newest' ? sorted.reverse() : sorted;
  }

  /**
   * Get episode metadata
   * @param {Object} episode - Episode object
   * @param {number} index - Episode index
   * @returns {Object}
   */
  getEpisodeMetadata(episode, index) {
    return {
      episodeNumber: index + 1,
      episodeString: String(index + 1).padStart(3, '0'),
      messageCount: episode.messages.length,
      hasTerminalBlocks: (episode.terminal_blocks || []).length > 0
    };
  }

  /**
   * Reload episodes (clear cache)
   */
  reload() {
    this.episodes = null;
    DataService.invalidate(this.dataUrl);
  }
}

export default new EpisodeService();
