const crypto = require('crypto');

// Génère un hash court et stable à partir d'une chaîne (utilisé comme clé unique d'AO)
function hash(str) {
  return crypto.createHash('md5').update(str.toLowerCase().trim()).digest('hex').slice(0, 8);
}

module.exports = { hash };
