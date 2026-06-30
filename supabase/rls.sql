-- Politiques RLS (Row Level Security) — à coller dans Supabase > SQL Editor

ALTER TABLE aos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- AOs : lecture seule pour les utilisateurs authentifiés
CREATE POLICY "auth_read_aos" ON aos
  FOR SELECT TO authenticated USING (true);

-- Décisions : lecture + écriture pour les utilisateurs authentifiés
CREATE POLICY "auth_read_decisions"   ON decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_decisions" ON decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_decisions" ON decisions FOR UPDATE TO authenticated USING (true);

-- Documents : lecture + écriture pour les utilisateurs authentifiés
CREATE POLICY "auth_read_documents"   ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_documents" ON documents FOR INSERT TO authenticated WITH CHECK (true);

-- Le scanner utilise service_role qui bypasse RLS par défaut — rien à faire
