-- ============================================================
--  THINKLESS – Schéma base de données complet
--  Stack : MySQL 8+
--  Projet E6 BTS SIO
-- ============================================================




USE thinkless_db;

DROP TABLE IF EXISTS Utilisateur, Sport, UtilisateurSport, JeuEsport, UtilisateurJeu,
  EquipeEsport, EquipeMembre, MatchSport, ParticipationMatch,
  ResultatMatch, Ligue, LigueUtilisateur, MatchEsport,
  MatchEquipe, ResultatMatchEsport;

SET FOREIGN_KEY_CHECKS = 0;
-- ------------------------------------------------------------
-- 1. Utilisateur
-- ------------------------------------------------------------
CREATE TABLE Utilisateur (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  pseudo        VARCHAR(50)     NOT NULL UNIQUE,
  email         VARCHAR(150)    NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255)    NOT NULL,          -- hash bcrypt
  localisation  VARCHAR(100)    DEFAULT NULL,
  avatar_url    VARCHAR(255)    DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. Sport physique
-- ------------------------------------------------------------
CREATE TABLE Sport (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom   VARCHAR(100) NOT NULL UNIQUE
);

-- Données de base
INSERT INTO Sport (nom) VALUES
  ('Football'), ('Basketball'), ('Tennis'),
  ('Volleyball'), ('Badminton'), ('Padel');

