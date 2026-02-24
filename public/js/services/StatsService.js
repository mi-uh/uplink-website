/* ==========================================================
   STATS SERVICE - Statistics & Scores
   ========================================================== */

import DataService from '../core/DataService.js';

class StatsService {
  constructor() {
    this.dataUrl = '/data/stats.json';
    this.configUrl = '/data/config.json';
    this.stats = null;
    this.config = null;
  }

  /**
   * Get stats
   * @returns {Promise<Object>}
   */
  async getStats() {
    if (this.stats) return this.stats;
    
    this.stats = await DataService.fetch(this.dataUrl, {
      cache: true,
      cacheDuration: 300000 // 5 minutes
    });
    
    return this.stats;
  }

  /**
   * Get config
   * @returns {Promise<Object>}
   */
  async getConfig() {
    if (this.config) return this.config;
    
    this.config = await DataService.fetch(this.configUrl, {
      cache: true,
      cacheDuration: 3600000 // 1 hour
    });
    
    return this.config;
  }

  /**
   * Get score categories
   * @returns {Promise<Array>}
   */
  async getScoreCategories() {
    const config = await this.getConfig();
    return config.scoring.categories;
  }

  /**
   * Get metrics definitions
   * @returns {Promise<Array>}
   */
  async getMetrics() {
    const config = await this.getConfig();
    return config.scoring.metrics;
  }

  /**
   * Get story arc phases
   * @returns {Promise<Array>}
   */
  async getPhases() {
    const config = await this.getConfig();
    return config.story_arc.phases;
  }

  /**
   * Get current phase
   * @returns {Promise<Object|null>}
   */
  async getCurrentPhase() {
    const [stats, phases] = await Promise.all([
      this.getStats(),
      this.getPhases()
    ]);
    
    const currentDay = stats.current_day || 1;
    return phases.find(phase => 
      currentDay >= phase.days[0] && currentDay <= phase.days[1]
    );
  }

  /**
   * Reload stats (clear cache)
   */
  reload() {
    this.stats = null;
    this.config = null;
    DataService.invalidate(this.dataUrl);
    DataService.invalidate(this.configUrl);
  }
}

export default new StatsService();
