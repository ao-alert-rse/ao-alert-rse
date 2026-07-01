/**
 * Reconstruit les URLs manquantes pour les AOs en base.
 * Stratégie :
 *  1. Recherche sur BOAMP par titre (API OpenDataSoft)
 *  2. Si trouvé → URL de l'avis BOAMP
 *  3. Sinon → URL de recherche BOAMP par titre (cliquable, utile)
 *
 * Usage : node scripts/fix-missing-urls.js
 */
require('dotenv').config();
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BOAMP_API = 'https://boamp-datadila.opendatasoft.com/api/records/1.0/search/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function findOnBOAMP(titre) {
  // Prend les 60 premiers caractères pour la recherche, nettoie les guillemets
  const q = titre.slice(0, 60).replace(/"/g, ' ');
  const params = new URLSearchParams({
    dataset: 'boamp',
    q: `objet:"${q}"`,
    rows: '1',
    output: 'json',
  });
  try {
    const res = await fetch(`${BOAMP_API}?${params}`, {
      headers: { 'User-Agent': 'AO-Scanner/1.0; contact: b.baroni@nam-kouji.fr' },
      timeout: 10000,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.records && data.records.length > 0) {
      const f = data.records[0].fields;
      return f.url_avis || `https://www.boamp.fr/pages/avis/?q=idweb:${f.idweb}`;
    }
    return null;
  } catch {
    return null;
  }
}

function boampSearchUrl(titre) {
  const q = encodeURIComponent(titre.slice(0, 80));
  return `https://www.boamp.fr/pages/avis/?q=${q}`;
}

async function main() {
  // Récupérer toutes les AOs sans URL
  const { data: aos, error } = await sb
    .from('aos')
    .select('id, titre, source, url')
    .or('url.is.null,url.eq.');

  if (error) { console.error('Erreur Supabase :', error.message); process.exit(1); }
  if (!aos || aos.length === 0) { console.log('✅ Aucune AO sans URL.'); return; }

  console.log(`🔍 ${aos.length} AOs sans URL à traiter...\n`);

  let found = 0, fallback = 0;

  for (let i = 0; i < aos.length; i++) {
    const ao = aos[i];
    process.stdout.write(`[${i + 1}/${aos.length}] ${ao.titre.slice(0, 60)}… `);

    // 1. Chercher sur BOAMP
    const boampUrl = await findOnBOAMP(ao.titre);

    let newUrl;
    if (boampUrl) {
      newUrl = boampUrl;
      found++;
      console.log(`✅ BOAMP trouvé`);
    } else {
      // 2. Fallback : URL de recherche BOAMP cliquable
      newUrl = boampSearchUrl(ao.titre);
      fallback++;
      console.log(`🔗 Fallback recherche BOAMP`);
    }

    await sb.from('aos').update({ url: newUrl }).eq('id', ao.id);

    // Pause pour ne pas spammer l'API BOAMP
    if (i < aos.length - 1) await sleep(300);
  }

  console.log(`\n✅ Terminé : ${found} URLs exactes trouvées, ${fallback} liens de recherche ajoutés.`);
}

main().catch(console.error);
