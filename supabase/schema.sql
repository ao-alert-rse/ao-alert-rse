-- ao-alert v2 — schéma Supabase
-- À coller dans Supabase > SQL Editor > New query

-- Table principale des AOs
CREATE TABLE IF NOT EXISTS aos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,       -- "source-hash" (même clé que ao-history.json)
  titre        TEXT NOT NULL,
  source       TEXT,
  score        INTEGER,
  description  TEXT,
  url          TEXT,
  date_cloture DATE,
  prix         NUMERIC,
  tags         TEXT[] DEFAULT '{}',
  date_vue     TIMESTAMPTZ,
  is_new       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Décisions GO / NO GO par AO
CREATE TABLE IF NOT EXISTS decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ao_id       UUID REFERENCES aos(id) ON DELETE CASCADE,
  statut      TEXT CHECK (statut IN ('go', 'no_go', 'en_attente', 'en_cours', 'repondu', 'remporte', 'perdu')) DEFAULT 'en_attente',
  commentaire TEXT,
  auteur      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Documents DCE attachés à une AO
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ao_id        UUID REFERENCES aos(id) ON DELETE CASCADE,
  nom          TEXT,
  url_source   TEXT,
  storage_key  TEXT,        -- chemin dans Supabase Storage si upload
  taille_bytes BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS aos_score_idx      ON aos(score DESC);
CREATE INDEX IF NOT EXISTS aos_date_vue_idx   ON aos(date_vue DESC);
CREATE INDEX IF NOT EXISTS decisions_ao_idx   ON decisions(ao_id);
CREATE INDEX IF NOT EXISTS documents_ao_idx   ON documents(ao_id);
