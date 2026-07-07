const { scrapeBOAMP, queryBOAMPKeywords } = require('./scrapers/boamp');
const { scrapeATLAS } = require('./scrapers/atlas');
const { scrape2i } = require('./scrapers/2i');
const { scrapeOCAPIAT } = require('./scrapers/ocapiat');
const { scrapeOPCOEP } = require('./scrapers/opcoep');
const { scrapeTED } = require('./scrapers/ted');
const { scrapeUniformation } = require('./scrapers/uniformation');
const { scrapeAKTO } = require('./scrapers/akto');
const { scrapeADEME } = require('./scrapers/ademe');
const { scrapeConstructys } = require('./scrapers/constructys');
const { scrapeOpcoMobilites } = require('./scrapers/opcomobilites');
const { scrapeMaximilien } = require('./scrapers/maximilien');
const { scrapePLACE } = require('./scrapers/place');
const { scrapeEMarchesPublics } = require('./scrapers/emarchespublics');
const { detectNewAOs } = require('./utils/detector');
const { sendEmailRecap, sendEmailAnomalie, sendEmailSourceAnomalie } = require('./utils/mailer');
const { logScan } = require('./utils/scan-logger');
const { filtrerAOs, dedupCrossSource } = require('./utils/filtrer');
const { generateHTMLReport } = require('./utils/reporter');
const { syncAOsToSupabase } = require('./utils/supabase-sync');
const { detecterScrapersEnPanne } = require('./utils/source-health');
const { reconcilierDoublons } = require('./utils/dedup-reconcile');

