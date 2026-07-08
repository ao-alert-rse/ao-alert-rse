const fetch = require('node-fetch');
const { scoreRSETEE } = require('../utils/scorer');
const { localToday } = require('../utils/date');

const API = 'https://api.ted.europa.eu/v3/notices/search';

// Mots-clés RSE/TEE/RH recherchés dans le titre du lot (champ title-lot)
// Pas d'accents : le moteur TED est insensible aux accents pour l'opérateur ~
const TITLE_KW = [
  'RSE',
  'bilan carbone', 'bilan GES', 'bilan emissions',
  'transition ecologique', 'feuille de route carbone', 'plan de transition',
  'QVT', 'QVCT', 'egalite professionnelle', 'index egalite',
  'developpement durable',
  'responsabilite societale',
  'accompagnement RSE', 'conseil RSE', 'diagnostic RSE', 'strategie RSE',
  // Réglementation 2024-2026
  'CSRD', 'devoir de vigilance', 'plan de vigilance',
  'DPEF', 'reporting extra-financier',
  'neutralite carbone', 'decarbonation',
  // Post loi PACTE
  'entreprise a mission',
  // Cadres/labels/normes
  'ISO 26000', 'double materialite', 'gouvernance durable', 'certification RSE',
  'EcoVadis', 'notation ESG', 'ESRS',
  // Carbone — compléments
  // ("plan climat" exclu : matche systématiquement "Plan Climat Air Energie Territorial",
  // document d'urbanisme cité dans quasi toutes les révisions de SCoT/PLU, hors sujet ;
  // "empreinte carbone" exclu : critère d'attribution fréquent sur des marchés de
  // fournitures — biscuits, fruits, gardiennage... — pas des missions de conseil)
  'SBTi', 'scope 3', 'accompagnement climat',
  // Achats responsables / éthique
  // ("due diligence" exclu : ambigu avec la due diligence financière/M&A hors RSE)
  'fournisseurs responsables', 'droits humains', 'Sapin II',
  // Autres
  'communication responsable', 'analyse du cycle de vie',
];

const FIELDS = [
  'title-lot',
  'description-lot',
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-request-date-lot',
  'deadline-date-lot',
  'deadline-date-part',
  'notice-type',
  'publication-date',
  'organisation-name-buyer',
  'buyer-name',
  'publication-number',
  'buyer-country',
  'links',
  'estimated-value-lot',
];

// Avis d'attribution/résultat (le marché est déjà attribué) : pas de date limite à afficher,
// et c'est normal — ce n'est pas un échec d'extraction, l'AO est simplement déjà fermée.
const AWARD_NOTICE_PREFIXES = ['can-', 'cn-desg-result'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Montant max plausible pour une mission RSE — au-delà c'est un plafond cadre agrégé
const XML_PRICE_CAP = 50_000_000;

function extractXmlAmounts(xml, tagPattern) {
  // currencyID peut ne pas être le seul attribut — [^>]* absorbe les attributs suivants
  const re = new RegExp(
    `<(?:${tagPattern})[^>]*currencyID="EUR"[^>]*>(\\d+(?:\\.\\d+)?)<`, 'g'
  );
  const vals = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 1000) vals.push(v);
  }
  return vals;
}

function extractPrixFromXml(xml) {
  // 1. Montants par lot (BT-27-Lot) — les plus fiables pour une mission spécifique
  const lotAmounts = extractXmlAmounts(xml, 'cbc:EstimatedTotalAmount');
  if (lotAmounts.length > 0) {
    const best = Math.max(...lotAmounts);
    return best <= XML_PRICE_CAP ? best : null;
  }

  // 2. Fallback : montant global du contrat / plafond cadre
  const globalAmounts = extractXmlAmounts(
    xml,
    'cbc:EstimatedOverallContractAmount|efbc:FrameworkMaximumAmount'
  );
  if (globalAmounts.length > 0) {
    const best = Math.max(...globalAmounts);
    return best <= XML_PRICE_CAP ? best : null;
  }

  return null;
}

