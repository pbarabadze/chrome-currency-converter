// content.js — pick mode, DOM detection, conversion engine

// ─── State ──────────────────────────────────────────────────────────────────

let pickModeActive = false;
let hoveredEl = null;
let siteRule = null;
let conversionActive = false;
let settings = { from: 'USD', to: 'GEL' };

const domain = location.hostname.replace(/^www\./, '');

// ─── Style injection ─────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById('__cc_styles')) return;
    const style = document.createElement('style');
    style.id = '__cc_styles';
    style.textContent = `
    .__cc_badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px !important;
      padding: 1px 6px 1px 5px !important;
      background: #1d4ed8;
      color: #fff;
      font-size: 0.82em;
      font-weight: 500;
      border-radius: 4px;
      font-family: system-ui, sans-serif;
      white-space: nowrap;
      vertical-align: middle;
      line-height: 1.6;
      cursor: default;
      user-select: none;
    }
    .__cc_badge .__cc_icon {
      font-size: 0.75em;
      opacity: 0.7;
      font-style: normal;
    }
    .__cc_badge:hover {
      background: #1e40af;
    }
    .__cc_badge[title]:hover::after {
      content: attr(title);
      position: absolute;
      bottom: calc(100% + 4px);
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #e2e8f0;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 5px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 2147483646;
      border: 1px solid #334155;
    }
  `;
    document.head.appendChild(style);
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
    injectStyles();
    const stored = await chrome.storage.sync.get(['settings', `rule_${domain}`]);
    if (stored.settings) settings = stored.settings;
    if (stored[`rule_${domain}`]) {
        siteRule = stored[`rule_${domain}`];
        autoConvert();
    }
}

init();

// ─── Message bus ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_PICK_MODE') { startPickMode(); sendResponse({ ok: true }); }
    if (msg.type === 'STOP_PICK_MODE')  { stopPickMode();  sendResponse({ ok: true }); }
    if (msg.type === 'GET_RULE')        { sendResponse({ rule: siteRule }); }
    if (msg.type === 'DELETE_RULE')     { siteRule = null; conversionActive = false; removeAllBadges(); sendResponse({ ok: true }); }
    if (msg.type === 'SETTINGS_UPDATED') {
        settings = msg.settings;
        if (conversionActive) { removeAllBadges(); autoConvert(); }
        sendResponse({ ok: true });
    }
});

// ─── Pick mode ───────────────────────────────────────────────────────────────

function startPickMode() {
    pickModeActive = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseout', onHoverOut, true);
    document.addEventListener('click', onPick, true);
    showToast('Click a price element to detect similar ones');
}

function stopPickMode() {
    pickModeActive = false;
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', onHover, true);
    document.removeEventListener('mouseout', onHoverOut, true);
    document.removeEventListener('click', onPick, true);
    if (hoveredEl) { hoveredEl.style.outline = ''; hoveredEl = null; }
}

function onHover(e) {
    if (!pickModeActive) return;
    if (hoveredEl) hoveredEl.style.outline = '';
    hoveredEl = e.target;
    hoveredEl.style.outline = '2px solid #3b82f6';
}

function onHoverOut(e) {
    if (e.target === hoveredEl) { e.target.style.outline = ''; hoveredEl = null; }
}

function onPick(e) {
    if (!pickModeActive) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    stopPickMode();
    const candidates = detectSimilar(el);
    showRefineUI(el, candidates);
}

// ─── DOM detection ───────────────────────────────────────────────────────────

const PRICE_PATTERN = /[\$€£¥₹₩₺₴₾]?\s*\d[\d,.\s]*(\s*[\$€£¥₹₩₺₴₾])?/;

