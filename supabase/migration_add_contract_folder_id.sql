-- Stocke le ContractFolderID (identifiant eForms, identique sur BOAMP et TED pour un même
-- avis publié au-dessus du seuil UE) afin de pouvoir détecter et fusionner automatiquement
-- les doublons cross-source déjà présents en base, pas seulement ceux du scan du jour.
-- À coller dans Supabase > SQL Editor > New query

ALTER TABLE aos ADD COLUMN IF NOT EXISTS contract_folder_id TEXT;
CREATE INDEX IF NOT EXISTS aos_contract_folder_id_idx ON aos(contract_folder_id) WHERE contract_folder_id IS NOT NULL;
