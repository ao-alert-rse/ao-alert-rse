// Axe 1 — THÈME : le sujet de l'AO correspond à un domaine métier RSE/ESG/Transition
const THEMES_FORTS = [
  // RSE / Stratégie
  'accompagnement rse', 'conseil rse', 'diagnostic rse', 'stratégie rse',
  'démarche rse', 'plan rse', 'audit rse', 'rapport rse', 'politique rse', 'label rse',
  'iso 26000', 'double matérialité', 'matérialité', 'gouvernance durable', 'feuille de route rse',
  // Climat / Décarbonation
  'bilan carbone', 'bilan ges', "bilan d'émissions", 'empreinte carbone',
  'feuille de route carbone', 'plan de transition', 'plan climat',
  'neutralité carbone', 'net zero', 'sbti', 'ghg protocol',
  'scope 1', 'scope 2', 'scope 3',
  // Reporting ESG
  'csrd', 'esrs', 'vsme', 'dpef', 'rapport de durabilité',
  'reporting esg', 'reporting extra-financier',
  // Labels & évaluations
  'ecovadis', 'b corp', 'notation esg', 'certification rse',
  // Achats responsables
  'achats responsables', 'achats durables', 'due diligence', 'devoir de vigilance',
  'fournisseurs responsables', 'cartographie fournisseurs', 'supply chain responsable',
  // Éthique & conformité
  'sapin ii', 'droits humains', 'alerte éthique', 'plan de vigilance',
  // Formation RSE spécifique
  'formation rse', 'formation climat', 'formation esg', 'formation csrd',
  'fresque du climat', 'parcours pédagogique',
  // Économie circulaire
  'économie circulaire', 'analyse du cycle de vie', 'écoconception',
  // Numérique responsable
  'numérique responsable', 'green it', 'it for green', 'sobriété numérique',
  // Communication RSE
  'communication responsable', 'communication à impact', 'engagement parties prenantes',
  // QVT / Social
  'accompagnement qvt', 'démarche qvt', 'diagnostic qvt',
  'accompagnement qvct', 'démarche qvct', 'accord qvct', 'diagnostic qvct',
  'risques psychosociaux', 'égalité professionnelle', 'index égalité',
  'accord diversité',
  // Post loi PACTE
  'entreprise à mission', "raison d'être",
];

const THEMES_FAIBLES = [
  'rse', 'esg', 'responsabilité sociétale',
  'transition écologique', 'transition énergétique',
  'développement durable', 'durabilité',
  'carbone', 'ges', 'décarbonation',
  'qvt', 'qvct', 'qualité de vie au travail',
  'diversité', 'inclusion',
  'extra-financier', 'taxonomie européenne',
  'biodiversité',
  'acv', 'réemploi', 'sobriété',
];

// Axe 2 — VERBE / ACTION : l'AO cherche une prestation de conseil/accompagnement/formation
const VERBES_POSITIFS = [
  'diagnostic', 'audit', 'analyse', 'évaluation', 'cartographie',
  'benchmark', 'état des lieux',
  'accompagnement', 'conseil', 'expertise', 'assistance',
  'amo', "assistance à maîtrise d'ouvrage",
  'appui méthodologique', 'appui stratégique',
  'élaboration', 'structuration', 'conception', 'formalisation',
  'rédaction', 'co-construction', 'ingénierie',
  'déploiement', 'mise en oeuvre', 'mise en place', 'animation', 'pilotage',
  'révision', 'actualisation', 'mise à jour', 'renouvellement',
  'amélioration continue', 'optimisation',
  'formation', 'sensibilisation', 'acculturation',
  'montée en compétences', 'e-learning', 'fresque', 'atelier participatif',
];

// Signaux négatifs — clairement hors périmètre conseil RSE
const SIGNAUX_NEGATIFS = [
  // Travaux / opérations physiques
  'travaux', 'nettoyage', 'gardiennage', 'sécurité incendie',
  // Fournitures / matériel
  'fournitures de bureau', 'matériel', 'véhicule', 'mobilier', 'impression', 'routage',
  // Services généraux
  'assurance', 'banque', 'audit comptable', 'restauration', 'traiteur',
  'hébergement', 'location', 'transport', 'reprographie', 'téléphonie',
  // Espaces / logistique
  'espaces verts', 'voirie', 'collecte de déchets',
  // Services divers
  "prestation d'insertion", "prestations d'insertion",
  'kiosque', 'factotum',
  // Urbanisme / aménagement concerté (≠ conseil RSE entreprise)
  'zac', 'aménagement concerté', "opération d'aménagement", 'orcod',
  'séquano', 'grand paris aménagement',
  // Alimentation
  'circuits courts', 'restauration scolaire', 'produits alimentaires',
  // Petite enfance
  'berceaux', 'crèche',
  // IT opérationnel (≠ numérique responsable)
  'solution de suivi', 'maintenance développement', 'maintenance informatique',
  // Audit hors RSE
  'audit qualité produit',
  // Entités foncières / aménagement
  'établissement public foncier',
  // Accessibilité handicap/RGAA (≠ numérique responsable RSE)
  'mise en accessibilité',
  // Santé / soins hospitaliers
  'psychiatrie', 'aide-soignant',
  // Alimentation froide
  'liaison froide',
  // Catalogues d'avantages salariaux (type AGOSPAP)
  'avantages salariés', 'action sociale des agents', 'produits locatifs',
];

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// \b sur mots seuls (évite biodiversité→diversité), includes() sur expressions multi-mots
function matches(texte, kw) {
  const t = norm(texte);
  const k = norm(kw);
  if (!k.includes(' ')) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${esc}\\b`).test(t);
  }
  return t.includes(k);
}

/**
 * Score RSE/TEE sur deux axes combinés :
 * - Axe thème  : le sujet de l'AO couvre un domaine RSE/ESG/Transition
 * - Axe verbe  : l'AO cherche du conseil/accompagnement/formation (pas travaux/fourniture)
 * Bonus +15 si les deux axes sont présents — mission de conseil RSE confirmée.
 * Pénalité -40 par signal clairement hors périmètre.
 * Seuil de passage dans index.js : score >= 20.
 */
function scoreRSETEE(titre, description) {
  let score = 0;
  let hasTheme = false;
  let hasVerb = false;

  for (const kw of THEMES_FORTS) {
    if (matches(titre, kw)) { score += 35; hasTheme = true; }
    else if (matches(description, kw)) { score += 18; hasTheme = true; }
  }

  for (const kw of THEMES_FAIBLES) {
    if (matches(titre, kw)) { score += 20; hasTheme = true; }
    else if (matches(description, kw)) { score += 10; hasTheme = true; }
  }

  for (const kw of VERBES_POSITIFS) {
    if (matches(titre, kw)) { score += 15; hasVerb = true; }
    else if (matches(description, kw)) { score += 8; hasVerb = true; }
  }

  if (hasTheme && hasVerb) score += 15;

  for (const kw of SIGNAUX_NEGATIFS) {
    if (matches(titre, kw) || matches(description, kw)) score -= 40;
  }

  // Sans aucun thème RSE/ESG/TEE, l'AO n'est pas une mission conseil pertinente
  if (!hasTheme) return 0;

  return score;
}

module.exports = { scoreRSETEE };
