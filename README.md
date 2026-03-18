# Verdict (TrueLens)

**A zero-latency, zero-audio Chrome Extension that fact-checks YouTube videos instantly.**

Have you ever watched a YouTube video and absorbed false claims without knowing they were false? Verdict solves this problem with a single click. 

By extracting existing auto-generated transcripts via a robust DOM-scraping engine and sending them to Google's most capable AI models augmented with live Search Grounding, Verdict verifies factual claims in real-time and displays a clean, timestamped report right next to the video.

## Features
* **Zero-Latency Fact Checking:** Instantly fact-checks videos by reading existing transcripts, entirely circumventing the need for slow and expensive audio processing.
* **Live Search Grounding:** Integrates Gemini 1.5 Pro with real-time internet access to cross-reference claims against credible sources, effectively eliminating LLM "hallucinations".
* **DOM UI Automation:** Programmatically simulates human clicks to open and scrape the Transcript side-panel natively, successfully bypassing strict YouTube Data API restrictions and CORS blocks.
* **Dynamic Model Discovery:** Securely interrogates Google's servers to auto-detect and route queries to the most capable LLM endpoint authorized by the user's specific API key.
* **Strict Fact Filtering:** Intelligently ignores opinions, jokes, and completely true statements to focus only on claims that are False, Misleading, or Disputed.

## How to Install
Verdict is currently available to install locally in Developer Mode.

1. **Clone or Download the Repository:** Download this code to your computer.
2. **Open Extensions in Chrome:** Navigate to `chrome://extensions` in your browser.
3. **Enable Developer Mode:** Toggle the "Developer mode" switch in the top right corner.
4. **Load the Extension:** Click the **Load unpacked** button in the top left and select the `TrueLens` folder you just downloaded.

## Setup (API Key)
Verdict runs entirely client-side and requires a free Google AI Studio API key. 
1. Get your free key at [Google AI Studio](https://aistudio.google.com/apikey). (Make sure your region has access to `gemini-1.5-pro` series).
2. Click the Verdict extension icon in your Chrome toolbar.
3. Paste your API key into the input field and hit "Save". The key is saved securely to Chrome's local storage engine.

## Tech Stack
* Vanilla JavaScript (ES6)
* HTML5 & CSS3
* Manifest V3 Chrome Extension Standard
* Google Gemini API (`generativelanguage.googleapis.com`)
