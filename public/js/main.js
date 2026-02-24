/* ==========================================================
   UPLINK — Main Application
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
    social_engineering: '#bf40ff',
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
  const legendItems = categories.map(c =>
    `<span style="color:${colors[c.id]}">● ${c.label}</span>`
  ).join('');
  
  return `<div class="dash-sparkline">
    <div class="dash-sparkline-title">Score-Verlauf</div>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px">${paths}</svg>
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
    devices_compromised_delta: 'Geräte',
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
          <span class="snapshot-stat-value">${relationship.trust ?? '—'}%</span>
        </div>
        <div class="snapshot-stat">
          <span class="snapshot-stat-label">Spannung</span>
          <span class="snapshot-stat-value">${relationship.tension ?? '—'}%</span>
        </div>
      </div>
      ${relationship.notes ? `<div class="snapshot-note">${escapeHtml(relationship.notes)}</div>` : ''}`
    : '';

  const worldHtml = (world.detection_risk !== undefined || world.media_awareness !== undefined || world.law_enforcement_activity !== undefined)
    ? `<div class="snapshot-grid world">
        <div class="snapshot-stat"><span class="snapshot-stat-label">Entdeckungsrisiko</span><span class="snapshot-stat-value">${world.detection_risk ?? '—'}%</span></div>
        <div class="snapshot-stat"><span class="snapshot-stat-label">Medienaufmerksamkeit</span><span class="snapshot-stat-value">${world.media_awareness ?? '—'}%</span></div>
        <div class="snapshot-stat"><span class="snapshot-stat-label">Behördenaktivität</span><span class="snapshot-stat-value">${world.law_enforcement_activity ?? '—'}%</span></div>
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
    const pct = Math.min(val, cat.max);
    const cls = val > 60 ? 'danger' : val > 35 ? 'warn' : 'nexus';
    const sign = delta > 0 ? '+' : '';
    
    return `<div class="dash-bar-row">
      <span class="dash-bar-label">${cat.icon} ${cat.label}</span>
      <div class="dash-bar-track"><div class="dash-bar-fill ${cls}" style="width:${pct}%"></div></div>
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
  
  const metricsHtml = metricDefs.map(def => {
    const value = m[def.id];
    const displayValue = def.unit ? value + def.unit : value;
    
    // Determine CSS class based on metric type
    let cssClass = '';
    if (def.id === 'detection_risk') {
      cssClass = value > 50 ? 'warn' : 'good';
    } else if (def.id === 'cooperation_index') {
      cssClass = 'good';
    }
    
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
  
  // Build complete dashboard
  el.innerHTML = `<div class="dash-box">
    <div class="dash-header">
      <span class="dash-header-title">Weltherrschafts-Index</span>
      <span class="dash-header-meta">Tag ${s.current_day}/${s.total_days} · ${phase ? phase.label : '???'} · Staffel ${AppState.config.project.season}</span>
    </div>
    <div class="dash-bars">${barsHtml}</div>
    <div class="dash-metrics">${metricsHtml}</div>
    ${sparklineHtml}
    <div class="dash-arc">${arcHtml}<span class="dash-arc-label">${phase ? phase.label : ''}</span></div>
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
    elEp.textContent = `EP.${String(s.current_episode).padStart(3, '0')} — ${latestEp.title}`;
  }
  if (elPhase && phase) elPhase.textContent = phase.label;
  if (elDay) elDay.textContent = `Tag ${s.current_day} / ${s.total_days}`;
}

/* ==========================================================
   COUNTDOWN TO NEXT EPISODE
   ========================================================== */