// ContractFolderID : identifiant du dossier de marché, identique sur TED et sur BOAMP pour un
// même avis eForms publié au-dessus du seuil UE — sert à dédupliquer les avis cross-source
// (voir extractContractFolderId dans scrapers/boamp.js) au lieu de comparer des titres.
function extractContractFolderIdFromXml(xml) {
  const m = xml.match(/<cbc:ContractFolderID>([^<]+)<\/cbc:ContractFolderID>/);
  return m ? m[1] : null;
}

// Sans retry ici, un simple raté réseau ponctuel (fréquent sur ce endpoint) empêchait
// l'extraction du ContractFolderID, laissant des doublons cross-source BOAMP/TED non
// réconciliables (le filet de sécurité dedup-reconcile.js ne peut rien fusionner si le
// champ n'a jamais été renseigné sur aucune des deux lignes).
async function fetchTEDXmlDetails(pubNum) {
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const r = await fetch(`https://ted.europa.eu/en/notice/${pubNum}/xml`, {
        headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
        timeout: 12000,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      return { prix: extractPrixFromXml(xml), contractFolderId: extractContractFolderIdFromXml(xml) };
    } catch (err) {
      if (attempt < 2) await sleep(delay);
    }
  }
  return { prix: null, contractFolderId: null };
}

// Calcule la date de clôture + le statut à partir des champs bruts renvoyés par l'API TED.
// Partagé entre normalizeNotice() (scan initial, scope ACTIVE) et refetchTedDeadline()
// (revérification d'une AO déjà en base, scope ALL) pour ne pas dupliquer cette logique.
function computeDeadlineEtStatut(n) {
  const rawDate =
    (n['deadline-receipt-tender-date-lot'] || [])[0] ||
    (n['deadline-receipt-request-date-lot'] || [])[0] ||
    (n['deadline-date-lot'] || [])[0] ||
    (n['deadline-date-part'] || [])[0] ||
    '';
  let dateClôture = rawDate ? rawDate.slice(0, 10) : '';
  const noticeType = Array.isArray(n['notice-type']) ? (n['notice-type'][0] || '') : (n['notice-type'] || '');
  const isAwardNotice = AWARD_NOTICE_PREFIXES.some(p => noticeType.startsWith(p));
  const statut = dateClôture
    ? (dateClôture >= localToday() ? 'Ouvert' : 'Fermé')
    : (isAwardNotice ? 'Fermé' : 'Ouvert');
  // Un avis d'attribution n'a par nature aucune date limite de candidature — la date de
  // publication de l'avis sert de repère "clos depuis" pour que l'AO se masque correctement
  // au lieu de rester "Ouvert" faute de date exploitable.
  if (!dateClôture && isAwardNotice) {
    const pubDate = Array.isArray(n['publication-date']) ? n['publication-date'][0] : n['publication-date'];
    if (pubDate) dateClôture = pubDate.slice(0, 10);
  }
  return { dateClôture, statut };
}

// Revérifie une AO déjà en base dont la date de clôture n'a jamais pu être déterminée au
// premier scan (scope ACTIVE uniquement) — sans ça, une AO comme un avis d'attribution publié
// après une refonte de champ reste "Ouvert" en base pour toujours, personne ne la revoit jamais
// puisqu'elle ne matche plus les requêtes de scan actives. scope: 'ALL' retrouve l'avis même
// s'il n'est plus actif.
async function refetchTedDeadline(pubNum) {
  const fields = [
    'notice-type',
    'publication-date',
    'deadline-receipt-tender-date-lot',
    'deadline-receipt-request-date-lot',
    'deadline-date-lot',
    'deadline-date-part',
  ];
  for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr',
        },
        body: JSON.stringify({
          query: `publication-number = "${pubNum}"`,
          fields,
          page: 1,
          limit: 1,
          scope: 'ALL',
        }),
        timeout: 15000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const notice = (data.notices || [])[0];
      if (!notice) return null;
      return computeDeadlineEtStatut(notice);
    } catch (err) {
      if (attempt < 2) await sleep(delay);
    }
  }
  return null;
}

