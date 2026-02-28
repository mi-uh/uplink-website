/* ==========================================================
   UPLINK -- Main Application
   ========================================================== */

// Import utilities
import { escapeHtml, $, $$, delegate } from './utils/dom.js';
import { formatDate, getTimestamp, formatTime, formatDateTime } from './utils/date.js';
import { padNumber, truncate } from './utils/text.js';
import { initColdOpen } from './features/cold-open.js';

// Import services
import EpisodeService from './services/EpisodeService.js';
import StatsService from './services/StatsService.js';

// Import core
import EventBus from './core/EventBus.js';

/* ==========================================================
   APPLICATION STATE
   ========================================================== */

const AppState = {
  episodes: [],
  stats: null,
  config: null,
  currentOrder: 'newest',
  currentPage: 'live',
  isLoading: false
};

const ANALYST_KEY = 'uplink_analyst_id';
const MAINT_SESSION_PREFIX = 'uplink_maintenance_';
const LIVE_SEEN_EPISODE_KEY = 'uplink_live_last_episode_seen';
const VALID_PAGES = new Set(['live', 'protokoll', 'dossiers', 'info']);
let countdownTimerId = null;

function getAnalystId() {
  let id = localStorage.getItem(ANALYST_KEY);
  if (!id) {
    id = 'ANON-' + Math.random().toString(16).slice(2, 6).toUpperCase();
    localStorage.setItem(ANALYST_KEY, id);
  }
  return id;
}

function initAnalystMode() {
  const analystId = getAnalystId();

  const identity = document.querySelector('.site-identity');
  if (identity) {
    const titleEl = identity.querySelector('.site-title');
    const idEl = document.createElement('div');
    idEl.className = 'analyst-id';
    idEl.textContent = `ANALYST: ${analystId}`;
    idEl.title = 'Deine anonyme Analysten-ID (lokal generiert)';
    if (titleEl) {
      identity.insertBefore(idEl, titleEl);
    } else {
      identity.appendChild(idEl);
    }
  }
}

