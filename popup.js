/**
 * popup.js — Popup UI logic.
 *
 * Responsibilities:
 *  - Check if current tab is a YouTube watch page
 *  - Send OPEN_SIDEBAR message to content script
 *  - Show live status feedback
 *  - Handle API key save/load
 */

// ─── DOM References ───────────────────────────────────────────────────────────

const checkBtn        = document.getElementById('check-btn');
const checkBtnText    = document.getElementById('check-btn-text');
const checkBtnSpinner = document.getElementById('check-btn-spinner');
const statusLine      = document.getElementById('status-line');

const apikeyToggle    = document.getElementById('apikey-toggle');
const apikeyInputRow  = document.getElementById('apikey-input-row');
const apikeyInput     = document.getElementById('apikey-input');
const apikeySave      = document.getElementById('apikey-save');
const apikeyStatus    = document.getElementById('apikey-status');

// ─── Initialization ───────────────────────────────────────────────────────────

init();

async function init() {
  await loadApiKeyDisplay();
  await checkTabState();

  // Listen for CHECK_COMPLETE message from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CHECK_COMPLETE') {
      setIdle();
    }
  });
}

async function checkTabState() {
  const tab = await getCurrentTab();

  if (!tab || !tab.url) {
    setStatus('Open a YouTube video to get started.', 'idle');
    checkBtn.disabled = true;
    return;
  }

  if (!tab.url.match(/youtube\.com\/watch/)) {
    setStatus('Navigate to a YouTube video first.', 'warn');
    checkBtn.disabled = true;
    return;
  }

  // Check if content script is already running a check
  try {
    const response = await sendMessageToTab(tab.id, { type: 'GET_STATUS' });
    if (response?.isChecking) {
      setBusy('Checking in progress…');
      return;
    }
    if (response?.hasSidebar) {
      setStatus('Verdict report is open below the video.', 'done');
    } else {
      setStatus('Ready to check.', 'idle');
    }
  } catch (_) {
    // Content script not injected yet (page just loaded), allow checking
    setStatus('Ready to check.', 'idle');
  }
}

// ─── Check Button ─────────────────────────────────────────────────────────────

checkBtn.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab) return;

  // Verify API key is saved
  const apiKey = await getStoredApiKey();
  if (!apiKey) {
    setStatus('Please save your Google AI API key first.', 'error');
    showApiKeySection();
    return;
  }

  setBusy('Analysing video…');

  try {
    // Ensure content scripts are injected (handles tabs open before extension was loaded)
    await ensureContentScripts(tab.id);

    const response = await sendMessageToTab(tab.id, { type: 'OPEN_SIDEBAR' });
    if (response?.status === 'already_checking') {
      setBusy('Already checking…');
    } else {
      setStatus('Searching the web for each claim…', 'checking');
      // Popup may close; the sidebar will show results regardless
      // Safety timeout to re-enable button if CHECK_COMPLETE never arrives
      setTimeout(() => setIdle(), 120_000);
    }
  } catch (e) {
    setStatus('Error: ' + e.message + '. Try refreshing the YouTube page.', 'error');
    setIdle();
  }
});

// ─── API Key Management ───────────────────────────────────────────────────────

apikeyToggle.addEventListener('click', () => {
  const isHidden = apikeyInputRow.classList.contains('hidden');
  if (isHidden) {
    apikeyInputRow.classList.remove('hidden');
    apikeyToggle.textContent = 'Hide';
  } else {
    apikeyInputRow.classList.add('hidden');
    apikeyToggle.textContent = 'Show';
    apikeyStatus.classList.add('hidden');
  }
});

apikeySave.addEventListener('click', async () => {
  const key = apikeyInput.value.trim();
  if (!key) {
    showApikeyStatus('Please enter an API key.', 'error');
    return;
  }

  await chrome.storage.local.set({ verdictApiKey: key });
  showApikeyStatus('Saved ✓', 'success');
  // Mask display
  apikeyInput.value = '';
  apikeyInput.placeholder = `${key.slice(0, 12)}…`;

  setTimeout(() => {
    apikeyStatus.classList.add('hidden');
  }, 2500);
});

async function loadApiKeyDisplay() {
  const key = await getStoredApiKey();
  if (key) {
    apikeyInput.placeholder = `${key.slice(0, 12)}…`;
  }
}

function showApiKeySection() {
  apikeyInputRow.classList.remove('hidden');
  apikeyToggle.textContent = 'Hide';
  apikeyInput.focus();
}

function showApikeyStatus(msg, type) {
  apikeyStatus.textContent = msg;
  apikeyStatus.className = `apikey-status-msg ${type}`;
  apikeyStatus.classList.remove('hidden');
}

// ─── State Helpers ────────────────────────────────────────────────────────────

function setBusy(msg) {
  checkBtn.disabled = true;
  checkBtnText.textContent = msg;
  checkBtnSpinner.classList.remove('hidden');
  setStatus(msg, 'checking');
}

function setIdle() {
  checkBtn.disabled = false;
  checkBtnText.textContent = 'Check This Video';
  checkBtnSpinner.classList.add('hidden');
  setStatus('Ready to check.', 'idle');
}

function setStatus(msg, type = 'idle') {
  statusLine.textContent = msg;
  statusLine.className = `status-${type}`;
}

// ─── Chrome API Helpers ───────────────────────────────────────────────────────

function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] || null));
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function getStoredApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get('verdictApiKey', result => resolve(result.verdictApiKey || null));
  });
}

/**
 * Programmatically inject content scripts into a tab that was already open
 * when the extension was installed/reloaded. Chrome only auto-injects content
 * scripts into tabs opened AFTER the extension loads.
 */
async function ensureContentScripts(tabId) {
  try {
    // Quick ping — if content script responds, it's already there
    await sendMessageToTab(tabId, { type: 'GET_STATUS' });
  } catch (_) {
    // Content script not found → inject all scripts and CSS programmatically
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['sidebar.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['captions.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['prompt.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    // Small delay to let the scripts initialize their globals
    await new Promise(r => setTimeout(r, 150));
  }
}
