const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const BASE = 'https://www.e-marchespublics.com';
const SEARCH_UPDATE_URL = `${BASE}/notices/search/update`;
const MAX_PAGES_PAR_MOTCLE = 2;

// Mots-clés RSE/TEE/RH recherchés via /appel-offre/<mot-clé> — la recherche du site
// n'étant pas garantie stricte (elle peut remonter des faux positifs), scoreRSETEE()
// en aval filtre le bruit ; on garde donc une liste de phrases assez spécifiques.
const KEYWORDS = [
  'accompagnement RSE', 'diagnostic RSE', 'stratégie RSE', 'démarche RSE',
  'bilan carbone', 'bilan GES', 'plan de transition',
  'accompagnement développement durable', 'transition écologique',
  'démarche QVCT', 'accompagnement QVCT', 'égalité professionnelle',
  'devoir de vigilance', 'reporting CSRD', 'accompagnement CSRD',
  'achats responsables', 'économie circulaire',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDate(text) {
  const m = (text || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Combine les Set-Cookie de la réponse initiale en un header Cookie utilisable pour la pagination
function extractCookies(res) {
  const raw = res.headers.raw()['set-cookie'] || [];
  return raw.map(c => c.split(';')[0]).join('; ');
}

function extractCsrf(html) {
  const m = html.match(/data-csrf="([^"]+)"/);
  return m ? m[1] : '';
}

function parseBoxes($, sourceLabel) {
  const aos = [];
  $('.box').each((_, el) => {
    const $el = $(el);
    const titre = $el.find('.box-header-title .texttruncate').first().text().trim();
    if (!titre || titre.length < 5) return;

    const acheteur = $el.find('.box-body-top > span').first().text().trim();

    const colInfos = $el.find('.col1 p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get();
    const description = colInfos.join(' — ');

    const dateTexte = $el.find('.col3 .pink').first().text();
    const dateClôture = parseDate(dateTexte);

    const href = $el.find('.box-footer a.notice-a[href]').first().attr('href') || '';
    if (!href) return;
    const path = href.split('#')[0];
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const segments = path.split('/').filter(Boolean);
    const idweb = `emp-${segments.slice(-2).join('-')}`;

    const score = scoreRSETEE(titre, description);

    aos.push({
      idweb,
      titre,
      description,
      dateClôture,
      url,
      statut: dateClôture ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé') : 'Ouvert',
      source: acheteur || sourceLabel,
      score,
      prix: null,
    });
  });
  return aos;
}

async function fetchAvecRetry(url, options, label) {
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(url, { timeout: 15000, ...options });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      console.error(`  ❌ e-marchespublics/${label} tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  return null;
}

async function scrapeMotCle(motCle) {
  const headers = { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' };
  const res = await fetchAvecRetry(`${BASE}/appel-offre/${encodeURIComponent(motCle)}`, { headers }, motCle);
  if (!res) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  let aos = parseBoxes($, 'e-marchespublics.com');

  const pageMatch = html.match(/<strong>1<\/strong>\s*\/\s*(\d+)/);
  const nbPages = Math.min(pageMatch ? parseInt(pageMatch[1], 10) : 1, MAX_PAGES_PAR_MOTCLE);
  if (nbPages <= 1) return aos;

  const csrf = extractCsrf(html);
  const cookie = extractCookies(res);
  if (!csrf || !cookie) return aos;

  for (let page = 2; page <= nbPages; page++) {
    const pageRes = await fetchAvecRetry(SEARCH_UPDATE_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookie,
      },
      body: new URLSearchParams({ _token: csrf, page: String(page) }),
    }, `${motCle} p${page}`);
    if (!pageRes) break;

    let json;
    try { json = await pageRes.json(); } catch { break; }
    if (!json || !json.view) break;

    aos = aos.concat(parseBoxes(cheerio.load(json.view), 'e-marchespublics.com'));
    await sleep(300);
  }

  return aos;
}

/**
 * Interroge e-marchespublics.com pour chaque mot-clé RSE/TEE/RH et déduplique
 * par idweb (un même avis peut matcher plusieurs mots-clés).
 */
async function scrapeEMarchesPublics() {
  const vus = new Set();
  const aos = [];

  for (const motCle of KEYWORDS) {
    const resultats = await scrapeMotCle(motCle).catch(err => {
      console.error(`  ❌ e-marchespublics/${motCle} : ${err.message}`);
      return [];
    });
    for (const ao of resultats) {
      if (vus.has(ao.idweb)) continue;
      vus.add(ao.idweb);
      aos.push(ao);
    }
    await sleep(300);
  }

  return aos;
}

module.exports = { scrapeEMarchesPublics };
