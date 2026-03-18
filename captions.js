/**
 * captions.js — Isolated caption-fetching module.
 *
 * Loaded as a content script before content.js.
 * Exports to window.VerdictCaptions namespace.
 *
 * Strategy (DOM Scraping):
 *  Expands the video description, clicks "Show transcript",
 *  and scrapes the resulting DOM elements. This is the only
 *  method that successfully bypassed API restrictions for the user.
 */

(function () {
  'use strict';

  class NoCaptionsError extends Error {
    constructor(message = 'No captions available for this video.') {
      super(message);
      this.name = 'NoCaptionsError';
    }
  }

  /**
   * Main entry point.
   * @returns {Promise<Array<{start: number, text: string}>>}
   */
  async function fetchCaptions() {
    const videoId = new URL(window.location.href).searchParams.get('v');
    if (!videoId) throw new Error('Not on a YouTube watch page.');

    // 1. Check if transcript is already open
    let panels = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
    
    // 2. If not open, we need to click the UI buttons
    if (panels.length === 0) {
      // Step 2a: Expand the description box if it's collapsed
      const expandBtn = document.querySelector('ytd-watch-metadata tp-yt-paper-button#expand') || 
                        document.querySelector('ytd-text-inline-expander #expand');
      
      if (expandBtn && expandBtn.offsetParent !== null) {
        expandBtn.click();
        await sleep(800); // Wait for the description to fully expand and render sub-components
      }

      // Step 2b: Find the actual clickable <button> for "Show transcript"
      // We loop a few times because YouTube sometimes renders it asynchronously after expansion
      let transcriptBtn = null;
      for (let i = 0; i < 5; i++) {
        const buttons = Array.from(document.querySelectorAll('button'));
        transcriptBtn = buttons.find(b => {
          if (b.offsetParent === null) return false; // Skip hidden buttons
          const text = (b.textContent || '').toLowerCase().trim();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
          return text === 'show transcript' || aria === 'show transcript';
        });

        if (transcriptBtn) break;
        await sleep(400); 
      }

      if (!transcriptBtn) {
        throw new Error('Could not find the "Show transcript" button in the description. Is it available for this video?');
      }

      // Click the native button
      transcriptBtn.click();

      // Step 2c: Wait for the transcript side-panel or modal to render segments
      try {
        await waitFor('ytd-transcript-segment-renderer', 5000);
      } catch (err) {
        throw new Error('Transcript panel failed to open after clicking the button.');
      }
      
      panels = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
    }

    if (panels.length === 0) {
      throw new NoCaptionsError('Transcript panel opened but no captions were found inside it.');
    }

    // 3. Extract data from the DOM
    const segments = [];
    for (const el of panels) {
      const timeEl = el.querySelector('.segment-timestamp');
      const textEl = el.querySelector('.segment-text');
      if (!timeEl || !textEl) continue;
      
      const start = parseTimestamp(timeEl.textContent.trim());
      const text = textEl.textContent.trim();
      
      if (text) segments.push({ start, text });
    }

    if (segments.length === 0) throw new NoCaptionsError('No valid caption text could be read from the panel.');
    return segments;
  }

  function parseTimestamp(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function waitFor(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector)) return resolve();
      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) { observer.disconnect(); resolve(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); reject(); }, timeout);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Export to global namespace ──────────────────────────────────────────────
  window.VerdictCaptions = { fetchCaptions, NoCaptionsError };
})();
