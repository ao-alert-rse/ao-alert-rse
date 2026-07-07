// Détecte les scrapers HTML potentiellement cassés silencieusement : une source qui
// remonte fiablement des résultats depuis plusieurs scans et tombe soudainement à 0 est
// plus probablement un changement de structure de page (cf. Uniformation, 07/07/2026)
// qu'une vraie absence d'appels d'offres — contrairement à un site qui alterne déjà 0/N.
const FENETRE = 5;
const MIN_HISTORIQUE = 3;
const MIN_MOYENNE = 1;

function detecterScrapersEnPanne(log, sourceCountsActuel) {
  const scansAnterieurs = log
    .slice(0, -1) // le dernier élément est le scan qu'on vient de logger
    .slice(-FENETRE);

  const enPanne = [];
  for (const [source, count] of Object.entries(sourceCountsActuel)) {
    if (count > 0) continue;

    const historique = scansAnterieurs
      .map(s => s.sourceCounts && s.sourceCounts[source])
      .filter(v => typeof v === 'number');

    if (historique.length < MIN_HISTORIQUE) continue;

    const moyenne = historique.reduce((a, b) => a + b, 0) / historique.length;
    const toujoursActive = historique.every(v => v > 0);

    if (toujoursActive && moyenne >= MIN_MOYENNE) {
      enPanne.push({ source, moyenneHistorique: Math.round(moyenne * 10) / 10, historique });
    }
  }

  return enPanne;
}

module.exports = { detecterScrapersEnPanne };
