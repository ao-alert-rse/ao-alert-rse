/**
 * Envoie un email récap avec toutes les AOs actives en base,
 * sans modifier ao-history.json.
 * Usage : node send-recap.js
 */
const { scrapeBOAMP, queryBOAMPKeywords } = require('./scrapers/boamp');
const { scrapeATLAS } = require('./scrapers/atlas');
const { scrape2i } = require('./scrapers/2i');
const { scrapeOCAPIAT } = require('./scrapers/ocapiat');
const { scrapeTED } = require('./scrapers/ted');
const { scrapeOPCOEP } = require('./scrapers/opcoep');
const { scrapeUniformation } = require('./scrapers/uniformation');
const { scrapeAKTO } = require('./scrapers/akto');
const { scrapeADEME } = require('./scrapers/ademe');
const { scrapeConstructys } = require('./scrapers/constructys');
const { scrapeOpcoMobilites } = require('./scrapers/opcomobilites');
const { scrapeMaximilien } = require('./scrapers/maximilien');
const { sendEmailRecap } = require('./utils/mailer');
const { filtrerAOs, dedupCrossSource } = require('./utils/filtrer');

async function main() {
  console.log('📡 Récupération des AOs en cours...');

  function withTimeout(promise, label, ms = 15000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout`)), ms)),
    ]).catch(err => { console.error(`  ❌ ${label} : ${err.message}`); return []; });
  }

  const [boampResultats, kwRaw, tedAOs, atlasAOs, deuxiAOs, ocapiatAOs, opcoepAOs,
         uniformationAOs, aktoAOs, ademeAOs, constructysAOs, opcomobilitesAOs, maximilienAOs] = await Promise.all([
    scrapeBOAMP(),
    withTimeout(queryBOAMPKeywords(3), 'BOAMP/mots-clés', 60000),
    withTimeout(scrapeTED(), 'TED/FR', 45000),
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
  ]);

  let toutesAOs = [];
  for (const { aos } of boampResultats) toutesAOs = toutesAOs.concat(filtrerAOs(aos));

  const idwebsVus = new Set(boampResultats.flatMap(({ aos }) => aos.map(a => a.idweb).filter(Boolean)));
  toutesAOs = toutesAOs.concat(filtrerAOs((kwRaw || []).filter(a => !idwebsVus.has(a.idweb))));
  toutesAOs = toutesAOs.concat(filtrerAOs(tedAOs || []));

  const { hash } = require('./utils/hasher');
  const clésVues = new Set(toutesAOs.map(a => `${a.source}-${hash(a.titre)}`));
  for (const [aos] of [[atlasAOs], [deuxiAOs], [ocapiatAOs], [opcoepAOs],
                       [uniformationAOs], [aktoAOs], [ademeAOs], [constructysAOs], [opcomobilitesAOs], [maximilienAOs]]) {
    filtrerAOs(aos || []).forEach(a => {
      const clé = `${a.source}-${hash(a.titre)}`;
      if (!clésVues.has(clé)) { clésVues.add(clé); toutesAOs.push(a); }
    });
  }

  toutesAOs = dedupCrossSource(toutesAOs);

  const enCours = toutesAOs.sort((a, b) => (a.dateClôture || '9999').localeCompare(b.dateClôture || '9999'));
  console.log(`📋 ${enCours.length} AOs actives trouvées`);

  // Toutes les AOs sont traitées comme "nouvelles" pour forcer l'envoi
  await sendEmailRecap(enCours, []);
}

main().catch(console.error);