function detectSimilar(seed) {
    const strategies = [
        buildClassSelector(seed),
        buildParentClassSelector(seed),
        buildDataAttrSelector(seed),
        buildStructuralSelector(seed),
    ].filter(Boolean);

    const seen = new Set();
    const results = [];

    for (const selector of strategies) {
        try {
            const els = [...document.querySelectorAll(selector)]
                .filter(el => PRICE_PATTERN.test(el.textContent.trim()));
            if (els.length > 0 && !seen.has(selector)) {
                seen.add(selector);
                results.push({ selector, count: els.length, elements: els });
            }
        } catch (_) {}
    }

    results.sort((a, b) => b.count - a.count);
    return results;
}

function buildClassSelector(el) {
    const tag = el.tagName.toLowerCase();
    const classes = [...el.classList]
        .filter(c => !c.match(/^(is-|has-|active|selected|hover|focus)/))
        .slice(0, 3);
    return classes.length ? `${tag}.${classes.join('.')}` : tag;
}

function buildParentClassSelector(el) {
    const parent = el.parentElement;
    if (!parent || parent === document.body) return null;
    const parentClasses = [...parent.classList].slice(0, 2);
    if (!parentClasses.length) return null;
    return `.${parentClasses.join('.')} ${el.tagName.toLowerCase()}`;
}

function buildDataAttrSelector(el) {
    const dataAttrs = [...el.attributes].filter(a => a.name.startsWith('data-') && a.value).slice(0, 1);
    if (!dataAttrs.length) return null;
    return `${el.tagName.toLowerCase()}[${dataAttrs[0].name}]`;
}

function buildStructuralSelector(el) {
    let ancestor = el.parentElement;
    let depth = 0;
    while (ancestor && depth < 4) {
        const tag = ancestor.tagName.toLowerCase();
        if (['li', 'article', 'tr', 'div'].includes(tag) && ancestor.classList.length > 0) {
            return `.${[...ancestor.classList][0]} ${el.tagName.toLowerCase()}`;
        }
        ancestor = ancestor.parentElement;
        depth++;
    }
    return null;
}

// ─── Refine UI ───────────────────────────────────────────────────────────────

