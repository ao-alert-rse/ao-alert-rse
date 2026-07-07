const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

const BASE = 'https://marches.maximilien.fr';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' };

// Mots-clés adaptés à la recherche plein-texte Maximilien (éviter les trop courts qui génèrent du bruit)
const KEYWORDS = [
  'responsabilité sociétale',
  'transition écologique',
  'développement durable',
  'QVCT',
  'CSRD',
  'décarbonation',
  'bilan carbone',
  'bilan GES',
];

function getMois(s) {
  const t = s.toLowerCase().replace('.','');
  if (t.startsWith('janv')) return 1;
  if (t.startsWith('f')) return 2;
  if (t.startsWith('mar')) return 3;
  if (t.startsWith('avr')) return 4;
  if (t === 'mai') return 5;
  if (t.startsWith('juin')) return 6;
  if (t.startsWith('juil')) return 7;
  if (t.startsWith('ao')) return 8;
  if (t.startsWith('sep')) return 9;
  if (t.startsWith('oct')) return 10;
  if (t.startsWith('nov')) return 11;
  if (t.startsWith('d')) return 12;
  return null;
}

function parseDate(txt) {
  const m = txt.match(/(\d{1,2})\s+(\w+\.?)\s+(\d{4})/i);
  if (!m) return null;
  const mo = getMois(m[2]);
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

async function fetchWithRetry(url, opts, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { ...opts, timeout: 15000 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i < retries - 1) await new Promise(res => setTimeout(res, delayMs * (i + 1)));
      else throw e;
    }
  }
}

async function searchKeyword(kw) {
  const url = `${BASE}/?page=Entreprise.EntrepriseAdvancedSearch&searchAnnCons&keyWord=${encodeURIComponent(kw)}`;
  const r = await fetchWithRetry(url, { headers: HEADERS });
  const $ = cheerio.load(await r.text());
  const items = [];

  $('.item_consultation').each((_, el) => {
    const $el = $(el);

    const titre = $el.find('[id*="panelBlocIntitule"] .truncate span[data-toggle="tooltip"]').attr('title')
      || $el.find('[id*="panelBlocIntitule"] .truncate').text().replace(/\s+/g,' ').trim();
    if (!titre) return;

    const desc = $el.find('[id*="panelBlocObjet"] .truncate-700').attr('title')
      || $el.find('[id*="panelBlocObjet"] .small span span').text().replace(/\s+/g,' ').trim();

    const orgFull = $el.find('[id*="panelBlocDenomination"] .truncate-700').attr('title')
      || $el.find('[id*="panelBlocDenomination"] .small').text().replace(/\s+/g,' ').trim();
    // "RESAH (75012 - Paris)" → "RESAH"
    const source = (orgFull || '').replace(/\s*\(\d[^)]*\)\s*$/, '').replace(/^Organisme\s*:\s*/i, '').trim()
      || 'Maximilien';

    // Date limite : format "D Mois YYYY HH:MM" dans le texte de l'item
    const texteItem = $el.text().replace(/\s+/g,' ');
    const dlMatch = texteItem.match(/(\d{1,2}\s+\w+\.?\s+\d{4})\s+\d{2}:\d{2}/);
    const dateClôture = dlMatch ? parseDate(dlMatch[1]) : null;

    // Lien direct consultation
    const lien = $el.find('a[href*="consultation"][href*="orgAcronyme"]').last().attr('href') || '';
    const url_ao = lien ? (lien.startsWith('http') ? lien : `${BASE}${lien}`) : null;

    items.push({ titre: titre.trim(), description: (desc || '').trim(), source, dateClôture, url: url_ao });
  });

  return items;
}

async function scrapeMaximilien() {
  const seen = new Set();
  const all = [];

  for (const kw of KEYWORDS) {
    try {
      const items = await searchKeyword(kw);
      for (const item of items) {
        // Déduplication par URL
        const key = item.url || item.titre.slice(0,60);
        if (seen.has(key)) continue;
        seen.add(key);
        const score = scoreRSETEE(item.titre, item.description);
        all.push({ ...item, score, prix: null });
      }
    } catch (e) {
      console.error(`  ⚠ Maximilien "${kw}" : ${e.message}`);
    }
  }

  return all;
}

module.exports = { scrapeMaximilien };
