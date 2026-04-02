-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Hôte : thinkless-db
-- Généré le : jeu. 02 avr. 2026 à 20:18
-- Version du serveur : 8.0.45
-- Version de PHP : 8.3.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `thinkless_db`
--

-- --------------------------------------------------------

--
-- Structure de la table `EquipeDemande`
--

CREATE TABLE `EquipeDemande` (
  `id` int UNSIGNED NOT NULL,
  `equipe_id` int UNSIGNED NOT NULL,
  `utilisateur_id` int UNSIGNED NOT NULL,
  `statut` enum('en_attente','acceptee','refusee') NOT NULL DEFAULT 'en_attente',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `EquipeDemande`
--

INSERT INTO `EquipeDemande` (`id`, `equipe_id`, `utilisateur_id`, `statut`, `created_at`, `decided_at`) VALUES
(1, 1, 1, 'acceptee', '2026-04-02 18:53:36', '2026-04-02 18:56:00');

-- --------------------------------------------------------

--
-- Structure de la table `EquipeEsport`
--

CREATE TABLE `EquipeEsport` (
  `id` int UNSIGNED NOT NULL,
  `nom` varchar(100) NOT NULL,
  `capitaine_id` int UNSIGNED NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `EquipeEsport`
--

INSERT INTO `EquipeEsport` (`id`, `nom`, `capitaine_id`, `logo_url`, `created_at`) VALUES
(1, '313PLUG', 7, '/uploads/team-logos/team-7-1775154296028-325223911.jpg', '2026-04-02 18:27:46'),
(2, 'Arsenal Club', 8, NULL, '2026-04-02 19:39:30');

-- --------------------------------------------------------

--
-- Structure de la table `EquipeMembre`
--

CREATE TABLE `EquipeMembre` (
  `equipe_id` int UNSIGNED NOT NULL,
  `utilisateur_id` int UNSIGNED NOT NULL,
  `role` enum('capitaine','joueur') NOT NULL DEFAULT 'joueur',
  `rejoint_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `EquipeMembre`
--

INSERT INTO `EquipeMembre` (`equipe_id`, `utilisateur_id`, `role`, `rejoint_le`) VALUES
(1, 1, 'joueur', '2026-04-02 18:56:00'),
(1, 7, 'capitaine', '2026-04-02 18:27:46'),
(2, 8, 'capitaine', '2026-04-02 19:39:30');

-- --------------------------------------------------------

--
-- Structure de la table `JeuEsport`
--

CREATE TABLE `JeuEsport` (
  `id` int UNSIGNED NOT NULL,
  `nom` varchar(100) NOT NULL,
  `badge_url` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `JeuEsport`
--

INSERT INTO `JeuEsport` (`id`, `nom`, `badge_url`) VALUES
(1, 'League of Legends', NULL),
(2, 'Valorant', NULL),
(3, 'CS2', NULL),
(4, 'Rocket League', NULL),
(5, 'FIFA', NULL),
(6, 'Fortnite', NULL);

-- --------------------------------------------------------

--
-- Structure de la table `Ligue`
--

CREATE TABLE `Ligue` (
  `id` int UNSIGNED NOT NULL,
  `sport_id` int UNSIGNED DEFAULT NULL,
  `jeu_id` int UNSIGNED DEFAULT NULL,
  `createur_id` int UNSIGNED NOT NULL,
  `nom` varchar(100) NOT NULL,
  `description` text,
  `publique` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nb_equipe` int UNSIGNED DEFAULT '2',
  `slots_par_equipe` int UNSIGNED DEFAULT '5',
  `code_acces` varchar(8) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `Ligue`
--

INSERT INTO `Ligue` (`id`, `sport_id`, `jeu_id`, `createur_id`, `nom`, `description`, `publique`, `created_at`, `nb_equipe`, `slots_par_equipe`, `code_acces`) VALUES
(1, 2, NULL, 7, 'Championnat SIO Ile-de-France', 'Un championnat de BTS SIO au basket, celui qui remporte le championnat gagne une alternance !', 0, '2026-04-02 02:11:09', 2, 5, NULL),
(2, 1, NULL, 7, 'Championnat SIO Ile-de-France', 'Une Ligue 100% de football entre tous les BTS SIO d\'île-de-France, venez vous défier pour tenter de remporter un voyage au ski', 0, '2026-04-02 02:56:45', 10, 8, 'J1TQAL55'),
(3, 3, NULL, 7, 'Ligue de Tennis entre SIO', 'Une Ligue 100% de Tennis entre tous les BTS SIO d\'île-de-France, venez vous défier pour tenter de remporter une alternance !', 1, '2026-04-02 03:18:07', 1, 1, NULL),
(4, NULL, 2, 7, 'valo ligue', 'sio', 0, '2026-04-02 19:38:06', 5, 5, 'DHUOWD6A');

-- --------------------------------------------------------

--
-- Structure de la table `LigueEquipe`
--

CREATE TABLE `LigueEquipe` (
  `id` int UNSIGNED NOT NULL,
  `ligue_id` int UNSIGNED NOT NULL,
  `nom` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `LigueEquipe`
--

INSERT INTO `LigueEquipe` (`id`, `ligue_id`, `nom`, `created_at`) VALUES
(1, 2, 'Lycée Turgot', '2026-04-02 02:56:45'),
(2, 2, 'Lycée Charles de Foucauld', '2026-04-02 02:56:45'),
(3, 2, 'Lycée du Parc des Loges', '2026-04-02 02:56:45'),
(4, 2, 'Lycée Paul Lapie', '2026-04-02 02:56:45'),
(5, 2, 'Lycée Parc de Vilgénis', '2026-04-02 02:56:45'),
(6, 2, 'Lycée Voillaume', '2026-04-02 02:56:45'),
(7, 2, 'Lycée Louis Armand', '2026-04-02 02:56:45'),
(8, 2, 'IRIS Paris', '2026-04-02 02:56:45'),
(9, 2, 'CESI Nanterre', '2026-04-02 02:56:45'),
(10, 2, 'Lycée Léonard de Vinci', '2026-04-02 02:56:45'),
(11, 4, 'Équipe 1', '2026-04-02 19:38:06'),
(12, 4, 'Équipe 2', '2026-04-02 19:38:06'),
(13, 4, 'Équipe 3', '2026-04-02 19:38:06'),
(14, 4, 'Équipe 4', '2026-04-02 19:38:06'),
(15, 4, 'Équipe 5', '2026-04-02 19:38:06');

-- --------------------------------------------------------

--
-- Structure de la table `LigueUtilisateur`
--

CREATE TABLE `LigueUtilisateur` (
  `ligue_id` int UNSIGNED NOT NULL,
  `utilisateur_id` int UNSIGNED NOT NULL,
  `points` int NOT NULL DEFAULT '0',
  `victoires` int UNSIGNED NOT NULL DEFAULT '0',
  `defaites` int UNSIGNED NOT NULL DEFAULT '0',
  `rejoint_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `equipe_id` int UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `LigueUtilisateur`
--

INSERT INTO `LigueUtilisateur` (`ligue_id`, `utilisateur_id`, `points`, `victoires`, `defaites`, `rejoint_le`, `equipe_id`) VALUES
(2, 7, 0, 0, 0, '2026-04-02 02:56:45', NULL),
(3, 1, 0, 0, 1, '2026-04-02 17:40:30', NULL),
(3, 7, 0, 0, 0, '2026-04-02 03:18:07', NULL),
(3, 8, 3, 1, 0, '2026-04-02 17:30:15', NULL),
(4, 7, 0, 0, 0, '2026-04-02 19:38:06', NULL),
(4, 8, 0, 0, 0, '2026-04-02 19:46:40', NULL);

-- --------------------------------------------------------

--
-- Structure de la table `MatchEquipe`
--

CREATE TABLE `MatchEquipe` (
  `match_esport_id` int UNSIGNED NOT NULL,
  `equipe_id` int UNSIGNED NOT NULL,
  `elo_moyen` smallint UNSIGNED NOT NULL DEFAULT '1000'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `MatchEquipe`
--

INSERT INTO `MatchEquipe` (`match_esport_id`, `equipe_id`, `elo_moyen`) VALUES
(1, 1, 1000),
(2, 1, 1000),
(2, 2, 1000);

-- --------------------------------------------------------

--
-- Structure de la table `MatchEquipeConvocation`
--

CREATE TABLE `MatchEquipeConvocation` (
  `match_esport_id` int UNSIGNED NOT NULL,
  `equipe_id` int UNSIGNED NOT NULL,
  `utilisateur_id` int UNSIGNED NOT NULL,
  `convoque_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `MatchEquipeConvocation`
--

INSERT INTO `MatchEquipeConvocation` (`match_esport_id`, `equipe_id`, `utilisateur_id`, `convoque_le`) VALUES
(1, 1, 7, '2026-04-02 19:57:30'),
(2, 1, 1, '2026-04-02 19:38:45'),
(2, 1, 7, '2026-04-02 19:38:45'),
(2, 2, 8, '2026-04-02 19:54:18');

-- --------------------------------------------------------

--
-- Structure de la table `MatchEsport`
--

CREATE TABLE `MatchEsport` (
  `id` int UNSIGNED NOT NULL,
  `jeu_id` int UNSIGNED NOT NULL,
  `createur_id` int UNSIGNED NOT NULL,
  `ligue_id` int UNSIGNED DEFAULT NULL,
  `date_heure` datetime NOT NULL,
  `format` varchar(50) DEFAULT 'BO1',
  `slots_par_equipe` tinyint UNSIGNED NOT NULL DEFAULT '5',
  `statut` enum('ouvert','complet','en_cours','termine','annule') NOT NULL DEFAULT 'ouvert',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `MatchEsport`
--

INSERT INTO `MatchEsport` (`id`, `jeu_id`, `createur_id`, `ligue_id`, `date_heure`, `format`, `slots_par_equipe`, `statut`, `created_at`) VALUES
(1, 1, 7, NULL, '2026-05-12 22:00:00', 'BO3', 5, 'ouvert', '2026-04-02 18:56:45'),
(2, 2, 7, 4, '2026-05-15 10:15:00', 'BO3', 5, 'complet', '2026-04-02 19:38:45');

-- --------------------------------------------------------

--
-- Structure de la table `MatchSport`
--

CREATE TABLE `MatchSport` (
  `id` int UNSIGNED NOT NULL,
  `sport_id` int UNSIGNED NOT NULL,
  `createur_id` int UNSIGNED NOT NULL,
  `ligue_id` int UNSIGNED DEFAULT NULL,
  `titre` varchar(150) DEFAULT NULL,
  `date_heure` datetime NOT NULL,
  `localisation` varchar(200) DEFAULT NULL,
  `nb_joueurs_max` tinyint UNSIGNED NOT NULL DEFAULT '2',
  `nb_equipe_a` tinyint UNSIGNED DEFAULT '1',
  `nb_equipe_b` tinyint UNSIGNED DEFAULT '1',
  `nb_remplacants` tinyint UNSIGNED DEFAULT '0',
  `nom_equipe_a` varchar(100) DEFAULT 'Ã‰quipe A',
  `nom_equipe_b` varchar(100) DEFAULT 'Ã‰quipe B',
  `statut` enum('ouvert','complet','termine','annule') NOT NULL DEFAULT 'ouvert',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `prive` tinyint(1) DEFAULT '0',
  `code_acces` varchar(8) DEFAULT NULL,
  `score_equipe_a` smallint DEFAULT NULL,
  `score_equipe_b` smallint DEFAULT NULL,
  `vainqueur_equipe` enum('A','B') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `MatchSport`
--

INSERT INTO `MatchSport` (`id`, `sport_id`, `createur_id`, `ligue_id`, `titre`, `date_heure`, `localisation`, `nb_joueurs_max`, `nb_equipe_a`, `nb_equipe_b`, `nb_remplacants`, `nom_equipe_a`, `nom_equipe_b`, `statut`, `created_at`, `prive`, `code_acces`, `score_equipe_a`, `score_equipe_b`, `vainqueur_equipe`) VALUES
(1, 2, 7, NULL, 'Match de reprise ', '2026-04-10 18:00:00', 'Aubervilliers', 12, 5, 5, 2, 'SIO A', 'SIO B', 'ouvert', '2026-04-02 02:09:33', 0, NULL, NULL, NULL, NULL),
(2, 1, 7, NULL, 'Match Amical entre SIO ', '2026-02-10 14:30:00', 'Creteil', 18, 8, 8, 2, 'SIO1B', 'SIO2B', 'ouvert', '2026-04-02 02:13:10', 0, NULL, NULL, NULL, NULL),
(3, 1, 7, NULL, 'Match 1 - Turgot Paris VS Loges Evry', '2026-04-18 18:00:00', 'Creteil Rompadour', 20, 8, 8, 4, 'Turgot', 'Les Loges', 'annule', '2026-04-02 02:26:34', 0, NULL, NULL, NULL, NULL),
(4, 3, 7, NULL, 'Reprise', '2026-05-20 20:00:00', 'Pantin', 2, 1, 1, 0, 'Joueur 1', 'Joueur 2', 'ouvert', '2026-04-02 02:28:08', 0, NULL, NULL, NULL, NULL),
(5, 2, 7, NULL, 'entrainement collectif', '2026-04-05 13:30:00', 'Aubervilliers', 10, 5, 5, 0, 'Équipe A', 'Équipe B', 'ouvert', '2026-04-02 02:29:12', 1, 'U5UVPP2R', NULL, NULL, NULL),
(6, 1, 7, 2, 'Lycée du Parc des Loges vs IRIS Paris', '2024-04-13 14:00:00', 'Paris', 18, 8, 8, 2, 'Lycée du Parc des Loges', 'IRIS Paris', 'ouvert', '2026-04-02 03:14:59', 0, NULL, NULL, NULL, NULL),
(7, 3, 7, 3, 'Match 1', '2026-04-04 13:00:00', 'Noisy-le-grand', 2, 1, 1, 0, 'Joueur 1', 'Joueur 2', 'termine', '2026-04-02 03:20:07', 0, NULL, 3, 2, 'A');

-- --------------------------------------------------------

--
-- Structure de la table `ParticipationMatch`
--

CREATE TABLE `ParticipationMatch` (
  `match_id` int UNSIGNED NOT NULL,
  `utilisateur_id` int UNSIGNED NOT NULL,
  `rejoint_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `equipe` enum('A','B') DEFAULT NULL,
  `statut` enum('en_attente','valide') DEFAULT 'en_attente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `ParticipationMatch`
--

INSERT INTO `ParticipationMatch` (`match_id`, `utilisateur_id`, `rejoint_le`, `equipe`, `statut`) VALUES
(1, 7, '2026-04-02 02:09:33', NULL, 'en_attente'),
(1, 8, '2026-04-02 03:38:34', NULL, 'en_attente'),
(2, 7, '2026-04-02 02:13:11', 'B', 'valide'),
(2, 8, '2026-04-02 03:38:21', 'A', 'valide'),
(3, 7, '2026-04-02 02:26:34', 'A', 'valide'),
(4, 7, '2026-04-02 02:28:08', 'A', 'valide'),
(4, 8, '2026-04-02 03:38:43', 'B', 'en_attente'),
(5, 7, '2026-04-02 02:29:12', 'A', 'valide'),
(6, 7, '2026-04-02 03:14:59', NULL, 'en_attente'),
(7, 1, '2026-04-02 18:34:03', 'B', 'valide'),
(7, 7, '2026-04-02 03:20:07', 'A', 'en_attente'),
(7, 8, '2026-04-02 20:15:33', 'A', 'valide');

-- --------------------------------------------------------

--
-- Structure de la table `ResultatMatch`
--

CREATE TABLE `ResultatMatch` (
  `id` int UNSIGNED NOT NULL,
  `match_id` int UNSIGNED NOT NULL,
  `gagnant_id` int UNSIGNED NOT NULL,
  `perdant_id` int UNSIGNED NOT NULL,
  `score_gagnant` tinyint UNSIGNED DEFAULT NULL,
  `score_perdant` tinyint UNSIGNED DEFAULT NULL,
  `elo_delta` smallint NOT NULL DEFAULT '0',
  `enregistre_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `ResultatMatch`
--

INSERT INTO `ResultatMatch` (`id`, `match_id`, `gagnant_id`, `perdant_id`, `score_gagnant`, `score_perdant`, `elo_delta`, `enregistre_le`) VALUES
(1, 7, 8, 1, 3, 2, 0, '2026-04-02 20:16:05');

-- --------------------------------------------------------

--
-- Structure de la table `ResultatMatchEsport`
--

CREATE TABLE `ResultatMatchEsport` (
  `id` int UNSIGNED NOT NULL,
  `match_esport_id` int UNSIGNED NOT NULL,
  `equipe_gagnante_id` int UNSIGNED NOT NULL,
  `equipe_perdante_id` int UNSIGNED NOT NULL,
  `score_gagnant` tinyint UNSIGNED DEFAULT NULL,
  `score_perdant` tinyint UNSIGNED DEFAULT NULL,
  `elo_delta` smallint NOT NULL DEFAULT '0',
  `enregistre_le` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Structure de la table `Sport`
--

CREATE TABLE `Sport` (
  `id` int UNSIGNED NOT NULL,
  `nom` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `Sport`
--

INSERT INTO `Sport` (`id`, `nom`) VALUES
(5, 'Badminton'),
(2, 'Basketball'),
(1, 'Football'),
(6, 'Padel'),
(3, 'Tennis'),
(4, 'Volleyball');

-- --------------------------------------------------------

--
-- Structure de la table `Utilisateur`
--

CREATE TABLE `Utilisateur` (
  `id` int UNSIGNED NOT NULL,
  `pseudo` varchar(50) NOT NULL,
  `email` varchar(150) NOT NULL,
  `mot_de_passe` varchar(255) NOT NULL,
  `localisation` varchar(100) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `Utilisateur`
--

INSERT INTO `Utilisateur` (`id`, `pseudo`, `email`, `mot_de_passe`, `localisation`, `avatar_url`, `created_at`, `updated_at`) VALUES
(1, 'Kody', 'borisephestion@gmail.com', '$2b$10$UZrY7LMZBYVP3atRsID4z.xV2R33oejss3TO8kGZefWzvEyGl1IRK', 'Paris', NULL, '2026-03-31 15:38:29', '2026-04-02 20:12:23'),
(2, 'testuser', 'test@test.com', '$2b$10$.3GHgcevt2E7VZXwjqxdXuwyylFMCSbJ2xifHu6buN5JKUwoSn2uO', 'Paris', NULL, '2026-03-31 15:42:07', '2026-03-31 15:42:07'),
(3, 'testuser2', 'test2@test.com', '$2b$10$6bI77yAHfhINYgo/mio5Yu5G33DxLhe1GJC9HreBLDsV947Pv2VxW', 'Paris', NULL, '2026-03-31 15:42:35', '2026-03-31 15:42:35'),
(7, '313Kody', 'kodyharvent@gmail.com', '$2b$10$XsyRzDc33jzAWcowinrNgu/NX7D1gPff.7XkCHEbwSL9Bx3yyeI/6', 'Paris', NULL, '2026-04-02 02:08:18', '2026-04-02 20:12:23'),
(8, 'John', 'johntimber@gmail.com', '$2b$10$KJeai/Kbf44D0EXwiwJENuysFTS4tuPTAx0d8CJ74pRLqYPiMhPza', 'Paris', NULL, '2026-04-02 03:34:42', '2026-04-02 03:34:42');

-- --------------------------------------------------------

--
-- Structure de la table `UtilisateurJeu`
--

CREATE TABLE `UtilisateurJeu` (
  `utilisateur_id` int UNSIGNED NOT NULL,
  `jeu_id` int UNSIGNED NOT NULL,
  `elo` int NOT NULL DEFAULT '1000',
  `victoires` int UNSIGNED NOT NULL DEFAULT '0',
  `defaites` int UNSIGNED NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `UtilisateurJeu`
--

INSERT INTO `UtilisateurJeu` (`utilisateur_id`, `jeu_id`, `elo`, `victoires`, `defaites`) VALUES
(7, 1, 1000, 0, 0),
(7, 2, 1000, 0, 0),
(7, 4, 1000, 0, 0),
(7, 5, 1000, 0, 0),
(7, 6, 1000, 0, 0);

-- --------------------------------------------------------

--
-- Structure de la table `UtilisateurSport`
--

CREATE TABLE `UtilisateurSport` (
  `utilisateur_id` int UNSIGNED NOT NULL,
  `sport_id` int UNSIGNED NOT NULL,
  `elo` int NOT NULL DEFAULT '1000',
  `victoires` int UNSIGNED NOT NULL DEFAULT '0',
  `defaites` int UNSIGNED NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Déchargement des données de la table `UtilisateurSport`
--

INSERT INTO `UtilisateurSport` (`utilisateur_id`, `sport_id`, `elo`, `victoires`, `defaites`) VALUES
(7, 1, 1000, 0, 0),
(7, 2, 1000, 0, 0),
(7, 3, 1000, 1, 0),
(8, 1, 1000, 0, 0),
(8, 2, 1000, 0, 0),
(8, 3, 1000, 1, 0),
(8, 5, 1000, 0, 0);

-- --------------------------------------------------------

--
-- Doublure de structure pour la vue `v_classement_jeu`
-- (Voir ci-dessous la vue réelle)
--
CREATE TABLE `v_classement_jeu` (
`defaites` int unsigned
,`elo` int
,`jeu` varchar(100)
,`pseudo` varchar(50)
,`rang` bigint unsigned
,`victoires` int unsigned
);

-- --------------------------------------------------------

--
-- Doublure de structure pour la vue `v_classement_sport`
-- (Voir ci-dessous la vue réelle)
--
CREATE TABLE `v_classement_sport` (
`defaites` int unsigned
,`elo` int
,`pseudo` varchar(50)
,`rang` bigint unsigned
,`sport` varchar(100)
,`victoires` int unsigned
);

-- --------------------------------------------------------

--
-- Doublure de structure pour la vue `v_elo_equipe_par_jeu`
-- (Voir ci-dessous la vue réelle)
--
CREATE TABLE `v_elo_equipe_par_jeu` (
`elo_moyen` decimal(11,0)
,`equipe_id` int unsigned
,`jeu_id` int unsigned
,`nb_joueurs` bigint
);

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `EquipeDemande`
--
ALTER TABLE `EquipeDemande`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_equipe_demande_unique` (`equipe_id`,`utilisateur_id`),
  ADD KEY `idx_equipe_demande_statut` (`statut`),
  ADD KEY `fk_ed_utilisateur` (`utilisateur_id`);

--
-- Index pour la table `EquipeEsport`
--
ALTER TABLE `EquipeEsport`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nom` (`nom`),
  ADD KEY `fk_equipe_capitaine` (`capitaine_id`);

--
-- Index pour la table `EquipeMembre`
--
ALTER TABLE `EquipeMembre`
  ADD PRIMARY KEY (`equipe_id`,`utilisateur_id`),
  ADD UNIQUE KEY `utilisateur_id` (`utilisateur_id`);

--
-- Index pour la table `JeuEsport`
--
ALTER TABLE `JeuEsport`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nom` (`nom`);

--
-- Index pour la table `Ligue`
--
ALTER TABLE `Ligue`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_ligue_sport` (`sport_id`),
  ADD KEY `fk_ligue_createur` (`createur_id`);

--
-- Index pour la table `LigueEquipe`
--
ALTER TABLE `LigueEquipe`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_ligue_nom` (`ligue_id`,`nom`);

--
-- Index pour la table `LigueUtilisateur`
--
ALTER TABLE `LigueUtilisateur`
  ADD PRIMARY KEY (`ligue_id`,`utilisateur_id`),
  ADD KEY `fk_lu_utilisateur` (`utilisateur_id`),
  ADD KEY `idx_ligueutilisateur_pts` (`ligue_id`,`points` DESC),
  ADD KEY `fk_lu_equipe` (`equipe_id`);

--
-- Index pour la table `MatchEquipe`
--
ALTER TABLE `MatchEquipe`
  ADD PRIMARY KEY (`match_esport_id`,`equipe_id`),
  ADD KEY `fk_meq_equipe` (`equipe_id`);

--
-- Index pour la table `MatchEquipeConvocation`
--
ALTER TABLE `MatchEquipeConvocation`
  ADD PRIMARY KEY (`match_esport_id`,`equipe_id`,`utilisateur_id`),
  ADD KEY `fk_mec_equipe` (`equipe_id`),
  ADD KEY `fk_mec_utilisateur` (`utilisateur_id`);

--
-- Index pour la table `MatchEsport`
--
ALTER TABLE `MatchEsport`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_me_createur` (`createur_id`),
  ADD KEY `idx_matchesport_jeu_statut` (`jeu_id`,`statut`);

--
-- Index pour la table `MatchSport`
--
ALTER TABLE `MatchSport`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_match_ligue` (`ligue_id`),
  ADD KEY `fk_match_createur` (`createur_id`),
  ADD KEY `idx_matchsport_sport_statut` (`sport_id`,`statut`),
  ADD KEY `idx_matchsport_date` (`date_heure`);

--
-- Index pour la table `ParticipationMatch`
--
ALTER TABLE `ParticipationMatch`
  ADD PRIMARY KEY (`match_id`,`utilisateur_id`),
  ADD KEY `idx_participation_user` (`utilisateur_id`);

--
-- Index pour la table `ResultatMatch`
--
ALTER TABLE `ResultatMatch`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `match_id` (`match_id`),
  ADD KEY `fk_rm_gagnant` (`gagnant_id`),
  ADD KEY `fk_rm_perdant` (`perdant_id`);

--
-- Index pour la table `ResultatMatchEsport`
--
ALTER TABLE `ResultatMatchEsport`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `match_esport_id` (`match_esport_id`),
  ADD KEY `fk_rme_gagnant` (`equipe_gagnante_id`),
  ADD KEY `fk_rme_perdant` (`equipe_perdante_id`);

--
-- Index pour la table `Sport`
--
ALTER TABLE `Sport`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nom` (`nom`);

--
-- Index pour la table `Utilisateur`
--
ALTER TABLE `Utilisateur`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `pseudo` (`pseudo`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Index pour la table `UtilisateurJeu`
--
ALTER TABLE `UtilisateurJeu`
  ADD PRIMARY KEY (`utilisateur_id`,`jeu_id`),
  ADD KEY `fk_uj_jeu` (`jeu_id`);

--
-- Index pour la table `UtilisateurSport`
--
ALTER TABLE `UtilisateurSport`
  ADD PRIMARY KEY (`utilisateur_id`,`sport_id`),
  ADD KEY `fk_us_sport` (`sport_id`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `EquipeDemande`
--
ALTER TABLE `EquipeDemande`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT pour la table `EquipeEsport`
--
ALTER TABLE `EquipeEsport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT pour la table `JeuEsport`
--
ALTER TABLE `JeuEsport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT pour la table `Ligue`
--
ALTER TABLE `Ligue`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `LigueEquipe`
--
ALTER TABLE `LigueEquipe`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT pour la table `MatchEsport`
--
ALTER TABLE `MatchEsport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT pour la table `MatchSport`
--
ALTER TABLE `MatchSport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT pour la table `ResultatMatch`
--
ALTER TABLE `ResultatMatch`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT pour la table `ResultatMatchEsport`
--
ALTER TABLE `ResultatMatchEsport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `Sport`
--
ALTER TABLE `Sport`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT pour la table `Utilisateur`
--
ALTER TABLE `Utilisateur`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

-- --------------------------------------------------------

--
-- Structure de la vue `v_classement_jeu`
--
DROP TABLE IF EXISTS `v_classement_jeu`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_classement_jeu`  AS SELECT `u`.`pseudo` AS `pseudo`, `j`.`nom` AS `jeu`, `uj`.`elo` AS `elo`, `uj`.`victoires` AS `victoires`, `uj`.`defaites` AS `defaites`, rank() OVER (PARTITION BY `uj`.`jeu_id` ORDER BY `uj`.`elo` desc ) AS `rang` FROM ((`UtilisateurJeu` `uj` join `Utilisateur` `u` on((`u`.`id` = `uj`.`utilisateur_id`))) join `JeuEsport` `j` on((`j`.`id` = `uj`.`jeu_id`))) ;

-- --------------------------------------------------------

--
-- Structure de la vue `v_classement_sport`
--
DROP TABLE IF EXISTS `v_classement_sport`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_classement_sport`  AS SELECT `u`.`pseudo` AS `pseudo`, `s`.`nom` AS `sport`, `us`.`elo` AS `elo`, `us`.`victoires` AS `victoires`, `us`.`defaites` AS `defaites`, rank() OVER (PARTITION BY `us`.`sport_id` ORDER BY `us`.`elo` desc ) AS `rang` FROM ((`UtilisateurSport` `us` join `Utilisateur` `u` on((`u`.`id` = `us`.`utilisateur_id`))) join `Sport` `s` on((`s`.`id` = `us`.`sport_id`))) ;

-- --------------------------------------------------------

--
-- Structure de la vue `v_elo_equipe_par_jeu`
--
DROP TABLE IF EXISTS `v_elo_equipe_par_jeu`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_elo_equipe_par_jeu`  AS SELECT `em`.`equipe_id` AS `equipe_id`, `uj`.`jeu_id` AS `jeu_id`, round(avg(`uj`.`elo`),0) AS `elo_moyen`, count(0) AS `nb_joueurs` FROM (`EquipeMembre` `em` join `UtilisateurJeu` `uj` on((`uj`.`utilisateur_id` = `em`.`utilisateur_id`))) GROUP BY `em`.`equipe_id`, `uj`.`jeu_id` ;

--
-- Contraintes pour les tables déchargées
--

--
-- Contraintes pour la table `EquipeDemande`
--
ALTER TABLE `EquipeDemande`
  ADD CONSTRAINT `fk_ed_equipe` FOREIGN KEY (`equipe_id`) REFERENCES `EquipeEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ed_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `EquipeEsport`
--
ALTER TABLE `EquipeEsport`
  ADD CONSTRAINT `fk_equipe_capitaine` FOREIGN KEY (`capitaine_id`) REFERENCES `Utilisateur` (`id`) ON DELETE RESTRICT;

--
-- Contraintes pour la table `EquipeMembre`
--
ALTER TABLE `EquipeMembre`
  ADD CONSTRAINT `fk_em_equipe` FOREIGN KEY (`equipe_id`) REFERENCES `EquipeEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_em_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `Ligue`
--
ALTER TABLE `Ligue`
  ADD CONSTRAINT `fk_ligue_createur` FOREIGN KEY (`createur_id`) REFERENCES `Utilisateur` (`id`),
  ADD CONSTRAINT `fk_ligue_sport` FOREIGN KEY (`sport_id`) REFERENCES `Sport` (`id`);

--
-- Contraintes pour la table `LigueEquipe`
--
ALTER TABLE `LigueEquipe`
  ADD CONSTRAINT `fk_le_ligue` FOREIGN KEY (`ligue_id`) REFERENCES `Ligue` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `LigueUtilisateur`
--
ALTER TABLE `LigueUtilisateur`
  ADD CONSTRAINT `fk_lu_equipe` FOREIGN KEY (`equipe_id`) REFERENCES `LigueEquipe` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_lu_ligue` FOREIGN KEY (`ligue_id`) REFERENCES `Ligue` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_lu_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `MatchEquipe`
--
ALTER TABLE `MatchEquipe`
  ADD CONSTRAINT `fk_meq_equipe` FOREIGN KEY (`equipe_id`) REFERENCES `EquipeEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_meq_match` FOREIGN KEY (`match_esport_id`) REFERENCES `MatchEsport` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `MatchEquipeConvocation`
--
ALTER TABLE `MatchEquipeConvocation`
  ADD CONSTRAINT `fk_mec_equipe` FOREIGN KEY (`equipe_id`) REFERENCES `EquipeEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_mec_match` FOREIGN KEY (`match_esport_id`) REFERENCES `MatchEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_mec_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `MatchEsport`
--
ALTER TABLE `MatchEsport`
  ADD CONSTRAINT `fk_me_createur` FOREIGN KEY (`createur_id`) REFERENCES `Utilisateur` (`id`),
  ADD CONSTRAINT `fk_me_jeu` FOREIGN KEY (`jeu_id`) REFERENCES `JeuEsport` (`id`);

--
-- Contraintes pour la table `MatchSport`
--
ALTER TABLE `MatchSport`
  ADD CONSTRAINT `fk_match_createur` FOREIGN KEY (`createur_id`) REFERENCES `Utilisateur` (`id`),
  ADD CONSTRAINT `fk_match_ligue` FOREIGN KEY (`ligue_id`) REFERENCES `Ligue` (`id`),
  ADD CONSTRAINT `fk_match_sport` FOREIGN KEY (`sport_id`) REFERENCES `Sport` (`id`);

--
-- Contraintes pour la table `ParticipationMatch`
--
ALTER TABLE `ParticipationMatch`
  ADD CONSTRAINT `fk_pm_match` FOREIGN KEY (`match_id`) REFERENCES `MatchSport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_pm_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `ResultatMatch`
--
ALTER TABLE `ResultatMatch`
  ADD CONSTRAINT `fk_rm_gagnant` FOREIGN KEY (`gagnant_id`) REFERENCES `Utilisateur` (`id`),
  ADD CONSTRAINT `fk_rm_match` FOREIGN KEY (`match_id`) REFERENCES `MatchSport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rm_perdant` FOREIGN KEY (`perdant_id`) REFERENCES `Utilisateur` (`id`);

--
-- Contraintes pour la table `ResultatMatchEsport`
--
ALTER TABLE `ResultatMatchEsport`
  ADD CONSTRAINT `fk_rme_gagnant` FOREIGN KEY (`equipe_gagnante_id`) REFERENCES `EquipeEsport` (`id`),
  ADD CONSTRAINT `fk_rme_match` FOREIGN KEY (`match_esport_id`) REFERENCES `MatchEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rme_perdant` FOREIGN KEY (`equipe_perdante_id`) REFERENCES `EquipeEsport` (`id`);

--
-- Contraintes pour la table `UtilisateurJeu`
--
ALTER TABLE `UtilisateurJeu`
  ADD CONSTRAINT `fk_uj_jeu` FOREIGN KEY (`jeu_id`) REFERENCES `JeuEsport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_uj_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `UtilisateurSport`
--
ALTER TABLE `UtilisateurSport`
  ADD CONSTRAINT `fk_us_sport` FOREIGN KEY (`sport_id`) REFERENCES `Sport` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_us_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `Utilisateur` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