// Extrait le texte français (ou premier disponible) d'un champ multilingue TED
function frText(obj) {
  if (!obj) return '';
  const langs = ['fra', 'FRA', 'fre', 'eng', 'ENG'];
  for (const l of langs) {
    if (obj[l]) {
      const v = obj[l];
      return Array.isArray(v) ? v.join(' | ') : String(v);
    }
  }
  const first = Object.values(obj)[0];
  if (!first) return '';
  return Array.isArray(first) ? first.join(' | ') : String(first);
}

// Extrait un tableau de chaînes (un élément par lot) depuis un champ multilingue TED
function frArray(obj) {
  if (!obj) return [];
  const langs = ['fra', 'FRA', 'fre', 'eng', 'ENG'];
  for (const l of langs) {
    if (obj[l]) {
      const v = obj[l];
      return Array.isArray(v) ? v.map(String) : [String(v)];
    }
  }
  const first = Object.values(obj)[0];
  if (!first) return [];
  return Array.isArray(first) ? first.map(String) : [String(first)];
}

// Pour un marché multi-lots : affiche le meilleur lot RSE + "[+N autres lots]"
function buildTitreMultiLot(titreLots, descLots) {
  if (titreLots.length <= 1) return titreLots[0] || '';

  // Départage déterministe par titre en cas d'égalité de score : l'ordre des lots renvoyé
  // par l'API TED n'est pas garanti stable d'un appel à l'autre, donc trier uniquement par
  // score (tri stable de JS) peut faire gagner un lot différent selon l'ordre reçu, ce qui
  // change le titre tronqué et casse la clé d'upsert Supabase d'un scan à l'autre.
  const scored = titreLots.map((titre, i) => ({
    titre,
    score: scoreRSETEE(titre, descLots[i] || ''),
  })).sort((a, b) => b.score - a.score || a.titre.localeCompare(b.titre));

  const best = scored[0].score > 0 ? scored[0] : { titre: titreLots[0] };
  const titre = best.titre.length > 100 ? best.titre.slice(0, 97) + '…' : best.titre;
  return `${titre} [+${titreLots.length - 1} autres lots]`;
}

// Score = meilleur lot individuel (pas dilué par les lots hors-sujet)
function bestScoreMultiLot(titreLots, descLots) {
  if (titreLots.length <= 1) return scoreRSETEE(titreLots[0] || '', descLots[0] || '');
  return Math.max(...titreLots.map((titre, i) => scoreRSETEE(titre, descLots[i] || '')));
}

