-- Ajoute la date de début d'exécution aux brouillons de génération de documents
-- (nouveau champ dans la modale "Générer les documents", utilisé par l'ATTRI1)
-- À coller dans Supabase > SQL Editor > New query

ALTER TABLE gendocs_drafts ADD COLUMN IF NOT EXISTS date_debut_execution TEXT;
