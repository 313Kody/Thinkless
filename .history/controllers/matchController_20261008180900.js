const { getPool } = require("../config/db");
const crypto = require("crypto");
let matchStatsSchemaReady = null;
let liveMatchSchemaReady = null;

async function ensureMatchStatsSchema(db) {
  if (!matchStatsSchemaReady) {
    matchStatsSchemaReady = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS StatsJoueurMatch (
          match_id INT UNSIGNED NOT NULL,
          utilisateur_id INT UNSIGNED NOT NULL,
          equipe ENUM('A','B') NOT NULL,
          buts INT UNSIGNED NOT NULL DEFAULT 0,
          passes_decisives INT UNSIGNED NOT NULL DEFAULT 0,
          PRIMARY KEY (match_id, utilisateur_id),
          CONSTRAINT fk_sjm_match FOREIGN KEY (match_id)
            REFERENCES MatchSport(id) ON DELETE CASCADE,
          CONSTRAINT fk_sjm_user FOREIGN KEY (utilisateur_id)
            REFERENCES Utilisateur(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);

      const [columns] = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StatsJoueurMatch'
           AND COLUMN_NAME = 'equipe'`,
      );
      if (!columns.length) {
        await db.execute(
          "ALTER TABLE StatsJoueurMatch ADD COLUMN equipe ENUM('A','B') NULL AFTER utilisateur_id",
        );
      }

      const [indexes] = await db.execute(
        `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StatsJoueurMatch'
           AND NON_UNIQUE = 0
         GROUP BY INDEX_NAME`,
      );
      const hasMatchPlayerKey = indexes.some(
        (index) => index.indexed_columns === "match_id,utilisateur_id",
      );
      if (!hasMatchPlayerKey) {
        const [duplicates] = await db.execute(
          `SELECT 1 FROM StatsJoueurMatch
           GROUP BY match_id, utilisateur_id
           HAVING COUNT(*) > 1 LIMIT 1`,
        );
        if (duplicates.length) {
          throw new Error(
            "StatsJoueurMatch contient des doublons match/joueur ; migration unique impossible",
          );
        }
        await db.execute(
          "ALTER TABLE StatsJoueurMatch ADD UNIQUE KEY uq_sjm_match_user (match_id, utilisateur_id)",
        );
      }
    })();
  }
  await matchStatsSchemaReady;
}

async function ensureLiveMatchSchema(db) {
  if (!liveMatchSchemaReady) {
    liveMatchSchemaReady = (async () => {
      const [columns] = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MatchSport'
           AND COLUMN_NAME IN ('chrono_secondes', 'chrono_demarre_le', 'chrono_duree_secondes', 'chrono_phase', 'chrono_temps_additionnel_secondes', 'chrono_prolongation_duree_secondes', 'tirs_au_but_a', 'tirs_au_but_b')`,
      );
      const names = new Set(columns.map((column) => column.COLUMN_NAME));
      if (!names.has("chrono_secondes")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_secondes INT UNSIGNED NOT NULL DEFAULT 0",
        );
      }
      if (!names.has("chrono_demarre_le")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_demarre_le DATETIME NULL",
        );
      }
      if (!names.has("chrono_duree_secondes")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_duree_secondes INT UNSIGNED NOT NULL DEFAULT 480",
        );
      }
      if (!names.has("chrono_phase")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_phase VARCHAR(24) NOT NULL DEFAULT 'temps_reglementaire'",
        );
      }
      if (!names.has("chrono_temps_additionnel_secondes")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_temps_additionnel_secondes INT UNSIGNED NOT NULL DEFAULT 0",
        );
      }
      if (!names.has("chrono_prolongation_duree_secondes")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN chrono_prolongation_duree_secondes INT UNSIGNED NOT NULL DEFAULT 300",
        );
      }
      if (!names.has("tirs_au_but_a")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN tirs_au_but_a TINYINT UNSIGNED NULL DEFAULT NULL",
        );
      }
      if (!names.has("tirs_au_but_b")) {
        await db.execute(
          "ALTER TABLE MatchSport ADD COLUMN tirs_au_but_b TINYINT UNSIGNED NULL DEFAULT NULL",
        );
      }
    })();
  }
  await liveMatchSchemaReady;
}

async function canManageLiveMatch(connection, match, userId) {
  if (match.createur_id === userId || match.ligue_createur_id === userId) {
    return true;
  }
  if (!match.ligue_id) return false;
  const [rows] = await connection.execute(
    `SELECT 1 FROM LigueUtilisateur
     WHERE ligue_id = ? AND utilisateur_id = ? AND est_staff = 1 LIMIT 1`,
    [match.ligue_id, userId],
  );
  return rows.length > 0;
}

function getLivePhaseDuration(match) {
  if (match.chrono_phase === "prolongation") {
    return Number(match.chrono_prolongation_duree_secondes || 300);
  }
  return (
    Number(match.chrono_duree_secondes || 480) +
    Number(match.chrono_temps_additionnel_secondes || 0)
  );
}

function hasPendingBracketTeam(match) {
  return [match.nom_equipe_a, match.nom_equipe_b].some((name) =>
    /^Vainqueur (du quart|de la demi-finale) \d+$/.test(name || ""),
  );
}

function shuffleTeams(teams) {
  const shuffled = [...teams];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]];
  }
  return shuffled;
}

async function ensureLeagueTeamPoules(db, ligueId, nbPoules) {
  const [teams] = await db.execute(
    `SELECT id, nom, poule
     FROM LigueEquipe
     WHERE ligue_id = ?
     ORDER BY id ASC`,
    [ligueId],
  );

  if (teams.length < 2) return teams;
  const pouleCount = Number(nbPoules);
  if (!Number.isInteger(pouleCount) || pouleCount < 1 || pouleCount > 26) {
    throw new Error("Nombre de poules invalide");
  }

  const needsDraw = teams.some((team) => !team.poule);
  if (!needsDraw) return teams;

  const shuffled = shuffleTeams(teams);
  const baseSize = Math.floor(shuffled.length / pouleCount);
  const remainder = shuffled.length % pouleCount;
  const assignedTeams = [];
  for (const [index, team] of shuffled.entries()) {
    let currentStart = 0;
    let assignedPoule = "A";
    for (let pouleIndex = 0; pouleIndex < pouleCount; pouleIndex += 1) {
      const currentSize = baseSize + (pouleIndex < remainder ? 1 : 0);
      if (index < currentStart + currentSize) {
        assignedPoule = String.fromCharCode(65 + pouleIndex);
        break;
      }
      currentStart += currentSize;
    }
    await db.execute(
      "UPDATE LigueEquipe SET poule = ? WHERE id = ? AND ligue_id = ?",
      [assignedPoule, team.id, ligueId],
    );
    assignedTeams.push({ ...team, poule: assignedPoule });
  }

  return assignedTeams;
}

