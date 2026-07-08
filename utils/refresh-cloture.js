// Filet de sécurité qui tourne après chaque sync : revérifie directement auprès de TED/BOAMP
// toutes les AOs déjà en base sans date de clôture connue. Sans ça, une AO dont l'extraction a
// raté une fois (ex. avis d'attribution sans date exposée par l'API au moment du scan) reste
// "Ouvert" en base pour toujours — elle ne remonte plus dans les résultats d'un scan classique
// puisqu'elle ne matche plus les requêtes filtrées sur une date future, donc personne ne la
// revoit jamais. Voir feedback_upsert_key_migration / project_ao_alert_state (mémoire) pour le
// contexte : plusieurs AOs closes depuis 2024 sont restées affichées comme actives pour cette
// raison exacte avant ce correctif.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { refetchTedDeadline } = require('../scrapers/ted');
const { refetchBoampByIdweb } = require('../scrapers/boamp');

let _client = null;
function getClient() {
  if (_client) return _client;
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _client;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function rafraichirDatesCloture() {
  const client = getClient();
  if (!client) return { verifiees: 0, misesAJour: 0 };

  const { data: rows, error } = await client
    .from('aos')
    .select('id, key')
    .is('date_cloture', null);
  if (error) {
    console.error(`  ❌ Rafraîchissement dates de clôture : ${error.message}`);
    return { verifiees: 0, misesAJour: 0 };
  }
  if (!rows || rows.length === 0) return { verifiees: 0, misesAJour: 0 };

  let misesAJour = 0;
  for (const row of rows) {
    let resultat = null;
    if (row.key?.startsWith('ted-')) {
      resultat = await refetchTedDeadline(row.key.slice(4));
    } else if (row.key?.startsWith('boamp-')) {
      resultat = await refetchBoampByIdweb(row.key.slice(6));
    } else {
      continue; // pas de moyen fiable de revérifier les autres sources pour l'instant
    }

    if (resultat && resultat.dateClôture) {
      const { error: updErr } = await client
        .from('aos')
        .update({ date_cloture: resultat.dateClôture })
        .eq('id', row.id);
      if (!updErr) misesAJour++;
    }
    await sleep(200); // évite de marteler les API TED/BOAMP sur un lot de revérifications
  }

  if (misesAJour > 0) {
    console.log(`  🔎 Rafraîchissement dates de clôture : ${misesAJour}/${rows.length} AO(s) mise(s) à jour rétroactivement.`);
  }
  return { verifiees: rows.length, misesAJour };
}

module.exports = { rafraichirDatesCloture };
