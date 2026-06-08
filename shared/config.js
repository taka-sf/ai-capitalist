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

// ── History ───────────────────────────────────────────
function saveAnalysis(result) {
  const key = 'aic_history_v1';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  history.unshift({ ...result, savedAt: new Date().toISOString() });
  if (history.length > 100) history = history.slice(0, 100);
  localStorage.setItem(key, JSON.stringify(history));
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('aic_history_v1') || '[]'); } catch(e) { return []; }
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
    callClaude, saveAnalysis, loadHistory, md, safeJsonParse
  };
}
})();
