-- Migration: Ajouter colonnes equipe et statut à ParticipationMatch
-- Pour la gestion des équipes dans les matchs

ALTER TABLE ParticipationMatch ADD COLUMN equipe ENUM('A', 'B') DEFAULT NULL;
ALTER TABLE ParticipationMatch ADD COLUMN statut ENUM('en_attente', 'valide') DEFAULT 'en_attente';

-- Colonne prive et code_acces pour les matchs privés
ALTER TABLE MatchSport ADD COLUMN prive TINYINT(1) DEFAULT 0;
ALTER TABLE MatchSport ADD COLUMN code_acces VARCHAR(8) DEFAULT NULL;
