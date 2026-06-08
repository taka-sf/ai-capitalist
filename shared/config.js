(function() {
'use strict';

const CONFIG_KEY = 'aic_config_v1';

const DEFAULT_CONFIG = {
  apiKey:    '',
  model:     'claude-sonnet-4-5',
  webSearch: true,
  language:  'auto',
  notionToken:   '',
  notionDbId:    '',
  gdriveEnabled: false,
  gasUrl:    '',   // GAS Web App URL for cross-device sync
};

function loadConfig() {
  try {
    const s = localStorage.getItem(CONFIG_KEY);
    if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) };
  } catch(e) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function detectLang(text) {
  const jaChars = (text.match(/[぀-ゟ゠-ヿ一-鿿]/g) || []).length;
  return jaChars > text.length * 0.08 ? 'ja' : 'en';
}

function classifyInput(text) {
  const t = text.trim().toUpperCase();
  if (/^\d{4}[A-Z]?$/.test(t)) return 'public';
  if (/^[A-Z]{1,5}$/.test(t)) return 'public';
  if (/^https?:\/\//i.test(text)) return null;
  if (/株式会社|合同会社|有限会社|合名会社|合資会社/.test(text)) return 'sme';
  return null;
}

// ── Claude API call with tool loop ────────────────────
async function callClaude({ prompt, system, useSearch = false, maxTokens = 1400 }) {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('APIキーが未設定です。Settings から設定してください。');

  const useWebSearch = useSearch && cfg.webSearch;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (useWebSearch) {
    headers['anthropic-beta'] = 'web-search-2025-03-05';
  }

  let messages = [{ role: 'user', content: prompt }];
  const bodyBase = {
    model: cfg.model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    ...(useWebSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search' }] } : {}),
  };

  // ── Rate-limit backoff helper ─────────────────────────
  // Waits respect the 60-second TPM window: 15s → 30s → 60s → 60s → give up
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const RATE_BACKOFF_MS = [15000, 30000, 60000, 60000]; // 4 retries max
  let rateRetries = 0;

  // Tool loop — handles web_search multi-turn if needed
  for (let turn = 0; turn < 6; turn++) {
    // ── Inner fetch with 429 backoff ──────────────────
    let res;
    while (true) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...bodyBase, messages }),
      });

      if (res.status === 429 && rateRetries < RATE_BACKOFF_MS.length) {
        // Honour Retry-After header if present, otherwise use our schedule
        const retryAfterSec = parseInt(res.headers.get('retry-after') || '0', 10);
        const waitMs = retryAfterSec > 0
          ? retryAfterSec * 1000 + 1000        // header value + 1s buffer
          : RATE_BACKOFF_MS[rateRetries];       // our fallback schedule
        console.warn(
          `Rate limit hit. Waiting ${waitMs / 1000}s before retry ` +
          `(attempt ${rateRetries + 1}/${RATE_BACKOFF_MS.length})...`
        );
        await sleep(waitMs);
        rateRetries++;
        continue; // retry same fetch
      }
      break; // exit inner retry loop
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(
          'レートリミット超過（リトライ上限に達しました）。' +
          '数分待ってから再度お試しください。'
        );
      }
      // If web search caused auth/beta error, retry without it
      if (useWebSearch && (res.status === 400 || res.status === 401)) {
        console.warn('Web search unavailable, retrying without search:', err);
        delete bodyBase.tools;
        delete headers['anthropic-beta'];
        messages = [{ role: 'user', content: prompt }];
        continue;
      }
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    // Collect any text from this turn
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);

    if (data.stop_reason === 'end_turn') {
      return textBlocks.join('');
    }

    if (data.stop_reason === 'tool_use') {
      // Build tool_results to continue — for web_search_20250305 the
      // search result is already embedded by Anthropic; we echo back empty
      const toolUseBlocks = (data.content || []).filter(b => b.type === 'tool_use');
      if (!toolUseBlocks.length) return textBlocks.join('');

      const toolResults = toolUseBlocks.map(tu => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: tu.type === 'web_search_20250305' || tu.name === 'web_search'
          ? [] // server-side search; Anthropic injects results automatically
          : [{ type: 'text', text: 'Tool executed.' }],
      }));

      messages = [
        ...messages,
        { role: 'assistant', content: data.content },
        { role: 'user',      content: toolResults },
      ];
      continue;
    }

    // Any other stop reason — return whatever text we have
    return textBlocks.join('');
  }

  throw new Error('Max tool loop iterations reached. Please try again.');
}

// ── History (localStorage + optional GAS cloud sync) ─────────────────────
const HISTORY_KEY = 'aic_history_v1';

/** Save to localStorage immediately; also push to GAS if configured. */
function saveAnalysis(result) {
  const entry = { ...result, savedAt: result.savedAt || new Date().toISOString() };

  // 1. Always save locally first (instant, offline-safe)
  let local = [];
  try { local = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) {}
  // Replace existing entry with same id, or prepend
  const idx = local.findIndex(r => r.id && r.id === entry.id);
  if (idx >= 0) local[idx] = entry; else local.unshift(entry);
  if (local.length > 200) local = local.slice(0, 200);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(local));

  // 2. Push to GAS cloud (non-blocking, errors logged but not thrown)
  const cfg = loadConfig();
  if (cfg.gasUrl) {
    gasPost_(cfg.gasUrl, { action: 'saveAnalysis', data: entry })
      .catch(e => console.warn('[GAS sync] saveAnalysis failed:', e.message));
  }

  return entry;
}

