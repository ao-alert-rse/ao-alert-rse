// Filet de sécurité qui tourne après chaque sync : détecte et fusionne automatiquement les
// AOs déjà en base qui partagent le même ContractFolderID (même avis eForms publié à la fois
// sur BOAMP et TED). Nécessaire car la fusion en amont (dedupCrossSource, dans filtrer.js)
// dépend d'un appel réseau séparé qui peut échouer un jour et réussir le lendemain — quand ça
// rate, les deux versions atterrissent en base comme deux lignes distinctes, et comme l'upsert
// ne supprime jamais rien, ce doublon reste coincé tant que personne ne le nettoie à la main.
// Voir project_ao_alert_state.md (mémoire) pour l'historique des incidents.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

let _client = null;
function getClient() {
  if (_client) return _client;
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _client;
}

// Choisit la ligne à garder dans un groupe de doublons : priorité à celle qui a le plus de
// travail réel dessus (documents générés > checklist > décisions), puis à la plus récente.
function choisirCanonique(rows, chkCount, docCount, decCount) {
  return [...rows].sort((a, b) => {
    const scoreA = (docCount[a.id] || 0) * 100 + (chkCount[a.id] || 0) * 10 + (decCount[a.id] || 0);
    const scoreB = (docCount[b.id] || 0) * 100 + (chkCount[b.id] || 0) * 10 + (decCount[b.id] || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(b.date_vue || 0) - new Date(a.date_vue || 0);
  })[0];
}

async function reconcilierDoublons() {
  const client = getClient();
  if (!client) return { fusions: 0 };

  const { data: rows, error } = await client
    .from('aos')
    .select('id, date_vue, contract_folder_id')
    .not('contract_folder_id', 'is', null);
  if (error) {
    console.error(`  ❌ Réconciliation doublons : ${error.message}`);
    return { fusions: 0 };
  }

  const groupes = new Map();
  for (const r of rows) {
    if (!groupes.has(r.contract_folder_id)) groupes.set(r.contract_folder_id, []);
    groupes.get(r.contract_folder_id).push(r);
  }
  const doublons = [...groupes.values()].filter(g => g.length > 1);
  if (doublons.length === 0) return { fusions: 0 };

  const tousIds = doublons.flat().map(r => r.id);
  const [{ data: chk }, { data: doc }, { data: dec }] = await Promise.all([
    client.from('checklist').select('ao_id').in('ao_id', tousIds),
    client.from('documents').select('ao_id').in('ao_id', tousIds),
    client.from('decisions').select('ao_id').in('ao_id', tousIds),
  ]);
  const compter = (list) => { const m = {}; (list || []).forEach(r => { m[r.ao_id] = (m[r.ao_id] || 0) + 1; }); return m; };
  const chkCount = compter(chk), docCount = compter(doc), decCount = compter(dec);

  let fusions = 0;
  for (const groupe of doublons) {
    const canonique = choisirCanonique(groupe, chkCount, docCount, decCount);
    const perdants = groupe.filter(r => r.id !== canonique.id);
    const perdantsAvecDocs = perdants.filter(r => (chkCount[r.id] || 0) > 0 || (docCount[r.id] || 0) > 0);

    if (perdantsAvecDocs.length > 0) {
      // Sécurité : ne jamais supprimer une ligne qui a une checklist/des documents, même si
      // elle a "perdu" — on log et on laisse le doublon pour un traitement manuel.
      console.log(`  ⚠️  Doublon cross-source non résolu automatiquement (checklist/documents sur plusieurs lignes) : ${groupe.map(r => r.id).join(', ')}`);
      continue;
    }

    const idsPerdants = perdants.map(r => r.id);
    const { error: repointErr } = await client.from('decisions').update({ ao_id: canonique.id }).in('ao_id', idsPerdants);
    if (repointErr) { console.error(`  ❌ Réconciliation (repoint decisions) : ${repointErr.message}`); continue; }

    const { error: delErr } = await client.from('aos').delete().in('id', idsPerdants);
    if (delErr) { console.error(`  ❌ Réconciliation (delete) : ${delErr.message}`); continue; }

    fusions++;
  }

  if (fusions > 0) console.log(`  🧹 Réconciliation doublons : ${fusions} groupe(s) cross-source fusionné(s) automatiquement.`);
  return { fusions };
}

module.exports = { reconcilierDoublons };