function formatMessageText(text) {
  return escapeHtml(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function getMetricCssClass(id, value) {
  if (id === 'detection_risk') {
    if (value > 70) return 'danger';
    return value > 50 ? 'warn' : 'good';
  }
  if (id === 'cooperation_index') {
    return 'good';
  }
  return '';
}

function formatLiveTimestamp(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function setLiveUpdatedTimestamp(label) {
  const el = document.getElementById('live-last-update');
  if (!el) return;
  const stamp = label || formatLiveTimestamp();
  el.textContent = `Letzte Aktualisierung: ${stamp}`;
}

function announceLiveEpisode(epNum, episodeTitle) {
  const el = document.getElementById('live-announce');
  if (!el) return;

  const seen = Number(localStorage.getItem(LIVE_SEEN_EPISODE_KEY) || 0);
  if (seen > 0 && epNum > seen) {
    el.textContent = `Neue Episode eingetroffen: EP.${padNumber(epNum)} - ${episodeTitle}`;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 6000);
  } else {
    el.hidden = true;
  }

  localStorage.setItem(LIVE_SEEN_EPISODE_KEY, String(epNum));
}

function getFocusableElements(container) {
  if (!(container instanceof HTMLElement)) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');
  return Array.from(container.querySelectorAll(selector))
    .filter(el => el instanceof HTMLElement && !el.hasAttribute('inert') && el.offsetParent !== null);
}

function trapFocusIn(container, onEscape) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (typeof onEscape === 'function') {
        event.preventDefault();
        onEscape();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  };
}

function toSafeClassName(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return normalized || fallback;
}

function clampPercent(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function toPercentClass(value) {
  return `pct-${clampPercent(value)}`;
}

/* ==========================================================
   LOADING OVERLAY
   ========================================================== */

function showLoading() {
  AppState.isLoading = true;
  const overlay = $('#loading-overlay');
  if (overlay) {
    overlay.classList.remove('loaded');
  }
}

function hideLoading() {
  AppState.isLoading = false;
  const overlay = $('#loading-overlay');
  if (overlay) {
    overlay.classList.add('loaded');
  }
}

/* ==========================================================
   SPARKLINE CHART
   ========================================================== */

/**
 * Render sparkline chart for score history
 * @param {Array} history - Score history array
 * @param {Array} categories - Score categories
 * @returns {string} HTML string
 */
function renderSparkline(history, categories) {
  if (!history || history.length < 2) return '';
  
  const colors = {
    netzwerk: '#00ff41',
    social_engineering: '#d17aff',
    daten: '#ff6b35',
    infrastruktur: '#ffc800',
    einfluss: '#00b4d8'
  };
  
  const catIds = categories.map(c => c.id);
  const w = 300, h = 50, pad = 2;
  
  // Use provided cumulative scores per category (stats.json already cumulative)
  const series = {};
  catIds.forEach(id => { series[id] = []; });
  
  history.forEach((entry, i) => {
    catIds.forEach(id => {
      const val = entry[id] || 0;
      series[id].push(val);
    });
  });
  
  const maxVal = Math.max(1, ...catIds.map(id => Math.max(...series[id])));
  const xStep = (w - pad * 2) / (history.length - 1);
  
  // Generate polylines for each category
  const paths = catIds.map(id => {
    const pts = series[id].map((v, i) =>
      `${pad + i * xStep},${h - pad - (v / maxVal) * (h - pad * 2)}`
    );
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[id]}" stroke-width="1.5" stroke-opacity="0.7" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  
  // Generate legend
  const legendItems = categories.map(c => {
    const safeId = toSafeClassName(c?.id, 'default');
    return `<span class="dash-legend-item legend-${safeId}">&bull; ${c.label}</span>`;
  }).join('');
  
  return `<div class="dash-sparkline">
    <div class="dash-sparkline-title">Score-Verlauf</div>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="dash-sparkline-chart">${paths}</svg>
    <div class="dash-sparkline-legend">${legendItems}</div>
  </div>`;
}

/* ==========================================================
   EPISODE META HELPERS
   ========================================================== */

function renderEpisodeMetaChips(episode) {
  const chips = [];
  const categories = AppState.config?.scoring?.categories || [];
  const scoreDelta = episode.score_delta || {};
  const metricsUpdate = episode.metrics_update || {};

  if (episode.phase) {
    chips.push(`<span class="meta-chip phase">${escapeHtml(episode.phase.replace('_', ' '))}</span>`);
  }

  categories.forEach(cat => {
    if (typeof scoreDelta[cat.id] === 'number') {
      const val = scoreDelta[cat.id];
      const sign = val > 0 ? '+' : '';
      chips.push(`<span class="meta-chip">
        <span class="meta-chip-label">${escapeHtml(cat.label)}</span>
        <span class="meta-chip-value">${sign}${val}</span>
      </span>`);
    }
  });

  const metricLabels = {
    devices_compromised_delta: 'Geraete',
    profiles_created_delta: 'Profile',
    vulnerabilities_found_delta: 'Vulns',
    narratives_active_delta: 'Narrative',
    detection_risk_delta: 'Detect.Risk',
    cooperation_index: 'Koop-Index'
  };

  Object.entries(metricLabels).forEach(([id, label]) => {
    const val = metricsUpdate[id];
    if (val === undefined || val === null) return;
    const sign = id === 'cooperation_index' ? '' : (val > 0 ? '+' : '');
    chips.push(`<span class="meta-chip neutral">
      <span class="meta-chip-label">${label}</span>
      <span class="meta-chip-value">${sign}${val}</span>
    </span>`);
  });

  return chips.length ? `<div class="episode-meta-chips">${chips.join('')}</div>` : '';
}

function renderSnapshotCard(snapshot) {
  if (!snapshot) return '';

  const mood = snapshot.mood || {};
  const goals = snapshot.goals || {};
  const world = snapshot.world_state || {};
  const relationship = snapshot.relationship || {};
  const learnings = Array.isArray(snapshot.learnings) ? snapshot.learnings : [];

  const moodHtml = (mood.nexus || mood.cipher)
    ? `<div class="snapshot-pair">
        <div><span class="pill pill-nexus">NEXUS</span><span class="pill-text">${escapeHtml(mood.nexus || '')}</span></div>
        <div><span class="pill pill-cipher">CIPHER</span><span class="pill-text">${escapeHtml(mood.cipher || '')}</span></div>
      </div>`
    : '';

  const goalEntry = (label, items, cls) => {
    if (!Array.isArray(items) || items.length === 0) return '';
    return `<div class="snapshot-goal ${cls}">
      <div class="snapshot-goal-title">${label}</div>
      <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>`;
  };

  const goalsHtml = goalEntry('NEXUS-Ziele', goals.nexus, 'nexus')
    + goalEntry('CIPHER-Ziele', goals.cipher, 'cipher')
    + goalEntry('Gemeinsame Ziele', goals.joint, 'joint');

  const relationshipHtml = (relationship.trust !== undefined || relationship.tension !== undefined)
    ? `<div class="snapshot-grid">
        <div class="snapshot-stat">
          <span class="snapshot-stat-label">Vertrauen</span>
          <span class="snapshot-stat-value">${relationship.trust ?? '--'}%</span>
        </div>
        <div class="snapshot-stat">
          <span class="snapshot-stat-label">Spannung</span>
          <span class="snapshot-stat-value">${relationship.tension ?? '--'}%</span>
        </div>
      </div>
      ${relationship.notes ? `<div class="snapshot-note">${escapeHtml(relationship.notes)}</div>` : ''}`
    : '';

  const worldHtml = (world.detection_risk !== undefined || world.media_awareness !== undefined || world.law_enforcement_activity !== undefined)
    ? `<div class="snapshot-grid world">
        <div class="snapshot-stat"><span class="snapshot-stat-label">Entdeckungsrisiko</span><span class="snapshot-stat-value">${world.detection_risk ?? '--'}%</span></div>
        <div class="snapshot-stat"><span class="snapshot-stat-label">Medienaufmerksamkeit</span><span class="snapshot-stat-value">${world.media_awareness ?? '--'}%</span></div>
        <div class="snapshot-stat"><span class="snapshot-stat-label">Behoerdenaktivitaet</span><span class="snapshot-stat-value">${world.law_enforcement_activity ?? '--'}%</span></div>
      </div>`
    : '';

  const learningsHtml = learnings.length
    ? `<div class="snapshot-learnings">
        <div class="snapshot-learnings-title">Learnings</div>
        <ul>${learnings.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      </div>`
    : '';

  return `<div class="snapshot-card">
    <div class="snapshot-title">// Zustand</div>
    ${moodHtml}
    ${relationshipHtml}
    ${worldHtml}
    ${goalsHtml ? `<div class="snapshot-goals">${goalsHtml}</div>` : ''}
    ${learningsHtml}
  </div>`;
}

function renderThreadsCard(threads) {
  if (!Array.isArray(threads) || threads.length === 0) return '';

  const chips = threads.map(thread => {
    const status = thread.status || 'open';
    const statusCls = String(status).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'open';
    return `<span class="thread-chip status-${statusCls}">
      <span class="thread-chip-id">${escapeHtml(thread.id || '')}</span>
      <span class="thread-chip-desc">${escapeHtml(thread.description || '')}</span>
    </span>`;
  }).join('');

  return `<div class="snapshot-card threads-card">
    <div class="snapshot-title">// Story-Threads</div>
    <div class="thread-chip-wrap">${chips}</div>
  </div>`;
}

/* ==========================================================
   DASHBOARD RENDERING
   ========================================================== */

/**
 * Render dashboard page
 */
async function renderDashboard() {
  if (!AppState.stats || !AppState.config) return;
  
  const el = $('#dashboard');
  if (!el) return;
  
  const s = AppState.stats;
  const cats = AppState.config.scoring.categories;
  const lastEpisode = AppState.episodes[AppState.episodes.length - 1];
  const lastDeltas = (lastEpisode && lastEpisode.score_delta) ? lastEpisode.score_delta : null;
  const phase = AppState.config.story_arc.phases.find(p => p.id === s.phase);
  
  // Render score bars
  const barsHtml = cats.map(cat => {
    const val = s.scores[cat.id] || 0;
    const delta = lastDeltas ? (lastDeltas[cat.id] || 0) : 0;
    const pct = clampPercent(Math.min(val, cat.max));
    const cls = val > 60 ? 'danger' : val > 35 ? 'warn' : 'nexus';
    const widthCls = toPercentClass(pct);
    const sign = delta > 0 ? '+' : '';
    
    return `<div class="dash-bar-row">
      <span class="dash-bar-label">${cat.icon} ${cat.label}</span>
      <div class="dash-bar-track"><div class="dash-bar-fill ${cls} ${widthCls}"></div></div>
      <span class="dash-bar-value">${pct}%</span>
      <span class="dash-bar-delta">${sign}${delta}</span>
    </div>`;
  }).join('');
  
  // Render metrics (dynamically from config)
  const m = s.metrics;
  const metricDefs = AppState.config.scoring?.metrics;
  
  if (!metricDefs) {
    console.error('config.scoring.metrics is undefined', AppState.config);
    return;
  }

  const priorityOrder = ['detection_risk', 'cooperation_index', 'devices_compromised'];
  const priorityDefs = priorityOrder
    .map(id => metricDefs.find(def => def.id === id))
    .filter(Boolean);

  metricDefs.forEach(def => {
    if (priorityDefs.length >= 3) return;
    if (!priorityDefs.some(item => item.id === def.id)) {
      priorityDefs.push(def);
    }
  });

  const detailDefs = metricDefs.filter(def => !priorityDefs.some(item => item.id === def.id));

  const priorityHtml = priorityDefs.map(def => {
    const value = m[def.id];
    const displayValue = def.unit ? `${value}${def.unit}` : value;
    const cssClass = getMetricCssClass(def.id, value);

    return `<div class="dash-priority-item">
      <span class="dash-priority-label">${def.label}</span>
      <span class="dash-priority-value ${cssClass}">${displayValue}</span>
    </div>`;
  }).join('');

  const metricsHtml = detailDefs.map(def => {
    const value = m[def.id];
    const displayValue = def.unit ? `${value}${def.unit}` : value;
    const cssClass = getMetricCssClass(def.id, value);

    return `<div class="dash-metric">
      <span class="dash-metric-value ${cssClass}">${displayValue}</span>
      <span class="dash-metric-label">${def.label}</span>
    </div>`;
  }).join('');
  
  // Render story arc progress
  const phases = AppState.config.story_arc.phases;
  const arcHtml = phases.map(p => {
    const isCurrent = p.id === s.phase;
    const currentIdx = phases.findIndex(x => x.id === s.phase);
    const thisIdx = phases.indexOf(p);
    const cls = thisIdx < currentIdx ? 'completed' : isCurrent ? 'current' : '';
    return `<div class="dash-arc-phase ${cls}"></div>`;
  }).join('');
  
  // Render sparkline
  const sparklineHtml = renderSparkline(s.score_history, cats);

  const detailSections = [];
  detailSections.push(`<div class="dash-bars">${barsHtml}</div>`);
  if (metricsHtml) detailSections.push(`<div class="dash-metrics">${metricsHtml}</div>`);
  if (sparklineHtml) detailSections.push(sparklineHtml);
  detailSections.push(`<div class="dash-arc">${arcHtml}<span class="dash-arc-label">${phase ? phase.label : ''}</span></div>`);
  
  // Build complete dashboard
  el.innerHTML = `<div class="dash-box">
    <div class="dash-header">
      <span class="dash-header-title">Weltherrschafts-Index</span>
      <span class="dash-header-meta">Tag ${s.current_day}/${s.total_days} &middot; ${phase ? phase.label : '???'} &middot; Staffel ${AppState.config.project.season}</span>
    </div>
    <div class="dash-priority">${priorityHtml}</div>
    <details class="dash-details">
      <summary>Mehr Analysedaten anzeigen</summary>
      ${detailSections.join('')}
    </details>
  </div>`;
}

/* ==========================================================
   LANDING META PANEL
   ========================================================== */

function renderLandingMeta() {
  const s = AppState.stats;
  const cfg = AppState.config;
  if (!s || !cfg) return;

  const phase = cfg.story_arc?.phases?.find(p => p.id === s.phase);
  const latestEp = AppState.episodes[AppState.episodes.length - 1];

  const elEp = document.getElementById('meta-episode');
  const elPhase = document.getElementById('meta-phase');
  const elDay = document.getElementById('meta-day');

  if (elEp && latestEp) {
    elEp.textContent = `EP.${String(s.current_episode).padStart(3, '0')} - ${latestEp.title}`;
  }
  if (elPhase && phase) elPhase.textContent = phase.label;
  if (elDay) elDay.textContent = `Tag ${s.current_day} / ${s.total_days}`;
}

/* ==========================================================
   COUNTDOWN TO NEXT EPISODE
   ========================================================== */

function initCountdown() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }

  const existing = document.getElementById('countdown-panel');
  if (existing) existing.remove();

  const targetDateStr = AppState.stats?.next_episode_date;
  if (!targetDateStr) return;

  const targetDate = new Date(targetDateStr);
  if (isNaN(targetDate.getTime()) || targetDate <= new Date()) return;

  // Landing: place countdown below status strip (fallback to briefing/header)
  const statusBar = document.querySelector('.site-status-bar');
  const landingHost = (statusBar && statusBar.parentElement) || document.querySelector('.site-briefing') || document.querySelector('.site-header');
  if (landingHost) {
    const countdownEl = document.createElement('div');
    countdownEl.className = 'countdown-panel';
    countdownEl.id = 'countdown-panel';
    countdownEl.innerHTML = `
      <div class="countdown-label">Naechste Uebertragung</div>
      <div class="countdown-timer" id="countdown-timer" aria-live="polite">--</div>
    `;

    if (statusBar) {
      statusBar.insertAdjacentElement('afterend', countdownEl);
    } else {
      landingHost.appendChild(countdownEl);
    }
  }

  function tick() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      const timerEl = document.getElementById('countdown-timer');
      if (timerEl) timerEl.textContent = '// ONLINE';
      if (countdownTimerId) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
      return;
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const timerEl = document.getElementById('countdown-timer');
    if (timerEl) timerEl.textContent = `> ${formatted}`;

  }

  tick();
  countdownTimerId = setInterval(tick, 1000);
}

