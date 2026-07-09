const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const BASE_URL = 'https://www.ocapiat.fr';
const LIST_URL = `${BASE_URL}/procedures-de-marches-publics-ami/`;

const MOIS = {
  janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDate(text) {
  const t = (text || '').toLowerCase();
  const m1 = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const m3 = t.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/);
  if (m3) return `${m3[3]}-${MOIS[m3[2]]}-${m3[1].padStart(2, '0')}`;
  return '';
}

async function fetchPage(url) {
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AO-Scanner/1.0)' },
        timeout: 20000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (err) {
      if (attempt < 2) await sleep(delay);
      else throw err;
    }
  }
}

// La page liste ne contient aucune date (le bloc parent du lien n'en affiche jamais) — la date
// limite de réponse n'existe que sur la page détail de chaque AO, dans un bloc Divi structuré
// (thème WordPress "Divi") : <h3>Date limite de réponse</h3> suivi de sa valeur juste après,
// ex. "11 septembre 2026 à 12:00". Confirmé en direct le 09/07/2026 sur les 7 AOs actives.
function extractDateLimiteDetail($) {
  let dateClôture = '';
  $('.et_pb_blurb_container').each((_, el) => {
    if (dateClôture) return;
    const label = $(el).find('h3').first().text().trim();
    if (!/date\s+limite/i.test(label)) return;
    const valeur = $(el).find('.et_pb_blurb_description').first().text().trim();
    dateClôture = parseDate(valeur);
  });
  return dateClôture;
}

async function scrapeOCAPIAT() {
  let html;
  try {
    html = await fetchPage(LIST_URL);
  } catch (err) {
    console.error(`  ❌ OCAPIAT/site : ${err.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const aos = [];

  // Chaque AO = lien vers /project/ — on extrait titre + URL depuis la liste
  $('a[href*="/project/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Titre = texte du lien ou du parent le plus proche avec contenu
    const titre = $(el).text().trim()
      || $(el).closest('article, li, div').find('h2, h3, h4').first().text().trim();
    if (!titre || titre.length < 5) return;

    const score = scoreRSETEE(titre, '');
    if (!aos.find(a => a.url === url)) {
      aos.push({ titre, dateClôture: '', description: '', score, url, statut: 'Ouvert', source: 'OCAPIAT', idweb: '', prix: null });
    }
  });

  // La date n'est disponible que sur la page détail — un fetch par AO, en petits lots pour
  // rester correct envers le serveur (mêmes volumes que TED/BOAMP, page très légère ~90ms).
  for (let i = 0; i < aos.length; i += 5) {
    const batch = aos.slice(i, i + 5);
    await Promise.all(batch.map(async ao => {
      try {
        const detailHtml = await fetchPage(ao.url);
        const dateClôture = extractDateLimiteDetail(cheerio.load(detailHtml));
        ao.dateClôture = dateClôture;
        ao.statut = dateClôture ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé') : 'Ouvert';
      } catch (err) {
        console.error(`  ❌ OCAPIAT/détail (${ao.url}) : ${err.message}`);
      }
    }));
    if (i + 5 < aos.length) await sleep(300);
  }

  return aos;
}

module.exports = { scrapeOCAPIAT };
