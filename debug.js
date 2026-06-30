/**
 * Script de debug : affiche les AO brutes (avant filtres) pour inspecter
 * le parsing HTML. Utile si 0 résultats ou titres incorrects.
 * Usage : node debug.js
 */
const { scrapeATLAS } = require('./scrapers/atlas');
const { scrape2i } = require('./scrapers/2i');

async function main() {
  console.log('\n=== DEBUG ATLAS ===');
  const atlas = await scrapeATLAS();
  console.log(`Trouvé ${atlas.length} AO`);
  atlas.slice(0, 5).forEach((ao, i) => {
    console.log(`\n[${i+1}] titre      : ${ao.titre}`);
    console.log(`     dateClôture: ${ao.dateClôture || '(vide)'}`);
    console.log(`     statut     : ${ao.statut}`);
    console.log(`     score      : ${ao.score}`);
    console.log(`     url        : ${ao.url}`);
    if (ao.description) console.log(`     desc       : ${ao.description.slice(0, 100)}...`);
  });

  console.log('\n=== DEBUG 2i ===');
  const i2 = await scrape2i();
  console.log(`Trouvé ${i2.length} AO`);
  i2.slice(0, 5).forEach((ao, i) => {
    console.log(`\n[${i+1}] titre      : ${ao.titre}`);
    console.log(`     dateClôture: ${ao.dateClôture || '(vide)'}`);
    console.log(`     statut     : ${ao.statut}`);
    console.log(`     score      : ${ao.score}`);
    console.log(`     url        : ${ao.url}`);
  });

  console.log('\n=== FIN DEBUG ===\n');
}

main();
