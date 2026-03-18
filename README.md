# Verdict

**A zero-latency, zero-audio Chrome Extension that fact-checks YouTube videos instantly.**

Have you ever watched a YouTube video and absorbed false claims without knowing they were false? Verdict solves this problem with a single click. 

By fetching the video's auto-generated captions directly from YouTube and sending them to Google's most capable AI models (with live Search Grounding capabilities), Verdict instantly verifies factual claims and displays a clean, color-coded report right next to the video.

## Features
* **One-Click Fact Checking:** Just click "Check This Video" and let the AI do the rest.
* **Instant Results:** No audio capture or real-time recording required. Verdict reads the transcript in milliseconds.
* **Live Web Grounding:** Uses Google Search to cross-reference claims against live, credible sources on the internet.
* **Timestamped Proof:** Every claim is timestamped. Click a timestamp in the Verdict sidebar to instantly jump to that exact moment in the video.
* **Strict Fact Filtering:** Intelligently filters out opinions, jokes, and completely true statements to focus only on what's False, Misleading, or Disputed.

## How to Install
Verdict is currently available to install locally in Developer Mode.

1. **Clone or Download the Repository:** Download this code to your computer.
2. **Open Extensions in Chrome:** Navigate to `chrome://extensions` in your browser.
3. **Enable Developer Mode:** Toggle the "Developer mode" switch in the top right corner.
4. **Load the Extension:** Click the **Load unpacked** button in the top left and select the `TrueLens` folder you just downloaded.

## Setup (API Key)
Verdict requires a free Google AI Studio API key. 
1. Get your free key at [Google AI Studio](https://aistudio.google.com/apikey). (Make sure you have access to `gemini-1.5-pro` series).
2. Click the Verdict extension icon in your Chrome toolbar.
3. Paste your API key into the input field and hit "Save".

## How It Works Under The Hood
1. **DOM Scraping Strategy:** When activated, Verdict expands the YouTube video description, locates the native "Show transcript" button, and rapidly scrapes the official timestamped captions.
2. **Dynamic Model Discovery:** It pings Google's API to dynamically discover which model your API key supports (defaulting to the highly capable `gemini-1.5-pro-002`).
3. **System Prompts:** The captions are fed into Gemini with a strict, rigorous system prompt demanding JSON output, live web search verification, and objective neutrality.
4. **Sidebar Injection:** The results are injected cleanly into the YouTube page's native secondary column without breaking the site layout.

## Tech Stack
* Vanilla JavaScript (ES6)
* HTML5 & CSS3
* Manifest V3 Chrome Extension Standard
* Google Gemini API (`generativelanguage.googleapis.com`)
