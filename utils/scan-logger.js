const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'data', 'scan-log.json');

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); } catch { return []; }
}

function logScan({ totalRecus, totalValides, nouvelles, toutesAOs, sourceCounts }) {
  const log = readLog();
  log.push({
    date: new Date().toISOString(),
    totalRecus,
    totalValides,
    nouvelles: nouvelles.length,
    nouvellesTitres: nouvelles.map(a => ({ titre: a.titre, score: a.score, source: a.source })),
    enCours: toutesAOs.length,
    sourceCounts: sourceCounts || {},
  });
  // Garder les 52 dernières entrées (1 an de scans hebdo)
  if (log.length > 52) log.splice(0, log.length - 52);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
  return log;
}

module.exports = { logScan, readLog };
