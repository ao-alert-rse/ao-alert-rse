const fetch = require('node-fetch');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

// API OpenDataSoft de la DILA — données publiques, pas d'auth requise
const API_BASE = 'https://boamp-datadila.opendatasoft.com/api/records/1.0/search/';

// Mots-clés RSE/TEE/RH recherchés directement dans le champ objet BOAMP
const KEYWORDS_BOAMP = [
  // Missions conseil/accompagnement RSE
  'accompagnement RSE', 'conseil RSE', 'diagnostic RSE',
  'stratégie RSE', 'démarche RSE', 'plan RSE', 'audit RSE',
  'rapport RSE', 'politique RSE', 'label RSE',
  // Développement durable — missions conseil
  'accompagnement développement durable', 'conseil développement durable',
  'assistance développement durable',
  // Bilan carbone / GES — toujours une mission conseil
  'bilan carbone', 'bilan GES', 'bilan d\'émissions',
  'plan de transition', 'feuille de route carbone',
  // Transition écologique — missions formation/conseil
  'formation transition écologique', 'accompagnement transition',
  // RH/QVT/QVCT — missions conseil
  'accompagnement QVT', 'démarche QVT', 'diagnostic QVT',
  'accompagnement QVCT', 'démarche QVCT', 'accord QVCT',
  'égalité professionnelle', 'index égalité',
  'accord diversité', 'politique diversité',
  // Réglementation 2024-2026 — CSRD, devoir de vigilance
  'CSRD', 'accompagnement CSRD', 'reporting CSRD',
  'devoir de vigilance', 'plan de vigilance',
  'DPEF', 'reporting extra-financier',
  'neutralité carbone', 'décarbonation',
  // Durabilité / ESG (souvent absent des titres RSE classiques)
  'rapport de durabilité', 'information en matière de durabilité',
  'performance extra-financière', 'critères ESG',
  'achats responsables', 'achats durables',
  'économie circulaire', 'écoconception',
  'numérique responsable',
  // Post loi PACTE
  'entreprise à mission',
  // Formation générique RSE/ESG/CSRD
  'formation RSE', 'formation ESG', 'formation CSRD', 'formation développement durable',
  'fresque du climat', 'sensibilisation RSE', 'formation climat',
  // Cadres/labels/normes (souvent le seul signal RSE dans un titre BOAMP générique)
  'ISO 26000', 'double matérialité', 'gouvernance durable', 'certification RSE',
  'EcoVadis', 'notation ESG', 'ESRS',
  // Carbone — compléments à bilan carbone/GES
  // ("plan climat" exclu : matche systématiquement "Plan Climat Air Energie Territorial",
  // document d'urbanisme cité dans quasi toutes les révisions de SCoT/PLU, hors sujet ;
  // "empreinte carbone" exclu : critère d'attribution fréquent sur des marchés de
  // fournitures — biscuits, fruits, gardiennage... — pas des missions de conseil)
  'SBTi', 'scope 3', 'accompagnement climat',
  // Achats responsables / éthique — compléments
  // ("due diligence" exclu : ambigu avec la due diligence financière/M&A hors RSE)
  'fournisseurs responsables', 'droits humains', 'Sapin II',
  // Autres
  'communication responsable', 'analyse du cycle de vie',
];