async function getMatchAuthorizationContext(connection, matchId) {
  const [rows] = await connection.execute(
    `SELECT ms.*, l.createur_id AS ligue_createur_id,
            l.type_evenement AS ligue_type_evenement,
            l.lieu AS ligue_lieu,
            l.date_debut AS ligue_date_debut,
            l.nb_terrains AS ligue_nb_terrains
     FROM MatchSport ms
     LEFT JOIN Ligue l ON l.id = ms.ligue_id
     WHERE ms.id = ?`,
    [matchId],
  );

  return rows[0] || null;
}

function canManageMatch(match, userId) {
  if (!match) {
    return false;
  }

  return match.createur_id === userId || match.ligue_createur_id === userId;
}

async function isLeagueMember(connection, ligueId, userId) {
  if (!ligueId) {
    return false;
  }

  const [rows] = await connection.execute(
    `SELECT 1
     FROM LigueUtilisateur
     WHERE ligue_id = ? AND utilisateur_id = ?
     LIMIT 1`,
    [ligueId, userId],
  );

  return rows.length > 0;
}

async function canJoinMatch(connection, match, userId) {
  if (!match || match.statut !== "ouvert") {
    return false;
  }

  if (canManageMatch(match, userId)) {
    return true;
  }

  if (match.prive) {
    return false;
  }

  if (!match.ligue_id) {
    return true;
  }

  return isLeagueMember(connection, match.ligue_id, userId);
}

function pickParticipantByTeam(participants, team) {
  return (
    participants.find((participant) => participant.equipe === team) || null
  );
}

async function applyLeagueStandingUpdate(
  connection,
  match,
  winnerTeam,
  loserTeam,
  scoreA,
  scoreB,
  isDraw,
) {
  if (!match.ligue_id) {
    return;
  }

  const [ligueEquipes] = await connection.execute(
    `SELECT id, nom
     FROM LigueEquipe
     WHERE ligue_id = ? AND nom IN (?, ?)`,
    [match.ligue_id, match.nom_equipe_a, match.nom_equipe_b],
  );

  const equipeA = ligueEquipes.find((item) => item.nom === match.nom_equipe_a);
  const equipeB = ligueEquipes.find((item) => item.nom === match.nom_equipe_b);

  if (equipeA && equipeB) {
    const [leagueRows] = await connection.execute(
      `SELECT pts_victoire, pts_nul, pts_defaite
       FROM Ligue WHERE id = ? LIMIT 1`,
      [match.ligue_id],
    );
    const rules = leagueRows[0] || {
      pts_victoire: 3,
      pts_nul: 1,
      pts_defaite: 0,
    };
    const pointsA = isDraw
      ? rules.pts_nul
      : scoreA > scoreB
        ? rules.pts_victoire
        : rules.pts_defaite;
    const pointsB = isDraw
      ? rules.pts_nul
      : scoreB > scoreA
        ? rules.pts_victoire
        : rules.pts_defaite;

    await connection.execute(
      `UPDATE LigueUtilisateur
       SET points = points + ?,
           victoires = victoires + ?,
           defaites = defaites + ?
       WHERE ligue_id = ? AND equipe_id = ?`,
      [
        pointsA,
        scoreA > scoreB ? 1 : 0,
        scoreA < scoreB ? 1 : 0,
        match.ligue_id,
        equipeA.id,
      ],
    );

    await connection.execute(
      `UPDATE LigueUtilisateur
       SET points = points + ?,
           victoires = victoires + ?,
           defaites = defaites + ?
       WHERE ligue_id = ? AND equipe_id = ?`,
      [
        pointsB,
        scoreB > scoreA ? 1 : 0,
        scoreB < scoreA ? 1 : 0,
        match.ligue_id,
        equipeB.id,
      ],
    );

    return;
  }

  const [participants] = await connection.execute(
    `SELECT utilisateur_id, equipe, statut, rejoint_le
     FROM ParticipationMatch
     WHERE match_id = ? AND equipe IN ('A', 'B')
     ORDER BY CASE WHEN statut = 'valide' THEN 0 ELSE 1 END, rejoint_le ASC`,
    [match.id],
  );

  if (isDraw) return;

  const winnerParticipant = pickParticipantByTeam(participants, winnerTeam);
  const loserParticipant = pickParticipantByTeam(participants, loserTeam);

  if (!winnerParticipant || !loserParticipant) {
    throw new Error(
      "Impossible de déterminer les joueurs du résultat de ligue",
    );
  }

  await connection.execute(
    `UPDATE LigueUtilisateur
     SET points = points + 3,
         victoires = victoires + 1
     WHERE ligue_id = ? AND utilisateur_id = ?`,
    [match.ligue_id, winnerParticipant.utilisateur_id],
  );

  await connection.execute(
    `UPDATE LigueUtilisateur
     SET defaites = defaites + 1
     WHERE ligue_id = ? AND utilisateur_id = ?`,
    [match.ligue_id, loserParticipant.utilisateur_id],
  );
}

async function advanceKnockoutPhase(connection, match) {
  if (!match.ligue_id || !["quart", "demi"].includes(match.phase)) {
    return null;
  }

  const [sourceMatches] = await connection.execute(
    `SELECT id, nom_equipe_a, nom_equipe_b, vainqueur_equipe, statut
     FROM MatchSport
     WHERE ligue_id = ? AND phase = ?
     ORDER BY id ASC`,
    [match.ligue_id, match.phase],
  );
  const expectedSources = match.phase === "quart" ? 4 : 2;
  if (sourceMatches.length !== expectedSources) return null;

  const nextPhase = match.phase === "quart" ? "demi" : "finale";
  const [nextMatches] = await connection.execute(
    `SELECT id, nom_equipe_a, nom_equipe_b, statut
     FROM MatchSport
     WHERE ligue_id = ? AND phase = ?
     ORDER BY id ASC`,
    [match.ligue_id, nextPhase],
  );
  const winners = sourceMatches.map((sourceMatch) =>
    sourceMatch.statut === "termine" && sourceMatch.vainqueur_equipe === "A"
      ? sourceMatch.nom_equipe_a
      : sourceMatch.statut === "termine" &&
          sourceMatch.vainqueur_equipe === "B"
        ? sourceMatch.nom_equipe_b
        : null,
  );
  const pairs =
    nextPhase === "demi"
      ? [
          [winners[0], winners[1]],
          [winners[2], winners[3]],
        ]
      : [[winners[0], winners[1]]];
  if (!winners.some(Boolean)) return null;

  const pendingTeamLabel = (index) =>
    match.phase === "quart"
      ? `Vainqueur du quart ${index + 1}`
      : `Vainqueur de la demi-finale ${index + 1}`;
  const isPendingTeam = (name) =>
    /^Vainqueur (du quart|de la demi-finale) \d+$/.test(name || "");

  for (const [index, [winnerA, winnerB]] of pairs.entries()) {
    const sourceIndexA = index * 2;
    const sourceIndexB = sourceIndexA + 1;
    const teamA = winnerA || pendingTeamLabel(sourceIndexA);
    const teamB = winnerB || pendingTeamLabel(sourceIndexB);
    const existing = nextMatches[index];

    if (!existing) {
      await connection.execute(
        `INSERT INTO MatchSport (
          sport_id, createur_id, ligue_id, titre, date_heure, localisation,
          nb_joueurs_max, nb_equipe_a, nb_equipe_b, nom_equipe_a, nom_equipe_b,
          statut, prive, phase, statut_match
        ) VALUES (?, ?, ?, ?, NOW(), ?, 2, 1, 1, ?, ?, 'ouvert', 0, ?, 'programme')`,
        [
          match.sport_id,
          match.createur_id,
          match.ligue_id,
          `${teamA} vs ${teamB}`,
          match.localisation || null,
          teamA,
          teamB,
          nextPhase,
        ],
      );
      continue;
    }

    if (existing.statut === "termine") continue;
    const updatedTeamA = winnerA && isPendingTeam(existing.nom_equipe_a)
      ? winnerA
      : existing.nom_equipe_a;
    const updatedTeamB = winnerB && isPendingTeam(existing.nom_equipe_b)
      ? winnerB
      : existing.nom_equipe_b;
    if (
      updatedTeamA !== existing.nom_equipe_a ||
      updatedTeamB !== existing.nom_equipe_b
    ) {
      await connection.execute(
        `UPDATE MatchSport
         SET nom_equipe_a = ?, nom_equipe_b = ?, titre = ?
         WHERE id = ? AND statut <> 'termine'`,
        [
          updatedTeamA,
          updatedTeamB,
          `${updatedTeamA} vs ${updatedTeamB}`,
          existing.id,
        ],
      );
    }
  }

  return nextPhase;
}

