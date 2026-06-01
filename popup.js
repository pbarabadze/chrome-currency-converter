// popup.js

const CURRENCIES = [
  'USD','EUR','GBP','JPY','GEL','INR','CAD','AUD','CHF','CNY',
  'SEK','NOK','DKK','PLN','CZK','HUF','TRY','UAH','KRW','RUB',
  'BRL','MXN','SGD','HKD','NZD','ZAR','AED','SAR','THB','IDR'
];

let currentTab = null;
let pickModeActive = false;
let settings = { from: 'USD', to: 'GEL' };
let currentRule = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const domain = new URL(tab.url).hostname.replace(/^www\./, '');
  document.getElementById('current-domain').textContent = domain;

  // Load settings
  const stored = await chrome.storage.sync.get(['settings', `rule_${domain}`]);
  if (stored.settings) settings = { ...settings, ...stored.settings };
  currentRule = stored[`rule_${domain}`] || null;

  populateCurrencySelects();
  renderRuleArea();
  loadRate();

  if (!currentRule) {
    document.getElementById('no-rule-hint').style.display = 'block';
  }
}

function populateCurrencySelects() {
  const fromEl = document.getElementById('from-currency');
  const toEl = document.getElementById('to-currency');

  CURRENCIES.forEach(c => {
    fromEl.insertAdjacentHTML('beforeend', `<option value="${c}" ${c === settings.from ? 'selected' : ''}>${c}</option>`);
    toEl.insertAdjacentHTML('beforeend', `<option value="${c}" ${c === settings.to ? 'selected' : ''}>${c}</option>`);
  });

  fromEl.addEventListener('change', onSettingsChange);
  toEl.addEventListener('change', onSettingsChange);

  document.getElementById('swap-btn').addEventListener('click', () => {
    const tmp = settings.from;
    settings.from = settings.to;
    settings.to = tmp;
    fromEl.value = settings.from;
    toEl.value = settings.to;
    onSettingsChange();
  });
}

async function onSettingsChange() {
  settings.from = document.getElementById('from-currency').value;
  settings.to = document.getElementById('to-currency').value;
  await chrome.storage.sync.set({ settings });
  loadRate();

  // Notify content script
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'SETTINGS_UPDATED', settings });
  } catch (_) {}
}

async function loadRate() {
  const infoEl = document.getElementById('rate-info');
  infoEl.textContent = 'Loading…';
  infoEl.style.color = '#64748b';

  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_RATES', base: settings.from });
    if (!res.ok) throw new Error(res.error);
    const rate = res.rates[settings.to];
    infoEl.innerHTML = `1 ${settings.from} = <span>${rate?.toFixed(4)} ${settings.to}</span>${res.stale ? ' (cached)' : ''}`;
  } catch (err) {
    infoEl.textContent = 'Rate unavailable';
    infoEl.style.color = '#f87171';
  }
}

// ─── Rule area ────────────────────────────────────────────────────────────────

function renderRuleArea() {
  const area = document.getElementById('rule-area');
  if (!currentRule) {
    area.innerHTML = `<div class="empty-state">No rule set for this site</div>`;
    return;
  }

  area.innerHTML = `
    <div class="rule-card active">
      <div class="rule-selector">${escapeHtml(currentRule.selector)}</div>
      <div class="rule-meta">
        <span>Auto-converts on page load</span>
        <span class="badge badge-green">Active</span>
      </div>
      <div class="rule-actions">
        <button class="btn btn-secondary" id="revert-btn">Revert page</button>
        <button class="btn btn-danger" id="delete-rule-btn">Delete rule</button>
      </div>
    </div>
  `;

  document.getElementById('delete-rule-btn').addEventListener('click', deleteRule);
  document.getElementById('revert-btn').addEventListener('click', revertPage);
}

async function deleteRule() {
  const domain = new URL(currentTab.url).hostname.replace(/^www\./, '');
  await chrome.storage.sync.remove(`rule_${domain}`);
  currentRule = null;
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'DELETE_RULE' });
  } catch (_) {}
  renderRuleArea();
  setStatus('Rule deleted', 'ok');
  document.getElementById('no-rule-hint').style.display = 'block';
}

async function revertPage() {
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'DELETE_RULE' });
    setStatus('Reverted', 'ok');
  } catch (_) {
    setStatus('Could not reach page', 'err');
  }
}

// ─── Pick mode ────────────────────────────────────────────────────────────────

document.getElementById('pick-btn').addEventListener('click', async () => {
  if (!pickModeActive) {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'START_PICK_MODE' });
      pickModeActive = true;
      document.getElementById('pick-btn').classList.add('active');
      document.getElementById('pick-label').textContent = 'Cancel pick mode';
      document.getElementById('pick-icon').textContent = '✕';
      window.close(); // close popup so user can click the page
    } catch (_) {
      setStatus('Cannot reach page — try refreshing', 'err');
    }
  } else {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'STOP_PICK_MODE' });
    } catch (_) {}
    pickModeActive = false;
    document.getElementById('pick-btn').classList.remove('active');
    document.getElementById('pick-label').textContent = 'Pick price element';
    document.getElementById('pick-icon').textContent = '⊕';
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = type;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
