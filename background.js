// background.js — rate fetching, caching, message routing

const RATES_CACHE_KEY = 'rates_cache';
const RATES_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATES_API = 'https://api.exchangerate-api.com/v4/latest/';

async function fetchRates(base) {
  const cacheKey = `${RATES_CACHE_KEY}_${base}`;
  const cached = await chrome.storage.local.get(cacheKey);

  if (cached[cacheKey]) {
    const { rates, timestamp } = cached[cacheKey];
    if (Date.now() - timestamp < RATES_TTL_MS) {
      return { rates, base, cached: true };
    }
  }

  try {
    const res = await fetch(`${RATES_API}${base}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const payload = { rates: data.rates, timestamp: Date.now() };
    await chrome.storage.local.set({ [cacheKey]: payload });
    return { rates: data.rates, base, cached: false };
  } catch (err) {
    if (cached[cacheKey]) {
      return { rates: cached[cacheKey].rates, base, cached: true, stale: true };
    }
    throw err;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_RATES') {
    fetchRates(msg.base)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