// GET /api/matchs
exports.getMatchs = async (req, res) => {
  try {
    const db = getPool();
    const { localisation } = req.query;

    let sql = `SELECT ms.*, s.nom AS sport,
                  CASE WHEN ms.prive = 1
                    THEN COALESCE(NULLIF(CONCAT_WS(' ', u.prenom, u.nom), ''), u.pseudo)
                    ELSE u.pseudo END AS createur
               FROM MatchSport ms
               JOIN Sport s       ON s.id = ms.sport_id
               JOIN Utilisateur u ON u.id = ms.createur_id
               WHERE ms.statut = 'ouvert'
                 AND ms.ligue_id IS NULL
                 AND (
                   ms.prive = 0
                   OR ms.createur_id = ?
                   OR EXISTS (
                     SELECT 1
                     FROM ParticipationMatch pm
                     WHERE pm.match_id = ms.id AND pm.utilisateur_id = ?
                   )
                 )`;
    const params = [req.user.id, req.user.id];

    if (localisation) {
      sql += " AND ms.localisation LIKE ?";
      params.push(`%${localisation}%`);
    }

    sql += " ORDER BY ms.date_heure ASC";
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
// POST /api/matchs
exports.createMatch = async (req, res) => {
  try {
    const db = getPool();
    let {
      sport_id,
      ligue_id,
      titre,
      date_heure,
      localisation,
      nb_equipe_a,
      nb_equipe_b,
      nb_remplacants,
      nb_joueurs_max,
      nom_equipe_a,
      nom_equipe_b,
      en_equipe,
      prive,
      heure_match,
      terrain_id,
      terrain_nom,
      chrono_duree_secondes,
    } = req.body;

    if (!sport_id || (!date_heure && !heure_match)) {
      return res.status(400).json({ message: "sport_id et date_heure requis" });
    }

    let finalLigueId = null;
    if (ligue_id !== undefined && ligue_id !== null && ligue_id !== "") {
      finalLigueId = Number(ligue_id);
      if (!Number.isInteger(finalLigueId) || finalLigueId <= 0) {
        return res.status(400).json({ message: "ligue_id invalide" });
      }

      const [ligueRows] = await db.execute(
        `SELECT l.createur_id, l.type_evenement, l.lieu, l.date_debut,
          l.nb_terrains, l.a_poules, l.nb_poules, lu.est_staff
         FROM Ligue l
         LEFT JOIN LigueUtilisateur lu
           ON lu.ligue_id = l.id AND lu.utilisateur_id = ?
         WHERE l.id = ?
         LIMIT 1`,
        [req.user.id, finalLigueId],
      );

      if (ligueRows.length === 0) {
        return res.status(404).json({ message: "Ligue introuvable" });
      }

      const isLeagueCreator =
        Number(ligueRows[0].createur_id) === Number(req.user.id);
      const isLeagueStaff = Number(ligueRows[0].est_staff) === 1;
      if (!isLeagueCreator && !isLeagueStaff) {
        return res.status(403).json({
          message: "Seul le créateur ou le STAFF peut ajouter un match",
        });
      }

      const [membershipRows] = await db.execute(
        `SELECT 1
         FROM LigueUtilisateur
         WHERE ligue_id = ? AND utilisateur_id = ?
         LIMIT 1`,
        [finalLigueId, req.user.id],
      );

      if (membershipRows.length === 0) {
        return res
          .status(403)
          .json({ message: "Tu dois etre membre de la ligue" });
      }

      const league = ligueRows[0];
      let matchPoule = null;
      if (league.a_poules && nom_equipe_a && nom_equipe_b) {
        const teamRows = await ensureLeagueTeamPoules(
          db,
          finalLigueId,
          league.nb_poules,
        );
        const selectedTeams = teamRows.filter(
          (team) => team.nom === nom_equipe_a || team.nom === nom_equipe_b,
        );
        if (selectedTeams.length !== 2) {
          return res.status(400).json({
            message: "Les deux équipes doivent appartenir à cette ligue",
          });
        }
        if (selectedTeams[0].poule !== selectedTeams[1].poule) {
          return res.status(400).json({
            message: `Match impossible : ${selectedTeams[0].nom} est en poule ${selectedTeams[0].poule} et ${selectedTeams[1].nom} en poule ${selectedTeams[1].poule}`,
          });
        }
        matchPoule = selectedTeams[0].poule;
      }
      if (league.type_evenement === "unique") {
        if (!league.date_debut || !league.lieu || !heure_match) {
          return res.status(400).json({
            message: "L'heure du match est obligatoire pour cette ligue",
          });
        }
        const datePart = new Date(league.date_debut).toISOString().slice(0, 10);
        date_heure = `${datePart}T${heure_match}`;
        localisation = league.lieu;
        const selectedTerrain = Number(terrain_id) || 1;
        if (
          selectedTerrain < 1 ||
          selectedTerrain > Number(league.nb_terrains || 1)
        ) {
          return res.status(400).json({ message: "Terrain invalide" });
        }
      }
    }

    const [sportRows] = await db.execute("SELECT nom FROM Sport WHERE id = ?", [
      sport_id,
    ]);
    if (sportRows.length === 0) {
      return res.status(400).json({ message: "Sport invalide" });
    }

    const normalizeSportName = (name) =>
      (name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const soloSports = new Set(["tennis", "badminton", "padel"]);
    const isSoloSport = soloSports.has(normalizeSportName(sportRows[0].nom));
    const modeEquipe = isSoloSport ? Boolean(en_equipe) : true;

    const finalNbA = modeEquipe ? Number(nb_equipe_a) || 1 : 1;
    const finalNbB = modeEquipe ? Number(nb_equipe_b) || 1 : 1;
    const finalNbRem = modeEquipe ? Number(nb_remplacants) || 0 : 0;
    const finalNomA = modeEquipe ? nom_equipe_a || "Équipe A" : "Joueur 1";
    const finalNomB = modeEquipe ? nom_equipe_b || "Équipe B" : "Joueur 2";
    const finalNbJoueursMax =
      Number(nb_joueurs_max) || finalNbA + finalNbB + finalNbRem;

    // Génération du code d'accès si match privé
    let code_acces = null;
    if (prive) {
      code_acces = Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    const [result] = await db.execute(
      `INSERT INTO MatchSport (sport_id, createur_id, ligue_id, titre, date_heure, localisation, nb_joueurs_max, nb_equipe_a, nb_equipe_b, nb_remplacants, nom_equipe_a, nom_equipe_b, prive, code_acces, poule, terrain_id, terrain_nom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sport_id,
        req.user.id,
        finalLigueId,
        titre || null,
        date_heure,
        localisation || null,
        finalNbJoueursMax,
        finalNbA,
        finalNbB,
        finalNbRem,
        finalNomA,
        finalNomB,
        prive ? 1 : 0,
        code_acces,
        matchPoule,
        terrain_id ? Number(terrain_id) : null,
        terrain_nom || null,
      ],
    );

    await db.execute(
      "INSERT INTO ParticipationMatch (match_id, utilisateur_id) VALUES (?, ?)",
      [result.insertId, req.user.id],
    );

    res.status(201).json({
      message: "Match créé",
      id: result.insertId,
      code_acces: code_acces, // On renvoie le code au créateur
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/rejoindre
exports.rejoindreMatch = async (req, res) => {
  try {
    const db = getPool();
    const matchId = req.params.id;

    const match = await getMatchAuthorizationContext(db, matchId);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (match.statut !== "ouvert")
      return res.status(400).json({ message: "Match non disponible" });

    if (match.ligue_id) {
      const member = await isLeagueMember(db, match.ligue_id, req.user.id);
      if (!member) {
        return res
          .status(403)
          .json({ message: "Tu dois avoir rejoint la ligue pour participer" });
      }
    }

    if (match.prive && !canManageMatch(match, req.user.id)) {
      return res
        .status(403)
        .json({ message: "Utilise le code d'acces pour rejoindre ce match" });
    }

    await db.execute(
      "INSERT INTO ParticipationMatch (match_id, utilisateur_id) VALUES (?, ?)",
      [matchId, req.user.id],
    );

    res.json({ message: "Rejoint le match !" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Déjà inscrit" });
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.rejoindreAvecCode = async (req, res) => {
  try {
    const db = getPool();
    const { code_acces } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM MatchSport WHERE code_acces = ? AND statut = 'ouvert'",
      [code_acces.toUpperCase()],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Code invalide ou match introuvable" });
    }

    const match = rows[0];

    if (match.ligue_id) {
      const member = await isLeagueMember(db, match.ligue_id, req.user.id);
      if (!member) {
        return res
          .status(403)
          .json({ message: "Tu dois avoir rejoint la ligue pour participer" });
      }
    }

    await db.execute(
      "INSERT INTO ParticipationMatch (match_id, utilisateur_id) VALUES (?, ?)",
      [match.id, req.user.id],
    );

    res.json({ message: "Match rejoint !", match_id: match.id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Déjà inscrit" });
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/matchs/:id
exports.getMatch = async (req, res) => {
  try {
    const db = getPool();
    await ensureLiveMatchSchema(db);
    await ensureMatchStatsSchema(db);
    const [rows] = await db.execute(
      `SELECT ms.*,
              CASE WHEN ms.statut_match = 'en_cours' AND ms.chrono_demarre_le IS NOT NULL
                THEN ms.chrono_secondes + GREATEST(0, TIMESTAMPDIFF(SECOND, ms.chrono_demarre_le, NOW()))
                ELSE ms.chrono_secondes END AS chrono_secondes_live,
              s.nom AS sport,
              CASE WHEN ms.prive = 1 THEN CONCAT_WS(' ', u.prenom, u.nom) ELSE u.pseudo END AS createur,
              l.createur_id AS ligue_createur_id,
              l.createur_joueur AS ligue_createur_joueur,
              l.slots_par_equipe AS ligue_slots_par_equipe,
              ea.logo_url AS logo_equipe_a,
              eb.logo_url AS logo_equipe_b
       FROM MatchSport ms
       JOIN Sport s       ON s.id = ms.sport_id
       JOIN Utilisateur u ON u.id = ms.createur_id
       LEFT JOIN Ligue l  ON l.id = ms.ligue_id
      LEFT JOIN LigueEquipe ea ON ea.ligue_id = ms.ligue_id AND ea.nom = ms.nom_equipe_a
      LEFT JOIN LigueEquipe eb ON eb.ligue_id = ms.ligue_id AND eb.nom = ms.nom_equipe_b
       WHERE ms.id = ?`,
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Match introuvable" });

    const [participants] = await db.execute(
      `SELECT u.id, u.pseudo, u.nom, u.prenom, u.avatar_url, pm.equipe, pm.statut,
          CASE WHEN ms.prive = 1
            THEN COALESCE(NULLIF(CONCAT_WS(' ', u.prenom, u.nom), ''), u.pseudo)
            ELSE u.pseudo END AS affichage_nom,
          GROUP_CONCAT(DISTINCT e.nom ORDER BY e.nom SEPARATOR ', ') AS equipe_affiliee_nom,
          COALESCE(MAX(sjm.buts), 0) AS buts,
          COALESCE(MAX(sjm.passes_decisives), 0) AS passes_decisives
       FROM ParticipationMatch pm
       JOIN Utilisateur u ON u.id = pm.utilisateur_id
       JOIN MatchSport ms ON ms.id = pm.match_id
       LEFT JOIN EquipeMembre em ON em.utilisateur_id = u.id
       LEFT JOIN EquipeEsport e ON e.id = em.equipe_id
       LEFT JOIN StatsJoueurMatch sjm
         ON sjm.match_id = pm.match_id AND sjm.utilisateur_id = pm.utilisateur_id
       WHERE pm.match_id = ?
       GROUP BY u.id, u.pseudo, u.nom, u.prenom, u.avatar_url, pm.equipe, pm.statut, ms.prive`,
      [req.params.id],
    );

    const match = rows[0];
    const participantIds = new Set(
      participants.map((participant) => Number(participant.id)),
    );
    if (match.ligue_id) {
      const [leaguePlayers] = await db.execute(
        `SELECT u.id, u.pseudo, u.nom, u.prenom, u.avatar_url,
                CASE WHEN le.nom = ? THEN 'A' WHEN le.nom = ? THEN 'B' END AS equipe,
                'valide' AS statut, le.nom AS equipe_affiliee_nom,
                COALESCE(MAX(sjm.buts), 0) AS buts,
                COALESCE(MAX(sjm.passes_decisives), 0) AS passes_decisives
         FROM LigueUtilisateur lu
         JOIN Utilisateur u ON u.id = lu.utilisateur_id
         JOIN LigueEquipe le ON le.id = lu.equipe_id
         LEFT JOIN StatsJoueurMatch sjm
           ON sjm.match_id = ? AND sjm.utilisateur_id = u.id
         WHERE lu.ligue_id = ? AND lu.est_staff = 0
           AND le.nom IN (?, ?)
         GROUP BY u.id, u.pseudo, u.nom, u.prenom, u.avatar_url, le.nom`,
        [
          match.nom_equipe_a,
          match.nom_equipe_b,
          req.params.id,
          match.ligue_id,
          match.nom_equipe_a,
          match.nom_equipe_b,
        ],
      );
      for (const player of leaguePlayers) {
        if (!participantIds.has(Number(player.id))) {
          participants.push({
            ...player,
            affichage_nom: player.pseudo,
            equipe_affiliee_nom: player.equipe_affiliee_nom,
          });
        }
      }
    }
    if (match.ligue_id && Number(match.ligue_slots_par_equipe) > 0) {
      match.nb_equipe_a = Number(match.ligue_slots_par_equipe);
      match.nb_equipe_b = Number(match.ligue_slots_par_equipe);
      match.nb_joueurs_max = match.nb_equipe_a + match.nb_equipe_b;
    }
    let equipeAffiliee = null;
    if (!match.ligue_id) {
      const [teamRows] = await db.execute(
        `SELECT e.id, e.nom, e.logo_url, em.role
         FROM EquipeMembre em
         JOIN EquipeEsport e ON e.id = em.equipe_id
         WHERE em.utilisateur_id = ?
         LIMIT 1`,
        [req.user.id],
      );
      equipeAffiliee = teamRows[0] || null;
    }

    const canJoin = await canJoinMatch(db, match, req.user.id);
    const canManage = await canManageLiveMatch(db, match, req.user.id);
    res.json({
      ...match,
      is_elimination: ["quart", "demi", "finale", "classement"].includes(
        match.phase,
      ),
      equipes_determinees: !hasPendingBracketTeam(match),
      can_manage: canManage,
      can_join: canJoin,
      equipe_affiliee: equipeAffiliee,
      participants,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// PUT /api/matchs/:id
exports.updateMatch = async (req, res) => {
  try {
    const db = getPool();
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    let canManage = canManageMatch(match, req.user.id);
    if (!canManage && match.ligue_id) {
      const [staffRows] = await db.execute(
        `SELECT est_staff
         FROM LigueUtilisateur
         WHERE ligue_id = ? AND utilisateur_id = ? AND est_staff = 1
         LIMIT 1`,
        [match.ligue_id, req.user.id],
      );
      canManage = staffRows.length > 0;
    }
    if (!canManage) return res.status(403).json({ message: "Interdit" });

    const {
      titre,
      date_heure,
      localisation,
      heure_match,
      terrain_id,
      terrain_nom,
      chrono_duree_secondes,
      nom_equipe_a,
      nom_equipe_b,
      nb_equipe_a,
      nb_equipe_b,
      nb_remplacants,
    } = req.body;

    let finalDate = date_heure;
    let finalLocalisation = localisation;
    if (match.ligue_type_evenement === "unique") {
      const hour =
        heure_match || new Date(date_heure).toTimeString().slice(0, 5);
      if (!match.ligue_date_debut || !hour || hour === "Invalid Date") {
        return res.status(400).json({ message: "Heure de match invalide" });
      }
      const datePart = new Date(match.ligue_date_debut)
        .toISOString()
        .slice(0, 10);
      finalDate = `${datePart}T${hour}`;
      finalLocalisation = match.ligue_lieu;
      if (
        terrain_id &&
        Number(terrain_id) > Number(match.ligue_nb_terrains || 1)
      ) {
        return res.status(400).json({ message: "Terrain invalide" });
      }
    }

    const chronoDuration =
      chrono_duree_secondes === undefined
        ? Number(match.chrono_duree_secondes || 480)
        : Number(chrono_duree_secondes);
    if (
      !Number.isInteger(chronoDuration) ||
      chronoDuration < 60 ||
      chronoDuration > 7200
    ) {
      return res.status(400).json({ message: "Durée du chrono invalide" });
    }
    const finalNbEquipeA =
      nb_equipe_a === undefined
        ? Number(match.nb_equipe_a || 1)
        : Number(nb_equipe_a);
    const finalNbEquipeB =
      nb_equipe_b === undefined
        ? Number(match.nb_equipe_b || 1)
        : Number(nb_equipe_b);
    const finalNbRemplacants =
      nb_remplacants === undefined
        ? Number(match.nb_remplacants || 0)
        : Number(nb_remplacants);

    await db.execute(
      `UPDATE MatchSport SET titre=?, date_heure=?, localisation=?, terrain_id=?, terrain_nom=?, chrono_duree_secondes=?, nom_equipe_a=?, nom_equipe_b=?, nb_equipe_a=?, nb_equipe_b=?, nb_remplacants=?, nb_joueurs_max=? WHERE id=?`,
      [
        titre,
        finalDate,
        finalLocalisation,
        terrain_id ? Number(terrain_id) : match.terrain_id,
        terrain_nom || match.terrain_nom || null,
        chronoDuration,
        nom_equipe_a,
        nom_equipe_b,
        finalNbEquipeA,
        finalNbEquipeB,
        finalNbRemplacants,
        finalNbEquipeA + finalNbEquipeB + finalNbRemplacants,
        req.params.id,
      ],
    );

    res.json({ message: "Match mis à jour" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// DELETE /api/matchs/:id
exports.deleteMatch = async (req, res) => {
  try {
    const db = getPool();
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!canManageMatch(match, req.user.id))
      return res.status(403).json({ message: "Interdit" });

    await db.execute("UPDATE MatchSport SET statut='annule' WHERE id=?", [
      req.params.id,
    ]);
    res.json({ message: "Match annulé" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/equipe – joueur choisit son équipe
exports.choisirEquipe = async (req, res) => {
  try {
    const db = getPool();
    const { equipe } = req.body;

    if (!["A", "B"].includes(equipe)) {
      return res.status(400).json({ message: "Equipe invalide" });
    }

    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });

    if (match.statut !== "ouvert") {
      return res.status(400).json({ message: "Match non disponible" });
    }

    const canJoin = await canJoinMatch(db, match, req.user.id);
    if (!canJoin) {
      return res.status(403).json({ message: "Interdit" });
    }

    const [participantRows] = await db.execute(
      `SELECT 1
       FROM ParticipationMatch
       WHERE match_id = ? AND utilisateur_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id],
    );

    const targetStatus = canManageMatch(match, req.user.id)
      ? "valide"
      : "en_attente";

    if (participantRows.length === 0) {
      await db.execute(
        `INSERT INTO ParticipationMatch (match_id, utilisateur_id, equipe, statut)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, req.user.id, equipe, targetStatus],
      );
    } else {
      await db.execute(
        `UPDATE ParticipationMatch
         SET equipe = ?, statut = ?
         WHERE match_id = ? AND utilisateur_id = ?`,
        [equipe, targetStatus, req.params.id, req.user.id],
      );
    }

    const sideLabel = equipe === "A" ? match.nom_equipe_a : match.nom_equipe_b;
    const message = canManageMatch(match, req.user.id)
      ? `Placement direct dans ${sideLabel}`
      : `Demande envoyee pour ${sideLabel}`;

    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/valider – créateur valide un joueur dans une équipe
exports.validerJoueur = async (req, res) => {
  try {
    const db = getPool();
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!canManageMatch(match, req.user.id))
      return res.status(403).json({ message: "Interdit" });

    const { utilisateur_id, equipe } = req.body;
    await db.execute(
      `UPDATE ParticipationMatch SET equipe=?, statut='valide' WHERE match_id=? AND utilisateur_id=?`,
      [equipe, req.params.id, utilisateur_id],
    );
    res.json({ message: "Joueur validé !" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/retirer-equipe – créateur retire quelqu'un d'une équipe sans le supprimer
exports.retirerEquipe = async (req, res) => {
  try {
    const db = getPool();
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!canManageMatch(match, req.user.id))
      return res.status(403).json({ message: "Interdit" });

    const { utilisateur_id } = req.body;
    await db.execute(
      `UPDATE ParticipationMatch SET equipe=NULL, statut='en_attente' WHERE match_id=? AND utilisateur_id=?`,
      [req.params.id, utilisateur_id],
    );
    res.json({ message: "Joueur retiré de l'équipe" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/retirer – créateur retire un joueur complètement
exports.retirerJoueur = async (req, res) => {
  try {
    const db = getPool();
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!canManageMatch(match, req.user.id))
      return res.status(403).json({ message: "Interdit" });

    const { utilisateur_id } = req.body;
    await db.execute(
      `DELETE FROM ParticipationMatch WHERE match_id=? AND utilisateur_id=?`,
      [req.params.id, utilisateur_id],
    );
    res.json({ message: "Joueur retiré du match" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/lancer
exports.lancerMatchLive = async (req, res) => {
  const db = getPool();
  try {
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Interdit" });
    }
    if (
      ["quart", "demi", "finale", "classement"].includes(match.phase) &&
      hasPendingBracketTeam(match)
    ) {
      return res.status(409).json({
        message: "Ce match attend encore la qualification de ses deux équipes",
      });
    }
    if (match.statut === "termine" || match.statut === "annule") {
      return res
        .status(409)
        .json({ message: "Ce match ne peut plus être lancé" });
    }
    if (match.statut_match === "en_cours") {
      return res.json({ message: "Match déjà en cours" });
    }
    await db.execute(
      `UPDATE MatchSport
       SET statut_match = 'en_cours', chrono_demarre_le = NOW()
       WHERE id = ?`,
      [req.params.id],
    );
    res.json({
      message: "Match lancé",
      statut_match: "en_cours",
      chrono_secondes: Number(match.chrono_secondes || 0),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/pause
exports.pauseMatchLive = async (req, res) => {
  const db = getPool();
  try {
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Interdit" });
    }
    const [update] = await db.execute(
      `UPDATE MatchSport
       SET statut_match = 'programme',
           chrono_secondes = chrono_secondes + GREATEST(0, TIMESTAMPDIFF(SECOND, chrono_demarre_le, NOW())),
           chrono_demarre_le = NULL
       WHERE id = ? AND statut_match = 'en_cours' AND chrono_demarre_le IS NOT NULL`,
      [req.params.id],
    );
    if (!update.affectedRows) {
      return res.status(409).json({ message: "Le match n'est pas en cours" });
    }
    const [rows] = await db.execute(
      "SELECT chrono_secondes FROM MatchSport WHERE id = ?",
      [req.params.id],
    );
    res.json({
      message: "Chronomètre en pause",
      statut_match: "programme",
      chrono_secondes: Number(rows[0].chrono_secondes || 0),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/temps-additionnel
exports.ajouterTempsAdditionnel = async (req, res) => {
  const db = getPool();
  try {
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Interdit" });
    }
    const minutes = Number(req.body.minutes);
    if (![1, 2].includes(minutes)) {
      return res.status(400).json({ message: "Choisis +1 ou +2 minutes" });
    }
    if (
      match.statut === "termine" ||
      match.statut === "annule" ||
      match.chrono_phase !== "temps_reglementaire"
    ) {
      return res.status(409).json({ message: "Le temps ne peut plus être ajouté à ce match" });
    }
    const [update] = await db.execute(
      `UPDATE MatchSport
       SET chrono_temps_additionnel_secondes = chrono_temps_additionnel_secondes + ?
       WHERE id = ? AND statut_match = 'en_cours' AND chrono_demarre_le IS NOT NULL
         AND chrono_phase = 'temps_reglementaire' AND statut NOT IN ('termine', 'annule')`,
      [minutes * 60, req.params.id],
    );
    if (!update.affectedRows) {
      return res.status(409).json({ message: "Le chrono doit être lancé pour ajouter du temps" });
    }
    const [rows] = await db.execute(
      "SELECT chrono_temps_additionnel_secondes FROM MatchSport WHERE id = ?",
      [req.params.id],
    );
    res.json({
      message: `+${minutes} minute${minutes > 1 ? "s" : ""} ajoutée${minutes > 1 ? "s" : ""}`,
      chrono_temps_additionnel_secondes: Number(rows[0].chrono_temps_additionnel_secondes),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/reset
exports.recommencerMatchLive = async (req, res) => {
  const db = getPool();
  try {
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Action interdite" });
    }
    await db.execute("DELETE FROM StatsJoueurMatch WHERE match_id = ?", [
      req.params.id,
    ]);
    await db.execute("DELETE FROM ResultatMatch WHERE match_id = ?", [
      req.params.id,
    ]);
    await db.execute(
      `UPDATE MatchSport
       SET statut = 'ouvert', statut_match = 'programme', chrono_secondes = 0, chrono_demarre_le = NULL,
           chrono_phase = 'temps_reglementaire', chrono_temps_additionnel_secondes = 0,
           chrono_prolongation_duree_secondes = 300,
           score_equipe_a = NULL, score_equipe_b = NULL, vainqueur_equipe = NULL
       WHERE id = ?`,
      [req.params.id],
    );
    res.json({ message: "Chronomètre recommencé", chrono_secondes: 0 });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/phase
exports.passerPhaseLive = async (req, res) => {
  const db = getPool();
  try {
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Interdit" });
    }
    if (!["quart", "demi", "finale", "classement"].includes(match.phase)) {
      return res
        .status(409)
        .json({ message: "Cette phase est réservée au bracket" });
    }
    if (
      Number(match.score_equipe_a || 0) !== Number(match.score_equipe_b || 0)
    ) {
      return res
        .status(409)
        .json({ message: "Le score doit être nul pour changer de phase" });
    }
    if (match.statut_match !== "programme" || match.chrono_demarre_le) {
      return res
        .status(409)
        .json({
          message: "Le chronomètre doit être arrêté avant de changer de phase",
        });
    }
    if (Number(match.chrono_secondes || 0) < getLivePhaseDuration(match)) {
      return res
        .status(409)
        .json({ message: "La durée de jeu de cette phase n'est pas terminée" });
    }
    const nextPhase = req.body.phase;
    const validNextPhases =
      match.chrono_phase === "temps_reglementaire" ? ["prolongation"] : [];
    if (!validNextPhases.includes(nextPhase)) {
      return res.status(409).json({ message: "Transition de match invalide" });
    }
    const overtimeDuration = Number(req.body.chrono_duree_secondes);
    if (
      nextPhase === "prolongation" &&
      (!Number.isInteger(overtimeDuration) ||
        overtimeDuration < 60 ||
        overtimeDuration > 7200)
    ) {
      return res
        .status(400)
        .json({ message: "Durée de prolongation invalide" });
    }
    await db.execute(
      `UPDATE MatchSport
       SET chrono_phase = ?, chrono_secondes = 0, chrono_demarre_le = NULL,
           statut_match = 'programme',
           chrono_prolongation_duree_secondes = CASE
             WHEN ? = 'prolongation' THEN ?
             ELSE chrono_prolongation_duree_secondes
           END
       WHERE id = ?`,
      [nextPhase, nextPhase, overtimeDuration || 300, req.params.id],
    );
    res.json({
      message: "Prolongation prête",
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/live/but
exports.enregistrerButLive = async (req, res) => {
  const db = getPool();
  try {
    await ensureMatchStatsSchema(db);
    await ensureLiveMatchSchema(db);
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!(await canManageLiveMatch(db, match, req.user.id))) {
      return res.status(403).json({ message: "Interdit" });
    }
    if (match.statut_match !== "en_cours" || !match.chrono_demarre_le) {
      return res
        .status(409)
        .json({
          message: "Le chronomètre doit être en cours pour enregistrer un but",
        });
    }
    const equipe = req.body.equipe;
    const buteurId = Number(req.body.buteur_id);
    const rawPasser = req.body.passeur_id;
    const passeurId =
      rawPasser === null || rawPasser === undefined || rawPasser === ""
        ? null
        : Number(rawPasser);
    if (
      !["A", "B"].includes(equipe) ||
      !Number.isInteger(buteurId) ||
      (passeurId !== null && !Number.isInteger(passeurId))
    ) {
      return res.status(400).json({ message: "Buteur et équipe requis" });
    }

    const [players] = match.ligue_id
      ? await db.execute(
          `SELECT lu.utilisateur_id,
                  CASE WHEN le.nom = ? THEN 'A' WHEN le.nom = ? THEN 'B' END AS equipe
           FROM LigueUtilisateur lu
           JOIN LigueEquipe le ON le.id = lu.equipe_id
           WHERE lu.ligue_id = ? AND lu.est_staff = 0
             AND le.nom IN (?, ?)
             AND lu.utilisateur_id IN (?, ?)
           UNION
           SELECT utilisateur_id, equipe
           FROM ParticipationMatch
           WHERE match_id = ? AND statut = 'valide' AND equipe IN ('A','B')
             AND utilisateur_id IN (?, ?)`,
          [
            match.nom_equipe_a,
            match.nom_equipe_b,
            match.ligue_id,
            match.nom_equipe_a,
            match.nom_equipe_b,
            buteurId,
            passeurId || 0,
            req.params.id,
            buteurId,
            passeurId || 0,
          ],
        )
      : await db.execute(
          `SELECT utilisateur_id, equipe FROM ParticipationMatch
           WHERE match_id = ? AND statut = 'valide' AND equipe IN ('A','B')
             AND utilisateur_id IN (?, ?)`,
          [req.params.id, buteurId, passeurId || 0],
        );
    const scorer = players.find(
      (player) => Number(player.utilisateur_id) === buteurId,
    );
    const assister = passeurId
      ? players.find((player) => Number(player.utilisateur_id) === passeurId)
      : null;
    if (
      !scorer ||
      scorer.equipe !== equipe ||
      (passeurId && (!assister || assister.equipe !== equipe))
    ) {
      return res.status(400).json({
        message:
          "Le buteur et le passeur doivent appartenir à l'équipe choisie",
      });
    }

    const scoreField = equipe === "A" ? "score_equipe_a" : "score_equipe_b";
    await db.execute(
      `INSERT INTO StatsJoueurMatch (match_id, utilisateur_id, equipe, buts, passes_decisives)
       VALUES (?, ?, ?, 1, 0)
       ON DUPLICATE KEY UPDATE buts = buts + 1`,
      [req.params.id, buteurId, equipe],
    );
    if (passeurId) {
      await db.execute(
        `INSERT INTO StatsJoueurMatch (match_id, utilisateur_id, equipe, buts, passes_decisives)
         VALUES (?, ?, ?, 0, 1)
         ON DUPLICATE KEY UPDATE passes_decisives = passes_decisives + 1`,
        [req.params.id, passeurId, equipe],
      );
    }
    await db.execute(
      `UPDATE MatchSport
         SET ${scoreField} = COALESCE(${scoreField}, 0) + 1
       WHERE id = ?`,
      [req.params.id],
    );
    res.json({ message: "But enregistré", equipe });
  } catch (err) {
    console.error("❌ enregistrerButLive:", err.message, err.sql);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/resultat – créateur enregistre le score final
exports.enregistrerResultat = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureMatchStatsSchema(connection);
    await ensureLiveMatchSchema(connection);
    const scoreA = Number(req.body.score_equipe_a);
    const scoreB = Number(req.body.score_equipe_b);

    if (
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB) ||
      scoreA < 0 ||
      scoreB < 0
    ) {
      return res.status(400).json({ message: "Scores invalides" });
    }

    await connection.beginTransaction();

    const [matchRows] = await connection.execute(
      `SELECT *
       FROM MatchSport
       WHERE id = ?
       FOR UPDATE`,
      [req.params.id],
    );

    if (matchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Match introuvable" });
    }

    const match = matchRows[0];

    let canRecordResult = match.createur_id === req.user.id;
    if (!canRecordResult && match.ligue_id) {
      const [staffRows] = await connection.execute(
        `SELECT 1 FROM LigueUtilisateur
         WHERE ligue_id = ? AND utilisateur_id = ? AND est_staff = 1
         LIMIT 1`,
        [match.ligue_id, req.user.id],
      );
      canRecordResult = staffRows.length > 0;
    }
    if (!canRecordResult) {
      await connection.rollback();
      return res.status(403).json({ message: "Interdit" });
    }

    if (match.statut === "annule") {
      await connection.rollback();
      return res.status(400).json({ message: "Le match est annulé" });
    }

    if (match.statut === "termine") {
      await connection.rollback();
      return res
        .status(409)
        .json({ message: "Le résultat est déjà enregistré" });
    }

    const isDraw = scoreA === scoreB;
    const isKnockout = ["quart", "demi", "finale", "classement"].includes(
      match.phase,
    );
    if (isKnockout && hasPendingBracketTeam(match)) {
      await connection.rollback();
      return res.status(409).json({
        message: "Ce match attend encore la qualification de ses deux équipes",
      });
    }
    const forfeitWinner = req.body.vainqueur_forfait;
    const hasForfeit = ["A", "B"].includes(forfeitWinner);
    const confirmedDraw = req.body.terminer_match_nul === true;
    const shootoutA = Number(req.body.tirs_au_but_a);
    const shootoutB = Number(req.body.tirs_au_but_b);
    const hasShootout =
      Number.isInteger(shootoutA) &&
      Number.isInteger(shootoutB) &&
      shootoutA >= 0 &&
      shootoutB >= 0 &&
      shootoutA !== shootoutB;
    if (hasForfeit && !isDraw) {
      await connection.rollback();
      return res.status(400).json({
        message: "Le forfait ne peut être déclaré que pour un score à égalité",
      });
    }
    if (
      isDraw &&
      isKnockout &&
      !hasForfeit &&
      !confirmedDraw &&
      !hasShootout &&
      match.chrono_phase !== "prolongation"
    ) {
      await connection.rollback();
      return res.status(409).json({
        message: "Le score est nul : lancez la prolongation",
        phase_suivante_requise: "prolongation",
      });
    }
    if (isDraw && isKnockout && !hasForfeit && !confirmedDraw && !hasShootout) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "La prolongation doit désigner un vainqueur" });
    }
    const winnerTeam = hasForfeit
      ? forfeitWinner
      : hasShootout
        ? shootoutA > shootoutB
          ? "A"
          : "B"
        : isDraw
          ? null
          : scoreA > scoreB
            ? "A"
            : "B";
    const loserTeam = winnerTeam ? (winnerTeam === "A" ? "B" : "A") : null;
    const effectiveDraw = isDraw && !hasForfeit && !hasShootout;

    const [participants] = await connection.execute(
      `SELECT utilisateur_id, equipe, statut, rejoint_le
       FROM ParticipationMatch
       WHERE match_id = ? AND equipe IN ('A', 'B')
       ORDER BY CASE WHEN statut = 'valide' THEN 0 ELSE 1 END, rejoint_le ASC`,
      [match.id],
    );

    const [ligueEquipes] = match.ligue_id
      ? await connection.execute(
          `SELECT id, nom
           FROM LigueEquipe
           WHERE ligue_id = ? AND nom IN (?, ?)`,
          [match.ligue_id, match.nom_equipe_a, match.nom_equipe_b],
        )
      : [[]];

    const hasPrecreatedTeams = ligueEquipes.length === 2;
    const winningParticipants = participants.filter(
      (participant) => participant.equipe === winnerTeam,
    );
    const losingParticipants = participants.filter(
      (participant) => participant.equipe === loserTeam,
    );
    const winnerParticipant = pickParticipantByTeam(participants, winnerTeam);
    const loserParticipant = pickParticipantByTeam(participants, loserTeam);

    if ((!winnerParticipant || !loserParticipant) && !hasPrecreatedTeams) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Chaque côté doit avoir au moins un joueur assigné" });
    }

    const winningScore = Math.max(scoreA, scoreB);
    const losingScore = Math.min(scoreA, scoreB);

    if (winnerParticipant && loserParticipant && !effectiveDraw) {
      await connection.execute(
        `INSERT INTO ResultatMatch (match_id, gagnant_id, perdant_id, score_gagnant, score_perdant, elo_delta)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [
          match.id,
          winnerParticipant.utilisateur_id,
          loserParticipant.utilisateur_id,
          winningScore,
          losingScore,
        ],
      );
    }

    const stats = Array.isArray(req.body.stats_joueurs)
      ? req.body.stats_joueurs
      : [];
    for (const stat of stats) {
      const utilisateurId = Number(stat.utilisateur_id);
      const buts = Number(stat.buts || 0);
      const passes = Number(stat.passes_decisives || 0);
      if (
        !Number.isInteger(utilisateurId) ||
        !["A", "B"].includes(stat.equipe) ||
        !Number.isInteger(buts) ||
        buts < 0 ||
        !Number.isInteger(passes) ||
        passes < 0
      ) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Statistiques joueur invalides" });
      }
      await connection.execute(
        `INSERT INTO StatsJoueurMatch (match_id, utilisateur_id, equipe, buts, passes_decisives)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE equipe = VALUES(equipe), buts = VALUES(buts), passes_decisives = VALUES(passes_decisives)`,
        [match.id, utilisateurId, stat.equipe, buts, passes],
      );
    }

    await connection.execute(
      `UPDATE MatchSport
       SET score_equipe_a = ?,
           score_equipe_b = ?,
           vainqueur_equipe = ?,
           tirs_au_but_a = ?,
           tirs_au_but_b = ?,
           statut = 'termine',
           statut_match = 'termine',
           chrono_demarre_le = NULL
       WHERE id = ?`,
      [
        scoreA,
        scoreB,
        winnerTeam,
        hasShootout ? shootoutA : null,
        hasShootout ? shootoutB : null,
        match.id,
      ],
    );

    let nextPhase = null;
    if (match.ligue_id && ["poule", "classement"].includes(match.phase)) {
      await applyLeagueStandingUpdate(
        connection,
        match,
        winnerTeam,
        loserTeam,
        scoreA,
        scoreB,
        effectiveDraw,
      );
    }
    if (match.ligue_id && winnerTeam) {
      nextPhase = await advanceKnockoutPhase(connection, match);
    }

    await connection.commit();
    return res.json({
      message: "Résultat enregistré",
      score_equipe_a: scoreA,
      score_equipe_b: scoreB,
      vainqueur_equipe: winnerTeam,
      phase_suivante: nextPhase,
    });
  } catch (err) {
    await connection.rollback();
    return res
      .status(500)
      .json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};
