// Importe ao-history.json dans Supabase (migration initiale — à lancer une seule fois)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const historyPath = path.join(__dirname, '..', 'data', 'ao-history.json');
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const entries = Object.entries(history);

  console.log(`📦 ${entries.length} AOs trouvées dans ao-history.json`);

  const rows = entries.map(([key, ao]) => ({
    key,
    titre: ao.titre,
    source: ao.source || null,
    score: ao.scoreRSETEE || null,
    date_vue: ao.dateVue || null,
    date_cloture: ao.dateClôture && ao.dateClôture.length === 10 ? ao.dateClôture : null,
    is_new: false
  }));

  // Upsert par lots de 100
  const BATCH = 100;
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('aos')
      .upsert(batch, { onConflict: 'key' });

    if (error) {
      console.error(`❌ Erreur lot ${i}–${i + batch.length} :`, error.message);
    } else {
      total += batch.length;
      process.stdout.write(`\r✅ ${total}/${rows.length} importées`);
    }
  }

  console.log(`\n\n🎉 Import terminé — ${total} AOs dans Supabase`);
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err.message);
  process.exit(1);
});
