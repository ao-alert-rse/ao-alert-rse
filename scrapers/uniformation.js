const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const URL = 'https://www.uniformation.fr/partenaire-prestataire/appels-doffre';

async function scrapeUniformation() {
  let html;
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
      timeout: 15000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`  ❌ Uniformation : ${err.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const aos = [];

  $('article.ao-public').each((_, el) => {
    const $el = $(el);
    const titre = $el.find('h3 span').first().text().trim();
    if (!titre || titre.length < 5) return;

    let dateClôture = '';
    $el.find('p').each((_, p) => {
      const $p = $(p);
      if ($p.find('strong').text().toLowerCase().includes('date limite')) {
        const dt = $p.find('time[datetime]').attr('datetime') || '';
        if (dt) dateClôture = dt.slice(0, 10);
      }
    });

    const $link = $el.find('a[class*="button-blue"]');
    const href = $link.attr('href') || URL;
    const url = href.startsWith('http') ? href : `https://www.uniformation.fr${href}`;
    const idmMatch = url.match(/IDM=(\d+)/);
    const idweb = idmMatch ? `uniformation-${idmMatch[1]}` : `uniformation-${titre.slice(0, 25).replace(/\W+/g, '-')}`;

    const description = $el.find('.text-content p').first().text().trim();
    const score = scoreRSETEE(titre, description);

    aos.push({
      idweb,
      titre,
      description,
      dateClôture,
      url,
      statut: dateClôture ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé') : 'Ouvert',
      source: 'Uniformation',
      score,
      prix: null,
    });
  });

  return aos;
}

module.exports = { scrapeUniformation };
