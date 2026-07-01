-- Brouillon des champs de génération de documents (DC1/DC2/ATTRI1/Mémoire) par AO
-- À coller dans Supabase > SQL Editor > New query

CREATE TABLE IF NOT EXISTS gendocs_drafts (
  ao_id             UUID PRIMARY KEY REFERENCES aos(id) ON DELETE CASCADE,
  objet_marche      TEXT,
  reference_marche  TEXT,
  acheteur          TEXT,
  montant_offre_ht  TEXT,
  montant_offre_ttc TEXT,
  delai_execution   TEXT,
  lieu_signature    TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gendocs_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_gendocs_drafts"   ON gendocs_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_gendocs_drafts" ON gendocs_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_gendocs_drafts" ON gendocs_drafts FOR UPDATE TO authenticated USING (true);
