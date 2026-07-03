-- Corrige la contrainte CHECK sur decisions.statut, restée bloquée sur les 3
-- statuts d'origine ('go', 'no_go', 'en_attente') alors que l'app en utilise 6
-- depuis la v2 (+ 'en_cours', 'repondu', 'remporte', 'perdu').
-- Sans ce correctif, tout passage à "En cours" / "Répondu" / "Remporté" / "Perdu"
-- est rejeté par la base de données.
-- À coller dans Supabase > SQL Editor > New query

ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_statut_check;

ALTER TABLE decisions ADD CONSTRAINT decisions_statut_check
  CHECK (statut IN ('go', 'no_go', 'en_attente', 'en_cours', 'repondu', 'remporte', 'perdu'));
