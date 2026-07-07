const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function fmt(date) {
  if (!date) return 'N/A';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function fmtPrix(prix) {
  if (!prix || isNaN(prix)) return '—';
  if (prix >= 1_000_000) return `${(prix / 1_000_000).toFixed(prix % 1_000_000 === 0 ? 0 : 1)}M€`;
  const k = Math.round(prix / 1000);
  return k >= 1 ? `${k}k€` : `${Math.round(prix)}€`;
}

const THEAD = `
  <thead>
    <tr style="background:#1a73e8;color:#fff">
      <th style="padding:10px 12px;border:1px solid #1558b0">#</th>
      <th style="padding:10px 12px;border:1px solid #1558b0;text-align:left">Titre / Description</th>
      <th style="padding:10px 12px;border:1px solid #1558b0;text-align:left">Source</th>
      <th style="padding:10px 12px;border:1px solid #1558b0">Prix estimatif</th>
      <th style="padding:10px 12px;border:1px solid #1558b0">Score</th>
      <th style="padding:10px 12px;border:1px solid #1558b0">Clôture</th>
    </tr>
  </thead>`;

// Patterns de boilerplate juridique/procédural à couper dès leur apparition
const BOILERPLATE_RE = /(?:La consultation est passée selon|conformément à l'article|selon la procédure\s+d'|Le présent avis de marché vise|Les prestations sont réglées par|Le détail du phasage|Le présent marché a pour objet)/i;

function cleanDesc(raw, titre) {
  if (!raw) return '';
  let s = raw
    // Décoder les entités HTML
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    // Supprimer balises HTML
    .replace(/<[^>]*>/g, ' ')
    // Supprimer URLs
    .replace(/https?:\/\/\S+/g, '')
    // Couper au séparateur bilingue (//) — TED
    .replace(/\s*\/\/\s*.*/s, '')
    // Couper au boilerplate juridique
    .replace(new RegExp(`(${BOILERPLATE_RE.source}.*)`, 'is'), '')
    // Espaces multiples
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Supprimer si trop similaire au titre (répétition inutile)
  if (titre && s.length > 10) {
    const normS = s.toLowerCase().slice(0, 60);
    const normT = (titre || '').toLowerCase().slice(0, 60);
    if (normT.includes(normS) || normS.includes(normT.slice(0, 40))) return '';
  }

  return s.slice(0, 150);
}

function buildRows(list) {
  return list.map((ao, i) => {
    const titre = ao.titre.length > 120 ? ao.titre.slice(0, 117) + '…' : ao.titre;
    const rawDesc = cleanDesc(ao.description, ao.titre);
    const desc = rawDesc
      ? `<br><span style="font-size:12px;color:#666">${rawDesc}${(ao.description || '').length > 150 ? '…' : ''}</span>`
      : '';
    const scoreLabel = ao.score >= 80 ? '🔥' : ao.score >= 40 ? '⭐' : '';
    return `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
      <td style="padding:8px 12px;border:1px solid #ddd">${i + 1}</td>
      <td style="padding:8px 12px;border:1px solid #ddd"><a href="${ao.url}" style="color:#1a73e8">${titre}</a>${desc}</td>
      <td style="padding:8px 12px;border:1px solid #ddd">${ao.source}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:center;color:#555">${fmtPrix(ao.prix)}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:center">${scoreLabel} ${ao.score}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:center">${fmt(ao.dateClôture)}</td>
    </tr>`;
  }).join('');
}

function buildHtml(nouvelles, enCours) {
  const sectionNouvelles = `
  <h2 style="color:#1a73e8;margin-top:0">🆕 ${nouvelles.length} nouvelle${nouvelles.length > 1 ? 's' : ''} AO RSE/TEE détectée${nouvelles.length > 1 ? 's' : ''}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:32px">
    ${THEAD}
    <tbody>${buildRows(nouvelles)}</tbody>
  </table>`;

  const autresEnCours = enCours.filter(ao => !nouvelles.some(n => n.titre === ao.titre && n.source === ao.source));

  const sectionEnCours = autresEnCours.length === 0 ? '' : `
  <h2 style="color:#555;border-top:2px solid #eee;padding-top:24px">📋 AOs en cours (${autresEnCours.length} déjà connues)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:32px">
    ${THEAD}
    <tbody>${buildRows(autresEnCours)}</tbody>
  </table>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:900px;margin:auto;padding:20px">
  ${sectionNouvelles}
  ${sectionEnCours}
  <p style="margin-top:20px;font-size:12px;color:#888">Généré automatiquement par projet-ao-alert — ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
</body>
</html>`;
}

function getTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPassword) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPassword },
  });
}

