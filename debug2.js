/**
 * Debug : inspecte la pipeline complète étape par étape.
 * node debug2.js
 */
const { scrapeBOAMP } = require('./scrapers/boamp');
const { scrapeATLAS } = require('./scrapers/atlas');
const { scoreRSETEE } = require('./utils/scorer');

const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  console.log('\n=== DEBUG BOAMP ATLAS ===');
  const { atlas: boampAtlas, i2: boamp2i } = await scrapeBOAMP();

  console.log(`\nTotal BOAMP ATLAS reçu : ${boampAtlas.length}`);

  // Montrer les 10 premières entrées avec leurs champs clés
  console.log('\n--- 10 premières entrées BOAMP ATLAS ---');
  boampAtlas.slice(0, 10).forEach((ao, i) => {
    const pass = ao.statut !== 'Fermé' && (!ao.dateClôture || ao.dateClôture >= TODAY) && ao.score > 0;
    console.log(`[${i+1}] titre      : ${ao.titre.slice(0, 60)}`);
    console.log(`     dateClôture: "${ao.dateClôture}" | statut: ${ao.statut} | score: ${ao.score}`);
    console.log(`     → filtre: ${pass ? '✅ PASSE' : '❌ BLOQUÉ'}`);
    console.log('');
  });

  // Compter les passants
  const passants = boampAtlas.filter(ao =>
    ao.statut !== 'Fermé' &&
    (!ao.dateClôture || ao.dateClôture >= TODAY) &&
    ao.score > 0
  );
  console.log(`BOAMP ATLAS après filtres : ${passants.length}`);

  console.log('\n=== DEBUG ATLAS DIRECT (parseCardText) ===');
  const atlasHTML = await scrapeATLAS();
  console.log(`Total direct reçu : ${atlasHTML.length}`);
  console.log('\n--- 5 premières entrées directes ---');
  atlasHTML.slice(0, 5).forEach((ao, i) => {
    console.log(`[${i+1}] titre      : "${ao.titre.slice(0, 80).replace(/\n/g, '↵')}"`);
    console.log(`     dateClôture: "${ao.dateClôture}" | score: ${ao.score}`);
  });

  console.log('\n=== DEBUG BOAMP 2i ===');
  console.log(`Total BOAMP 2i reçu : ${boamp2i.length}`);
  const passants2i = boamp2i.filter(ao =>
    ao.statut !== 'Fermé' &&
    (!ao.dateClôture || ao.dateClôture >= TODAY) &&
    ao.score > 0
  );
  console.log(`BOAMP 2i après filtres : ${passants2i.length}`);
  if (passants2i.length > 0) {
    passants2i.forEach((ao, i) => {
      console.log(`[${i+1}] ${ao.titre.slice(0, 60)} | ${ao.dateClôture}`);
    });
  }
}

main().catch(console.error);
