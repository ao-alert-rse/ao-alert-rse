/**
 * Recalcule les scores plafonnés à 100 pour tous les AOs en base.
 * Usage : node scripts/fix-scores.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { scoreRSETEEDetailed, getThemeTags } = require('../utils/scorer');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const { data: aos, error } = await sb.from('aos').select('id, titre, description, score');
  if (error) { console.error('Erreur lecture:', error.message); process.exit(1); }

  console.log(`${aos.length} AOs à recalculer…`);

  let updated = 0;
  const batch = [];

  for (const ao of aos) {
    const { score, breakdown } = scoreRSETEEDetailed(ao.titre || '', ao.description || '');
    const tags = getThemeTags(breakdown);
    if (score !== ao.score) {
      batch.push({ id: ao.id, score, tags });
    }
  }

  console.log(`${batch.length} AOs avec score modifié`);

  for (const item of batch) {
    const { error: err } = await sb.from('aos')
      .update({ score: item.score, tags: item.tags })
      .eq('id', item.id);
    if (err) console.error(`  ✗ ${item.id}: ${err.message}`);
    else { updated++; process.stdout.write('.'); }
  }

  console.log(`\n✅ ${updated} AOs mis à jour`);
}

main().catch(err => { console.error(err); process.exit(1); });