// Noms validés dans BOAMP (testés avec nhits > 0)
// OCAPIAT et OPCO EP absents de BOAMP → à surveiller manuellement ou via leurs sites
const ACHETEURS = [
  // OPCOs
  { q: 'OPCO ATLAS',      source: 'ATLAS'        },
  { q: 'OPCO 2i',         source: '2i'           },
  { q: 'Afdas',           source: 'AFDAS'        },
  { q: 'AKTO',            source: 'AKTO'         },
  { q: 'CONSTRUCTYS',     source: 'CONSTRUCTYS'  },
  { q: 'UNIFORMATION',    source: 'UNIFORMATION' },
  { q: 'OPCO Mobilités',  source: 'OPCO Mobilités' },
  { q: 'OPCO Santé',      source: 'OPCO Santé'   },
  { q: 'Opcommerce',      source: 'Opcommerce'   },
  // Organismes RSE/TEE/RH — noms validés dans BOAMP le 2026-06-26
  // AFNOR et ADEME : 0 AO actives à date, mais publient ponctuellement
  { q: 'AFNOR',           source: 'AFNOR'        },
  { q: 'ADEME',           source: 'ADEME'        },
  { q: 'Anact',           source: 'ANACT'        },
  // Grandes régions (toutes actives dans BOAMP)
  { q: 'Région Ile de France',          source: 'Région Île-de-France'     },
  { q: 'Région Auvergne-Rhône-Alpes',   source: 'Région AURA'              },
  { q: 'Région Occitanie',              source: 'Région Occitanie'         },
  { q: 'Région Nouvelle-Aquitaine',     source: 'Région Nouvelle-Aquitaine'},
  { q: 'Région Grand Est',              source: 'Région Grand Est'         },
  // Ministères
  { q: 'Ministère Transition Ecologique', source: 'Min. Transition Écologique' },
  // Organismes publics à fort potentiel RSE/durabilité (validés BOAMP 29/06/2026)
  { q: 'Caisse des dépôts',  source: 'Caisse des dépôts' },
  // Régions supplémentaires
  { q: 'REGION NORMANDIE',                    source: 'Région Normandie'              },
  { q: 'Région Bretagne',                     source: 'Région Bretagne'               },
  { q: 'Région Hauts-de-France',              source: 'Région Hauts-de-France'        },
  { q: "Région Provence-Alpes-Côte d'Azur",   source: 'Région PACA'                  },
  { q: 'Région Bourgogne-Franche-Comté',      source: 'Région BFC'                   },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Interroge BOAMP pour un acheteur donné et retourne les AO normalisées.
 * Le champ `datelimitereponse` est direct : pas de parsing HTML.
 */
async function queryBOAMP(nomacheteur, source) {
  // Filtre : seulement les AOs dont la date limite est aujourd'hui ou dans le futur.
  // datelimitereponse n'est pas toujours renseigné par BOAMP (constaté sur des avis pourtant
  // bien actifs) — datefindiffusion sert de repli dans normalizeRecord(), donc il faut aussi
  // l'inclure ici, sinon ces AOs ne remontent jamais du tout (filtrées avant même d'être vues).
  const today = localToday();
  const params = new URLSearchParams({
    dataset: 'boamp',
    q: `nomacheteur:"${nomacheteur}" AND (datelimitereponse>=${today} OR datefindiffusion>=${today})`,
    rows: '100',
    sort: 'datelimitereponse',
    output: 'json',
  });

  let data;
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(`${API_BASE}?${params}`, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.error(`  ❌ BOAMP/${source} tentative ${attempt + 1}/3 : ${err.message}`);
      if (attempt < 2) await sleep(delay);
    }
  }

  if (!data || !data.records) return [];

  return data.records.map(rec => normalizeRecord(rec, source));
}

// Revérifie une AO déjà en base dont la date de clôture n'a jamais pu être déterminée au
// premier scan — sans filtre de date cette fois (contrairement à queryBOAMP/queryBOAMPKeywords),
// pour retrouver l'avis même s'il n'est plus actif et récupérer sa vraie date via le même
// repli datefindiffusion que normalizeRecord() utilise déjà.
async function refetchBoampByIdweb(idweb) {
  const params = new URLSearchParams({
    dataset: 'boamp',
    q: `idweb:"${idweb}"`,
    rows: '1',
    output: 'json',
  });
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(`${API_BASE}?${params}`, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rec = (data.records || [])[0];
      if (!rec) return null;
      return normalizeRecord(rec, null);
    } catch (err) {
      if (attempt < 2) await sleep(delay);
    }
  }
  return null;
}

// Extrait le montant depuis le blob JSON du champ "donnees".
// Gère deux formats coexistants dans BOAMP :
//   - eForms (post-2023) : objets {"@currencyID":"EUR","#text":"440000"}
//   - Ancien format       : clés numériques "valeur", "montant", "montant_estime"…
const MONEY_KEYS = /montant|valeur|estimat|amount|value|budget/i;
function extractPrixDonnees(donnees) {
  if (!donnees) return null;
  let d;
  try { d = typeof donnees === 'string' ? JSON.parse(donnees) : donnees; } catch { return null; }
  const amounts = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    // eForms : {"@currencyID":"EUR","#text":"440000"}
    if (obj['@currencyID'] && obj['#text']) {
      const v = parseFloat(obj['#text']);
      if (!isNaN(v) && v > 1000) amounts.push(v);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      // Ancien format : clé monétaire + valeur numérique ou chaîne
      if (MONEY_KEYS.test(k)) {
        if (typeof v === 'number' && v > 1000) { amounts.push(v); continue; }
        if (typeof v === 'string') {
          const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(n) && n > 1000) { amounts.push(n); continue; }
        }
      }
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') walk(v);
    }
  }
  walk(d);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

