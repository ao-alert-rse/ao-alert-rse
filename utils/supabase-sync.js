// Synchronise les AOs scrapées vers Supabase après chaque scan
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { hash } = require('./hasher');
const { scoreRSETEEDetailed, getThemeTags } = require('./scorer');

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

  const rows = aos.map(ao => {
    const { breakdown } = scoreRSETEEDetailed(ao.titre, ao.description || '');
    const tags = getThemeTags(breakdown);
    return {
      key: `${ao.source}-${hash(ao.titre)}`,
      titre: ao.titre,
      source: ao.source || null,
      score: ao.score || null,
      description: ao.description || null,
      url: ao.url || null,
      date_cloture: ao.dateClôture && ao.dateClôture.length === 10 ? ao.dateClôture : null,
      prix: ao.prix || null,
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
