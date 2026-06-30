const fs = require('fs');
const path = require('path');
const { hash } = require('./hasher');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'ao-history.json');

// Charge l'historique depuis le fichier JSON (fallback sur {} si absent ou corrompu)
function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return {};
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.warn('  ⚠️  ao-history.json corrompu ou illisible → fallback sur historique vide');
    return {};
  }
}

// Sauvegarde l'historique dans le fichier JSON
function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Identifie les AO non encore vues, met à jour l'historique, et retourne les nouvelles AO.
 * @param {Array} aos - Liste des AO scrapées et filtrées
 * @returns {{ nouvelles: Array, history: Object, added: number }}
 */
function detectNewAOs(aos) {
  const history = loadHistory();
  const nouvelles = [];

  for (const ao of aos) {
    const key = `${ao.source}-${hash(ao.titre)}`;
    if (!history[key]) {
      nouvelles.push({ ...ao, key });
      history[key] = {
        titre: ao.titre,
        source: ao.source,
        scoreRSETEE: ao.score,
        dateVue: new Date().toISOString(),
        'dateClôture': ao.dateClôture,
      };
    }
  }

  if (nouvelles.length > 0) {
    saveHistory(history);
  }

  return { nouvelles, added: nouvelles.length };
}

module.exports = { detectNewAOs };