/**
 * Load history.
 * - If gasUrl configured: fetch from GAS (cloud-first), merge with local,
 *   refresh localStorage cache. Falls back to localStorage on network error.
 * - Returns a Promise that resolves to the history array.
 */
async function loadHistory() {
  const local = loadLocalHistory_();
  const cfg   = loadConfig();
  if (!cfg.gasUrl) return local;

  try {
    const res  = await gasPost_(cfg.gasUrl, { action: 'getHistory', limit: 200 });
    if (res.ok && Array.isArray(res.history)) {
      // Merge: cloud is source-of-truth; add any local-only entries not yet synced
      const cloudIds = new Set(res.history.map(r => r.id));
      const localOnly = local.filter(r => r.id && !cloudIds.has(r.id));
      const merged = [...res.history, ...localOnly];
      // Sort newest-first
      merged.sort((a, b) => (b.savedAt || '') > (a.savedAt || '') ? 1 : -1);
      // Refresh cache
      localStorage.setItem(HISTORY_KEY, JSON.stringify(merged.slice(0, 200)));
      // Upload any local-only entries to cloud
      localOnly.forEach(entry => {
        gasPost_(cfg.gasUrl, { action: 'saveAnalysis', data: entry })
          .catch(e => console.warn('[GAS sync] upload local-only failed:', e.message));
      });
      return merged;
    }
  } catch(e) {
    console.warn('[GAS sync] loadHistory failed, using local cache:', e.message);
  }
  return local;
}

/** Delete a single analysis (local + cloud). */
async function deleteAnalysis(id) {
  // Remove from local
  let local = loadLocalHistory_();
  local = local.filter(r => r.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(local));
  // Remove from cloud
  const cfg = loadConfig();
  if (cfg.gasUrl) {
    await gasPost_(cfg.gasUrl, { action: 'deleteAnalysis', id })
      .catch(e => console.warn('[GAS sync] deleteAnalysis failed:', e.message));
  }
}

function loadLocalHistory_() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
}

// ── GAS HTTP helpers ──────────────────────────────────────────────────────
// GAS Web Apps redirect (302) to the actual execution URL.
// Browsers follow redirects automatically but CORS headers are lost on the
// redirect target unless "redirect: follow" + no preflight is used.
// Workaround: send everything as POST with action in the body (avoids
// preflight for GETs with custom params), OR use no-cors for GETs and
// parse the opaque response — but that returns status 0.
// Best approach: always POST (GAS doPost handles all actions), and for
// simple GETs append params to URL and use redirect:follow with no
// custom Content-Type to avoid preflight.

async function gasPost_(url, body) {
  // Use text/plain to avoid CORS preflight (GAS doesn't send preflight headers)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { throw new Error(`GAS response parse error: ${text.slice(0, 100)}`); }
}

async function gasGet_(url, params) {
  // Simple GET — no custom headers avoids preflight
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { throw new Error(`GAS response parse error: ${text.slice(0, 100)}`); }
}

/** Sync current settings (minus apiKey) to GAS. */
async function syncConfigToGas(cfg) {
  if (!cfg.gasUrl) return;
  const safe = { ...cfg };
  delete safe.apiKey;
  await gasPost_(cfg.gasUrl, { action: 'saveConfig', data: safe })
    .catch(e => console.warn('[GAS sync] saveConfig failed:', e.message));
}

// ── Markdown → HTML ───────────────────────────────────
function md(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<h3 style="font-weight:600;font-size:13px;color:var(--text-1);margin:14px 0 5px">$1</h3>')
    .replace(/^[-•]\s+(.+)$/gm, '<span style="display:block;padding-left:14px;position:relative;margin:3px 0"><span style="position:absolute;left:0;color:var(--accent)">›</span>$1</span>')
    .replace(/\n{2,}/g, '</p><p style="margin:4px 0">')
    .replace(/\n/g, '<br>');
}

// ── Safe JSON parse (strips markdown fences) ──────────
function safeJsonParse(text) {
  if (!text) return null;
  let clean = text.trim();
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  clean = clean.replace(/^`+|`+$/g, '');
  // Find first { or [ to handle preamble text
  const firstBrace = clean.search(/[{[]/);
  if (firstBrace > 0) clean = clean.slice(firstBrace);
  const lastBrace = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
  if (lastBrace >= 0) clean = clean.slice(0, lastBrace + 1);
  try { return JSON.parse(clean); } catch(e) { return null; }
}

if (typeof window !== 'undefined') {
  window.ConfigModule = {
    loadConfig, saveConfig, detectLang, classifyInput,
    callClaude, saveAnalysis, loadHistory, deleteAnalysis,
    syncConfigToGas, gasPost_, gasGet_,
    md, safeJsonParse
  };
}
})();
