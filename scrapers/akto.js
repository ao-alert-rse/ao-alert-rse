const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const URL = 'https://www.akto.fr/appels-d-offres/';

function parseDate(text) {
  const m = (text || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeAKTO() {
  let html;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(URL, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (err) {
      console.error(`  ❌ AKTO tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!html) return [];

  const $ = cheerio.load(html);
  const aos = [];

  $('div.posts-card').each((_, el) => {
    const $el = $(el);
    const titre = $el.find('h3.h3').text().trim();
    if (!titre || titre.length < 5) return;

    let dateClôture = '';
    $el.find('p.metas').each((_, p) => {
      const text = $(p).text();
      if (text.includes('Limite de réponse')) dateClôture = parseDate(text);
    });

    const href = $el.find('a.btn.bg-primary').attr('href') || URL;
    const url = href.startsWith('http') ? href : `https://www.akto.fr${href}`;

    const description = $el.find('.posts-card__content p').text().trim();
    const score = scoreRSETEE(titre, description);

    aos.push({
      idweb: `akto-${titre.slice(0, 30).replace(/\W+/g, '-')}`,
      titre,
      description,
      dateClôture,
      url,
      statut: dateClôture ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé') : 'Ouvert',
      source: 'AKTO',
      score,
      prix: null,
    });
  });

  return aos;
}

module.exports = { scrapeAKTO };