function showRefineUI(seed, candidates) {
    removeRefineUI();

    const panel = document.createElement('div');
    panel.id = '__cc_refine_panel';
    panel.innerHTML = `
    <div style="font-family:system-ui;font-size:13px;color:#f1f5f9;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:fixed;bottom:20px;right:20px;z-index:2147483647">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <strong style="font-size:14px">Detected price elements</strong>
        <button id="__cc_close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;padding:0;line-height:1">×</button>
      </div>
      <div style="margin-bottom:10px;color:#94a3b8;font-size:12px">
        Picked: <code style="background:#0f172a;padding:2px 6px;border-radius:4px;color:#7dd3fc">${escapeHtml(seed.textContent.trim().slice(0, 40))}</code>
      </div>
      <div id="__cc_candidates" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:200px;overflow-y:auto">
        ${candidates.map((c, i) => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#0f172a;border-radius:8px;cursor:pointer;border:1px solid ${i === 0 ? '#3b82f6' : '#1e293b'}">
            <input type="radio" name="__cc_sel" value="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:#3b82f6">
            <span>
              <code style="color:#7dd3fc;font-size:11px">${escapeHtml(c.selector)}</code>
              <span style="color:#94a3b8;font-size:11px;margin-left:6px">${c.count} match${c.count !== 1 ? 'es' : ''}</span>
            </span>
          </label>
        `).join('')}
      </div>
      <div style="margin-bottom:12px">
        <label style="color:#94a3b8;font-size:11px;display:block;margin-bottom:4px">Or type a custom CSS selector:</label>
        <input id="__cc_custom_sel" type="text" placeholder="e.g. .price, span[data-price]"
          style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px 10px;color:#f1f5f9;font-size:12px;font-family:monospace;outline:none">
      </div>
      <div id="__cc_preview" style="color:#94a3b8;font-size:11px;margin-bottom:12px"></div>
      <div style="display:flex;gap:8px">
        <button id="__cc_save" style="flex:1;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;font-weight:500">Save rule</button>
        <button id="__cc_cancel" style="background:#334155;color:#f1f5f9;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px">Cancel</button>
      </div>
    </div>
  `;

    document.body.appendChild(panel);

    let activeHighlights = [];
    let selectedIndex = 0;

    function highlight(selector) {
        clearHighlights();
        try {
            const els = [...document.querySelectorAll(selector)]
                .filter(el => PRICE_PATTERN.test(el.textContent.trim()));
            els.forEach(el => {
                el.dataset.__ccOldOutline = el.style.outline;
                el.style.outline = '2px solid #10b981';
                activeHighlights.push(el);
            });
            panel.querySelector('#__cc_preview').textContent = `Highlighting ${els.length} element${els.length !== 1 ? 's' : ''}`;
        } catch (_) {
            panel.querySelector('#__cc_preview').textContent = 'Invalid selector';
        }
    }

    function clearHighlights() {
        activeHighlights.forEach(el => {
            el.style.outline = el.dataset.__ccOldOutline || '';
            delete el.dataset.__ccOldOutline;
        });
        activeHighlights = [];
    }

    function getActiveSelector() {
        const custom = panel.querySelector('#__cc_custom_sel').value.trim();
        if (custom) return custom;
        return candidates[selectedIndex]?.selector || null;
    }

    if (candidates[0]) highlight(candidates[0].selector);

    panel.querySelectorAll('input[name="__cc_sel"]').forEach(radio => {
        radio.addEventListener('change', e => {
            selectedIndex = parseInt(e.target.value);
            panel.querySelector('#__cc_custom_sel').value = '';
            highlight(candidates[selectedIndex].selector);
        });
    });

    panel.querySelector('#__cc_custom_sel').addEventListener('input', e => {
        const val = e.target.value.trim();
        highlight(val || candidates[selectedIndex]?.selector || '');
    });

    panel.querySelector('#__cc_save').addEventListener('click', () => {
        const selector = getActiveSelector();
        if (!selector) return;
        clearHighlights();
        removeRefineUI();
        applySelector(selector);
    });

    panel.querySelector('#__cc_cancel').addEventListener('click', () => { clearHighlights(); removeRefineUI(); });
    panel.querySelector('#__cc_close').addEventListener('click', () => { clearHighlights(); removeRefineUI(); });
}

function removeRefineUI() {
    document.getElementById('__cc_refine_panel')?.remove();
}

// ─── Apply & convert ─────────────────────────────────────────────────────────

async function applySelector(selector) {
    siteRule = { selector, domain };
    await chrome.storage.sync.set({ [`rule_${domain}`]: siteRule });
    autoConvert();
    showToast(`Rule saved — converting ${document.querySelectorAll(selector).length} elements`);
}

async function autoConvert() {
    if (!siteRule) return;

    const stored = await chrome.storage.sync.get('settings');
    if (stored.settings) settings = stored.settings;

    const { from, to } = settings;

    const rateRes = await chrome.runtime.sendMessage({ type: 'GET_RATES', base: from });
    if (!rateRes.ok) { showToast('Could not fetch exchange rates', 'error'); return; }

    const rate = rateRes.rates[to];
    if (!rate) { showToast(`No rate found for ${to}`, 'error'); return; }

    const elements = [...document.querySelectorAll(siteRule.selector)]
        .filter(el => PRICE_PATTERN.test(el.textContent.trim()))
        // Skip elements that already have a badge injected (avoid double-conversion)
        .filter(el => !el.querySelector('.__cc_badge'));

    elements.forEach(el => {
        const originalText = el.textContent.trim();
        const converted = convertValue(originalText, rate, to);
        if (converted === null) return;

        const badge = document.createElement('span');
        badge.className = '__cc_badge';
        badge.dataset.ccBadge = '1';
        badge.title = `Converted from ${originalText} · Rate: 1 ${from} = ${rate.toFixed(4)} ${to}`;
        badge.innerHTML = `<i class="__cc_icon">≈</i>${converted}`;

        // Insert badge after the text — wrap text in a span if needed to avoid
        // clobbering childNodes that contain the original price
        el.appendChild(badge);
    });

    conversionActive = true;
}

function removeAllBadges() {
    document.querySelectorAll('.__cc_badge').forEach(b => b.remove());
    conversionActive = false;
}

// ─── Conversion math ──────────────────────────────────────────────────────────

// Detect number format and parse to float.
// Handles:
//   US/UK:     1,000.50  →  1000.50
//   European:  1.000,50  →  1000.50
//   Ambiguous: 1.000     →  1000  (3 decimal digits = thousands separator)
//              1,000     →  1000
//              1.5       →  1.5   (1-2 decimal digits = decimal separator)
//              1,5       →  1.5
function parseLocalizedNumber(str) {
    const s = str.trim();

    // Both separators present — determine which is which by order
    if (s.includes(',') && s.includes('.')) {
        const lastComma = s.lastIndexOf(',');
        const lastDot   = s.lastIndexOf('.');
        if (lastDot > lastComma) {
            // 1,000.50 — dot is decimal
            return parseFloat(s.replace(/,/g, ''));
        } else {
            // 1.000,50 — comma is decimal
            return parseFloat(s.replace(/\./g, '').replace(',', '.'));
        }
    }

    // Only dots
    if (s.includes('.') && !s.includes(',')) {
        const parts = s.split('.');
        const decimals = parts[parts.length - 1];
        if (decimals.length === 3 && parts.length === 2) {
            // 1.000 — looks like European thousands, not a decimal
            return parseFloat(s.replace(/\./g, ''));
        }
        // 1.5, 1.50, 1.500.000,00 handled above
        return parseFloat(s);
    }

    // Only commas
    if (s.includes(',') && !s.includes('.')) {
        const parts = s.split(',');
        const decimals = parts[parts.length - 1];
        if (decimals.length === 3 && parts.length === 2) {
            // 1,000 — US thousands separator
            return parseFloat(s.replace(/,/g, ''));
        }
        // 1,5 — European decimal
        return parseFloat(s.replace(',', '.'));
    }

    return parseFloat(s);
}

function convertValue(text, rate, toCurrency) {
    const match = text.match(/([\$€£¥₹₩₺₴₾]?)\s*([\d.,]+)\s*([\$€£¥₹₩₺₴₾]?)/);
    if (!match) return null;

    const num = parseLocalizedNumber(match[2]);
    if (isNaN(num) || num === 0) return null;

    const converted = num * rate;
    const symbol = CURRENCY_SYMBOLS[toCurrency] || toCurrency + ' ';

    // Format: drop decimals for large numbers, keep 2 for small
    const formatted = converted >= 1000
        ? symbol + Math.round(converted).toLocaleString('en-US')
        : symbol + converted.toFixed(2);

    return formatted;
}

const CURRENCY_SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹',
    KRW: '₩', TRY: '₺', UAH: '₴', GEL: '₾', RUB: '₽',
    CHF: 'Fr ', CAD: 'C$', AUD: 'A$', CNY: '¥', SEK: 'kr ',
    NOK: 'kr ', DKK: 'kr ', PLN: 'zł ', CZK: 'Kč ', HUF: 'Ft ',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
    document.getElementById('__cc_toast')?.remove();
    const toast = document.createElement('div');
    toast.id = '__cc_toast';
    const bg = type === 'error' ? '#b91c1c' : '#1e3a5f';
    const border = type === 'error' ? '#ef4444' : '#3b82f6';
    toast.innerHTML = `<div style="font-family:system-ui;font-size:13px;color:#f1f5f9;background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 16px;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:nowrap">${escapeHtml(msg)}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
