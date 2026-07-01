const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { scoreRSETEE } = require('../utils/scorer');

const URL = 'https://www.opcomobilites.fr/a-propos/';
const MOIS = { janvier:1,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,septembre:9,octobre:10,novembre:11,décembre:12 };

function parseDate(txt) {
  if (!txt) return null;
  const m = txt.trim().match(/(\d{1,2})\s+(\w+\.?)\s+(\d{4})/);
  if (!m) return null;
  const key = m[2].toLowerCase().replace('.', '');
  const mo = MOIS[key] ?? MOIS[Object.keys(MOIS).find(k => k.startsWith(key.slice(0, 4))) || ''];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

async function scrapeOpcoMobilites() {
  const r = await fetch(URL, { headers: { 'User-Agent': 'AO-Scanner/1.0' }, timeout: 15000 });
  const $ = cheerio.load(await r.text());
  const aos = [];

  $('details.accordion__details').each((_, el) => {
    const titre = $(el).find('h3.accordion__title').text()
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!titre) return;

    let lien = '';
    $(el).find('a[href]').each((_, a) => {
      const h = $(a).attr('href') || '';
      if (!lien && (h.includes('achatpublic') || h.includes('marches-publics'))) lien = h;
    });

    let dateClôture = null;
    $(el).find('tr').each((_, tr) => {
      const th = $(tr).find('th').text().trim();
      if (th.includes('Date de clôture')) {
        dateClôture = parseDate($(tr).find('td').text().trim());
      }
    });

    const score = scoreRSETEE(titre, '');
    const url = lien || URL;
    aos.push({ titre, url, dateClôture, score, source: 'OPCO Mobilités', prix: null });
  });

  return aos;
}

module.exports = { scrapeOpcoMobilites };
