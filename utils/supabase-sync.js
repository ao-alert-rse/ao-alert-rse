// Synchronise les AOs scrapées vers Supabase après chaque scan
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { scoreRSETEEDetailed, getThemeTags } = require('./scorer');
const { computeAOKey } = require('./filtrer');

let _client = null;

function getClient() {
  if (_client) return _client;
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _client;
}

async function syncAOsToSupabase(aos) {
  const client = getClient();
  if (!client) {
    console.log('  ⚠️  Supabase non configuré — sync ignoré');
    return;
  }

  const eligibles = aos.filter(ao => (ao.score || 0) >= 20);
  const sansLien = eligibles.filter(ao => !ao.url);
  if (sansLien.length > 0) {
    console.log(`  🚫 ${sansLien.length} AO(s) rejetée(s) — pas de lien officiel`);
  }

  const rows = eligibles.filter(ao => ao.url).map(ao => {
    const { breakdown } = scoreRSETEEDetailed(ao.titre, ao.description || '');
    const tags = getThemeTags(breakdown);
    return {
      key: computeAOKey(ao),
      titre: ao.titre,
      source: ao.source || null,
      score: ao.score || null,
      description: ao.description || null,
      url: ao.url || null,
      date_cloture: ao.dateClôture && ao.dateClôture.length === 10 ? ao.dateClôture : null,
      ...(ao.prix > 0 ? { prix: ao.prix } : {}),
      contract_folder_id: ao.contractFolderId || null,
      tags: tags || [],
      date_vue: ao.dateVue || new Date().toISOString(),
      is_new: ao.nouveau || false
    };
  });

  const BATCH = 100;
  let synced = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await client
      .from('aos')
      .upsert(batch, { onConflict: 'key' });

    if (error) {
      console.error(`  ❌ Supabase sync erreur : ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  console.log(`  ☁️  Supabase : ${synced} AOs synchronisées`);
}

module.exports = { syncAOsToSupabase };
