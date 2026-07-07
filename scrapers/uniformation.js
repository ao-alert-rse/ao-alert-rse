const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const URL = 'https://www.uniformation.fr/partenaire-prestataire/appels-doffre';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeUniformation() {
  let html;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (err) {
      console.error(`  ❌ Uniformation tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!html) return [];

  const $ = cheerio.load(html);
  const aos = [];

  // Refonte du site (Drupal, vue "editorial-content-list") observée le 07/07/2026 : l'ancien
  // sélecteur "article.ao-public" ne correspond plus à rien. Structure confirmée par analogie
  // avec la liste d'actualités du même thème (.views-row > article.editorial-list-single),
  // mais pas encore vérifiée sur un vrai appel d'offre publié (liste vide au moment du fix) —
  // à revalider dès qu'Uniformation republie une offre.
  $('.views-row').each((_, el) => {
    const $el = $(el);
    const titre = $el.find('h3 span').first().text().trim();
    if (!titre || titre.length < 5) return;

    let dateClôture = '';
    const $dateLimiteP = $el.find('*').filter((_, p) => $(p).text().toLowerCase().includes('date limite')).last();
    const dtLimite = $dateLimiteP.find('time[datetime]').attr('datetime');
    const times = $el.find('time[datetime]');
    const dt = dtLimite || (times.length > 0 ? times.last().attr('datetime') : '');
    if (dt) dateClôture = dt.slice(0, 10);

    const href = $el.find('article > a[href]').first().attr('href')
      || $el.find('a[href]').last().attr('href')
      || URL;
    const url = href.startsWith('http') ? href : `https://www.uniformation.fr${href}`;
    const idweb = `uniformation-${(url.split('/').filter(Boolean).pop() || titre.slice(0, 25)).replace(/\W+/g, '-')}`;

    // Le HTML source imbrique <p class="mobile-hidden"><p>texte</p></p> (invalide), ce qui
    // referme le <p> englobant à l'analyse — on prend donc le 1er <p> non vide, pas le 1er tout court.
    const description = $el.find('.text-content p').filter((_, p) => $(p).text().trim().length > 0).first().text().trim();
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
