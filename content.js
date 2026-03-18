/**
 * content.js — Injected into every youtube.com/watch page.
 *
 * Depends on: captions.js and prompt.js (loaded first via manifest content_scripts order)
 * Uses: window.VerdictCaptions, window.VerdictPrompt
 *
 * Responsibilities:
 *  - Listen for OPEN_SIDEBAR message from popup.js
 *  - Fetch captions using VerdictCaptions.fetchCaptions()
 *  - Build Gemini contents using VerdictPrompt.buildContents()
 *  - Send transcript to background.js for Gemini API call
 *  - Inject and manage the sidebar panel in the YouTube page DOM
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────────

  let sidebarEl = null;
  let isChecking = false;

  const { fetchCaptions, NoCaptionsError } = window.VerdictCaptions;
  const { buildContents } = window.VerdictPrompt;

  // ─── Message Listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'OPEN_SIDEBAR') {
      if (isChecking) {
        sendResponse({ status: 'already_checking' });
        return;
      }
      startCheck();
      sendResponse({ status: 'started' });
    }
    if (message.type === 'GET_STATUS') {
      sendResponse({ isChecking, hasSidebar: !!sidebarEl });
    }
  });

  // ─── Main Flow ────────────────────────────────────────────────────────────────

  async function startCheck() {
    isChecking = true;
    injectSidebar();
    showLoading();

    try {
      // Step 1: Fetch captions
      let segments;
      try {
        segments = await fetchCaptions();
      } catch (e) {
        if (e instanceof NoCaptionsError) {
          showError('no_captions', 'No captions available for this video. Verdict requires captions to work.');
        } else {
          showError('caption_error', `Could not read captions: ${e.message}`);
        }
        return;
      }

      // Step 2: Build Gemini contents payload
      const contents = buildContents(segments);

      // Step 3: Send to background service worker
      let result;
      try {
        result = await sendToBackground({ type: 'CHECK_VIDEO', contents });
      } catch (e) {
        showError('api_error', `Extension error: ${e.message}`);
        return;
      }

      if (!result.success) {
        const errorType = result.error === 'NO_API_KEY' ? 'no_api_key' : 'api_error';
        const errorMsg =
          result.error === 'NO_API_KEY'
            ? 'Please enter your Google AI API key in the Verdict extension popup.'
            : `API Error: ${result.error}`;
        showError(errorType, errorMsg);
        return;
      }

      // Step 4: Render verdicts
      showVerdicts(result.verdicts);
    } finally {
      isChecking = false;
      chrome.runtime.sendMessage({ type: 'CHECK_COMPLETE' }).catch(() => {});
    }
  }

  // ─── Sidebar DOM Management ───────────────────────────────────────────────────

  function injectSidebar() {
    if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; }

    sidebarEl = document.createElement('div');
    sidebarEl.id = 'verdict-sidebar';
    sidebarEl.innerHTML = getSidebarShell();

    const target =
      document.querySelector('#secondary-inner') ||
      document.querySelector('#secondary');

    if (target) {
      target.prepend(sidebarEl);
    } else {
      sidebarEl.classList.add('verdict-floating');
      document.body.appendChild(sidebarEl);
    }

    sidebarEl.querySelector('#verdict-close').addEventListener('click', () => {
      sidebarEl.remove();
      sidebarEl = null;
    });
  }

  function getSidebarShell() {
    const videoTitle =
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent ||
      document.querySelector('h1 yt-formatted-string')?.textContent ||
      'This video';

    return `
      <div id="verdict-header">
        <div id="verdict-title-row">
          <span id="verdict-logo">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4L10 16L17 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="15.5" cy="15.5" r="3.5" fill="#22c55e"/>
              <path d="M13.5 15.5L15 17L17.5 14" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Verdict</span>
          </span>
          <button id="verdict-close" aria-label="Close Verdict panel">✕</button>
        </div>
        <div id="verdict-video-title">${escapeHtml(videoTitle)}</div>
      </div>
      <div id="verdict-body"></div>
      <div id="verdict-footer"></div>
    `;
  }

  // ─── Loading State ────────────────────────────────────────────────────────────

  function showLoading() {
    const body = sidebarEl?.querySelector('#verdict-body');
    if (!body) return;
    body.innerHTML = `
      <div id="verdict-loading">
        <div class="verdict-spinner"></div>
        <p class="verdict-loading-title">Analysing video…</p>
        <p class="verdict-loading-sub">Reading captions → Searching the web → Building verdicts</p>
        <div class="verdict-skeleton-cards">
          ${'<div class="verdict-skeleton-card"><div class="sk sk-timestamp"></div><div class="sk sk-claim"></div><div class="sk sk-badge"></div></div>'.repeat(3)}
        </div>
      </div>
    `;
  }

  // ─── Error State ──────────────────────────────────────────────────────────────

  function showError(type, message) {
    const body = sidebarEl?.querySelector('#verdict-body');
    if (!body) return;
    const iconMap = { no_captions: '🔇', no_api_key: '🔑', api_error: '⚠️', caption_error: '📄' };
    body.innerHTML = `
      <div class="verdict-error">
        <span class="verdict-error-icon">${iconMap[type] || '⚠️'}</span>
        <p class="verdict-error-msg">${escapeHtml(message)}</p>
        ${type === 'no_api_key' ? '<p class="verdict-error-hint">Click the Verdict icon in your Chrome toolbar to enter your API key.</p>' : ''}
      </div>
    `;
    const footer = sidebarEl?.querySelector('#verdict-footer');
    if (footer) footer.innerHTML = '';
  }

  // ─── Results Rendering ────────────────────────────────────────────────────────

  function showVerdicts(verdicts) {
    const body = sidebarEl?.querySelector('#verdict-body');
    const footer = sidebarEl?.querySelector('#verdict-footer');
    if (!body) return;

    const faultyClaims = verdicts.filter(v => v.verdict !== 'TRUE');

    if (faultyClaims.length === 0) {
      body.innerHTML = `
        <div class="verdict-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
            <path d="M9 12l2 2 4-4"></path>
          </svg>
          <div class="empty-title">Clean Video</div>
          <div class="empty-sub">No false, misleading, or disputed claims were found in this video.</div>
        </div>
      `;
      if (footer) footer.innerHTML = '';
      return;
    }

    body.innerHTML = faultyClaims.map(v => renderCard(v)).join('');
    if (footer) {
      footer.innerHTML = `
        <div id="verdict-footer-content">
          <span>Powered by Gemini &amp; Google Search</span>
          <span class="verdict-count">${verdicts.length} claim${verdicts.length !== 1 ? 's' : ''} checked</span>
        </div>
      `;
    }

    body.querySelectorAll('.verdict-timestamp[data-seconds]').forEach(chip => {
      chip.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) video.currentTime = parseFloat(chip.dataset.seconds);
      });
    });
  }

  function renderCard(verdict) {
    const { timestamp, claim, verdict: v, explanation, source, source_url } = verdict;
    const cfgMap = {
      TRUE:       { color: '#22c55e', label: '✅ TRUE',       bg: 'rgba(34,197,94,0.08)' },
      FALSE:      { color: '#ef4444', label: '❌ FALSE',      bg: 'rgba(239,68,68,0.08)' },
      MISLEADING: { color: '#f59e0b', label: '⚠️ MISLEADING', bg: 'rgba(245,158,11,0.08)' },
      DISPUTED:   { color: '#f97316', label: '🔥 DISPUTED',   bg: 'rgba(249,115,22,0.08)' },
      UNVERIFIED: { color: '#6b7280', label: '❓ UNVERIFIED', bg: 'rgba(107,114,128,0.08)' },
    };
    const cfg = cfgMap[v] || cfgMap.UNVERIFIED;
    const mmss = formatTime(timestamp);
    const sourceHtml = source
      ? source_url
        ? `<a class="verdict-source-link" href="${escapeHtml(source_url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(source)}</a>`
        : `<span class="verdict-source-text">${escapeHtml(source)}</span>`
      : '';

    return `
      <div class="verdict-card" style="border-left-color:${cfg.color};background:${cfg.bg}">
        <div class="verdict-card-top">
          <button class="verdict-timestamp" data-seconds="${timestamp}" title="Jump to ${mmss}">${mmss}</button>
          <span class="verdict-badge" style="color:${cfg.color};border-color:${cfg.color}40">${cfg.label}</span>
        </div>
        <p class="verdict-claim">"${escapeHtml(claim)}"</p>
        <p class="verdict-explanation">${escapeHtml(explanation)}</p>
        ${sourceHtml ? `<div class="verdict-source">${sourceHtml}</div>` : ''}
      </div>
    `;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  function formatTime(seconds) {
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  }
})();
