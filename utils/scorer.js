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

  if (!hasTheme) return 0;

  return score;
}

/**
 * Même logique que scoreRSETEE, mais retourne aussi le détail des mots-clés matchés.
 * Utilisé uniquement par reporter.js pour l'affichage dans le panel.
 */
function scoreRSETEEDetailed(titre, description) {
  let score = 0;
  let hasTheme = false;
  let hasVerb = false;
  const matched = [];

  for (const kw of THEMES_FORTS) {
    if (matches(titre, kw))            { score += 35; hasTheme = true; matched.push({ kw, cat: 'theme_fort',  pts: 35, inTitre: true }); }
    else if (matches(description, kw)) { score += 18; hasTheme = true; matched.push({ kw, cat: 'theme_fort',  pts: 18, inTitre: false }); }
  }
  for (const kw of THEMES_FAIBLES) {
    if (matches(titre, kw))            { score += 20; hasTheme = true; matched.push({ kw, cat: 'theme_faible', pts: 20, inTitre: true }); }
    else if (matches(description, kw)) { score += 10; hasTheme = true; matched.push({ kw, cat: 'theme_faible', pts: 10, inTitre: false }); }
  }
  for (const kw of VERBES_POSITIFS) {
    if (matches(titre, kw))            { score += 15; hasVerb = true; matched.push({ kw, cat: 'verbe', pts: 15, inTitre: true }); }
    else if (matches(description, kw)) { score +=  8; hasVerb = true; matched.push({ kw, cat: 'verbe', pts:  8, inTitre: false }); }
  }

  const bonus = (hasTheme && hasVerb) ? 15 : 0;
  score += bonus;

  if (!hasTheme) score = 0;

  const ptsTheme = matched.filter(m => m.cat.startsWith('theme')).reduce((s, m) => s + m.pts, 0);
  const ptsVerbe = matched.filter(m => m.cat === 'verbe').reduce((s, m) => s + m.pts, 0);

  return { score, breakdown: { matched, bonus, penalites: [], ptsTheme, ptsVerbe } };
}

const TAG_MAP = [
  { label: 'RSE',       kws: ['accompagnement rse','conseil rse','diagnostic rse','stratégie rse','démarche rse','plan rse','audit rse','rapport rse','politique rse','label rse','iso 26000','double matérialité','matérialité','gouvernance durable','feuille de route rse','certification rse','entreprise à mission','raison d\'être','responsabilité sociétale','rse','esg','notation esg','ecovadis','b corp','sapin ii','droits humains','alerte éthique','plan de vigilance','communication responsable','communication à impact','engagement parties prenantes'] },
  { label: 'Carbone',   kws: ['bilan carbone','bilan ges','bilan d\'émissions','empreinte carbone','feuille de route carbone','plan de transition','plan climat','neutralité carbone','net zero','sbti','ghg protocol','scope 1','scope 2','scope 3','carbone','ges','décarbonation','transition écologique','transition énergétique'] },
  { label: 'CSRD',      kws: ['csrd','esrs','vsme','dpef','rapport de durabilité','reporting esg','reporting extra-financier','extra-financier','taxonomie européenne'] },
  { label: 'QVCT',      kws: ['accompagnement qvt','démarche qvt','diagnostic qvt','accompagnement qvct','démarche qvct','accord qvct','diagnostic qvct','risques psychosociaux','égalité professionnelle','index égalité','accord diversité','qvt','qvct','qualité de vie au travail','diversité','inclusion'] },
  { label: 'Formation', kws: ['formation rse','formation climat','formation esg','formation csrd','fresque du climat','parcours pédagogique','sensibilisation','acculturation','montée en compétences','e-learning','atelier participatif'] },
  { label: 'Achats',    kws: ['achats responsables','achats durables','due diligence','devoir de vigilance','fournisseurs responsables','cartographie fournisseurs','supply chain responsable'] },
  { label: 'Éco-conc.', kws: ['économie circulaire','analyse du cycle de vie','écoconception','acv','réemploi','biodiversité','numérique responsable','green it','it for green','sobriété numérique','sobriété','développement durable','durabilité'] },
];

function getThemeTags(breakdown) {
  if (!breakdown || !breakdown.matched) return [];
  const matchedSet = new Set(breakdown.matched.map(m => norm(m.kw)));
  const tags = [];
  for (const { label, kws } of TAG_MAP) {
    if (kws.some(k => matchedSet.has(norm(k)))) tags.push(label);
  }
  return tags;
}

module.exports = { scoreRSETEE, scoreRSETEEDetailed, getThemeTags };