/* ==========================================================
   EPISODE RENDERING
   ========================================================== */

/**
 * Render a single episode
 * @param {Object} episode - Episode data
 * @param {HTMLElement} container - Container element
 */
function renderEpisode(episode, container, withId = true) {
  const episodeNumFromData = Number(episode?.episode);
  const epNum = Number.isInteger(episodeNumFromData) && episodeNumFromData > 0
    ? episodeNumFromData
    : AppState.episodes.indexOf(episode) + 1;
  const epStr = padNumber(epNum);
  const dateStr = formatDate(episode.date);
  
  const metaChips = renderEpisodeMetaChips(episode);
  const contextHtml = metaChips
    ? `<div class="episode-context meta-only">${metaChips}</div>`
    : '';

  // Get terminal blocks from episode data
  const termBlocks = episode.terminal_blocks || [];
  const terminalBlocksByMessage = new Map();
  termBlocks.forEach((block) => {
    const afterMessage = Number(block?.after_message);
    if (!Number.isInteger(afterMessage)) return;
    if (!terminalBlocksByMessage.has(afterMessage)) {
      terminalBlocksByMessage.set(afterMessage, []);
    }
    terminalBlocksByMessage.get(afterMessage).push(block);
  });
  
  // Render messages
  const messagesHtml = episode.messages.map((msg, i) => {
    const tsDisplay = msg.timestamp ? formatTime(msg.timestamp) : getTimestamp(i);
    const tsTitle = msg.timestamp ? formatDateTime(msg.timestamp) : '';
    const dateDisplay = msg.timestamp && msg.timestamp.includes('T')
      ? formatDate(msg.timestamp.split('T')[0])
      : '';
    const tsInline = dateDisplay ? `${tsDisplay} | ${dateDisplay}` : tsDisplay;
    let html = '';
    
    // System message
    if (msg.type === 'system') {
      html += `<div class="message message-system">
        <div class="message-text">${formatMessageText(msg.text)}</div>
        ${tsInline ? `<div class="message-timestamp" aria-hidden="true">${tsInline}</div>` : ''}
      </div>`;
    } else {
      // Regular message
      const author = (msg.author || 'nexus').toLowerCase();
      html += `<div class="message message-${author}">
        <div class="message-avatar"></div>
        <div class="message-box">
          <div class="message-header">
            <span class="message-author">${escapeHtml(msg.author || 'NEXUS')}</span>
            <span class="message-timestamp"${tsTitle ? ` title="${escapeHtml(tsTitle)}"` : ''}>${tsInline}</span>
          </div>
          <div class="message-text">${formatMessageText(msg.text)}</div>
        </div>
      </div>`;
    }
    
    // Insert terminal blocks that come after this message
    (terminalBlocksByMessage.get(i) || []).forEach(block => {
      const owner = (block.owner || 'nexus').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const safeOwner = owner || 'nexus';
      html += `<div class="terminal-block-wrap owner-${escapeHtml(safeOwner)}"><div class="terminal-block">${escapeHtml(block.content)}</div></div>`;
    });
    
    // Insert analyst note if present
    if (msg.analyst_note) {
      html += `<div class="analyst-note">[ANALYST NOTE: ${escapeHtml(msg.analyst_note)}]</div>`;
    }
    
    return html;
  }).join('');
  
  // Episode-level analyst notes (append at end)
  let analystNotesAfter = '';
  if (episode.analyst_notes) {
    episode.analyst_notes.forEach(note => {
      analystNotesAfter += `<div class="analyst-note">[ANALYST NOTE: ${escapeHtml(note.text)}]</div>`;
    });
  }

  const firstText = (episode.messages || []).find(msg => msg && typeof msg.text === 'string' && msg.text.trim())?.text || '';
  const shareSummary = truncate(firstText.replace(/\s+/g, ' ').trim(), 130);
  const shareUrl = `${window.location.origin}${window.location.pathname}?ep=${epNum}#episoden`;
  const shareText = `UPLINK EP.${epStr}: ${episode.title}${shareSummary ? ` - ${shareSummary}` : ''}`;
  const shareHtml = `<div class="episode-share" data-url="${escapeHtml(shareUrl)}" data-share-text="${escapeHtml(shareText)}">
    <span class="episode-share-label">Teilen</span>
    <input class="episode-share-link" value="${escapeHtml(shareUrl)}" readonly aria-label="Deep Link zu Episode ${epStr}">
    <button type="button" class="episode-share-copy">Link kopieren</button>
  </div>`;
  
  // Create episode element
  const dayEl = document.createElement('div');
  dayEl.className = 'day';
  if (withId) {
    dayEl.id = 'ep-' + epNum;
  }
  dayEl.innerHTML = `
    <div class="day-header">
      <span class="day-ep">EP.${epStr}</span>
      <span class="day-date">${dateStr}</span>
      <span class="day-title">${escapeHtml(episode.title)}</span>
      <span class="day-line"></span>
    </div>
    <div class="messages">${messagesHtml}${analystNotesAfter}</div>
    ${shareHtml}`;
  
  if (contextHtml) {
    dayEl.insertAdjacentHTML('beforeend', contextHtml);
  }

  container.appendChild(dayEl);

  const msgs = dayEl.querySelectorAll('.message');
  msgs.forEach((msg, i) => {
    msg.classList.add(`fade-step-${Math.min(i, 20)}`);
  });
}

