/**
 * background.js — Service Worker
 *
 * Listens for CHECK_VIDEO messages from content.js.
 * Makes the Gemini API call (with Google Search grounding) and returns the verdict array.
 *
 * Why here and not in content.js?
 *   Content scripts cannot call external APIs due to CORS restrictions.
 *   Service workers bypass those limits when the host is in host_permissions.
 *
 * NOTE: SYSTEM_PROMPT is defined here directly.
 * background.js is an ES module (per manifest "type": "module"), but prompt.js
 * is an IIFE content script — it cannot be imported here. Keep them in sync manually.
 */

// ─── API Configuration ───────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── System Prompt Loader ──────────────────────────────────────────────────────

async function getSystemPrompt() {
  const url = chrome.runtime.getURL('prompt.json');
  const res = await fetch(url);
  const data = await res.json();
  return data.system_prompt;
}

// ─── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_VIDEO') {
    handleCheckVideo(message.contents)
      .then(result => sendResponse({ success: true, verdicts: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

// ─── Core API Call ─────────────────────────────────────────────────────────────

async function getAvailableModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list models: ${response.status} ${text}`);
  }
  const data = await response.json();
  const models = data.models || [];
  
  // Filter for models that support generateContent and contain "gemini" 
  // (ignore older text-bison models, embed models, etc.)
  const valid = models.filter(m => 
    (m.supportedGenerationMethods || []).includes('generateContent') && 
    m.name.includes('gemini') && 
    !m.name.includes('vision') // Prefer text/multimodal unified models
  );

  if (valid.length === 0) {
    throw new Error('Your API key does not have access to any generateContent models.');
  }

  // Preference order: 1.5 Pro > 1.5 Flash > anything else
  let chosen = 
    valid.find(m => m.name.includes('1.5-pro')) || 
    valid.find(m => m.name.includes('1.5-flash')) || 
    valid.find(m => m.name.includes('pro')) || 
    valid[0];

  // Remove the "models/" prefix if it's there
  return chosen.name.replace(/^models\//, '');
}

async function handleCheckVideo(contents) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  // Step 1: Auto-detect the best model the user's key allows
  const modelName = await getAvailableModel(apiKey);
  console.log('[Verdict] Using model:', modelName);

  // Step 2: Make the actual generation call
  const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = {
    systemInstruction: {
      parts: [{ text: await getSystemPrompt() }],
    },
    contents,
    tools: [
      { googleSearch: {} },
    ],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return extractVerdicts(data);
}

// ─── Response Parser ───────────────────────────────────────────────────────────

/**
 * Gemini response shape:
 * {
 *   candidates: [{
 *     content: { parts: [{ text: "..." }], role: "model" },
 *     finishReason: "STOP"
 *   }]
 * }
 */
function extractVerdicts(responseData) {
  const candidate = responseData?.candidates?.[0];
  if (!candidate) {
    const blocked = responseData?.promptFeedback?.blockReason;
    throw new Error(blocked ? `Blocked by Gemini: ${blocked}` : 'No response candidate from Gemini.');
  }

  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Response blocked by Gemini safety filters.');
  }

  const parts = candidate?.content?.parts || [];
  let jsonText = null;

  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].text) {
      jsonText = parts[i].text;
      break;
    }
  }

  if (!jsonText) throw new Error('No text response received from Gemini.');

  // Strip markdown fences if Gemini wraps output in ```json ... ```
  const cleaned = jsonText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Extract the JSON array even if there's stray text around it
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error('Gemini response did not contain a valid JSON array.');
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) throw new Error('Response is not an array.');
    return parsed;
  } catch (e) {
    throw new Error(`Failed to parse verdict JSON: ${e.message}`);
  }
}

// ─── Storage Helper ────────────────────────────────────────────────────────────

function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get('verdictApiKey', result => {
      resolve(result.verdictApiKey || null);
    });
  });
}
