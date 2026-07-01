const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const URL_ATLAS = 'https://www.opco-atlas.fr/appels-offres.html';

const MOIS = {
  janvier:'01', février:'02', mars:'03', avril:'04', mai:'05', juin:'06',
  juillet:'07', août:'08', septembre:'09', octobre:'10', novembre:'11', décembre:'12'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Extrait une date YYYY-MM-DD depuis un texte brut.
 * Gère : JJ/MM/AAAA, AAAA-MM-JJ, "DD mois YYYY"
 */
function parseDate(text) {
  const t = text.toLowerCase();
  const m1 = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const m3 = t.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/);
  if (m3) return `${m3[3]}-${MOIS[m3[2]]}-${m3[1].padStart(2, '0')}`;
  return '';
}

/**
 * Parse intelligemment le texte brut d'une carte AO ATLAS.
 * Structure observée :
 *   Ligne 1 : catégorie (ex: "Action collective campusAtlas")
 *   Ligne date : "DD mois YYYY ➔ DD mois YYYY"  ← fin = date de clôture
 *   Lignes suivantes : description
 *   Dernière ligne : "Cet appel d'offres est soumis..."
 */
function parseCardText(fullText) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 3);

  // Extraire toutes les dates — la plus récente = clôture
  const allDates = [];
  for (const line of lines) {
    const d = parseDate(line);
    if (d) allDates.push(d);
  }
  allDates.sort();
  const dateClôture = allDates[allDates.length - 1] || '';

  const LEGAL = ["cet appel d'offres", "procédure d'achat", "achat public"];

  // Trouver l'index de la dernière ligne-date dans la liste complète
  let lastDateIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (parseDate(lines[i]) || lines[i].startsWith('➔') || lines[i].startsWith('→')) {
      lastDateIdx = i;
    }
  }

  // Le titre est la première ligne substantielle (>15 chars) APRÈS le bloc de dates
  const afterDates = lines.slice(lastDateIdx + 1).filter(line => {
    if (LEGAL.some(l => line.toLowerCase().includes(l))) return false;
    return line.length > 15;
  });

  const titre = afterDates[0] || lines.find(l => l.length > 20) || '';
  const description = afterDates.slice(1).join(' ').slice(0, 400);

  return { titre, dateClôture, description };
}

function parseStatut(raw, dateClôture) {
  const r = raw.toLowerCase();
  if (r.includes('fermé') || r.includes('clôturé') || r.includes('terminé')) return 'Fermé';
  if (r.includes('cours')) return 'En cours';
  if (r.includes('ouvert')) return 'Ouvert';
  if (dateClôture) return dateClôture >= localToday() ? 'Ouvert' : 'Fermé';
  return 'Ouvert';
}

async function scrapeATLAS() {
  let html;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(URL_ATLAS, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AO-Scanner/1.0)' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (err) {
      console.error(`  ❌ ATLAS tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }
  if (!html) return [];

  const $ = cheerio.load(html);
  const aos = [];

  // Sélecteurs par ordre de priorité (ajuster si structure change)
  const selectors = [
    '.appel-offre', '.appel_offre', 'article.ao',
    '.liste-ao li', '.aos-list .item', '.content-ao',
    'table tbody tr',
  ];

  let matched = false;
  for (const sel of selectors) {
    const items = $(sel);
    if (items.length === 0) continue;
    matched = true;

    items.each((_, el) => {
      try {
        const el$ = $(el);

        // Toujours parser depuis le texte brut : le h2/h3 ATLAS enveloppe tout le contenu
        // donc .find('h2').text() retourne le texte sale complet.
        const { titre, dateClôture, description: descParsed } = parseCardText(el$.text());
        if (!titre || titre.length < 3) return;

        const description = el$.find('p, .description, .resume').first().text().trim() || descParsed;

        const href = el$.find('a').first().attr('href') || '';
        const url = href ? (href.startsWith('http') ? href : `https://www.opco-atlas.fr${href}`) : URL_ATLAS;
        const statutRaw = el$.find('.statut, .status, .badge').text();
        const statut = parseStatut(statutRaw, dateClôture);
        const score = scoreRSETEE(titre, description);

        aos.push({ titre, description, dateClôture, url, statut, source: 'ATLAS', score, prix: null });
      } catch { /* skip AO défectueuse */ }
    });
    break;
  }

  // Fallback : chaque <a> pointant vers /appels-d-offres/ est une fiche AO
  if (!matched) {
    $('a[href*="/appels-d-offres/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href) return;
      const texte = $(el).text().trim();
      if (texte.length < 10) return;
      const url = href.startsWith('http') ? href : `https://www.opco-atlas.fr${href}`;
      const { titre, dateClôture, description } = parseCardText(texte);
      if (!titre || titre.length < 5) return;
      const statut = parseStatut('', dateClôture);
      const score = scoreRSETEE(titre, description);
      aos.push({ titre, description, dateClôture, url, statut, source: 'ATLAS', score });
    });
  }

  return aos;
}

module.exports = { scrapeATLAS };
