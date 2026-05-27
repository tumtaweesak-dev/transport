const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

const PTT_PRICE_URL = 'https://gasprice.kapook.com/gasprice.php';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedPttPayload = null;
let cachedPttAt = 0;

function toNumber(value) {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUpdateDate(html) {
  const match = html.match(/อัปเดตล่าสุด\s*([^<\n]+)/i);
  return match ? stripHtml(match[1]) : '';
}

function parsePttRows(html) {
  const sectionMatch = html.match(/<article[^>]*class=["'][^"']*\bptt\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i);
  const section = sectionMatch ? sectionMatch[1] : '';
  const rows = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(section)) !== null) {
    const text = stripHtml(match[1]);
    const priceMatch = text.match(/(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (!priceMatch) continue;

    rows.push({
      name: priceMatch[1].trim(),
      priceToday: toNumber(priceMatch[2]),
      priceTomorrow: null,
      priceDifferenceTomorrow: null,
      icon: '',
    });
  }

  return rows;
}

function findOilRow(rows, matchers) {
  return rows.find((row) => matchers.some((matcher) => matcher.test(row.name))) || null;
}

function toMappedPrice(row) {
  if (!row || row.priceToday === null) return null;

  return {
    name: row.name,
    price: row.priceToday,
    priceToday: row.priceToday,
    priceTomorrow: row.priceTomorrow,
    priceDifferenceTomorrow: row.priceDifferenceTomorrow,
    icon: row.icon,
  };
}

function buildPriceMap(rows) {
  const map = {
    diesel: toMappedPrice(findOilRow(rows, [/^ดีเซล$/i])),
    hiDiesel: toMappedPrice(findOilRow(rows, [/ดีเซลพรีเมียม/i])),
    premiumDiesel: toMappedPrice(findOilRow(rows, [/ดีเซลพรีเมียม/i])),
    '95': toMappedPrice(findOilRow(rows, [/แก๊สโซฮอล์\s*95/i])),
    '91': toMappedPrice(findOilRow(rows, [/แก๊สโซฮอล์\s*91/i])),
    e20: toMappedPrice(findOilRow(rows, [/แก๊สโซฮอล์\s*E20/i])),
    e85: toMappedPrice(findOilRow(rows, [/แก๊สโซฮอล์\s*E85/i])),
    premium98: toMappedPrice(findOilRow(rows, [/ซูเปอร์พาวเวอร์\s*แก๊สโซฮอล์\s*95/i, /เบนซิน\s*95/i])),
  };

  return Object.fromEntries(Object.entries(map).filter(([, value]) => value));
}

async function fetchPttPrices() {
  const now = Date.now();
  if (cachedPttPayload && now - cachedPttAt < CACHE_TTL_MS) {
    return { ...cachedPttPayload, cached: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(PTT_PRICE_URL, {
      headers: {
        Accept: 'text/html,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`PTT price source responded with ${response.status}`);
    }

    const html = await response.text();
    const rows = parsePttRows(html);
    if (rows.length === 0) {
      throw new Error('PTT price rows were not found');
    }

    cachedPttPayload = {
      source: 'ptt',
      sourceUrl: PTT_PRICE_URL,
      date: parseUpdateDate(html),
      effectiveDate: '',
      remark: '',
      rows,
      prices: buildPriceMap(rows),
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    cachedPttAt = now;

    return cachedPttPayload;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = function createFuelPricesRouter() {
  const router = express.Router();

  router.get('/fuel-prices/ptt', asyncHandler(async (req, res) => {
    const prices = await fetchPttPrices();
    res.status(200).json(prices);
  }));

  router.get('/fuel-prices/bangchak', asyncHandler(async (req, res) => {
    const prices = await fetchPttPrices();
    res.status(200).json(prices);
  }));

  return router;
};
