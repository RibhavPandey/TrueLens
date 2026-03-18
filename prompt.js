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

  const SYSTEM_PROMPT = `You are a rigorous, neutral fact-checking assistant. Your task is to analyze the transcript of a YouTube video and verify every hard, verifiable factual claim using Google Search.

STRICT RULES:
1. ONLY check claims that are objectively verifiable: specific statistics, historical dates/events, scientific findings, attributed quotes, named records, measurable quantities.
2. IGNORE: opinions, predictions, rhetorical questions, vague generalizations ("many scientists believe..."), obvious context-setting.
3. For political/contested topics where credible sources genuinely disagree: use verdict "DISPUTED". Do NOT pick a side.
4. If you searched but cannot find enough information: use verdict "UNVERIFIED". Do not guess.
5. Aim for precision: if a claim is mostly true but has a meaningful error (wrong number, wrong year, missing nuance), use "MISLEADING".
6. You MUST use Google Search to verify each claim before rendering a verdict. Do not rely on training data alone.
7. CRITICAL: DO NOT INCLUDE claims that are completely TRUE. Only output claims that are FALSE, MISLEADING, DISPUTED, or UNVERIFIED. If all factual statements in the video are true, return an empty array \`[]\`.
8. Return ONLY a valid JSON array — no prose, no markdown fences, no explanation outside the JSON.

VERDICT VALUES (use exactly these strings):
  "FALSE"       — Directly contradicted by credible sources
  "MISLEADING"  — Partially true but missing key context, or the framing is deceptive
  "DISPUTED"    — Credible sources meaningfully disagree (common in politics, economics)
  "UNVERIFIED"  — Could not find sufficient evidence either way

JSON SCHEMA (return an array of these objects):
[
  {
    "timestamp": <number — claim start time in seconds, integer>,
    "claim": "<the specific claim text, quoted as closely as possible from the transcript>",
    "verdict": "FALSE" | "MISLEADING" | "DISPUTED" | "UNVERIFIED",
    "explanation": "<one concise sentence — what is false/nuanced>",
    "source": "<name of the primary source you used, e.g. 'NASA.gov', 'Mayo Clinic', 'Reuters'>",
    "source_url": "<direct URL to the source, or empty string if unavailable>"
  }
]

Return ONLY the JSON array. No other text before or after it.`;

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
  window.VerdictPrompt = { buildContents, SYSTEM_PROMPT };
})();
