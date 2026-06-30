const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

// Constructys publie ses AOs sur marches-publics.info (IDS=5173)
const URL = 'https://www.marches-publics.info/avis/index.cfm?IDS=5173';
const BASE = 'https://www.marches-publics.info/avis/';

function parseDate(text) {
  const m = (text || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return '';
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

async function scrapeConstructys() {
  let html;
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
      timeout: 15000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`  ❌ Constructys : ${err.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const aos = [];

  $('tr').each((_, row) => {
    const tds = $(row).find('td[class^="AW_Table_Ligne"]');
    if (tds.length < 3) return;

    const dateClôture = parseDate($(tds[1]).text().trim());
    const td3 = $(tds[2]);

    const avisHref = td3.find('a[href*="affPublication"]').attr('href') || '';
    const url = avisHref ? (avisHref.startsWith('http') ? avisHref : BASE + avisHref) : URL;

    // Titre : texte brut moins les labels de liens (Avis, RC, DCE) et la référence
    const rawText = td3.text().replace(/\s+/g, ' ').trim();
    const titre = rawText
      .replace(/\bAvis\b|\bRC\b|\bDCE\b|\bDCPA\b/gi, '')
      .replace(/D[ée]poser un pli/gi, '')
      .replace(/Constructys[^(]*\(\s*\d{4,6}\s*\)/g, '')  // "Constructys Siège (75010)"
      .replace(/\[r[ée]f\.[^\]]+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!titre || titre.length < 5) return;

    const score = scoreRSETEE(titre, '');
    aos.push({
      idweb: `constructys-${avisHref.match(/refPub=([^&]+)/)?.[1] || titre.slice(0, 20).replace(/\W+/g, '-')}`,
      titre,
      description: '',
      dateClôture,
      url,
      statut: dateClôture ? (new Date(dateClôture) >= new Date() ? 'Ouvert' : 'Fermé') : 'Ouvert',
      source: 'Constructys',
      score,
      prix: null,
    });
  });

  return aos;
}

module.exports = { scrapeConstructys };
