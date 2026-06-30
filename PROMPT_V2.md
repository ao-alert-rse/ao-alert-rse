# PROMPT V2 — AO Alert RSE/TEE

## Contexte : V1 déjà en production

Le projet `projet-ao-alert/` est fonctionnel. `node index.js` scanne 9 OPCOs via l'API BOAMP officielle (open data DILA), filtre les AOs RSE/TEE et détecte les nouvelles vs historique.

### Stack technique
- Node.js 18+ / npm
- `node-fetch@2` + `cheerio` (installés)
- API : `https://boamp-datadila.opendatasoft.com/api/records/1.0/search/`
- Pas de framework, pas d'ORM, code modulaire vanilla JS

### Structure du projet
```
projet-ao-alert/
├── index.js                  ← point d'entrée (node index.js)
├── scrapers/
│   └── boamp.js              ← interroge BOAMP pour les 9 OPCOs
├── utils/
│   ├── scorer.js             ← scoring RSE/TEE (+10 par keyword)
│   ├── detector.js           ← détection nouvelles AO + ao-history.json
│   └── hasher.js             ← clé unique = source-hash(titre)
├── data/
│   ├── ao-history.json       ← historique des AOs déjà vues
│   └── emails.json           ← { "destinataires": [] } prêt pour V2
└── package.json
```

### Ce que produit `node index.js` aujourd'hui
- Scanne 9 OPCOs en parallèle (ATLAS, 2i, AFDAS, AKTO, CONSTRUCTYS, UNIFORMATION, OPCO Mobilités, OPCO Santé, Opcommerce)
- Filtre : statut Ouvert/En cours + date clôture future + score RSE/TEE > 0
- Affiche les nouvelles AOs en console avec titre, source, score, date, URL BOAMP
- Sauvegarde dans `ao-history.json` (hash unique par AO)
- Output exemple : 12 AOs valides en 0.1 seconde

### OPCOs absents de BOAMP (V2 optionnel)
- **OCAPIAT** (`ocapiat.fr`) — agriculture/agroalimentaire
- **OPCO EP** (`opcoep.fr`) — entreprises de proximité
Ces deux n'ont pas d'historique dans BOAMP. Nécessitent scraping HTML direct.

---

## Objectif V2 : 3 tâches

### Tâche 1 — Email (prioritaire)

Envoyer un email récapitulatif quand de nouvelles AOs sont détectées.

**Contraintes :**
- Utiliser **Nodemailer** avec SMTP Gmail (App Password, pas OAuth)
- Config dans `data/emails.json` déjà créé : `{ "destinataires": ["email@exemple.com"] }`
- Envoyer seulement si `nouvelles.length > 0`
- Format email : HTML simple, une ligne par AO (titre | source | score | date | lien)
- Créer `utils/mailer.js` et l'appeler dans `index.js` après `detectNewAOs`

**Variables d'env nécessaires :**
```
GMAIL_USER=ton-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```
Charger via `process.env` (pas de dotenv requis, les définir dans le shell ou un `.env` chargé manuellement).

### Tâche 2 — Scheduling automatique

Lancer le scan automatiquement toutes les 24h (ou fréquence configurable).

**Recommandation :** utiliser le skill `/schedule` de Claude Code pour créer une routine cloud.
Sinon, fallback : Windows Task Scheduler ou un cron si environnement Linux/Mac.

### Tâche 3 — Affiner le scoring (optionnel, si faux positifs gênants)

Quelques AOs passent le filtre mais sont tangentes (ex: "rénovation du siège social" score 10 car "formation" dans le nom de l'orga).

Options :
- Monter le score minimum de 0 à 15 ou 20 dans `filtrerAOs()`
- Ajouter des termes négatifs (blacklist) dans `scorer.js`
- Scorer uniquement sur le champ `objet` BOAMP (pas le `description`)

---

## Points d'attention pour V2

1. **`data/emails.json`** est vide (`{ "destinataires": [] }`). Le dev doit y ajouter les emails avant de tester.

2. **Reset historique** pour tester l'email :
   ```powershell
   node -e "require('fs').writeFileSync('data/ao-history.json', '{}')"
   node index.js
   ```
   → forcera la détection de 12+ AOs → envoi email

3. **App Password Gmail** : Menu Google > Sécurité > Validation en 2 étapes > Mots de passe d'application. Générer un mot de passe pour "Mail / Windows".

4. **Le scan complète en ~0.1s** (API BOAMP très rapide). Pas de timeout à craindre.

5. **`ao-history.json`** : ne jamais supprimer en prod, c'est la mémoire du système. Sauvegarder avant de reset pour tests.

---

## Commandes utiles

```powershell
# Lancer le scan
node index.js

# Debug complet (affiche les AOs brutes avant filtres)
node debug2.js

# Reset historique (test uniquement)
node -e "require('fs').writeFileSync('data/ao-history.json', '{}')"

# Ajouter un destinataire email
node -e "require('fs').writeFileSync('data/emails.json', JSON.stringify({destinataires:['email@exemple.com']},null,2))"
```
