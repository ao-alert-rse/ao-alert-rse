const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

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

async function scrapeOCAPIATDetail(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const titre = $('h1, h2.entry-title, .project-title').first().text().trim();
  const corps = $('main, .entry-content, article').first();
  const texte = corps.text();

  const matchCloture = texte.match(/cl[oô]ture[^:]*?:\s*([^\n,]+\d{4})/i)
    || texte.match(/date\s+limite[^:]*?:\s*([^\n,]+\d{4})/i)
    || texte.match(/(\d{1,2}\s+\w+\s+\d{4})/);
  const dateClôture = matchCloture ? parseDate(matchCloture[1]) : '';

  const description = texte.replace(/\s+/g, ' ').trim().slice(0, 400);
  const score = scoreRSETEE(titre, description);

  return { titre, dateClôture, description, score, url, statut: 'Ouvert', source: 'OCAPIAT', idweb: '', prix: null };
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

    // Date dans le bloc parent
    const bloc = $(el).closest('article, li, .project-item, div').text();
    const dateClôture = parseDate(bloc);

    const score = scoreRSETEE(titre, '');
    if (!aos.find(a => a.url === url)) {
      aos.push({ titre, dateClôture, description: '', score, url, statut: 'Ouvert', source: 'OCAPIAT', idweb: '', prix: null });
    }
  });

  return aos;
}

module.exports = { scrapeOCAPIAT };
