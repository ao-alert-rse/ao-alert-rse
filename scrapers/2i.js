const fetch = require('node-fetch');
const { scoreRSETEE } = require('../utils/scorer');

// API REST WordPress native — pas de JS requis, pas de scraping HTML
const API_BASE = 'https://www.opco2i.fr/wp-json/wp/v2/appel_a_projects';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrape2i() {
  let data;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(`${API_BASE}?per_page=100&orderby=date&order=desc`, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.error(`  ❌ 2i/REST tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!Array.isArray(data)) return [];

  return data.map(post => {
    const titre = (post.title && post.title.rendered || '').replace(/&#\d+;/g, c => {
      try { return String.fromCharCode(parseInt(c.slice(2,-1))); } catch { return c; }
    }).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();

    const rawDesc = (post.content && post.content.rendered || '');
    const description = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300).trim();

    const score = scoreRSETEE(titre, description);

    return {
      idweb: `2i-${post.id}`,
      titre,
      description,
      dateClôture: '',   // non exposé par l'API REST 2i
      url: post.link || `https://www.opco2i.fr/appels-doffres/`,
      statut: 'Ouvert',
      source: '2i',
      score,
      prix: null,
    };
  });
}

module.exports = { scrape2i };
