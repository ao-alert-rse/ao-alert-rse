const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

const BASE = 'https://www.marches-publics.gouv.fr';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

const KEYWORDS = [
  'responsabilité sociétale',
  'transition écologique',
  'développement durable',
  'RSE',
  'QVCT',
  'CSRD',
  'décarbonation',
];

async function fetchWithRetry(url, opts, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { ...opts, timeout: 30000 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i < retries - 1) await new Promise(res => setTimeout(res, delayMs * (i + 1)));
      else throw e;
    }
  }
}

function getMois(s) {
  const t = s.toLowerCase().replace('.', '');
  const map = { janv: 1, f: 2, mar: 3, avr: 4, mai: 5, juin: 6, juil: 7, ao: 8, sep: 9, oct: 10, nov: 11, d: 12 };
  for (const [k, v] of Object.entries(map)) if (t.startsWith(k)) return v;
  return null;
}

function parseDate(txt) {
  const m = txt.match(/(\d{1,2})\s+(\w+\.?)\s+(\d{4})/i);
  if (!m) return null;
  const mo = getMois(m[2]);
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

async function searchKeyword(kw) {
  const url = `${BASE}/?page=Entreprise.EntrepriseAdvancedSearch&AllCons&keyWord=${encodeURIComponent(kw)}`;
  const r = await fetchWithRetry(url, { headers: HEADERS });
  const $ = cheerio.load(await r.text());
  const items = [];

  $('.item_consultation').each((_, el) => {
    const $el = $(el);

    const titre = $el.find('[id*="panelBlocIntitule"] .truncate span[data-toggle="tooltip"]').attr('title')
      || $el.find('[id*="panelBlocIntitule"] .truncate').text().replace(/\s+/g, ' ').trim();
    if (!titre) return;

    const desc = $el.find('[id*="panelBlocObjet"] .truncate-700').attr('title')
      || $el.find('[id*="panelBlocObjet"] .small span span').text().replace(/\s+/g, ' ').trim();

    const orgFull = $el.find('[id*="panelBlocDenomination"] .truncate-700').attr('title')
      || $el.find('[id*="panelBlocDenomination"] .small').text().replace(/\s+/g, ' ').trim();
    const source = (orgFull || '').replace(/\s*\(\d[^)]*\)\s*$/, '').replace(/^Organisme\s*:\s*/i, '').trim() || 'PLACE';

    const texteItem = $el.text().replace(/\s+/g, ' ');
    const dlMatch = texteItem.match(/(\d{1,2}\s+\w+\.?\s+\d{4})\s+\d{2}:\d{2}/);
    const dateClôture = dlMatch ? parseDate(dlMatch[1]) : null;

    const lien = $el.find('a[href*="consultation"][href*="orgAcronyme"]').last().attr('href') || '';
    const url_ao = lien.startsWith('http') ? lien : (lien ? `${BASE}${lien}` : BASE);

    items.push({ titre: titre.trim(), description: (desc || '').trim(), source, dateClôture, url: url_ao });
  });

  return items;
}

async function scrapePLACE() {
  const seen = new Set();
  const all = [];

  for (const kw of KEYWORDS) {
    try {
      const items = await searchKeyword(kw);
      for (const item of items) {
        const key = item.url || item.titre.slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        const score = scoreRSETEE(item.titre, item.description);
        all.push({ ...item, score, prix: null });
      }
    } catch (e) {
      console.error(`  ⚠ PLACE "${kw}" : ${e.message}`);
    }
  }

  return all;
}

module.exports = { scrapePLACE };
