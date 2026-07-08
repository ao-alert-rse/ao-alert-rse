# AO Alert RSE/TEE/RH

Outil de veille automatisée des appels d'offres publics en lien avec la **RSE**, la
**transition écologique (TEE)** et les **ressources humaines (RH)**, à destination des
consultants de **Nam & Kouji**. Chaque jour, un scan interroge 15 sources publiques, filtre et
note les AOs pertinentes, puis les publie dans un tableau de bord web et un email récapitulatif.

**App en production :** https://ao-alert-rse.github.io/ao-alert-rse/

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Fonctionnement du scan quotidien](#fonctionnement-du-scan-quotidien)
- [Sources surveillées](#sources-surveillées)
- [Scoring RSE/TEE/RH](#scoring-rsetéerh)
- [Déduplication](#déduplication)
- [Application web](#application-web)
- [Génération des documents de candidature](#génération-des-documents-de-candidature)
- [Architecture technique](#architecture-technique)
- [Structure du repo](#structure-du-repo)
- [Base de données Supabase](#base-de-données-supabase)
- [Installation / développement local](#installation--développement-local)
- [Déploiement](#déploiement)
- [Limitations connues et chantiers en cours](#limitations-connues-et-chantiers-en-cours)

---

## Vue d'ensemble

Le problème de départ : les appels d'offres publics liés à la RSE, la transition écologique et
les RH sont dispersés sur une quinzaine de plateformes (BOAMP, TED, sites d'OPCO, places de
marché régionales...), publiés en continu, et noyés au milieu de milliers d'AOs hors sujet
(travaux, fournitures, informatique...). Repérer à la main les AOs pertinentes chaque jour n'est
pas tenable.

AO Alert automatise ce travail :

1. **Scanne** 15 sources chaque matin (GitHub Actions, cron quotidien).
2. **Filtre et note** chaque AO trouvée selon un système de score à deux axes (thème RSE/TEE/RH
   + verbe d'action de conseil), pour ne garder que les vraies missions de conseil/accompagnement
   et écarter les faux positifs (marchés de travaux ou fournitures citant incidemment un critère
   RSE).
3. **Déduplique** les AOs qui apparaissent sur plusieurs sources à la fois (un même avis publié
   à la fois sur BOAMP et TED, par exemple).
4. **Synchronise** le résultat vers une base Supabase, consommée par une application web.
5. **Notifie** l'équipe par email (AOs à score ≥ 35) et publie un rapport HTML statique.
6. Permet ensuite à l'équipe de **décider** (GO / NO GO / En cours / Répondu / Remporté / Perdu),
   suivre une **checklist** de procédure, et **générer automatiquement** les documents de
   candidature (DC1, DC2, ATTRI1) pré-remplis.

## Fonctionnement du scan quotidien

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions — cron quotidien (06h00 UTC)                 │
│  .github/workflows/ao-scan.yml                                │
└───────────────────────────┬───────────────────────────────────┘
                            │  node index.js
                            ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 1. Scrape 15 sources en parallèle (scrapers/*.js)         │
   │    avec timeout et retry par source                       │
   └───────────────────────────┬─────────────────────────────┘
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 2. Filtrage : score RSE/TEE ≥ 20, hors zone/hors cible    │
   │    exclus, AOs déjà closes exclues (utils/filtrer.js)     │
   └───────────────────────────┬─────────────────────────────┘
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 3. Déduplication cross-source par ContractFolderID        │
   │    (utils/filtrer.js → dedupCrossSource)                  │
   └───────────────────────────┬─────────────────────────────┘
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 4. Détection des nouvelles AOs vs. historique local        │
   │    (utils/detector.js → data/ao-history.json)              │
   └───────────────────────────┬─────────────────────────────┘
                                ▼
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ rapport.html   │   │ Sync Supabase        │   │ Email récapitulatif │
│ (reporter.js)  │   │ (supabase-sync.js)   │   │ (mailer.js, ≥ 35)   │
└───────────────┘   └──────────┬──────────┘   └─────────────────────┘
                                ▼
                  ┌─────────────────────────────┐
                  │ Filets de sécurité post-sync  │
                  │ • dedup-reconcile.js          │
                  │   (fusionne les doublons       │
                  │   cross-source déjà en base)   │
                  │ • refresh-cloture.js          │
                  │   (revérifie les dates de      │
                  │   clôture jamais déterminées)  │
                  └─────────────────────────────┘
```

Le scan tourne aussi en local (`node index.js` / `npm run scan`) pour du debug, mais commiter
les fichiers générés (`data/ao-history.json`, `data/scan-log.json`, `rapport.html`) issus d'un
scan de test n'est pas souhaitable — voir [CLAUDE.md](CLAUDE.md).

En cas d'anomalie (0 AO toutes sources confondues, ou une source historiquement fiable qui tombe
soudainement à 0 — signe probable d'un scraper cassé par une refonte de site), un email d'alerte
dédié est envoyé (`utils/source-health.js` + `utils/mailer.js`).

## Sources surveillées

| Source | Type | Détail |
|---|---|---|
| **BOAMP — acheteurs ciblés** | API JSON (OpenDataSoft) | Requête par nom d'acheteur (OPCOs, régions, ADEME, Caisse des dépôts...) |
| **BOAMP — mots-clés** | API JSON (OpenDataSoft) | Recherche par ~60 mots-clés RSE/TEE/RH dans tout le champ `objet`, tout acheteur confondu |
| **TED/FR** | API JSON (TED v3) | Avis européens publiés en France, recherche par mots-clés dans le titre de lot |
| **OPCO ATLAS, 2i, OCAPIAT, OPCO EP, Uniformation, AKTO, Constructys, OPCO Mobilités** | Scraping HTML | Sites propres de chaque OPCO (pas de couverture BOAMP fiable pour tous) |
| **ADEME** | Scraping HTML | Site direct |
| **PLACE (marchés publics de l'État)** | Scraping HTML | Recherche par mot-clé, une requête par mot-clé |
| **Maximilien (Île-de-France)** | Scraping HTML | Recherche par mot-clé |
| **e-marchespublics.com** | Scraping HTML + endpoint JSON de pagination | Ajouté 07/07/2026 — chevauchement partiel avec BOAMP/TED mais couvre des AOs propres au site (petites communes) |

Deux sources évaluées et écartées : **marchesonline.com** (protection anti-bot au niveau de
l'empreinte réseau sur l'endpoint de recherche) et **francemarches.com** (protégé par
DataDome). Voir l'historique des commits pour le détail de l'investigation.

## Scoring RSE/TEE/RH

`utils/scorer.js` calcule un score de 0 à 100 sur **deux axes combinés** :

- **Axe thème** : le sujet de l'AO couvre un domaine RSE/ESG/Transition (RSE, bilan carbone,
  CSRD, QVCT, achats responsables, économie circulaire...). Mots-clés « forts » (+35 pts dans le
  titre) et « faibles » plus génériques (+20 pts).
- **Axe verbe** : l'AO cherche une prestation de **conseil/accompagnement/formation** (audit,
  diagnostic, AMO, formation, sensibilisation...) et non des travaux ou fournitures. +15 pts.
- **Bonus +15** si les deux axes sont présents à la fois — signal fort d'une mission de conseil
  RSE.
- Un score de 0 est retourné si aucun signal thématique n'est trouvé, quel que soit le verbe.

Seuils utilisés en aval :
- **Application** : score ≥ 20 pour être synchronisé vers Supabase (`utils/supabase-sync.js`).
- **Email quotidien** : score ≥ 35 pour être notifié (`utils/mailer.js`).

**Limite connue** : un mot-clé thème fort seul peut suffire à dépasser le seuil sans qu'aucun
verbe d'action ne soit présent, ce qui laisse passer occasionnellement de faux positifs (ex. un
marché de travaux mentionnant incidemment un critère RSE). Documenté, pas corrigé à ce stade pour
ne pas déséquilibrer le scoring existant sans tests plus approfondis.

Chaque AO reçoit aussi des **tags thématiques** (RSE, Carbone, CSRD, QVCT, Formation, Achats,
Éco-conception) dérivés des mots-clés qui ont matché, utilisés pour le filtrage dans
l'application.

## Déduplication

Une même consultation peut apparaître plusieurs fois : sur plusieurs sources à la fois (un avis
eForms publié simultanément sur BOAMP et TED), ou avec un titre légèrement différent d'un scan à
l'autre (republication BOAMP avec des lots réordonnés, par exemple).

- **En amont** (`utils/filtrer.js` → `dedupCrossSource`) : fusion par `ContractFolderID`, un
  identifiant standard eForms identique sur BOAMP et TED pour un même dossier de marché.
- **Clé d'upsert stable** (`computeAOKey` dans `utils/filtrer.js`) : basée sur l'identifiant
  natif de la plateforme (idweb BOAMP / numéro de publication TED extrait de l'URL), avec repli
  sur le titre normalisé si absent — volontairement **pas** basée sur un champ dont l'extraction
  dépend d'un appel réseau séparé pouvant échouer un jour sur deux.
- **Filet de sécurité en aval** (`utils/dedup-reconcile.js`) : tourne après chaque sync,
  regroupe automatiquement les lignes déjà en base partageant le même `ContractFolderID` et les
  fusionne (réaffecte décisions/checklist/documents vers la ligne avec le plus de travail réel
  dessus). Ne fusionne jamais automatiquement si plusieurs lignes ont déjà des données
  utilisateur dessus — dans ce cas, log et traitement manuel.

## Application web

Dashboard statique (`app.html`) servi par GitHub Pages, connecté en direct à Supabase
(authentification email/password, Realtime activé sur les tables `aos` et `decisions`).

- **Tableau filtrable** : par score, tags thématiques, recherche texte, tri sur toutes les
  colonnes (titre, source, score, date de clôture, montant estimatif).
- **KPIs** : montant du pipeline en cours, nombre de marchés remportés, AOs urgentes (clôture
  ≤ 10 jours), taux de succès.
- **Graphiques** (Chart.js) : AOs par mois, répartition par statut de décision.
- **Workflow de décision** en 6 statuts : À décider → **GO** / **NO GO** → En cours → Répondu →
  Remporté / Perdu. Chaque décision est horodatée et attribuée à son auteur.
- **Checklist de procédure** (5 étapes) sur les AOs passées en GO.
- **Upload de documents** (DCE) par AO, stocké dans Supabase Storage.
- **Fiche détail** au clic : description complète, score détaillé par mot-clé matché, lien
  source.
- **Export CSV** de la vue filtrée courante.
- **Multi-utilisateur** : Benjamin Baroni (admin), Lucas Toledo, John Adrien.
- Un onglet **NO GO** archive les AOs refusées, mais masque automatiquement celles déjà closes
  depuis longtemps pour ne garder que les refus encore d'actualité.

## Génération des documents de candidature

Depuis la fiche d'une AO passée en GO, génération automatique des documents de candidature
**DC1** (lettre de candidature), **DC2** (déclaration du candidat) et **ATTRI1** (acte
d'engagement, ex-DC3) :

- Templates DOCX dans `assets/templates/`, remplis côté navigateur avec
  [docxtemplater](https://docxtemplater.com/) + pizzip (chargés depuis le CDN jsDelivr en build
  ESM — le build `.min.js` classique est en CommonJS pur et inutilisable en `<script type=module>`
  direct).
- Données société fixes dans la constante `COMPANY` de `app.html` (SIRET, représentant légal,
  chiffre d'affaires, effectif, attestation RC Pro).
- Champs spécifiques au marché (objet, référence, montant de l'offre, délai d'exécution) saisis
  dans un brouillon persistant par AO (table `gendocs_drafts`).
- Documents générés uploadés automatiquement dans Supabase Storage (bucket `dce`) et référencés
  dans la table `documents`.
- Le **DUME** est explicitement hors scope.

## Architecture technique

- **Backend de scan** : Node.js (`>=18`), exécuté par GitHub Actions — pas de serveur permanent.
- **Scraping** : [node-fetch](https://www.npmjs.com/package/node-fetch) pour les API JSON
  (BOAMP, TED), [cheerio](https://cheerio.js.org/) pour le parsing HTML des sites sans API.
- **Base de données** : Supabase (Postgres + Auth + Storage + Realtime), plan gratuit.
- **Frontend** : HTML/JS vanilla, pas de framework ni de build — [Chart.js](https://www.chartjs.org/)
  v4 pour les graphiques, [@supabase/supabase-js](https://github.com/supabase/supabase-js) v2
  côté client.
- **Hébergement** : GitHub Pages, déploiement automatique à chaque push sur `main`.
- **Emails** : Gmail SMTP via [nodemailer](https://nodemailer.com/).
- **Automatisation** : GitHub Actions, cron quotidien (`0 6 * * *`, ~08h00 CEST l'été).

## Structure du repo

```
.
├── index.js                    # Point d'entrée du scan (orchestre tout le pipeline)
├── app.html                    # Application web (dashboard, décisions, génération docs)
├── index.html                  # Redirige vers app.html (page d'accueil GitHub Pages)
├── rapport.html                # Rapport HTML statique généré par chaque scan
├── scrapers/                   # Un fichier par source (BOAMP, TED, OPCOs, PLACE...)
├── utils/
│   ├── scorer.js                # Scoring RSE/TEE/RH à deux axes
│   ├── filtrer.js                # Filtrage, clé d'upsert, dédup cross-source
│   ├── detector.js               # Détection des nouvelles AOs vs. historique local
│   ├── supabase-sync.js          # Upsert vers la table `aos`
│   ├── dedup-reconcile.js        # Filet de sécurité anti-doublons post-sync
│   ├── refresh-cloture.js        # Filet de sécurité : revérifie les dates de clôture inconnues
│   ├── source-health.js          # Détection des scrapers cassés silencieusement
│   ├── scan-logger.js            # Historique des volumes par source (data/scan-log.json)
│   ├── mailer.js                  # Emails (récap quotidien, anomalies)
│   ├── reporter.js                # Génération de rapport.html
│   ├── date.js / hasher.js       # Utilitaires date (fuseau Paris) et hash de titre
├── supabase/
│   ├── schema.sql                 # Tables principales (aos, decisions, documents)
│   ├── rls.sql                     # Politiques Row Level Security
│   ├── storage.sql                 # Configuration du bucket `dce`
│   └── migration_*.sql             # Migrations appliquées manuellement dans Supabase
├── assets/templates/              # Templates DOCX (DC1, DC2, ATTRI1, mémoire technique)
├── scripts/                        # Scripts ponctuels (import d'historique, fix d'URLs)
├── data/                            # Fichiers générés par le scan (historique, logs, emails.json)
└── .github/workflows/ao-scan.yml   # Cron quotidien GitHub Actions
```

## Base de données Supabase

Tables principales (voir `supabase/schema.sql` pour le détail complet) :

| Table | Rôle |
|---|---|
| `aos` | AOs synchronisées : titre, source, score, description, url, date de clôture, prix estimatif, tags, `contract_folder_id` (dédup cross-source) |
| `decisions` | Historique des décisions par AO (go / no_go / en_cours / repondu / remporte / perdu), horodaté et attribué |
| `documents` | Documents DCE uploadés ou générés, par AO |
| `checklist` | Étapes de procédure cochées, par AO |
| `gendocs_drafts` | Brouillon des champs de génération DC1/DC2/ATTRI1, par AO |

Row Level Security activée sur toutes les tables : lecture/écriture pour les utilisateurs
authentifiés uniquement. Le scan quotidien utilise la clé `service_role`, qui bypasse RLS.

## Installation / développement local

```bash
git clone https://github.com/ao-alert-rse/ao-alert-rse.git
cd ao-alert-rse
npm install
cp .env.example .env   # renseigner SUPABASE_URL, SUPABASE_SERVICE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD
```

Lancer un scan complet en local :

```bash
npm run scan
```

⚠️ Un scan local écrit `data/ao-history.json`, `data/scan-log.json` et `rapport.html`, et
synchronise réellement vers la base Supabase de production s'il est configuré avec les vraies
clés. Committer ou annuler (`git checkout -- <fichier>`) le résultat d'un scan de test avant de
pousser, pour éviter un conflit avec le prochain scan automatique.

Prévisualiser l'application web en local (nécessite un compte Supabase existant pour se
connecter) :

```bash
npx serve . --listen 3000
# puis ouvrir http://localhost:3000/app.html
```

## Déploiement

- **Application web** : automatique, à chaque push sur `main` (GitHub Pages sert directement le
  contenu du repo).
- **Scan quotidien** : `.github/workflows/ao-scan.yml`, déclenché par cron ou manuellement
  (onglet *Actions* de GitHub → *Run workflow*). Le workflow committe et pousse lui-même
  `data/ao-history.json`, `data/scan-log.json` et `rapport.html` sur `main` — toujours faire
  `git fetch && git status` avant de travailler localement pour éviter une divergence.

## Limitations connues et chantiers en cours

- Sous-domaine `aos.nam-kouji.fr` prévu, en attente d'accès DNS.
- Relecture juridique du contenu des documents DC1/DC2/ATTRI1 par une personne du métier,
  toujours en attente.
- Fragilité connue du scorer (voir [Scoring](#scoring-rsetéerh)) : un mot-clé thème fort seul
  peut suffire à dépasser le seuil, sans garde-fou sur le type de marché (travaux/fournitures vs.
  conseil).
- Certains scrapers "site direct" (2i, OCAPIAT, Uniformation, ADEME) peuvent encore présenter des
  angles morts sur l'extraction de la date de clôture, contrairement à BOAMP/TED déjà couverts
  par le filet de sécurité `refresh-cloture.js`.
- Pas de couverture BOAMP fiable pour OCAPIAT et OPCO EP — surveillés uniquement via leur site
  propre.

---

Projet interne Nam & Kouji. Pour toute question, contacter Benjamin Baroni
(b.baroni@nam-kouji.fr).
