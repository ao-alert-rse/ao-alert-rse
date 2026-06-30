-- Bucket DCE + politiques Storage — coller dans Supabase > SQL Editor

-- Créer le bucket (privé)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dce', 'dce', false)
ON CONFLICT (id) DO NOTHING;

-- Lecture : utilisateurs authentifiés uniquement
CREATE POLICY "auth_read_dce" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'dce');

-- Upload : utilisateurs authentifiés uniquement
CREATE POLICY "auth_upload_dce" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dce');

-- Suppression : utilisateurs authentifiés uniquement
CREATE POLICY "auth_delete_dce" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'dce');