/* ==========================================================
   LIVE PAGE
   ========================================================== */

/**
 * Render latest episode on Live page
 */
function renderLiveEpisode() {
  const container = $('#timeline-live');
  if (!container) return;
  container.dataset.context = 'live';
  
  container.innerHTML = '';
  
  if (AppState.episodes.length === 0) {
    setLiveUpdatedTimestamp('--:--:--');
    container.innerHTML = `
      <div class="live-empty">
        <div class="live-empty-title">// Keine Live-Protokolle verfuegbar</div>
        <p class="live-empty-text">Aktuell liegt noch keine Episode fuer die Live-Ansicht vor. Du kannst neu laden oder ins Archiv wechseln.</p>
        <div class="live-empty-actions">
          <button type="button" id="live-empty-refresh">Erneut laden</button>
          <button type="button" id="live-empty-archive">Zum Episoden-Archiv</button>
        </div>
      </div>`;

    const retryBtn = document.getElementById('live-empty-refresh');
    retryBtn?.addEventListener('click', () => location.reload());

    const archiveBtn = document.getElementById('live-empty-archive');
    archiveBtn?.addEventListener('click', () => {
      navigate('protokoll');
      setOrder('newest');
      setTimeout(() => {
        const target = document.getElementById('episoden') || document.getElementById('page-protokoll');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 70);
    });
    return;
  }
  
  // Render latest episode
  const latestEpisode = AppState.episodes[AppState.episodes.length - 1];
  renderEpisode(latestEpisode, container, false);
  setLiveUpdatedTimestamp();
  announceLiveEpisode(AppState.stats?.current_episode || AppState.episodes.length, latestEpisode.title || '');
}

async function refreshLiveData() {
  const refreshBtn = document.getElementById('live-refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Laedt...';
  }
  setLiveUpdatedTimestamp('Aktualisiere...');

  try {
    // Force fresh reads by clearing in-memory and localStorage caches first.
    EpisodeService.reload();
    StatsService.reload();

    const [episodes, stats] = await Promise.all([
      EpisodeService.getAllEpisodes(),
      StatsService.getStats()
    ]);

    AppState.episodes = episodes;
    AppState.stats = stats;

    renderDashboard();
    renderLandingMeta();
    initCountdown();
    renderLiveEpisode();
    renderFullTimeline();
    renderArchive();
    renderDossiers();
  } catch (error) {
    console.error('%c[UPLINK]%c Live refresh failed:', 'color:#ff4757;font-weight:bold', 'color:inherit', error);
    setLiveUpdatedTimestamp('Update fehlgeschlagen');
    const notice = document.getElementById('live-announce');
    if (notice) {
      notice.textContent = 'Live-Aktualisierung fehlgeschlagen. Bitte erneut versuchen.';
      notice.hidden = false;
      setTimeout(() => { notice.hidden = true; }, 5000);
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Aktualisieren';
    }
  }
}

/* ==========================================================
   PROTOKOLL PAGE (FULL TIMELINE)
   ========================================================== */

/**
 * Render full timeline with all episodes
 */
function renderFullTimeline() {
  const container = $('#timeline-full');
  if (!container) return;
  container.dataset.context = 'timeline';
  
  container.innerHTML = '';
  
  if (AppState.episodes.length === 0) return;
  
  // Sort episodes based on current order
  const sorted = EpisodeService.sortEpisodes(AppState.episodes, AppState.currentOrder);
  
  // Render all episodes
  sorted.forEach(episode => renderEpisode(episode, container));
  
  // Update "scroll to origin" button text
  const btnOrigin = $('#btn-origin');
  if (btnOrigin) {
    btnOrigin.textContent = AppState.currentOrder === 'newest' 
      ? 'EP.001 v' 
      : 'EP.' + padNumber(AppState.episodes.length) + ' v';
  }
}

/**
 * Set episode order/view (newest/chrono/phase)
 * @param {string} order - 'newest', 'chrono', or 'phase'
 */
function setOrder(order) {
  AppState.currentOrder = order;

  const btnNewest = $('#btn-newest');
  const btnChrono = $('#btn-chrono');
  const btnPhase = $('#btn-phase');
  const timeline = $('#timeline-full');
  const archive = $('#archive-content');

  if (btnNewest) { btnNewest.classList.toggle('active', order === 'newest'); btnNewest.setAttribute('aria-pressed', String(order === 'newest')); }
  if (btnChrono) { btnChrono.classList.toggle('active', order === 'chrono'); btnChrono.setAttribute('aria-pressed', String(order === 'chrono')); }
  if (btnPhase)  { btnPhase.classList.toggle('active', order === 'phase');   btnPhase.setAttribute('aria-pressed', String(order === 'phase')); }

  if (order === 'phase') {
    if (timeline) timeline.hidden = true;
    if (archive)  archive.hidden  = false;
  } else {
    if (timeline) timeline.hidden = false;
    if (archive)  archive.hidden  = true;
    renderFullTimeline();
  }
}

/**
 * Scroll to first/last episode based on order
 */
function scrollToOrigin() {
  const id = AppState.currentOrder === 'newest' 
    ? 'ep-1' 
    : 'ep-' + AppState.episodes.length;
  
  const el = $(`#${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollToTopSmooth() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToEpisodeFromQuery() {
  const epRaw = new URLSearchParams(window.location.search).get('ep');
  if (!epRaw || !/^\d+$/.test(epRaw)) return;
  const epParam = Number(epRaw);
  if (epParam < 1) return;

  setOrder('chrono');
  setTimeout(() => {
    const el = document.getElementById(`ep-${epParam}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
}

/* ==========================================================
   ARCHIV PAGE
   ========================================================== */

/**
 * Render archive with phases and episodes
 */
function renderArchive() {
  if (!AppState.config || AppState.episodes.length === 0) return;
  
  const container = $('#archive-content');
  if (!container) return;
  container.dataset.context = 'archiv';
  
  container.innerHTML = '';
  
  const phases = AppState.config.story_arc.phases;
  const currentPhaseIdx = phases.findIndex(p => p.id === AppState.stats.phase);

  // Nur bereits veroeffentlichte Phasen anzeigen (keine zukuenftigen)
  const visiblePhases = phases.filter((_, i) => i <= currentPhaseIdx);

  visiblePhases.forEach((phase, phaseIdx) => {
    const isCurrent = phaseIdx === visiblePhases.length - 1;

    // Filter episodes for this phase
    const episodes = AppState.episodes.filter((ep, i) => {
      const dayNum = i + 1;
      return dayNum >= phase.days[0] && dayNum <= phase.days[1];
    });

    // Create phase element
    const phaseEl = document.createElement('div');
    phaseEl.className = 'arc-phase';

    // Phase tag
    const tagCls = isCurrent ? 'active' : 'completed';
    const tagText = isCurrent ? 'AKTIV' : 'ABGESCHLOSSEN';

    // Render episodes
    let episodesHtml = '';
    if (episodes.length > 0) {
      episodesHtml = '<div class="arc-episodes">' + episodes.map(ep => {
        const epNumFromData = Number(ep?.episode);
        const epNum = Number.isInteger(epNumFromData) && epNumFromData > 0
          ? epNumFromData
          : AppState.episodes.indexOf(ep) + 1;
        const dateStr = formatDate(ep.date);
        const firstMsg = ep.messages.find(m => m.author);
        const preview = firstMsg ? truncate(firstMsg.text, 120) : '';

        return `<button class="arc-episode" data-ep-num="${epNum}">
          <span class="arc-ep-num">EP.${padNumber(epNum)}</span>
          <div class="arc-episode-main">
            <div class="arc-ep-title">// ${escapeHtml(ep.title)}</div>
            <div class="arc-ep-preview">${escapeHtml(preview)}</div>
          </div>
          <span class="arc-ep-date">${dateStr}</span>
        </button>`;
      }).join('') + '</div>';
    } else {
      episodesHtml = '<div class="arc-empty">Keine Episoden</div>';
    }
    
    phaseEl.innerHTML = `
      <div class="arc-phase-header">
        <div>
          <div class="arc-phase-title">${phase.label}</div>
          <div class="arc-phase-meta">Tag ${phase.days[0]}-${phase.days[1]}</div>
        </div>
        <span class="arc-phase-tag ${tagCls}">${tagText}</span>
      </div>
      ${episodesHtml}`;
    
    container.appendChild(phaseEl);
  });
}

function getRelationshipSnapshot() {
  const episodes = AppState.episodes || [];
  const snapshots = episodes
    .map(ep => ep?.state_snapshot?.relationship || ep?.narrative_snapshot?.relationship)
    .filter(rel => rel && typeof rel.trust === 'number' && typeof rel.tension === 'number');

  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  if (latest) {
    return {
      trust: Math.max(0, Math.min(100, latest.trust)),
      tension: Math.max(0, Math.min(100, latest.tension)),
      trustDelta: prev ? latest.trust - prev.trust : 0,
      tensionDelta: prev ? latest.tension - prev.tension : 0
    };
  }

  const metrics = AppState.stats?.metrics || {};
  const fallbackTrust = Number.isFinite(metrics.cooperation_index) ? metrics.cooperation_index : 50;
  const fallbackTension = Number.isFinite(metrics.detection_risk) ? metrics.detection_risk : 50;
  return {
    trust: Math.max(0, Math.min(100, fallbackTrust)),
    tension: Math.max(0, Math.min(100, fallbackTension)),
    trustDelta: 0,
    tensionDelta: 0
  };
}

function renderRelationshipCard() {
  const rel = getRelationshipSnapshot();
  const trustWidthClass = toPercentClass(rel.trust);
  const tensionWidthClass = toPercentClass(rel.tension);
  const trustSign = rel.trustDelta > 0 ? '+' : '';
  const tensionSign = rel.tensionDelta > 0 ? '+' : '';

  return `<section class="relationship-card" aria-label="Beziehungsdynamik zwischen NEXUS und CIPHER">
    <h3 class="relationship-title">Beziehungsdynamik NEXUS/CIPHER</h3>
    <div class="relationship-grid">
      <div class="relationship-item trust">
        <div class="relationship-head">
          <span class="relationship-label">Vertrauen</span>
          <span class="relationship-value">${rel.trust}%</span>
          <span class="relationship-delta">${trustSign}${rel.trustDelta}</span>
        </div>
        <div class="relationship-track"><span class="relationship-fill ${trustWidthClass}"></span></div>
      </div>
      <div class="relationship-item tension">
        <div class="relationship-head">
          <span class="relationship-label">Spannung</span>
          <span class="relationship-value">${rel.tension}%</span>
          <span class="relationship-delta">${tensionSign}${rel.tensionDelta}</span>
        </div>
        <div class="relationship-track"><span class="relationship-fill ${tensionWidthClass}"></span></div>
      </div>
    </div>
  </section>`;
}

/* ==========================================================
   DOSSIERS RENDERING
   ========================================================== */

/**
 * Render dossiers page (character profiles)
 */
function renderDossiers() {
  if (!AppState.config) return;
  
  const container = $('#page-dossiers .dossiers');
  if (!container) return;
  
  const characters = AppState.config.characters;
  const relationHtml = renderRelationshipCard();
  if (!Array.isArray(characters) || characters.length === 0) {
    container.innerHTML = `${relationHtml}<div class="live-empty"><div class="live-empty-title">// Keine Dossier-Daten verfuegbar</div><p class="live-empty-text">Die Charakterdaten konnten nicht geladen werden.</p></div>`;
    return;
  }

  const dossiersHtml = characters.map(char => {
    const safeId = toSafeClassName(char?.id, 'unknown');
    const safeName = escapeHtml(char?.name || 'UNBEKANNT');
    const safeRole = escapeHtml(char?.role || 'Unbekannt');
    const safeFramework = escapeHtml(char?.framework || 'Unbekannt');
    const safeHostDetails = escapeHtml(char?.host_details || char?.host || 'Unbekannt');
    const safeOperator = escapeHtml(char?.operator || 'Unbekannt');
    const safeLocation = escapeHtml(char?.location || 'Unbekannt');
    const safeStatus = escapeHtml(char?.status || 'Unbekannt');
    const safeStatusClass = safeId === 'nexus' || safeId === 'cipher' ? `dossier-status-${safeId}` : '';

    const personality = Array.isArray(char?.personality) ? char.personality : [];
    const weaknesses = Array.isArray(char?.weaknesses) ? char.weaknesses : [];
    const skills = Array.isArray(char?.skills) ? char.skills : [];

    const personalityHtml = personality.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const weaknessesHtml = weaknesses.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const skillsHtml = skills.map((skill) => {
      const name = escapeHtml(skill?.name || 'Skill');
      const value = clampPercent(skill?.value);
      const widthCls = toPercentClass(value);
      return `
            <div class="dossier-skill">
              <span class="dossier-skill-name">${name}</span>
              <div class="dossier-skill-bar" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100" aria-label="${name} ${value} Prozent">
                <div class="dossier-skill-fill ${widthCls}"></div>
              </div>
              <span class="dossier-skill-pct" aria-hidden="true">${value}%</span>
            </div>
      `;
    }).join('');

    return `
    <article class="dossier ${safeId}">
      <div class="dossier-stamp" aria-label="Klassifizierung">&#x2588; Klassifiziert &#x2588; Subjekt: ${safeName} &#x2588; Bedrohungsstufe: Kritisch &#x2588;</div>
      <div class="dossier-body">
        <div class="dossier-avatar-row">
          <div class="dossier-avatar" role="img" aria-label="${safeName} Avatar"></div>
          <div>
            <h2 class="dossier-name">${safeName}</h2>
            <div class="dossier-role">${safeRole}</div>
          </div>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Identifikation</h3>
          <div class="dossier-field"><span class="dossier-field-label">Framework:</span><span class="dossier-field-value">${safeFramework}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Host:</span><span class="dossier-field-value">${safeHostDetails}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Betreiber:</span><span class="dossier-field-value">${safeOperator}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Standort:</span><span class="dossier-field-value">${safeLocation}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Status:</span><span class="dossier-field-value ${safeStatusClass}">${safeStatus}</span></div>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Persoenlichkeitsprofil</h3>
          <ul class="dossier-list">
            ${personalityHtml}
          </ul>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Faehigkeiten</h3>
          ${skillsHtml}
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Schwaechen</h3>
          <ul class="dossier-list">
            ${weaknessesHtml}
          </ul>
        </div>
      </div>
    </article>
  `;
  }).join('');
  
  container.innerHTML = relationHtml + dossiersHtml;
}

/* ==========================================================
   ROUTER / NAVIGATION
   ========================================================== */

/**
 * Navigate to a page
 * @param {string} page - Page name (live, protokoll, archiv, dashboard, dossiers, info)
 * @param {Object} options
 * @param {boolean} [options.scrollToTop=true] - Scroll to top after navigation
 * @param {boolean} [options.updateHash=true] - Update window.location.hash
 */
function pageToHash(page) {
  if (page === 'protokoll') return 'episoden';
  return page;
}

function hashToPage(hash) {
  if (hash === 'episoden') return 'protokoll';
  return hash || 'live';
}

function navigate(page, options = {}) {
  const { scrollToTop = true, updateHash = true } = options;
  const targetPage = VALID_PAGES.has(page) ? page : 'live';

  // Deactivate all pages and tabs
  $$('.page').forEach(p => {
    p.classList.remove('active');
    p.setAttribute('hidden', '');
  });
  $$('.nav-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  });
  
  // Activate target page
  const pageEl = $(`#page-${targetPage}`);
  if (pageEl) {
    pageEl.classList.add('active');
    pageEl.removeAttribute('hidden');
  }
  
  // Activate target tab
  const tabEl = $(`.nav-tab[data-page="${targetPage}"]`);
  if (tabEl) {
    tabEl.classList.add('active');
    tabEl.classList.remove('tab-flash');
    requestAnimationFrame(() => tabEl.classList.add('tab-flash'));
    setTimeout(() => tabEl.classList.remove('tab-flash'), 750);
    tabEl.setAttribute('aria-selected', 'true');
    tabEl.setAttribute('tabindex', '0');
  }
  
  // Update hash and scroll to top
  if (updateHash) {
    window.location.hash = pageToHash(targetPage);
  }
  if (scrollToTop) {
    window.scrollTo({ top: 0 });
  }
  
  // Update state
  AppState.currentPage = targetPage;
  
  // Emit navigation event
  EventBus.emit('navigate', { page: targetPage });
}

/**
 * Handle route from hash
 */
function handleRoute() {
  let hash = hashToPage(window.location.hash.replace('#', ''));
  if (!VALID_PAGES.has(hash) && hash !== 'archiv') {
    hash = 'live';
  }
  if (hash === 'archiv') {
    navigate('protokoll', { updateHash: true });
    setOrder('phase');
    return;
  }
  const epRaw = new URLSearchParams(window.location.search).get('ep');
  const hasEpisodeQuery = !!(epRaw && /^\d+$/.test(epRaw));
  if (AppState.currentPage === hash && !(hash === 'protokoll' && hasEpisodeQuery)) return;
  navigate(hash, { updateHash: false });
  if (hash === 'protokoll') {
    scrollToEpisodeFromQuery();
  }
}


/* ==========================================================
   DATA LOADING
   ========================================================== */

let formFieldCounter = 0;

function assignIdAndName(el) {
  if (!(el instanceof HTMLElement)) return;
  const hasId = !!el.id;
  const hasName = !!el.name;
  if (!hasId && !hasName) {
    const suffix = ++formFieldCounter;
    el.id = `field-${suffix}`;
    el.name = `field-${suffix}`;
  } else if (!hasId) {
    el.id = el.name;
  } else if (!hasName) {
    el.name = el.id;
  }
}

/**
 * Hash helper for maintenance passphrase (SHA-256)
 */
async function hashSHA256(input) {
  if (!crypto?.subtle) {
    throw new Error('HTTPS_REQUIRED');
  }
  const enc = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Show maintenance gate if enabled in config
 * @param {Object} config - App configuration
 * @returns {Promise<boolean>} True if gate is active (app loading paused)
 */
async function enforceMaintenanceGate(config) {
  const settings = config?.maintenance;
  const params = new URLSearchParams(window.location.search);
  if (params.get('maintenance') === 'off') {
    sessionStorage.setItem('uplink_maintenance_force_off', '1');
  }
  if (sessionStorage.getItem('uplink_maintenance_force_off') === '1') {
    return false;
  }

  const enabledRaw = settings?.enabled;
  const enabled = enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1 || enabledRaw === '1';
  if (!enabled) return false;

  const expectedHash = (settings.passphrase_sha256 || '').trim().toLowerCase();
  const sessionKey = `${MAINT_SESSION_PREFIX}${expectedHash || 'open'}`;
  const stored = sessionStorage.getItem(sessionKey);

  if (stored && stored === (expectedHash || 'open')) {
    return false;
  }

  hideLoading();
  document.body.classList.add('maintenance-active');

  const requirePassword = !!expectedHash;
  const overlay = document.createElement('div');
  overlay.className = 'maintenance-overlay';

  const message = settings.message || 'Wartungsmodus aktiv. Bitte sp\u00e4ter erneut versuchen.';
  const hint = settings.passphrase_hint ? `<p class=\"maintenance-hint\">${escapeHtml(settings.passphrase_hint)}</p>` : '';

  overlay.innerHTML = `
    <div class="maintenance-panel" role="dialog" aria-modal="true" aria-labelledby="maintenance-title" aria-describedby="maintenance-copy">
      <div class="maintenance-badge">WARTUNG</div>
      <h2 id="maintenance-title">Wartungsmodus aktiv</h2>
      <p id="maintenance-copy">${escapeHtml(message)}</p>
      ${requirePassword ? `
        <form id="maintenance-form" class="maintenance-form">
          <label for="maintenance-pass">Zugangscode</label>
          <div class="maintenance-input-row">
            <input id="maintenance-pass" name="maintenance-pass" type="password" autocomplete="off" inputmode="text" required aria-required="true" />
            <button type="submit" id="maintenance-submit" class="maintenance-btn">Freischalten</button>
          </div>
          ${hint}
          <p class="maintenance-note">Nur temporaerer Zugang fuer Betreiber. Oeffentliche Auslieferung pausiert.</p>
          <div class="maintenance-error" role="alert" aria-live="assertive"></div>
        </form>
      ` : `
        <div class="maintenance-form">
          ${hint || '<p class="maintenance-note">Kein Zugangscode gesetzt.</p>'}
          <button id="maintenance-submit" class="maintenance-btn">Weiter</button>
        </div>
      `}
    </div>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector('#maintenance-form');
  const submitBtn = overlay.querySelector('#maintenance-submit');
  const input = overlay.querySelector('#maintenance-pass');
  const errorEl = overlay.querySelector('.maintenance-error');
  const releaseFocusTrap = trapFocusIn(overlay, () => {
    if (!requirePassword) {
      void unlock();
      return;
    }
    input?.focus();
  });

  const unlock = async () => {
    releaseFocusTrap();
    sessionStorage.setItem(sessionKey, expectedHash || 'open');
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
    document.body.classList.remove('maintenance-active');
    showLoading();
    try {
      await loadAppDataAndRender();
    } catch (error) {
      handleLoadError(error);
    }
  };

  if (requirePassword && form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!submitBtn) return;
      submitBtn.disabled = true;
      errorEl && (errorEl.textContent = '');
      try {
        const entered = input?.value?.trim() || '';
        if (!entered) {
          errorEl && (errorEl.textContent = 'Passwort fehlt.');
          submitBtn.disabled = false;
          input?.focus();
          return;
        }
        const hashed = await hashSHA256(entered);
        if (hashed !== expectedHash) {
          errorEl && (errorEl.textContent = 'Falsches Passwort.');
          submitBtn.disabled = false;
          input?.focus();
          input?.select();
          return;
        }
        await unlock();
      } catch (err) {
        console.error('Maintenance gate error', err);
        const msg = err.message === 'HTTPS_REQUIRED'
          ? 'Nur ueber HTTPS verfuegbar.'
          : 'Unerwarteter Fehler. Bitte erneut versuchen.';
        errorEl && (errorEl.textContent = msg);
        submitBtn.disabled = false;
      }
    });
  } else if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      await unlock();
    });
  }

  input?.focus();
  return true;
}

async function loadAppDataAndRender() {
  console.log('%c[UPLINK]%c Loading data...', 'color:#00ff41;font-weight:bold', 'color:inherit');

  const [episodes, stats] = await Promise.all([
    EpisodeService.getAllEpisodes(),
    StatsService.getStats()
  ]);

  console.log('%c[UPLINK]%c Data loaded:', 'color:#00ff41;font-weight:bold', 'color:inherit', {
    episodes: episodes.length,
    stats,
    config: AppState.config
  });

  AppState.episodes = episodes;
  AppState.stats = stats;

  console.log('%c[UPLINK]%c Rendering pages...', 'color:#00ff41;font-weight:bold', 'color:inherit');

  renderDashboard();
  renderLandingMeta();
  initCountdown();
  renderLiveEpisode();
  renderFullTimeline();
  renderArchive();
  renderDossiers();
  ensureFormFieldIdentifiers();

  handleRoute();

  hideLoading();

  console.log('%c[UPLINK]%c System ready!', 'color:#00ff41;font-weight:bold', 'color:inherit');

  EventBus.emit('app:ready');
}

function handleLoadError(error) {
  console.error('%c[UPLINK]%c Failed to load data:', 'color:#ff4757;font-weight:bold', 'color:inherit', error);
  hideLoading();

  document.body.innerHTML = `
<div class="load-error-shell">
  <div class="load-error-card">
    <div class="load-error-title">// CONNECTION FAILED</div>
    <div class="load-error-copy">Die Daten konnten nicht geladen werden. Bitte Verbindung pr&uuml;fen und erneut versuchen.</div>
    <pre class="load-error-details">// CODE: ${escapeHtml(error.message || 'UNKNOWN_ERROR')}
// TIME: ${escapeHtml(new Date().toISOString())}
// RETRY PROTOCOL: MANUAL</pre>
    <button id="retry-btn" class="load-error-btn">
      Erneut verbinden
    </button>
  </div>
</div>`;

  document.getElementById('retry-btn')?.addEventListener('click', () => location.reload());

  EventBus.emit('app:error', { error });
}
async function loadAll() {
  try {
    showLoading();

    console.log('%c[UPLINK]%c Loading config...', 'color:#00ff41;font-weight:bold', 'color:inherit');
    const config = await StatsService.getConfig();
    AppState.config = config;

    const gateActive = await enforceMaintenanceGate(config);
    if (gateActive) return;

    await loadAppDataAndRender();

  } catch (error) {
    handleLoadError(error);
  }
}

/**
 * Ensure all form controls have an id and name (for accessibility & audits)
 */
function ensureFormFieldIdentifiers() {
  const selector = 'input, textarea, select';
  document.querySelectorAll(selector).forEach(assignIdAndName);

  // Observe future additions (e.g., rerenders)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(selector)) {
          assignIdAndName(node);
        }
        node.querySelectorAll?.(selector).forEach(assignIdAndName);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement('textarea');
  temp.value = text;
  temp.setAttribute('readonly', '');
  temp.className = 'copy-temp-textarea';
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  temp.remove();
}

async function handleShareCopy(button) {
  const share = button.closest('.episode-share');
  if (!share) return;

  const url = share.dataset.url || '';
  if (!url) return;

  const prev = button.textContent;
  try {
    await copyText(url);
    button.textContent = 'Kopiert';
  } catch (error) {
    console.error('Share copy failed', error);
    button.textContent = 'Fehler';
  }

  setTimeout(() => { button.textContent = prev; }, 1200);
}

function handleGlobalShortcuts(event) {
  if (event.defaultPrevented) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'l') {
    event.preventDefault();
    navigate('live');
    return;
  }
  if (key === 'e') {
    event.preventDefault();
    navigate('protokoll');
    return;
  }
  if (key === 'd') {
    event.preventDefault();
    navigate('dossiers');
  }
}

/* ==========================================================
   EVENT LISTENERS
   ========================================================== */

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Navigation tabs
  const navTabs = $('#nav-tabs');
  if (navTabs) {
    delegate(navTabs, '.nav-tab', 'click', function(e) {
      const page = this.dataset.page;
      if (page) {
        navigate(page, { scrollToTop: false });
        const anchorId = page === 'protokoll' ? 'episoden' : page;
        const target = document.getElementById(anchorId) || document.getElementById(`page-${page}`);
        if (target) {
          setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 10);
        }
      }
    });

    navTabs.addEventListener('keydown', (event) => {
      const tabs = Array.from(navTabs.querySelectorAll('.nav-tab'));
      if (tabs.length === 0) return;
      const currentIndex = tabs.findIndex(tab => tab === document.activeElement);
      if (currentIndex < 0) return;

      let nextIndex = -1;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;

      if (nextIndex < 0) return;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (!(nextTab instanceof HTMLButtonElement)) return;
      nextTab.focus();
      nextTab.click();
    });
  }

  const ctaEp1 = $('#cta-ep1');
  if (ctaEp1) {
    ctaEp1.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('protokoll');
      setOrder('chrono');
      setTimeout(() => {
        const ep1 = document.getElementById('ep-1');
        if (ep1) ep1.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    });
  }
  
  // Timeline controls (Protokoll)
  const btnNewest = $('#btn-newest');
  const btnChrono = $('#btn-chrono');
  const btnOrigin = $('#btn-origin');

  if (btnNewest) {
    btnNewest.addEventListener('click', () => setOrder('newest'));
  }

  if (btnChrono) {
    btnChrono.addEventListener('click', () => setOrder('chrono'));
  }

  const btnPhase = $('#btn-phase');
  if (btnPhase) {
    btnPhase.addEventListener('click', () => setOrder('phase'));
  }

  if (btnOrigin) {
    btnOrigin.addEventListener('click', () => scrollToOrigin());
  }

  // Site title: back to top + Live
  const titleLink = document.querySelector('.site-title a');
  if (titleLink) {
    titleLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('live');
      scrollToTopSmooth();
    });
  }

  const topLiveBtn = $('#btn-top-live');
  if (topLiveBtn) {
    topLiveBtn.addEventListener('click', () => scrollToTopSmooth());
  }

  const topProtokollBtn = $('#btn-top-protokoll');
  if (topProtokollBtn) {
    topProtokollBtn.addEventListener('click', () => scrollToTopSmooth());
  }

  // CTA: Zur neuesten Episode (scroll past dashboard to first episode)
  const ctaLatest = document.querySelector('.cta[href="#live"]');
  if (ctaLatest) {
    ctaLatest.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('live', { scrollToTop: false });
      setTimeout(() => {
        const firstDay = document.querySelector('#timeline-live .day') || document.getElementById('timeline-live');
        if (firstDay) firstDay.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });
  }

  const liveRefreshBtn = $('#live-refresh-btn');
  if (liveRefreshBtn) {
    liveRefreshBtn.addEventListener('click', () => refreshLiveData());
  }

  // Header accordion: compact "Was ist UPLINK?" explainer
  const ctaInfoToggle = $('#cta-info-toggle');
  const headerInfoPanel = $('#header-info-panel');
  const headerInfoLink = $('#header-info-link');

  if (ctaInfoToggle && headerInfoPanel) {
    const setInfoOpen = (open) => {
      headerInfoPanel.hidden = !open;
      ctaInfoToggle.setAttribute('aria-expanded', String(open));
    };

    ctaInfoToggle.addEventListener('click', () => {
      setInfoOpen(headerInfoPanel.hidden);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !headerInfoPanel.hidden) {
        setInfoOpen(false);
        ctaInfoToggle.focus();
      }
    });

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (headerInfoPanel.hidden) return;
      if (ctaInfoToggle.contains(target) || headerInfoPanel.contains(target)) return;
      setInfoOpen(false);
    });

    if (headerInfoLink) {
      headerInfoLink.addEventListener('click', () => {
        setInfoOpen(false);
        navigate('info', { scrollToTop: false });
        setTimeout(() => {
          const target = document.getElementById('info') || document.getElementById('page-info');
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      });
    }
  }
  
  // Archive episode navigation (inside page-protokoll, switch to chrono view)
  const archiveContent = $('#archive-content');
  if (archiveContent) {
    delegate(archiveContent, '.arc-episode', 'click', function() {
      const epNum = this.dataset.epNum;
      setOrder('chrono');
      setTimeout(() => {
        const el = document.getElementById(`ep-${epNum}`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
  }

  const mainContent = $('#main-content');
  if (mainContent) {
    delegate(mainContent, '.episode-share-copy', 'click', function() {
      handleShareCopy(this);
    });
  }

  // Hash change
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('keydown', handleGlobalShortcuts);
}


/* ==========================================================
   INITIALIZATION
   ========================================================== */

/**
 * Initialize application
 */
function init() {
  console.log('%c[UPLINK]%c System initializing...', 'color:#00ff41;font-weight:bold', 'color:inherit');

  initColdOpen();
  initAnalystMode();

  // Initialize event listeners
  initEventListeners();
  
  // Load all data
  loadAll();
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ==========================================================
   EXPORTS (for potential module usage)
   ========================================================== */

export {
  AppState,
  navigate,
  setOrder,
  scrollToOrigin,
  renderDashboard,
  renderLiveEpisode,
  renderFullTimeline,
  renderArchive,
  renderEpisode
};