function getDestinataires() {
  const emailsPath = path.join(__dirname, '..', 'data', 'emails.json');
  const { destinataires } = JSON.parse(fs.readFileSync(emailsPath, 'utf8'));
  return destinataires || [];
}

async function sendEmailAnomalie() {
  const transporter = getTransporter();
  if (!transporter) { console.warn('⚠️  Email ignoré : credentials manquants.'); return; }
  const destinataires = getDestinataires();
  if (!destinataires.length) return;

  await transporter.sendMail({
    from: `"AO Alert RSE/TEE" <${process.env.GMAIL_USER}>`,
    to: destinataires.join(', '),
    subject: '[AO Alert] ⚠️ Scan — 0 AO retournée (anomalie ?)',
    html: `<p>Le scan hebdomadaire n'a retourné <strong>aucune AO</strong> toutes sources confondues.</p>
           <p>Vérifier : timeout réseau, changement de structure des sites, ou coupure BOAMP/TED.</p>`,
  });
  console.log('⚠️  Email anomalie envoyé (0 AO).');
}

async function sendEmailSourceAnomalie(sourcesEnPanne) {
  const transporter = getTransporter();
  if (!transporter) { console.warn('⚠️  Email ignoré : credentials manquants.'); return; }
  const destinataires = getDestinataires();
  if (!destinataires.length) return;

  const items = sourcesEnPanne.map(s =>
    `<li><strong>${s.source}</strong> : 0 AO aujourd'hui, alors que la moyenne des ${s.historique.length} derniers scans était de ${s.moyenneHistorique} (historique : ${s.historique.join(', ')})</li>`
  ).join('');

  await transporter.sendMail({
    from: `"AO Alert RSE/TEE" <${process.env.GMAIL_USER}>`,
    to: destinataires.join(', '),
    subject: `[AO Alert] ⚠️ ${sourcesEnPanne.length} source(s) probablement cassée(s)`,
    html: `<p>Ces sources remontaient fiablement des résultats et sont tombées à 0 aujourd'hui —
           probablement un changement de structure du site plutôt qu'une vraie absence d'AO
           (voir le cas Uniformation du 07/07/2026 dans l'historique du projet) :</p>
           <ul>${items}</ul>
           <p>À vérifier : ouvrir le site source et comparer avec le sélecteur du scraper correspondant.</p>`,
  });
  console.log(`⚠️  Email anomalie source(s) envoyé (${sourcesEnPanne.length} source(s) suspecte(s)).`);
}

async function sendEmailRecap(nouvelles, enCours = []) {
  const nouvellesEmail = nouvelles.filter(ao => ao.score >= 35);
  if (nouvellesEmail.length === 0) {
    if (nouvelles.length > 0) console.log(`📧 Email ignoré : ${nouvelles.length} nouvelle(s) AO mais aucune ≥ 35.`);
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    console.warn('⚠️  Email ignoré : GMAIL_USER ou GMAIL_APP_PASSWORD non défini.');
    return;
  }

  const emailsPath = path.join(__dirname, '..', 'data', 'emails.json');
  const { destinataires } = JSON.parse(fs.readFileSync(emailsPath, 'utf8'));

  if (!destinataires || destinataires.length === 0) {
    console.warn('⚠️  Email ignoré : aucun destinataire dans data/emails.json.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPassword },
  });

  const subject = `[AO Alert] ${nouvellesEmail.length} nouvelle${nouvellesEmail.length > 1 ? 's' : ''} AO RSE/TEE (score ≥ 35)`;

  await transporter.sendMail({
    from: `"AO Alert RSE/TEE" <${gmailUser}>`,
    to: destinataires.join(', '),
    subject,
    html: buildHtml(nouvellesEmail, enCours),
  });

  console.log(`📧 Email envoyé à : ${destinataires.join(', ')} (${nouvellesEmail.length}/${nouvelles.length} nouvelles ≥ 35)`);
}

module.exports = { sendEmailRecap, sendEmailAnomalie, sendEmailSourceAnomalie };
