/**
 * prompt.js — Builds the Gemini API contents payload.
 *
 * Loaded as a content script before content.js.
 * Exports to window.VerdictPrompt namespace.
 *
 * This is the product. Tune SYSTEM_PROMPT to improve fact-check quality.
 */

(function () {
  'use strict';

  const MAX_TRANSCRIPT_CHARS = 40000; // ~10k tokens, safe for most videos

// SYSTEM_PROMPT has been moved to prompt.json per deep analysis feedback

  /**
   * Builds the Gemini API `contents` array from caption segments.
   * @param {Array<{start: number, text: string}>} segments
   * @returns {Array} Gemini contents array
   */
  function buildContents(segments) {
    const transcript = formatTranscript(segments);
    return [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt(transcript) }],
      },
    ];
  }

  function formatTranscript(segments) {
    let result = '';
    for (const seg of segments) {
      const line = `[${Math.round(seg.start)}] ${seg.text}\n`;
      if ((result + line).length > MAX_TRANSCRIPT_CHARS) break;
      result += line;
    }
    return result.trim();
  }

  function buildUserPrompt(transcript) {
    return `Here is the transcript of a YouTube video. Each line starts with the timestamp in seconds, followed by the caption text.

Identify every hard verifiable factual claim. Use Google Search to verify each one. Return your findings as a JSON array following the schema in your instructions.

TRANSCRIPT:
${transcript}`;
  }

  // ─── Export to global namespace ──────────────────────────────────────────────
  window.VerdictPrompt = { buildContents };
})();
