const { localToday } = require('./date');
const { hash } = require('./hasher');

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
function dedupParTitre(aos) {
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

// Un même avis eForms (au-dessus du seuil UE) est publié à la fois sur BOAMP et sur TED, avec
// une casse d'acheteur et un titre qui peuvent diverger dès les premiers caractères (BOAMP
// abrège parfois là où TED détaille) — invisible pour dedupParTitre. Le ContractFolderID reste
// identique des deux côtés, donc on fusionne d'abord sur cet identifiant quand il existe.
// TED prioritaire sur BOAMP quand les deux couvrent le même avis (même ContractFolderID) :
// BOAMP ne renseigne jamais de description (toujours '' dans boamp.js), le prix vient d'un
// champ moins fiable, et TED a une meilleure couverture de date de clôture (voir scrapers/ted.js)
// — le score seul ne suffit pas à départager de façon prévisible.
function estTED(ao) { return !!ao.url && ao.url.includes('ted.europa.eu'); }

function dedupCrossSource(aos) {
  const parCF = new Map();
  const sansCF = [];
  for (const ao of aos) {
    if (!ao.contractFolderId) { sansCF.push(ao); continue; }
    const existant = parCF.get(ao.contractFolderId);
    if (!existant) { parCF.set(ao.contractFolderId, ao); continue; }
    const aoTED = estTED(ao), existantTED = estTED(existant);
    if (aoTED !== existantTED) {
      if (aoTED) parCF.set(ao.contractFolderId, ao);
      // sinon existant (déjà TED) reste en place
    } else if (ao.score > existant.score) {
      parCF.set(ao.contractFolderId, ao);
    }
  }
  return dedupParTitre([...parCF.values(), ...sansCF]);
}

// Titre normalisé pour la clé d'upsert Supabase : les marchés à lots multiples voient leur
// `objet` BOAMP changer légèrement d'un scan à l'autre (lots ajoutés/réordonnés), donc on ne
// garde que la partie stable avant le premier séparateur de lot pour que la clé ne bouge pas.
function normTitreForKey(t) {
  const s = normStr(t).replace(/\s+/g, ' ').trim();
  return s.split(/\s*\|\s*|\s*\[\+\d+ autres lots\]/)[0].trim().slice(0, 100);
}

// Clé d'upsert Supabase : préfère toujours un identifiant natif de la plateforme source
// (bien plus stable qu'un hash de titre, qui bouge à chaque republication/amendement) —
// idweb BOAMP ou numéro de publication TED, extraits directement de l'URL déjà stockée,
// à défaut titre normalisé. Le ContractFolderID n'est PAS utilisé ici volontairement : il
// dépend d'un appel réseau séparé (XML TED) qui peut échouer un jour et réussir le lendemain
// pour le même avis — l'utiliser dans la clé persistée la rendrait instable d'un scan à
// l'autre pour toute AO BOAMP/TED, pas seulement les doublons cross-source qu'il visait à
// résoudre. Il reste utilisé uniquement dans dedupCrossSource() pour la fusion en mémoire,
// où une extraction manquée un jour donné n'a qu'un impact cosmétique temporaire.
function computeAOKey(ao) {
  if (ao.url) {
    let m = ao.url.match(/boamp\.fr\/pages\/avis\/\?q=idweb:([\w-]+)/);
    if (m) return `boamp-${m[1]}`;
    m = ao.url.match(/ted\.europa\.eu\/[a-z]{2}\/notice\/-\/detail\/([\w-]+)/);
    if (m) return `ted-${m[1]}`;
  }
  return `${normStr(ao.source)}-${hash(normTitreForKey(ao.titre))}`;
}

module.exports = { normStr, normTitre, normTitreForKey, filtrerAOs, dedupCrossSource, computeAOKey };