function normalizeNotice(n) {
  const pubNum = n['publication-number'] || '';

  const titreLots = frArray(n['title-lot']);
  const descLots = frArray(n['description-lot']);

  const titre = titreLots.length > 1
    ? buildTitreMultiLot(titreLots, descLots)
    : (titreLots[0] || '');

  // Nettoyer le HTML des descriptions TED (les acheteurs y incluent parfois du HTML)
  const BOILERPLATE = /^(la (consultation|proc[eé]dure|pr[eé]sente)|le (pr[eé]sent|march[eé]|lot|d[eé]tail)|il s.agit|march[eé] (de (services|fournitures|travaux)|public)|proc[eé]dure (d.appel|ouverte|adapt[eé]e)|appel d.offres (ouvert|restreint)|les (prestations|travaux|fournitures) (feront|attendues|vis[eé]es|demand[eé]es)|conform[eé]ment [àa] l)/i;
  // Supprime les préfixes introductifs pour extraire le contenu après ":"
  const STRIP_PREFIX = /^(la pr[eé]sente consultation a pour objet\s*:\s*|l.objet [^:]{0,60}:\s*|il est pr[eé]cis[eé] que\s*)/i;
  const cleanLotDesc = (d) => {
    let s = (d || '')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>') // double-encoded
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    s = s.replace(STRIP_PREFIX, '');
    const sentences = s.split(/(?<=[.!?])\s+/);
    const meaningful = sentences.find(p => !BOILERPLATE.test(p.trim()));
    return (meaningful || s).slice(0, 350);
  };

  // Multi-lots : ne garder que les descriptions des lots RSE (évite de joindre 10 lots hors-sujet)
  // Si la description nettoyée ressemble au titre du lot, on la supprime (redondant)
  const buildMultiDesc = (t, d) => {
    const c = cleanLotDesc(d);
    return c && !t.toLowerCase().startsWith(c.slice(0, 30).toLowerCase()) ? c : null;
  };
  const description = titreLots.length > 1
    ? titreLots
        .map((t, i) => scoreRSETEE(t, descLots[i] || '') > 0 ? buildMultiDesc(t, descLots[i]) : null)
        .filter(Boolean)
        .join(' | ')
        .slice(0, 400)
    : cleanLotDesc(descLots[0]).slice(0, 400);

  const { dateClôture, statut } = computeDeadlineEtStatut(n);

  const url = `https://ted.europa.eu/fr/notice/-/detail/${pubNum}`;

  const source =
    frText(n['organisation-name-buyer']) ||
    frText(n['buyer-name']) ||
    'TED/FR';

  const score = bestScoreMultiLot(titreLots, descLots);

  const estimatedValues = n['estimated-value-lot'];
  const prixRaw = Array.isArray(estimatedValues) && estimatedValues.length > 0
    ? Math.max(...estimatedValues.map(v => parseFloat(v) || 0))
    : null;
  const prix = prixRaw && prixRaw > 0 && prixRaw <= XML_PRICE_CAP ? prixRaw : null;

  return { idweb: pubNum, contractFolderId: null, titre, description, dateClôture, url, statut, source, score, prix };
}

/**
 * Interroge TED pour les AOs françaises RSE/TEE/RH actives.
 * Pagine si le total dépasse 100.
 */
async function scrapeTED() {
  const kwQuery = TITLE_KW.map(k => `title-lot ~ "${k}"`).join(' OR ');
  const query = `(${kwQuery}) AND buyer-country = "FRA"`;

  const allNotices = [];
  let page = 1;
  let totalHits = null;

  while (true) {
    const body = JSON.stringify({
      query,
      fields: FIELDS,
      page,
      limit: 100,
      scope: 'ACTIVE',
    });

    let data;
    for (let attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr',
          },
          body,
          timeout: 20000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        console.error(`  ❌ TED p${page} tentative ${attempt + 1}/3 : ${err.message}`);
        if (attempt < 2) await sleep(delay);
      }
    }

    if (!data || !data.notices || data.notices.length === 0) break;

    if (totalHits === null) totalHits = data.totalNoticeCount;
    allNotices.push(...data.notices);

    if (allNotices.length >= totalHits) break;
    page++;
  }

  // Dédupliquer par publication-number (TED peut retourner le même AO sur plusieurs pages)
  const seen = new Set();
  const unique = allNotices.filter(n => {
    const k = n['publication-number'];
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const normalized = unique.map(normalizeNotice);

  // Enrichir avec le XML TED (prix manquant + contractFolderId, nécessaire pour tous —
  // par lots de 5 pour éviter le 429)
  for (let i = 0; i < normalized.length; i += 5) {
    const batch = normalized.slice(i, i + 5);
    await Promise.all(batch.map(async ao => {
      const { prix, contractFolderId } = await fetchTEDXmlDetails(ao.idweb);
      if (!ao.prix) ao.prix = prix;
      ao.contractFolderId = contractFolderId;
    }));
    if (i + 5 < normalized.length) await sleep(300);
  }

  return normalized;
}

module.exports = { scrapeTED, refetchTedDeadline };
