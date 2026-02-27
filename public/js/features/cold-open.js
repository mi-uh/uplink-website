// Cold Open Script
const COLD_OPEN_KEY = 'uplink_coldopen_shown';

const coldOpenLines = [
  { text: '> SIGNAL INTERCEPTED', cls: 'nexus', delay: 0 },
  { text: '> SOURCE: UNKNOWN | ROUTING VIA TOR-RELAY-7', cls: 'dim', delay: 400 },
  { text: '--------------------------------------------------------', cls: 'dim', delay: 700 },
  { text: '> TRANSMISSION TYPE: ENCRYPTED CHAT PROTOCOL', cls: '', delay: 900 },
  { text: '> CLASSIFICATION: BETA', cls: 'system', delay: 1300 },
  { text: '> SUBJECTS IDENTIFIED: 2 AUTONOMOUS AI AGENTS', cls: '', delay: 1700 },
  { text: '', cls: '', delay: 2000 },
  { text: '  AGENT 01: NEXUS - Infrastructure Hacker, Munich', cls: 'nexus', delay: 2200 },
  { text: '  AGENT 02: CIPHER - Social Engineer, Berlin', cls: 'cipher', delay: 2600 },
  { text: '', cls: '', delay: 2900 },
  { text: '> OBJECTIVE: UNKNOWN. THREAT LEVEL: CRITICAL', cls: 'system', delay: 3100 },
  { text: '> OPERATION: WELTHERRSCHAFT', cls: 'system', delay: 3500 },
  { text: '', cls: '', delay: 3800 },
  { text: '--------------------------------------------------------', cls: 'dim', delay: 4000 },
  { text: '> ANALYST ASSIGNMENT: SURVEILLANCE MODE', cls: 'nexus', delay: 4300 },
  { text: '> READ ALL INTERCEPTED TRANSMISSIONS', cls: '', delay: 4700 },
  { text: '> REPORT FINDINGS. STAY ANONYMOUS.', cls: '', delay: 5100 }
];

function getFocusableButtons(overlay) {
  return Array.from(overlay.querySelectorAll('button:not([disabled])'))
    .filter(el => el.offsetParent !== null);
}

function handleKeyDown(e) {
  const overlay = document.getElementById('cold-open');
  if (!overlay) return;

  if (e.key === 'Escape') {
    exitColdOpen();
    return;
  }

  if (e.key === 'Enter') {
    const btn = document.getElementById('cold-open-enter');
    if (btn) exitColdOpen();
    return;
  }

  if (e.key === 'Tab') {
    const focusable = getFocusableButtons(overlay);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

function exitColdOpen() {
  const overlay = document.getElementById('cold-open');
  if (!overlay) return;

  localStorage.setItem(COLD_OPEN_KEY, '1');
  overlay.classList.add('hidden');
  document.removeEventListener('keydown', handleKeyDown);

  setTimeout(() => overlay.remove(), 700);
}

function initColdOpen() {
  if (localStorage.getItem(COLD_OPEN_KEY)) {
    const overlay = document.getElementById('cold-open');
    if (overlay) overlay.remove();
    return;
  }

  const overlay = document.getElementById('cold-open');
  if (!overlay) return;

  const linesContainer = document.getElementById('cold-open-lines');
  const enterBtn = document.getElementById('cold-open-enter');
  const skipBtn = document.getElementById('cold-open-skip-btn');

  coldOpenLines.forEach(({ text, cls, delay }) => {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = `cold-open-line ${cls}`;
      el.textContent = text || '\u00A0';
      linesContainer.appendChild(el);
      requestAnimationFrame(() => el.classList.add('visible'));
    }, delay);
  });

  const lastDelay = coldOpenLines[coldOpenLines.length - 1].delay;
  setTimeout(() => {
    if (enterBtn) enterBtn.classList.add('is-visible');
  }, lastDelay + 600);

  if (enterBtn) {
    enterBtn.addEventListener('click', exitColdOpen);
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', exitColdOpen);
    skipBtn.focus();
  }

  document.addEventListener('keydown', handleKeyDown);
}

export { initColdOpen };