function fmt(date) {
  if (!date) return 'N/A';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function afficherNouvellesAOs(nouvelles) {
  if (nouvelles.length === 0) {
    console.log('\n✅ Aucune nouvelle AO RSE/TEE détectée.');
    return;
  }
  console.log('\n' + '═'.repeat(59));
  console.log(`✨ NOUVELLES AO (${nouvelles.length} trouvée${nouvelles.length > 1 ? 's' : ''})`);
  console.log('═'.repeat(59));
  nouvelles.forEach((ao, i) => {
    const titreAffiche = ao.titre.length > 120 ? ao.titre.slice(0, 117) + '…' : ao.titre;
    console.log(`\n#${i + 1} | ${titreAffiche}`);
    console.log(`    Source: ${ao.source}`);
    console.log(`    Score RSE/TEE: ${ao.score}`);
    console.log(`    Date clôture: ${fmt(ao.dateClôture)}`);
    console.log(`    URL: ${ao.url}`);
    console.log(`    Détecté: NOUVEAU ✨`);
  });
}

async function main() {
  const startTime = Date.now();
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  console.log('\n' + '═'.repeat(59));
  console.log(`🔍 SCAN DÉMARRÉ [${now}]`);
  console.log('═'.repeat(59));

  // Timeout global par scraper web (évite les blocages sur sites lents)
  function withTimeout(promise, label, ms = 15000) {
    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms / 1000}s`)), ms)
    );
    return Promise.race([promise, timer]).catch(err => {
      console.error(`  ❌ ${label} : ${err.message}`);
      return [];
    });
  }

  // Toutes les sources en parallèle
  const [boampResultats, kwRaw, tedAOs, atlasAOs, deuxiAOs, ocapiatAOs, opcoepAOs,
         uniformationAOs, aktoAOs, ademeAOs, constructysAOs, opcomobilitesAOs, maximilienAOs, placeAOs,
         emarchespublicsAOs] = await Promise.all([
    scrapeBOAMP(),
    withTimeout(queryBOAMPKeywords(3), 'BOAMP/mots-clés', 60000),
    withTimeout(scrapeTED(), 'TED/FR', 90000),
    withTimeout(scrapeATLAS(), 'ATLAS/site', 20000),
    withTimeout(scrape2i(), '2i/site', 20000),
    withTimeout(scrapeOCAPIAT(), 'OCAPIAT/site', 25000),
    withTimeout(scrapeOPCOEP(), 'OPCOEP/site', 20000),
    withTimeout(scrapeUniformation(), 'Uniformation/site', 20000),
    withTimeout(scrapeAKTO(), 'AKTO/site', 20000),
    withTimeout(scrapeADEME(), 'ADEME/site', 25000),
    withTimeout(scrapeConstructys(), 'Constructys/site', 20000),
    withTimeout(scrapeOpcoMobilites(), 'OPCOMobilités/site', 20000),
    withTimeout(scrapeMaximilien(), 'Maximilien/IDF', 60000),
    withTimeout(scrapePLACE(), 'PLACE/national', 90000),
    withTimeout(scrapeEMarchesPublics(), 'e-marchespublics/site', 90000),
  ]);

  let toutesAOs = [];
  let totalRecus = 0;
  let totalValides = 0;

  // BOAMP — acheteurs ciblés (OPCOs + organismes RSE)
  for (const { source, aos } of boampResultats) {
    const valides = filtrerAOs(aos);
    totalRecus += aos.length;
    totalValides += valides.length;
    toutesAOs = toutesAOs.concat(valides);

    if (aos.length > 0) {
      const icon = valides.length > 0 ? '✅' : '○';
      console.log(`\n${icon} ${source} (BOAMP) : ${aos.length} AO → ${valides.length} RSE/TEE/RH`);
    } else {
      console.log(`\n○ ${source} (BOAMP) : 0 AO actives`);
    }
  }

  // BOAMP — mots-clés RSE/TEE/RH (tout BOAMP, dédupliqué par idweb)
  {
    const idwebsVus = new Set(
      boampResultats.flatMap(({ aos }) => aos.map(a => a.idweb).filter(Boolean))
    );
    const kwSansDoublons = (kwRaw || []).filter(a => !a.idweb || !idwebsVus.has(a.idweb));
    const kwValides = filtrerAOs(kwSansDoublons);
    totalRecus += (kwRaw || []).length;
    totalValides += kwValides.length;
    toutesAOs = toutesAOs.concat(kwValides);
    const icon = kwValides.length > 0 ? '✅' : '○';
    console.log(`\n${icon} BOAMP/mots-clés : ${(kwRaw || []).length} AO → ${kwSansDoublons.length} dédupliquées → ${kwValides.length} RSE/TEE/RH`);
  }

  // TED/FR — déduplique par publication-number (idweb TED ≠ idweb BOAMP, pas de collision)
  {
    const tedValides = filtrerAOs(tedAOs || []);
    totalRecus += (tedAOs || []).length;
    totalValides += tedValides.length;
    toutesAOs = toutesAOs.concat(tedValides);
    const icon = tedValides.length > 0 ? '✅' : '○';
    console.log(`\n${icon} TED/FR : ${(tedAOs || []).length} AO → ${tedValides.length} RSE/TEE/RH`);
  }

  // Sites directs — déduplique par idweb ou hash titre+source
  const { hash } = require('./utils/hasher');
  const clésVues = new Set(toutesAOs.map(a => `${a.source}-${hash(a.titre)}`));
  const sourceCounts = {};

  function ajouterSiteDirect(aos, label) {
    const valides = filtrerAOs(aos).filter(a => {
      const clé = `${a.source}-${hash(a.titre)}`;
      if (clésVues.has(clé)) return false;
      clésVues.add(clé);
      return true;
    });
    totalRecus += aos.length;
    totalValides += valides.length;
    toutesAOs = toutesAOs.concat(valides);
    sourceCounts[label] = aos.length;
    const icon = valides.length > 0 ? '✅' : '○';
    console.log(`\n${icon} ${label} (site) : ${aos.length} AO → ${valides.length} RSE/TEE/RH`);
  }

  ajouterSiteDirect(atlasAOs, 'ATLAS');
  ajouterSiteDirect(deuxiAOs, '2i');
  ajouterSiteDirect(ocapiatAOs, 'OCAPIAT');
  ajouterSiteDirect(opcoepAOs, 'OPCO EP');
  ajouterSiteDirect(uniformationAOs, 'Uniformation');
  ajouterSiteDirect(aktoAOs, 'AKTO');
  ajouterSiteDirect(ademeAOs, 'ADEME');
  ajouterSiteDirect(constructysAOs, 'Constructys');
  ajouterSiteDirect(opcomobilitesAOs, 'OPCO Mobilités');
  ajouterSiteDirect(maximilienAOs, 'Maximilien/IDF');
  ajouterSiteDirect(placeAOs, 'PLACE/national');
  ajouterSiteDirect(emarchespublicsAOs, 'e-marchespublics.com');

  console.log(`\n📊 Total : ${totalRecus} AO reçues → ${totalValides} valides RSE/TEE/RH`);

  toutesAOs = dedupCrossSource(toutesAOs);

  const { nouvelles, added } = detectNewAOs(toutesAOs);
  const nouvellesKeys = new Set(nouvelles.map(n => n.key));
  toutesAOs.forEach(ao => { ao.nouveau = nouvellesKeys.has(`${ao.source}-${hash(ao.titre)}`); });

  const enCours = [...toutesAOs].sort((a, b) => (a.dateClôture || '9999').localeCompare(b.dateClôture || '9999'));

  afficherNouvellesAOs(nouvelles);
  generateHTMLReport(toutesAOs, nouvelles);

  const log = logScan({ totalRecus, totalValides, nouvelles, toutesAOs, sourceCounts });

  const sourcesEnPanne = detecterScrapersEnPanne(log, sourceCounts);
  if (sourcesEnPanne.length > 0) {
    console.log(`\n⚠️  ${sourcesEnPanne.length} source(s) probablement cassée(s) : ${sourcesEnPanne.map(s => s.source).join(', ')}`);
    await sendEmailSourceAnomalie(sourcesEnPanne);
  }

  await syncAOsToSupabase(toutesAOs);
  await reconcilierDoublons();

  if (toutesAOs.length === 0) {
    await sendEmailAnomalie();
  } else {
    await sendEmailRecap(nouvelles, enCours);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(59));
  if (added > 0) {
    console.log(`💾 ao-history.json mis à jour (+${added} AO)`);
  } else {
    console.log('💾 ao-history.json : aucune modification');
  }
  console.log(`🕐 Scan complété en ${elapsed} secondes`);
  console.log('═'.repeat(59) + '\n');
}

main();
