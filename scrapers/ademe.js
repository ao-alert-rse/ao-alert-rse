const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

const URL = 'https://agirpourlatransition.ademe.fr/entreprises/aides-financieres/catalogue';
const BASE = 'https://agirpourlatransition.ademe.fr';

function parseEndDate(raw) {
  // Format : "12-10-2026" (DD-MM-YYYY)
  const m = (raw || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeADEME() {
  let html;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(URL, {
        headers: {
          'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        timeout: 20000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (err) {
      console.error(`  ❌ ADEME tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!html) return [];

  const $ = cheerio.load(html);
  const aos = [];

  $('[data-component-id="agir_theme:card"]').each((_, el) => {
    const $content = $(el).find('.card__content');
    if (!$content.length) return;

    const status = $content.attr('data-status');
    if (status === 'closed' || status === 'past') return;

    const $link = $content.find('h2 a.card-link');
    const titre = $link.text().trim();
    if (!titre) return;

    const href = $link.attr('href') || '';
    // Exclure les AAP (appels à projets industriels) et fonds : financement d'entreprises, pas marchés de prestation
    if (href.includes('/aap/') || href.includes('/fonds-')) return;
    const url = href.startsWith('http') ? href : BASE + href;
    const dateClôture = parseEndDate($content.attr('data-end-date'));
    const description = $content.find('.content p').text().trim();
    const score = scoreRSETEE(titre, description);

    aos.push({
      idweb: `ademe-${href.split('/').pop() || titre.slice(0, 20).replace(/\W+/g, '-')}`,
      titre,
      description,
      dateClôture,
      url,
      statut: 'Ouvert',
      source: 'ADEME',
      score,
      prix: null,
    });
  });

  return aos;
}

module.exports = { scrapeADEME };
