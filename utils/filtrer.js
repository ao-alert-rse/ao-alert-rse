const { localToday } = require('./date');

const HORS_ZONE = [
  'martinique', 'guadeloupe', 'reunion', 'guyane', 'mayotte',
  'polynesie', 'caledonie', 'saint-pierre', 'saint-martin',
];

// Acheteurs hors cible métier (formation interne hospitalière, sécurité résidentielle, etc.)
const HORS_SOURCE = [
  'centre hospitalier',
  'groupement de surete',
  'groupement de sûreté',
  'agospap',   // catalogue avantages salariés, pas marchés RSE
  'sequano',   // Séquano Aménagement = aménageur urbain, pas consultant RSE
];

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normTitre(t) {
  return normStr(t).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function filtrerAOs(aos) {
  const today = localToday();
  return aos.filter(ao => {
    if (ao.statut === 'Fermé') return false;
    if (ao.dateClôture && ao.dateClôture < today) return false;
    if (ao.score < 25) return false;
    if (HORS_ZONE.some(z => normStr(ao.source).includes(z))) return false;
    if (HORS_SOURCE.some(s => normStr(ao.source).includes(s))) return false;
    // Titre bilingue FR/EN = projet international hors France (AFD, banques de développement, etc.)
    if (ao.titre.includes('//')) return false;
    return true;
  });
}

// Déduplication cross-source : même titre normalisé → garde le score le plus haut
function dedupCrossSource(aos) {
  const meilleurScore = new Map();
  for (const ao of aos) {
    const nt = normTitre(ao.titre);
    if (!meilleurScore.has(nt) || ao.score > meilleurScore.get(nt)) meilleurScore.set(nt, ao.score);
  }
  const vu = new Set();
  return aos.filter(ao => {
    const nt = normTitre(ao.titre);
    if (vu.has(nt)) return false;
    if (ao.score === meilleurScore.get(nt)) { vu.add(nt); return true; }
    return false;
  });
}

// Titre normalisé pour la clé d'upsert Supabase : les marchés à lots multiples voient leur
// `objet` BOAMP changer légèrement d'un scan à l'autre (lots ajoutés/réordonnés), donc on ne
// garde que la partie stable avant le premier séparateur de lot pour que la clé ne bouge pas.
function normTitreForKey(t) {
  const s = normStr(t).replace(/\s+/g, ' ').trim();
  return s.split(/\s*\|\s*|\s*\[\+\d+ autres lots\]/)[0].trim().slice(0, 100);
}

module.exports = { normStr, normTitre, normTitreForKey, filtrerAOs, dedupCrossSource };
