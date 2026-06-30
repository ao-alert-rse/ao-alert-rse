const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

// OPCO EP publie ses AOs sur marches-publics.info — page dédiée IDS=6499
const URL_OPCOEP = 'https://www.marches-publics.info/avis/index.cfm?IDS=6499';
const BASE_URL   = 'https://www.marches-publics.info/avis/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDate(text) {
  // Format dd/mm/yy ou dd/mm/yyyy
  const m = (text || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return '';
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

async function scrapeOPCOEP() {
  let html;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(URL_OPCOEP, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (err) {
      console.error(`  ❌ OPCOEP tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!html) return [];

  const $ = cheerio.load(html);
  const aos = [];

  // Chaque AO est une <tr> avec des <td class="AW_Table_Ligne0|1">
  $('tr').each((_, row) => {
    const tds = $(row).find('td[class^="AW_Table_Ligne"]');
    if (tds.length < 3) return;

    const dateClôture = parseDate($(tds[1]).text().trim());

    const td3 = $(tds[2]);

    // URL de l'avis (lien "Avis" dans la table interne)
    const avisHref = td3.find('a[title="Consulter l\'Avis"]').attr('href') || '';
    const url = avisHref ? (avisHref.startsWith('http') ? avisHref : BASE_URL + avisHref) : URL_OPCOEP;

    // Titre : texte brut après [réf. XXXXX]
    const rawText = td3.text().replace(/\s+/g, ' ').trim();
    const refMatch = rawText.match(/\[r[ée]f\.[^\]]+\]\s*(.*)/s);
    const titre = refMatch ? refMatch[1].trim() : rawText.replace(/^.*OPCO EP[^[]*/, '').trim();

    if (!titre || titre.length < 10) return;

    const score = scoreRSETEE(titre, '');
    aos.push({
      idweb: `opcoep-${avisHref.match(/refPub=([^&]+)/)?.[1] || titre.slice(0, 20)}`,
      titre,
      description: '',
      dateClôture,
      url,
      statut: dateClôture ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé') : 'Ouvert',
      source: 'OPCO EP',
      score,
      prix: null,
    });
  });

  return aos;
}

module.exports = { scrapeOPCOEP };