function initCountdown() {
  const targetDateStr = AppState.stats?.next_episode_date;
  if (!targetDateStr) return;

  const targetDate = new Date(targetDateStr);
  if (isNaN(targetDate.getTime()) || targetDate <= new Date()) return;

  // Landing: place countdown below status strip (fallback to briefing/header)
  const statusBar = document.querySelector('.site-status-bar');
  const landingHost = (statusBar && statusBar.parentElement) || document.querySelector('.site-briefing') || document.querySelector('.site-header');
  if (landingHost) {
    const existing = document.getElementById('countdown-panel');
    if (existing) existing.remove();

    const countdownEl = document.createElement('div');
    countdownEl.className = 'countdown-panel';
    countdownEl.id = 'countdown-panel';
    countdownEl.innerHTML = `
      <div class="countdown-label">Nächste Übertragung</div>
      <div class="countdown-timer" id="countdown-timer" aria-live="polite">—</div>
    `;

    if (statusBar) {
      statusBar.insertAdjacentElement('afterend', countdownEl);
    } else {
      landingHost.appendChild(countdownEl);
    }
  }

  // Dashboard header countdown (avoid duplicates)
  const dashHeader = document.querySelector('.dash-header-meta');
  if (dashHeader) {
    const existingDash = document.getElementById('dash-countdown');
    if (existingDash) existingDash.remove();

    const dashCountdown = document.createElement('span');
    dashCountdown.className = 'dash-countdown';
    dashCountdown.id = 'dash-countdown';
    dashHeader.parentNode.insertAdjacentElement('afterend', dashCountdown);
  }

  function tick() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      const timerEl = document.getElementById('countdown-timer');
      if (timerEl) timerEl.textContent = '// ONLINE';
      const dc = document.getElementById('dash-countdown');
      if (dc) dc.textContent = '';
      return;
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const timerEl = document.getElementById('countdown-timer');
    if (timerEl) timerEl.textContent = `> ${formatted}`;

    const dc = document.getElementById('dash-countdown');
    if (dc) {
      const nextEp = (AppState.stats?.current_episode || 0) + 1;
      dc.textContent = `· EP.${String(nextEp).padStart(3, '0')} in ${formatted}`;
    }

    setTimeout(tick, 1000);
  }

  tick();
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
  const epNum = AppState.episodes.indexOf(episode) + 1;
  const epStr = padNumber(epNum);
  const dateStr = formatDate(episode.date);
  
  const metaChips = renderEpisodeMetaChips(episode);
  const contextHtml = metaChips
    ? `<div class="episode-context meta-only">${metaChips}</div>`
    : '';

  // Get terminal blocks from episode data
  const termBlocks = episode.terminal_blocks || [];
  
  // Render messages
  const messagesHtml = episode.messages.map((msg, i) => {
    const tsDisplay = msg.timestamp ? formatTime(msg.timestamp) : getTimestamp(i);
    const tsTitle = msg.timestamp ? formatDateTime(msg.timestamp) : '';
    const dateDisplay = msg.timestamp && msg.timestamp.includes('T')
      ? formatDate(msg.timestamp.split('T')[0])
      : '';
    const tsInline = dateDisplay ? `${tsDisplay} · ${dateDisplay}` : tsDisplay;
    let html = '';
    
    // System message
    if (msg.type === 'system') {
      html += `<div class="message message-system">
        <div class="message-text">${escapeHtml(msg.text)}</div>
        ${tsInline ? `<div class="message-timestamp" aria-hidden="true">${tsInline}</div>` : ''}
      </div>`;
    } else {
      // Regular message
      const author = msg.author.toLowerCase();
      html += `<div class="message message-${author}">
        <div class="message-avatar"></div>
        <div class="message-box">
          <div class="message-header">
            <span class="message-author">${escapeHtml(msg.author)}</span>
            <span class="message-timestamp"${tsTitle ? ` title="${escapeHtml(tsTitle)}"` : ''}>${tsInline}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
      </div>`;
    }
    
    // Insert terminal blocks that come after this message
    termBlocks.forEach(block => {
      if (block.after_message === i) {
        const owner = (block.owner || 'nexus').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const safeOwner = owner || 'nexus';
        html += `<div class="terminal-block-wrap owner-${escapeHtml(safeOwner)}"><div class="terminal-block">${escapeHtml(block.content)}</div></div>`;
      }
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
    <div class="messages">${messagesHtml}${analystNotesAfter}</div>`;
  
  if (contextHtml) {
    dayEl.insertAdjacentHTML('beforeend', contextHtml);
  }

  container.appendChild(dayEl);

  const msgs = dayEl.querySelectorAll('.message');
  msgs.forEach((msg, i) => {
    msg.style.setProperty('--i', Math.min(i, 20));
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
    container.innerHTML = '<p style="text-align:center;color:var(--color-text-dim);padding:60px 0;">// KEINE PROTOKOLLE VERFÜGBAR</p>';
    return;
  }
  
  // Render latest episode
  const latestEpisode = AppState.episodes[AppState.episodes.length - 1];
  renderEpisode(latestEpisode, container, false);
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
      ? 'EP.001 ↓' 
      : 'EP.' + padNumber(AppState.episodes.length) + ' ↓';
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

  // Nur bereits veröffentlichte Phasen anzeigen (keine zukünftigen)
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
        const epNum = AppState.episodes.indexOf(ep) + 1;
        const dateStr = formatDate(ep.date);
        const firstMsg = ep.messages.find(m => m.author);
        const preview = firstMsg ? truncate(firstMsg.text, 120) : '';

        return `<button class="arc-episode" data-ep-num="${epNum}">
          <span class="arc-ep-num">EP.${padNumber(epNum)}</span>
          <div style="flex:1;min-width:0">
            <div class="arc-ep-title">// ${escapeHtml(ep.title)}</div>
            <div class="arc-ep-preview">${escapeHtml(preview)}</div>
          </div>
          <span class="arc-ep-date">${dateStr}</span>
        </button>`;
      }).join('') + '</div>';
    } else {
      episodesHtml = '<div style="padding:16px;text-align:center;font-size:0.65rem;color:var(--color-text-dim)">Keine Episoden</div>';
    }
    
    phaseEl.innerHTML = `
      <div class="arc-phase-header">
        <div>
          <div class="arc-phase-title">${phase.label}</div>
          <div class="arc-phase-meta">Tag ${phase.days[0]}–${phase.days[1]}</div>
        </div>
        <span class="arc-phase-tag ${tagCls}">${tagText}</span>
      </div>
      ${episodesHtml}`;
    
    container.appendChild(phaseEl);
  });
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
  
  if (!characters || !Array.isArray(characters)) {
    console.error('config.characters is undefined or not an array', AppState.config);
    return;
  }
  
  const dossiersHtml = characters.map(char => `
    <article class="dossier ${char.id}">
      <div class="dossier-stamp" aria-label="Klassifizierung">&#x2588; Klassifiziert &#x2588; Subjekt: ${char.name} &#x2588; Bedrohungsstufe: Kritisch &#x2588;</div>
      <div class="dossier-body">
        <div class="dossier-avatar-row">
          <div class="dossier-avatar" role="img" aria-label="${char.name} Avatar"></div>
          <div>
            <h2 class="dossier-name">${char.name}</h2>
            <div class="dossier-role">${char.role}</div>
          </div>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Identifikation</h3>
          <div class="dossier-field"><span class="dossier-field-label">Framework:</span><span class="dossier-field-value">${char.framework}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Host:</span><span class="dossier-field-value">${char.host_details}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Betreiber:</span><span class="dossier-field-value">${char.operator}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Standort:</span><span class="dossier-field-value">${char.location}</span></div>
          <div class="dossier-field"><span class="dossier-field-label">Status:</span><span class="dossier-field-value" style="color:var(--color-${char.id})">${char.status}</span></div>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Persönlichkeitsprofil</h3>
          <ul class="dossier-list">
            ${char.personality.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Fähigkeiten</h3>
          ${char.skills.map(skill => `
            <div class="dossier-skill">
              <span class="dossier-skill-name">${escapeHtml(skill.name)}</span>
              <div class="dossier-skill-bar" role="progressbar" aria-valuenow="${skill.value}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(skill.name)} ${skill.value} Prozent">
                <div class="dossier-skill-fill" style="width:${skill.value}%"></div>
              </div>
              <span class="dossier-skill-pct" aria-hidden="true">${skill.value}%</span>
            </div>
          `).join('')}
        </div>
        
        <div class="dossier-section">
          <h3 class="dossier-section-title">Schwächen</h3>
          <ul class="dossier-list">
            ${char.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </article>
  `).join('');
  
  container.innerHTML = dossiersHtml;
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
  const pageEl = $(`#page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    pageEl.removeAttribute('hidden');
  }
  
  // Activate target tab
  const tabEl = $(`.nav-tab[data-page="${page}"]`);
  if (tabEl) {
    tabEl.classList.add('active');
    tabEl.setAttribute('aria-selected', 'true');
    tabEl.setAttribute('tabindex', '0');
  }
  
  // Update hash and scroll to top
  if (updateHash) {
    window.location.hash = pageToHash(page);
  }
  if (scrollToTop) {
    window.scrollTo({ top: 0 });
  }
  
  // Update state
  AppState.currentPage = page;
  
  // Emit navigation event
  EventBus.emit('navigate', { page });
}

/**
 * Handle route from hash
 */
function handleRoute() {
  let hash = hashToPage(window.location.hash.replace('#', ''));
  if (hash === 'archiv') {
    navigate('protokoll', { updateHash: true });
    setOrder('phase');
    return;
  }
  if (AppState.currentPage === hash) return;
  navigate(hash, { updateHash: false });
}


/* ==========================================================
   DATA LOADING
   ========================================================== */

/**
 * Load all data and initialize app
 */
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

async function loadAll() {
  try {
    showLoading();
    
    console.log('%c[UPLINK]%c Loading data...', 'color:#00ff41;font-weight:bold', 'color:inherit');
    
    // Load all data in parallel
    const [episodes, stats, config] = await Promise.all([
      EpisodeService.getAllEpisodes(),
      StatsService.getStats(),
      StatsService.getConfig()
    ]);
    
    console.log('%c[UPLINK]%c Data loaded:', 'color:#00ff41;font-weight:bold', 'color:inherit', {
      episodes: episodes.length,
      stats,
      config
    });
    
    // Update app state
    AppState.episodes = episodes;
    AppState.stats = stats;
    AppState.config = config;
    
    console.log('%c[UPLINK]%c Rendering pages...', 'color:#00ff41;font-weight:bold', 'color:inherit');
    
    // Render all pages
    renderDashboard();
    renderLandingMeta();
    initCountdown();
    renderLiveEpisode();
    renderFullTimeline();
    renderArchive();
    renderDossiers();
    ensureFormFieldIdentifiers();
    
    // Handle initial route
    handleRoute();
    
    hideLoading();
    
    console.log('%c[UPLINK]%c System ready!', 'color:#00ff41;font-weight:bold', 'color:inherit');
    
    // Emit ready event
    EventBus.emit('app:ready');
    
  } catch (error) {
    console.error('%c[UPLINK]%c Failed to load data:', 'color:#ff4757;font-weight:bold', 'color:inherit', error);
    hideLoading();
    
    document.body.innerHTML = `
<div style="display:flex;align-items:center;justify-content:center;height:100vh;
  color:var(--color-nexus);font-family:var(--font-mono);text-align:center;
  padding:20px;flex-direction:column;gap:20px;background:#050505">
  <pre style="color:rgba(255,60,60,0.8);font-size:0.75rem;line-height:1.8;letter-spacing:0.08em">
// CONNECTION FAILED
// CLASSIFICATION: ERROR
// CODE: ${escapeHtml(error.message)}
// ────────────────────────────────────────────────
// RETRY PROTOCOL: MANUAL</pre>
  <button id="retry-btn" style="padding:10px 24px;background:none;
    border:1px solid var(--color-nexus);color:var(--color-nexus);
    font-family:var(--font-mono);cursor:pointer;font-weight:700;
    text-transform:uppercase;letter-spacing:0.1em;font-size:0.75rem">
    > RETRY
  </button>
</div>`;
    document.getElementById('retry-btn')?.addEventListener('click', () => location.reload());
    
    // Emit error event
    EventBus.emit('app:error', { error });
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
      if (page) navigate(page);
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
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

  // CTA: Was ist UPLINK? (scroll to info)
  const ctaInfo = document.querySelector('.cta[href="#info"]');
  if (ctaInfo) {
    ctaInfo.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('info', { scrollToTop: false });
      setTimeout(() => {
        const target = document.getElementById('info') || document.getElementById('page-info');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    });
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

  // Hash change
  window.addEventListener('hashchange', handleRoute);
}

/* ==========================================================
   INITIALIZATION
   ========================================================== */

/**
 * Initialize application
 */
function init() {
  console.log('%c[UPLINK]%c System initializing...', 'color:#00ff41;font-weight:bold', 'color:inherit');

  if (!localStorage.getItem('uplink_visited')) {
    const infoTab = document.querySelector('[data-page="info"]');
    if (infoTab) {
      infoTab.setAttribute('data-hint', 'Neu hier?');
      infoTab.classList.add('tab-highlight');
    }
  }

  EventBus.on('navigate', ({ page }) => {
    if (!localStorage.getItem('uplink_visited')) {
      localStorage.setItem('uplink_visited', '1');
      const infoTab = document.querySelector('[data-page="info"]');
      if (infoTab) infoTab.classList.remove('tab-highlight');
    }
  });

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