// Les avis eForms (au-dessus du seuil UE) sont publiés une seule fois puis mirorés sur BOAMP
// ET sur TED : le champ ContractFolderID identifie le dossier de marché et reste identique
// des deux côtés — bien plus fiable qu'un rapprochement par titre pour dédupliquer ces cas.
function extractContractFolderId(donnees) {
  if (!donnees) return null;
  let d;
  try { d = typeof donnees === 'string' ? JSON.parse(donnees) : donnees; } catch { return null; }
  let found = null;
  function walk(obj) {
    if (found || !obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (found) return;
      if (/ContractFolderID$/.test(k) && typeof v === 'string') { found = v; return; }
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') walk(v);
    }
  }
  walk(d);
  return found;
}

function normalizeRecord(rec, sourceOverride) {
  const f = rec.fields;
  // datefindiffusion ("date de fin de diffusion") n'est PAS la date limite de réponse — c'est
  // juste la date à laquelle l'avis arrête d'être affiché sur BOAMP, sans rapport garanti avec
  // la vraie deadline. Vérifié en direct sur un avis "cn-social" (services sociaux/spécifiques) :
  // aucune date limite structurée n'existe côté BOAMP/TED pour ce régime, la procédure réelle est
  // gérée sur la plateforme externe du profil acheteur (ex. achatpublic.com). L'utiliser comme
  // repli affichait une date fausse plutôt qu'une date inconnue — mieux vaut ne rien afficher.
  const dateClôture = f.datelimitereponse ? f.datelimitereponse.slice(0, 10) : '';
  const statut = dateClôture
    ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé')
    : 'Ouvert';
  const titre = f.objet || '';
  const description = '';
  const score = scoreRSETEE(titre, description);
  const prixRaw = extractPrixDonnees(f.donnees);
  const prix = prixRaw && prixRaw <= 50_000_000 ? prixRaw : null;
  return {
    idweb: f.idweb || '',
    contractFolderId: extractContractFolderId(f.donnees),
    titre,
    description,
    dateClôture,
    url: f.url_avis || `https://www.boamp.fr/pages/avis/?q=idweb:${f.idweb}`,
    statut,
    source: sourceOverride || f.nomacheteur || 'BOAMP',
    score,
    prix,
  };
}

/**
 * Recherche sur tout le BOAMP par mots-clés RSE/TEE dans le champ objet.
 * Pagine jusqu'à maxPages * 100 résultats.
 */
async function queryBOAMPKeywords(maxPages = 3) {
  const today = localToday();
  const kwQuery = KEYWORDS_BOAMP.map(k => `objet:"${k}"`).join(' OR ');
  // Voir le commentaire dans queryBOAMP() : datefindiffusion en repli, sinon ces AOs
  // n'apparaissent jamais dans les résultats malgré une date limite bien réelle.
  const q = `(${kwQuery}) AND (datelimitereponse>=${today} OR datefindiffusion>=${today})`;

  const allRecords = [];

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      dataset: 'boamp',
      q,
      rows: '100',
      start: String(page * 100),
      sort: 'datelimitereponse',
      output: 'json',
    });

    let data;
    for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
      try {
        const res = await fetch(`${API_BASE}?${params}`, {
          headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
          timeout: 15000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        console.error(`  ❌ BOAMP/keywords tentative ${attempt + 1}/3 : ${err.message}`);
        if (attempt < 2) await sleep(delay);
      }
    }

    if (!data || !data.records || data.records.length === 0) break;
    allRecords.push(...data.records);

    // Arrêt anticipé si on a tout récupéré
    if (allRecords.length >= data.nhits) break;
  }

  return allRecords.map(rec => normalizeRecord(rec, null));
}

/**
 * Interroge tous les OPCOs en parallèle via BOAMP.
 * Retourne un tableau de { source, aos[] } pour chaque OPCO.
 */
async function scrapeBOAMP() {
  const results = await Promise.all(
    ACHETEURS.map(async a => {
      const aos = await queryBOAMP(a.q, a.source).catch(err => {
        console.error(`  ❌ Erreur BOAMP/${a.source} : ${err.message}`);
        return [];
      });
      return { source: a.source, aos };
    })
  );
  return results;
}

module.exports = { scrapeBOAMP, queryBOAMPKeywords, refetchBoampByIdweb };