-- ------------------------------------------------------------
-- 3. Utilisateur ↔ Sport  (ranking individuel par sport)
-- ------------------------------------------------------------
CREATE TABLE UtilisateurSport (
  utilisateur_id  INT UNSIGNED  NOT NULL,
  sport_id        INT UNSIGNED  NOT NULL,
  elo             INT           NOT NULL DEFAULT 1000,
  victoires       INT UNSIGNED  NOT NULL DEFAULT 0,
  defaites        INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (utilisateur_id, sport_id),
  CONSTRAINT fk_us_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES Utilisateur(id) ON DELETE CASCADE,
  CONSTRAINT fk_us_sport       FOREIGN KEY (sport_id)
    REFERENCES Sport(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. Jeu e-sport
-- ------------------------------------------------------------
CREATE TABLE JeuEsport (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(100)  NOT NULL UNIQUE,
  badge_url   VARCHAR(255)  DEFAULT NULL    -- image du badge affiché sur le profil
);

INSERT INTO JeuEsport (nom) VALUES
  ('League of Legends'), ('Valorant'), ('CS2'),
  ('Rocket League'), ('FIFA'), ('Fortnite');

-- ------------------------------------------------------------
-- 5. Utilisateur ↔ Jeu e-sport  (ranking individuel par jeu)
-- ------------------------------------------------------------
CREATE TABLE UtilisateurJeu (
  utilisateur_id  INT UNSIGNED  NOT NULL,
  jeu_id          INT UNSIGNED  NOT NULL,
  elo             INT           NOT NULL DEFAULT 1000,
  victoires       INT UNSIGNED  NOT NULL DEFAULT 0,
  defaites        INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (utilisateur_id, jeu_id),
  CONSTRAINT fk_uj_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES Utilisateur(id) ON DELETE CASCADE,
  CONSTRAINT fk_uj_jeu         FOREIGN KEY (jeu_id)
    REFERENCES JeuEsport(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 6. Équipe e-sport
-- ------------------------------------------------------------
CREATE TABLE EquipeEsport (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100)  NOT NULL UNIQUE,
  capitaine_id  INT UNSIGNED  NOT NULL,
  logo_url      VARCHAR(255)  DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipe_capitaine FOREIGN KEY (capitaine_id)
    REFERENCES Utilisateur(id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- 7. Membres d'une équipe
--    Un joueur ne peut appartenir qu'à une seule équipe
-- ------------------------------------------------------------
CREATE TABLE EquipeMembre (
  equipe_id       INT UNSIGNED  NOT NULL,
  utilisateur_id  INT UNSIGNED  NOT NULL UNIQUE,  -- UNIQUE = 1 équipe max
  role            ENUM('capitaine','joueur')  NOT NULL DEFAULT 'joueur',
  rejoint_le      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipe_id, utilisateur_id),
  CONSTRAINT fk_em_equipe      FOREIGN KEY (equipe_id)
    REFERENCES EquipeEsport(id) ON DELETE CASCADE,
  CONSTRAINT fk_em_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES Utilisateur(id) ON DELETE CASCADE
);

CREATE TABLE Ligue (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  sport_id      INT UNSIGNED  NOT NULL,
  createur_id   INT UNSIGNED  NOT NULL,
  nom           VARCHAR(100)  NOT NULL,
  description   TEXT          DEFAULT NULL,
  publique      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ligue_sport    FOREIGN KEY (sport_id)
    REFERENCES Sport(id),
  CONSTRAINT fk_ligue_createur FOREIGN KEY (createur_id)
    REFERENCES Utilisateur(id)
);

-- ------------------------------------------------------------
-- 12. Membres d'une ligue + classement
-- ------------------------------------------------------------
CREATE TABLE LigueUtilisateur (
  ligue_id        INT UNSIGNED  NOT NULL,
  utilisateur_id  INT UNSIGNED  NOT NULL,
  points          INT           NOT NULL DEFAULT 0,
  victoires       INT UNSIGNED  NOT NULL DEFAULT 0,
  defaites        INT UNSIGNED  NOT NULL DEFAULT 0,
  rejoint_le      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ligue_id, utilisateur_id),
  CONSTRAINT fk_lu_ligue       FOREIGN KEY (ligue_id)
    REFERENCES Ligue(id) ON DELETE CASCADE,
  CONSTRAINT fk_lu_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES Utilisateur(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 8. Match sport physique
-- ------------------------------------------------------------
CREATE TABLE MatchSport (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  sport_id        INT UNSIGNED  NOT NULL,
  createur_id     INT UNSIGNED  NOT NULL,
  ligue_id        INT UNSIGNED  DEFAULT NULL,       -- optionnel
  titre           VARCHAR(150)  DEFAULT NULL,
  date_heure      DATETIME      NOT NULL,
  localisation    VARCHAR(200)  DEFAULT NULL,
  nb_joueurs_max  TINYINT UNSIGNED NOT NULL DEFAULT 2,
  statut          ENUM('ouvert','complet','termine','annule')
                  NOT NULL DEFAULT 'ouvert',
  created_at      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_match_ligue    FOREIGN KEY (ligue_id)
    REFERENCES Ligue(id),
  CONSTRAINT fk_match_sport    FOREIGN KEY (sport_id)
    REFERENCES Sport(id),
  CONSTRAINT fk_match_createur FOREIGN KEY (createur_id)
    REFERENCES Utilisateur(id)
);

-- ------------------------------------------------------------
-- 9. Participation à un match physique
-- ------------------------------------------------------------
CREATE TABLE ParticipationMatch (
  match_id        INT UNSIGNED  NOT NULL,
  utilisateur_id  INT UNSIGNED  NOT NULL,
  rejoint_le      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id, utilisateur_id),
  CONSTRAINT fk_pm_match       FOREIGN KEY (match_id)
    REFERENCES MatchSport(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES Utilisateur(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 10. Résultat d'un match physique
--     ELO delta stocké pour l'historique
-- ------------------------------------------------------------
CREATE TABLE ResultatMatch (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  match_id        INT UNSIGNED  NOT NULL UNIQUE,
  gagnant_id      INT UNSIGNED  NOT NULL,
  perdant_id      INT UNSIGNED  NOT NULL,
  score_gagnant   TINYINT UNSIGNED DEFAULT NULL,
  score_perdant   TINYINT UNSIGNED DEFAULT NULL,
  elo_delta       SMALLINT      NOT NULL DEFAULT 0,
  enregistre_le   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rm_match   FOREIGN KEY (match_id)
    REFERENCES MatchSport(id) ON DELETE CASCADE,
  CONSTRAINT fk_rm_gagnant FOREIGN KEY (gagnant_id)
    REFERENCES Utilisateur(id),
  CONSTRAINT fk_rm_perdant FOREIGN KEY (perdant_id)
    REFERENCES Utilisateur(id)
);

-- ------------------------------------------------------------
-- 11. Ligue (entre amis / collègues)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 13. Match e-sport
-- ------------------------------------------------------------
CREATE TABLE MatchEsport (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  jeu_id        INT UNSIGNED  NOT NULL,
  createur_id   INT UNSIGNED  NOT NULL,
  date_heure    DATETIME      NOT NULL,
  format        VARCHAR(50)   DEFAULT 'BO1',   -- BO1, BO3, BO5…
  statut        ENUM('ouvert','complet','en_cours','termine','annule')
                NOT NULL DEFAULT 'ouvert',
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_me_jeu      FOREIGN KEY (jeu_id)
    REFERENCES JeuEsport(id),
  CONSTRAINT fk_me_createur FOREIGN KEY (createur_id)
    REFERENCES Utilisateur(id)
);

-- ------------------------------------------------------------
-- 14. Équipes participant à un match e-sport
-- ------------------------------------------------------------
CREATE TABLE MatchEquipe (
  match_esport_id  INT UNSIGNED  NOT NULL,
  equipe_id        INT UNSIGNED  NOT NULL,
  elo_moyen        SMALLINT UNSIGNED  NOT NULL DEFAULT 1000,  -- snapshot au moment du match
  PRIMARY KEY (match_esport_id, equipe_id),
  CONSTRAINT fk_meq_match  FOREIGN KEY (match_esport_id)
    REFERENCES MatchEsport(id) ON DELETE CASCADE,
  CONSTRAINT fk_meq_equipe FOREIGN KEY (equipe_id)
    REFERENCES EquipeEsport(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 15. Résultat d'un match e-sport
-- ------------------------------------------------------------
CREATE TABLE ResultatMatchEsport (
  id                   INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  match_esport_id      INT UNSIGNED  NOT NULL UNIQUE,
  equipe_gagnante_id   INT UNSIGNED  NOT NULL,
  equipe_perdante_id   INT UNSIGNED  NOT NULL,
  score_gagnant        TINYINT UNSIGNED DEFAULT NULL,
  score_perdant        TINYINT UNSIGNED DEFAULT NULL,
  elo_delta            SMALLINT  NOT NULL DEFAULT 0,
  enregistre_le        DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rme_match    FOREIGN KEY (match_esport_id)
    REFERENCES MatchEsport(id) ON DELETE CASCADE,
  CONSTRAINT fk_rme_gagnant  FOREIGN KEY (equipe_gagnante_id)
    REFERENCES EquipeEsport(id),
  CONSTRAINT fk_rme_perdant  FOREIGN KEY (equipe_perdante_id)
    REFERENCES EquipeEsport(id)
);

-- ============================================================
--  VUES UTILES
-- ============================================================

-- Classement joueurs par sport
CREATE OR REPLACE VIEW v_classement_sport AS
SELECT
  u.pseudo,
  s.nom        AS sport,
  us.elo,
  us.victoires,
  us.defaites,
  RANK() OVER (PARTITION BY us.sport_id ORDER BY us.elo DESC) AS rang
FROM UtilisateurSport us
JOIN Utilisateur u ON u.id = us.utilisateur_id
JOIN Sport s       ON s.id = us.sport_id;

-- Classement joueurs par jeu e-sport
CREATE OR REPLACE VIEW v_classement_jeu AS
SELECT
  u.pseudo,
  j.nom        AS jeu,
  uj.elo,
  uj.victoires,
  uj.defaites,
  RANK() OVER (PARTITION BY uj.jeu_id ORDER BY uj.elo DESC) AS rang
FROM UtilisateurJeu uj
JOIN Utilisateur u ON u.id = uj.utilisateur_id
JOIN JeuEsport j   ON j.id = uj.jeu_id;

-- ELO moyen d'une équipe pour un jeu donné  (utilisé pour le matchmaking)
CREATE OR REPLACE VIEW v_elo_equipe_par_jeu AS
SELECT
  em.equipe_id,
  uj.jeu_id,
  ROUND(AVG(uj.elo)) AS elo_moyen,
  COUNT(*)           AS nb_joueurs
FROM EquipeMembre em
JOIN UtilisateurJeu uj ON uj.utilisateur_id = em.utilisateur_id
GROUP BY em.equipe_id, uj.jeu_id;

-- ============================================================
--  INDEX SUPPLÉMENTAIRES  (performances)
-- ============================================================
CREATE INDEX idx_matchsport_sport_statut  ON MatchSport(sport_id, statut);
CREATE INDEX idx_matchsport_date          ON MatchSport(date_heure);
CREATE INDEX idx_matchesport_jeu_statut ON MatchEsport(jeu_id, statut);
CREATE INDEX idx_participation_user    ON ParticipationMatch(utilisateur_id);
CREATE INDEX idx_ligueutilisateur_pts  ON LigueUtilisateur(ligue_id, points DESC);

SET FOREIGN_KEY_CHECKS = 1;
