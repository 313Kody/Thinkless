const { getPool } = require("../config/db");
const { getLevelForElo } = require("../utils/rankUtils");

async function ensureColumn(db, tableName, columnName, definition) {
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  if (!rows.length) {
    await db.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
    );
  }
}

async function ensureNullableColumn(db, tableName, columnName, definition) {
  const [rows] = await db.execute(
    `SELECT IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  if (!rows.length || rows[0].IS_NULLABLE !== "YES") {
    await db.execute(
      `ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definition}`,
    );
  }
}

async function ensureEsportSchema(db) {
  await ensureNullableColumn(db, "Ligue", "sport_id", "INT UNSIGNED NULL");
  await ensureColumn(db, "Ligue", "jeu_id", "INT UNSIGNED NULL AFTER sport_id");
  await ensureColumn(
    db,
    "MatchEsport",
    "ligue_id",
    "INT UNSIGNED NULL AFTER createur_id",
  );
  await ensureColumn(
    db,
    "MatchEsport",
    "slots_par_equipe",
    "TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER format",
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS EquipeMembre (
      equipe_id INT UNSIGNED NOT NULL,
      utilisateur_id INT UNSIGNED NOT NULL,
      rejoint_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (equipe_id, utilisateur_id),
      CONSTRAINT fk_em_equipe FOREIGN KEY (equipe_id)
        REFERENCES EquipeEsport(id) ON DELETE CASCADE,
      CONSTRAINT fk_em_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES Utilisateur(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS MatchEquipe (
      match_esport_id INT UNSIGNED NOT NULL,
      equipe_id INT UNSIGNED NOT NULL,
      elo_moyen SMALLINT UNSIGNED NOT NULL DEFAULT 1000,
      PRIMARY KEY (match_esport_id, equipe_id),
      CONSTRAINT fk_meq_match FOREIGN KEY (match_esport_id)
        REFERENCES MatchEsport(id) ON DELETE CASCADE,
      CONSTRAINT fk_meq_equipe FOREIGN KEY (equipe_id)
        REFERENCES EquipeEsport(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS MatchEquipeConvocation (
      match_esport_id INT UNSIGNED NOT NULL,
      equipe_id INT UNSIGNED NOT NULL,
      utilisateur_id INT UNSIGNED NOT NULL,
      convoque_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (match_esport_id, equipe_id, utilisateur_id),
      CONSTRAINT fk_mec_match FOREIGN KEY (match_esport_id)
        REFERENCES MatchEsport(id) ON DELETE CASCADE,
      CONSTRAINT fk_mec_equipe FOREIGN KEY (equipe_id)
        REFERENCES EquipeEsport(id) ON DELETE CASCADE,
      CONSTRAINT fk_mec_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES Utilisateur(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function buildAccessCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function getMyTeamForUser(db, userId) {
  const [rows] = await db.execute(
    `SELECT ee.id, ee.nom, ee.capitaine_id
     FROM EquipeMembre em
     JOIN EquipeEsport ee ON ee.id = em.equipe_id
     WHERE em.utilisateur_id = ?
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
}

async function getTeamAverageElo(db, teamId, gameId) {
  const [rows] = await db.execute(
    `SELECT ROUND(AVG(uj.elo)) AS elo_moyen
     FROM EquipeMembre em
     JOIN UtilisateurJeu uj ON uj.utilisateur_id = em.utilisateur_id
     WHERE em.equipe_id = ? AND uj.jeu_id = ?`,
    [teamId, gameId],
  );

  return Number(rows[0]?.elo_moyen || 1000);
}

async function getTeamMembers(db, teamId, gameId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.pseudo, uj.elo
     FROM EquipeMembre em
     JOIN Utilisateur u ON u.id = em.utilisateur_id
     LEFT JOIN UtilisateurJeu uj ON uj.utilisateur_id = u.id AND uj.jeu_id = ?
     WHERE em.equipe_id = ?
     ORDER BY u.pseudo ASC`,
    [gameId, teamId],
  );

  return rows.map((row) => ({
    ...row,
    elo: Number(row.elo || 1000),
    niveau: getLevelForElo("game", row.elo || 1000),
  }));
}

exports.getJeux = async (_req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const [rows] = await db.execute(
      `SELECT j.id, j.nom, j.badge_url,
              COUNT(me.id) AS nb_matchs_ouverts
       FROM JeuEsport j
       LEFT JOIN MatchEsport me ON me.jeu_id = j.id AND me.statut = 'ouvert'
       GROUP BY j.id, j.nom, j.badge_url
       ORDER BY j.nom ASC`,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getMatchs = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const params = [];
    let whereClause = "WHERE me.statut = 'ouvert'";

    if (req.query.jeu_id) {
      whereClause += " AND me.jeu_id = ?";
      params.push(Number(req.query.jeu_id));
    }

    if (req.query.ligue_id) {
      whereClause += " AND me.ligue_id = ?";
      params.push(Number(req.query.ligue_id));
    }

    const [rows] = await db.execute(
      `SELECT me.id, me.jeu_id, me.createur_id, me.date_heure, me.format, me.slots_par_equipe, me.statut,
              j.nom AS jeu,
              u.pseudo AS createur,
              COUNT(DISTINCT mq.equipe_id) AS nb_equipes,
              GROUP_CONCAT(DISTINCT ee.nom ORDER BY ee.nom SEPARATOR ' vs ') AS affichage_equipes
       FROM MatchEsport me
       JOIN JeuEsport j ON j.id = me.jeu_id
       JOIN Utilisateur u ON u.id = me.createur_id
       LEFT JOIN MatchEquipe mq ON mq.match_esport_id = me.id
       LEFT JOIN EquipeEsport ee ON ee.id = mq.equipe_id
       ${whereClause}
       GROUP BY me.id, me.jeu_id, me.createur_id, me.date_heure, me.format, me.slots_par_equipe, me.statut, j.nom, u.pseudo
       ORDER BY me.date_heure ASC`,
      params,
    );

    const myTeam = await getMyTeamForUser(db, req.user.id);
    const enriched = rows.map((item) => ({
      ...item,
      has_slot: Number(item.nb_equipes) < 2,
      my_team_id: myTeam?.id || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.createMatch = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureEsportSchema(connection);

    const {
      jeu_id,
      date_heure,
      format,
      slots_par_equipe,
      convoques,
      ligue_id,
    } = req.body;
    if (!jeu_id || !date_heure) {
      return res.status(400).json({ message: "jeu_id et date_heure requis" });
    }

    const slots = Number(slots_par_equipe) || 5;
    if (!Number.isInteger(slots) || slots < 1 || slots > 10) {
      return res.status(400).json({ message: "slots_par_equipe invalide" });
    }

    const myTeam = await getMyTeamForUser(connection, req.user.id);
    if (!myTeam) {
      return res.status(403).json({
        message: "Tu dois appartenir a une equipe e-sport pour creer un match",
      });
    }

    await connection.beginTransaction();

    const [gameRows] = await connection.execute(
      `SELECT id FROM JeuEsport WHERE id = ? LIMIT 1`,
      [Number(jeu_id)],
    );

    if (gameRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Jeu introuvable" });
    }

    if (ligue_id) {
      const [leagueRows] = await connection.execute(
        `SELECT id, jeu_id FROM Ligue WHERE id = ? AND jeu_id IS NOT NULL LIMIT 1`,
        [Number(ligue_id)],
      );

      if (!leagueRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: "Ligue e-sport introuvable" });
      }

      if (Number(leagueRows[0].jeu_id) !== Number(jeu_id)) {
        await connection.rollback();
        return res
          .status(400)
          .json({
            message: "Le jeu du match doit correspondre à celui de la ligue",
          });
      }
    }

    const teamMembers = await getTeamMembers(
      connection,
      myTeam.id,
      Number(jeu_id),
    );
    const memberIds = new Set(teamMembers.map((member) => Number(member.id)));
    const selectedConvocations = Array.from(
      new Set(
        Array.isArray(convoques)
          ? convoques
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value))
          : [],
      ),
    );

    if (!selectedConvocations.length) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Choisis au moins un joueur convoqué" });
    }

    if (selectedConvocations.length > slots) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Trop de joueurs convoqués pour ce nombre de slots" });
    }

    if (!selectedConvocations.every((id) => memberIds.has(id))) {
      await connection.rollback();
      return res
        .status(400)
        .json({
          message: "Les joueurs convoqués doivent appartenir à ton équipe",
        });
    }

    const [result] = await connection.execute(
      `INSERT INTO MatchEsport (jeu_id, createur_id, ligue_id, date_heure, format, slots_par_equipe)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(jeu_id),
        req.user.id,
        ligue_id ? Number(ligue_id) : null,
        date_heure,
        format || "BO1",
        slots,
      ],
    );

    const eloMoyen = await getTeamAverageElo(
      connection,
      myTeam.id,
      Number(jeu_id),
    );

    await connection.execute(
      `INSERT INTO MatchEquipe (match_esport_id, equipe_id, elo_moyen)
       VALUES (?, ?, ?)`,
      [result.insertId, myTeam.id, eloMoyen],
    );

    for (const utilisateurId of selectedConvocations) {
      await connection.execute(
        `INSERT INTO MatchEquipeConvocation (match_esport_id, equipe_id, utilisateur_id)
         VALUES (?, ?, ?)`,
        [result.insertId, myTeam.id, utilisateurId],
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Match e-sport cree",
      id: result.insertId,
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

exports.rejoindreMatch = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const matchId = Number(req.params.id);
    const [matchRows] = await db.execute(
      `SELECT * FROM MatchEsport WHERE id = ? LIMIT 1`,
      [matchId],
    );

    if (matchRows.length === 0) {
      return res.status(404).json({ message: "Match introuvable" });
    }

    const match = matchRows[0];
    if (match.statut !== "ouvert") {
      return res.status(400).json({ message: "Match non disponible" });
    }

    const myTeam = await getMyTeamForUser(db, req.user.id);
    if (!myTeam) {
      return res.status(403).json({ message: "Aucune equipe e-sport trouvee" });
    }

    const [currentTeams] = await db.execute(
      `SELECT equipe_id FROM MatchEquipe WHERE match_esport_id = ?`,
      [matchId],
    );

    if (
      currentTeams.some((item) => Number(item.equipe_id) === Number(myTeam.id))
    ) {
      return res
        .status(409)
        .json({ message: "Ton equipe est deja dans ce match" });
    }

    if (currentTeams.length >= 2) {
      return res.status(400).json({ message: "Le match est deja complet" });
    }

    const eloMoyen = await getTeamAverageElo(
      db,
      myTeam.id,
      Number(match.jeu_id),
    );

    await db.execute(
      `INSERT INTO MatchEquipe (match_esport_id, equipe_id, elo_moyen)
       VALUES (?, ?, ?)`,
      [matchId, myTeam.id, eloMoyen],
    );

    const [updatedTeams] = await db.execute(
      `SELECT equipe_id FROM MatchEquipe WHERE match_esport_id = ?`,
      [matchId],
    );

    if (updatedTeams.length >= 2) {
      await db.execute(
        `UPDATE MatchEsport SET statut = 'complet' WHERE id = ?`,
        [matchId],
      );
    }

    res.json({ message: "Equipe ajoutee au match" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Equipe deja inscrite" });
    }

    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getMatch = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const matchId = Number(req.params.id);
    const [matchRows] = await db.execute(
      `SELECT me.*, j.nom AS jeu, u.pseudo AS createur
       FROM MatchEsport me
       JOIN JeuEsport j ON j.id = me.jeu_id
       JOIN Utilisateur u ON u.id = me.createur_id
       WHERE me.id = ?
       LIMIT 1`,
      [matchId],
    );

    if (matchRows.length === 0) {
      return res.status(404).json({ message: "Match introuvable" });
    }

    const [teams] = await db.execute(
      `SELECT ee.id, ee.nom, ee.logo_url, mq.elo_moyen
       FROM MatchEquipe mq
       JOIN EquipeEsport ee ON ee.id = mq.equipe_id
       WHERE mq.match_esport_id = ?
       ORDER BY mq.equipe_id ASC`,
      [matchId],
    );

    const [convocations] = await db.execute(
      `SELECT mec.equipe_id, u.id, u.pseudo, uj.elo
       FROM MatchEquipeConvocation mec
       JOIN Utilisateur u ON u.id = mec.utilisateur_id
       LEFT JOIN MatchEsport me ON me.id = mec.match_esport_id
       LEFT JOIN UtilisateurJeu uj ON uj.utilisateur_id = u.id AND uj.jeu_id = me.jeu_id
       WHERE mec.match_esport_id = ?
       ORDER BY mec.equipe_id ASC, u.pseudo ASC`,
      [matchId],
    );

    const [resultRows] = await db.execute(
      `SELECT rme.*, wg.nom AS equipe_gagnante, wl.nom AS equipe_perdante
       FROM ResultatMatchEsport rme
       JOIN EquipeEsport wg ON wg.id = rme.equipe_gagnante_id
       JOIN EquipeEsport wl ON wl.id = rme.equipe_perdante_id
       WHERE rme.match_esport_id = ?
       LIMIT 1`,
      [matchId],
    );

    const myTeam = await getMyTeamForUser(db, req.user.id);

    const teamsWithData = await Promise.all(
      teams.map(async (team) => ({
        ...team,
        membres: await getTeamMembers(db, team.id, matchRows[0].jeu_id),
        convoques: convocations
          .filter((item) => Number(item.equipe_id) === Number(team.id))
          .map((item) => ({
            id: item.id,
            pseudo: item.pseudo,
            elo: Number(item.elo || 1000),
            niveau: getLevelForElo("game", item.elo || 1000),
          })),
      })),
    );

    res.json({
      ...matchRows[0],
      teams: teamsWithData,
      result: resultRows[0] || null,
      can_manage: Number(matchRows[0].createur_id) === Number(req.user.id),
      can_join:
        Boolean(myTeam) &&
        teams.length < 2 &&
        !teams.some((t) => Number(t.id) === Number(myTeam.id)),
      my_team: myTeam,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.updateConvocations = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureEsportSchema(connection);

    const matchId = Number(req.params.id);
    const { convoques } = req.body;

    const [matchRows] = await connection.execute(
      `SELECT * FROM MatchEsport WHERE id = ? LIMIT 1`,
      [matchId],
    );

    if (!matchRows.length) {
      return res.status(404).json({ message: "Match introuvable" });
    }

    const match = matchRows[0];
    if (match.statut === "termine" || match.statut === "annule") {
      return res
        .status(400)
        .json({
          message:
            "Impossible de modifier les convocations d'un match terminé ou annulé",
        });
    }

    const myTeam = await getMyTeamForUser(connection, req.user.id);
    if (!myTeam) {
      return res.status(403).json({ message: "Aucune équipe trouvée" });
    }

    if (Number(myTeam.capitaine_id) !== Number(req.user.id)) {
      return res
        .status(403)
        .json({ message: "Seul le capitaine peut modifier les convocations" });
    }

    const [teamInMatch] = await connection.execute(
      `SELECT 1 FROM MatchEquipe WHERE match_esport_id = ? AND equipe_id = ?`,
      [matchId, myTeam.id],
    );

    if (!teamInMatch.length) {
      return res
        .status(403)
        .json({ message: "Ton équipe ne participe pas à ce match" });
    }

    const slots = Number(match.slots_par_equipe);
    const convocationsArray = Array.from(
      new Set(
        Array.isArray(convoques)
          ? convoques
              .map((v) => Number(v))
              .filter((v) => Number.isInteger(v) && v > 0)
          : [],
      ),
    );

    if (!convocationsArray.length) {
      return res.status(400).json({ message: "Convoque au moins un joueur" });
    }

    if (convocationsArray.length > slots) {
      return res
        .status(400)
        .json({ message: `Maximum ${slots} joueur(s) par équipe` });
    }

    const teamMembers = await getTeamMembers(
      connection,
      myTeam.id,
      match.jeu_id,
    );
    const memberIds = new Set(teamMembers.map((m) => Number(m.id)));
    if (!convocationsArray.every((id) => memberIds.has(id))) {
      return res
        .status(400)
        .json({
          message: "Tous les joueurs convoqués doivent appartenir à ton équipe",
        });
    }

    await connection.beginTransaction();

    await connection.execute(
      `DELETE FROM MatchEquipeConvocation WHERE match_esport_id = ? AND equipe_id = ?`,
      [matchId, myTeam.id],
    );

    for (const userId of convocationsArray) {
      await connection.execute(
        `INSERT INTO MatchEquipeConvocation (match_esport_id, equipe_id, utilisateur_id) VALUES (?, ?, ?)`,
        [matchId, myTeam.id, userId],
      );
    }

    await connection.commit();
    res.json({ message: "Convocations mises à jour" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

exports.enregistrerResultat = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureEsportSchema(connection);

    const matchId = Number(req.params.id);
    const scoreGagnant = Number(req.body.score_gagnant);
    const scorePerdant = Number(req.body.score_perdant);
    const equipeGagnanteId = Number(req.body.equipe_gagnante_id);

    if (!Number.isInteger(scoreGagnant) || !Number.isInteger(scorePerdant)) {
      return res.status(400).json({ message: "Scores invalides" });
    }

    await connection.beginTransaction();

    const [matchRows] = await connection.execute(
      `SELECT * FROM MatchEsport WHERE id = ? FOR UPDATE`,
      [matchId],
    );

    if (matchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Match introuvable" });
    }

    const match = matchRows[0];
    if (Number(match.createur_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Interdit" });
    }

    const [teams] = await connection.execute(
      `SELECT equipe_id FROM MatchEquipe WHERE match_esport_id = ?`,
      [matchId],
    );

    if (teams.length !== 2) {
      await connection.rollback();
      return res.status(400).json({ message: "Le match doit avoir 2 equipes" });
    }

    const teamIds = teams.map((item) => Number(item.equipe_id));
    if (!teamIds.includes(equipeGagnanteId)) {
      await connection.rollback();
      return res.status(400).json({ message: "Equipe gagnante invalide" });
    }

    const equipePerdanteId = teamIds.find((id) => id !== equipeGagnanteId);

    await connection.execute(
      `INSERT INTO ResultatMatchEsport (match_esport_id, equipe_gagnante_id, equipe_perdante_id, score_gagnant, score_perdant, elo_delta)
       VALUES (?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         equipe_gagnante_id = VALUES(equipe_gagnante_id),
         equipe_perdante_id = VALUES(equipe_perdante_id),
         score_gagnant = VALUES(score_gagnant),
         score_perdant = VALUES(score_perdant)`,
      [matchId, equipeGagnanteId, equipePerdanteId, scoreGagnant, scorePerdant],
    );

    await connection.execute(
      `UPDATE MatchEsport
       SET statut = 'termine'
       WHERE id = ?`,
      [matchId],
    );

    await connection.execute(
      `UPDATE UtilisateurJeu uj
       JOIN EquipeMembre em ON em.utilisateur_id = uj.utilisateur_id
       SET uj.victoires = uj.victoires + 1
       WHERE em.equipe_id = ? AND uj.jeu_id = ?`,
      [equipeGagnanteId, match.jeu_id],
    );

    await connection.execute(
      `UPDATE UtilisateurJeu uj
       JOIN EquipeMembre em ON em.utilisateur_id = uj.utilisateur_id
       SET uj.defaites = uj.defaites + 1
       WHERE em.equipe_id = ? AND uj.jeu_id = ?`,
      [equipePerdanteId, match.jeu_id],
    );

    await connection.commit();
    res.json({ message: "Resultat enregistre" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

exports.getClassementJeu = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const jeuId = Number(req.params.jeuId);
    const [jeuRows] = await db.execute(
      `SELECT id, nom, badge_url FROM JeuEsport WHERE id = ? LIMIT 1`,
      [jeuId],
    );

    if (jeuRows.length === 0) {
      return res.status(404).json({ message: "Jeu introuvable" });
    }

    const [classementJoueurs] = await db.execute(
      `SELECT u.id, u.pseudo, uj.elo, uj.victoires, uj.defaites,
              RANK() OVER (ORDER BY uj.elo DESC) AS rang
       FROM UtilisateurJeu uj
       JOIN Utilisateur u ON u.id = uj.utilisateur_id
       WHERE uj.jeu_id = ?
       ORDER BY uj.elo DESC, u.pseudo ASC`,
      [jeuId],
    );

    const [classementEquipes] = await db.execute(
      `SELECT t.id, t.nom, t.elo_moyen, t.nb_joueurs,
              RANK() OVER (ORDER BY t.elo_moyen DESC) AS rang
       FROM (
         SELECT ee.id, ee.nom,
                ROUND(AVG(uj.elo)) AS elo_moyen,
                COUNT(DISTINCT em.utilisateur_id) AS nb_joueurs
         FROM EquipeEsport ee
         JOIN EquipeMembre em ON em.equipe_id = ee.id
         JOIN UtilisateurJeu uj ON uj.utilisateur_id = em.utilisateur_id AND uj.jeu_id = ?
         GROUP BY ee.id, ee.nom
       ) AS t
       ORDER BY t.elo_moyen DESC, t.nom ASC`,
      [jeuId],
    );

    const [matchsRecents] = await db.execute(
      `SELECT me.id, me.date_heure, me.format, me.statut,
              GROUP_CONCAT(ee.nom ORDER BY ee.nom SEPARATOR ' vs ') AS affichage_equipes
       FROM MatchEsport me
       LEFT JOIN MatchEquipe mq ON mq.match_esport_id = me.id
       LEFT JOIN EquipeEsport ee ON ee.id = mq.equipe_id
       WHERE me.jeu_id = ?
       GROUP BY me.id, me.date_heure, me.format, me.statut
       ORDER BY me.date_heure DESC
       LIMIT 10`,
      [jeuId],
    );

    res.json({
      jeu: jeuRows[0],
      classement_joueurs: classementJoueurs,
      classement_equipes: classementEquipes,
      matchs_recents: matchsRecents,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getEsportLigues = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const { nom } = req.query;
    let sql = `SELECT l.*, j.nom AS jeu, u.pseudo AS createur,
              CASE WHEN mylu.utilisateur_id IS NULL THEN 0 ELSE 1 END AS suis,
              COUNT(lu.utilisateur_id) AS nb_membres
       FROM Ligue l
       JOIN JeuEsport j ON j.id = l.jeu_id
       JOIN Utilisateur u ON u.id = l.createur_id
       LEFT JOIN LigueUtilisateur lu ON lu.ligue_id = l.id
       LEFT JOIN LigueUtilisateur mylu
         ON mylu.ligue_id = l.id AND mylu.utilisateur_id = ?
       WHERE l.jeu_id IS NOT NULL
         AND (l.publique = 1 OR mylu.utilisateur_id IS NOT NULL)`;

    const params = [req.user.id];
    if (nom) {
      sql += ` AND l.nom LIKE ?`;
      params.push(`%${nom}%`);
    }

    sql += ` GROUP BY l.id, j.nom, u.pseudo, mylu.utilisateur_id ORDER BY l.id DESC`;

    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.createEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);

    const {
      jeu_id,
      nom,
      description,
      publique,
      nb_equipe,
      slots_par_equipe,
      equipes,
    } = req.body;
    const leagueName = String(nom || "").trim();
    if (!jeu_id || !leagueName) {
      return res.status(400).json({ message: "jeu_id et nom requis" });
    }

    const [gameRows] = await db.execute(
      `SELECT id FROM JeuEsport WHERE id = ? LIMIT 1`,
      [Number(jeu_id)],
    );

    if (!gameRows.length) {
      return res.status(400).json({ message: "Jeu non trouvé" });
    }

    const finalNbEquipe = Number(nb_equipe) || 2;
    const finalSlotsPar = Number(slots_par_equipe) || 5;
    const isPublic = Boolean(publique);
    const code_acces = isPublic ? null : buildAccessCode();
    const teamNames = !isPublic
      ? (Array.isArray(equipes) && equipes.length
          ? equipes
          : Array.from(
              { length: finalNbEquipe },
              (_, index) => `Équipe ${index + 1}`,
            )
        )
          .map((teamName) => String(teamName || "").trim())
          .filter(Boolean)
      : [];

    if (!isPublic && teamNames.length !== finalNbEquipe) {
      return res
        .status(400)
        .json({
          message: "Chaque équipe de la ligue privée doit avoir un nom.",
        });
    }

    const [result] = await db.execute(
      `INSERT INTO Ligue (sport_id, jeu_id, createur_id, nom, description, publique, nb_equipe, slots_par_equipe, code_acces)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null,
        Number(jeu_id),
        req.user.id,
        leagueName,
        description || null,
        isPublic ? 1 : 0,
        finalNbEquipe,
        finalSlotsPar,
        code_acces,
      ],
    );

    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [result.insertId, req.user.id],
    );

    if (!isPublic) {
      for (const nomEquipe of teamNames) {
        await db.execute(
          `INSERT INTO LigueEquipe (ligue_id, nom) VALUES (?, ?)`,
          [result.insertId, nomEquipe],
        );
      }
    }

    const response = { message: "Ligue e-sport créée", id: result.insertId };
    if (code_acces) {
      response.code_acces = code_acces;
    }

    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.rejoindreEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id)
       SELECT id, ? FROM Ligue WHERE id = ? AND jeu_id IS NOT NULL`,
      [req.user.id, req.params.id],
    );
    res.json({ message: "Ligue e-sport rejointe !" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Déjà membre" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.rejoindreEsportLigueAvecCode = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);
    const { code_acces } = req.body;

    const [rows] = await db.execute(
      `SELECT * FROM Ligue WHERE code_acces = ? AND publique = 0 AND jeu_id IS NOT NULL`,
      [String(code_acces || "").toUpperCase()],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ message: "Code invalide ou ligue introuvable" });
    }

    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [rows[0].id, req.user.id],
    );

    res.json({ message: "Ligue e-sport rejointe !", ligue_id: rows[0].id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Déjà membre" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getEsportEquipesLigue = async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT id, nom, created_at FROM LigueEquipe WHERE ligue_id = ? ORDER BY id ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.classementEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    const ligueId = req.params.id;

    const [equipes] = await db.execute(
      `SELECT id FROM LigueEquipe WHERE ligue_id = ? LIMIT 1`,
      [ligueId],
    );

    if (equipes.length > 0) {
      const [rows] = await db.execute(
        `SELECT t.pseudo, t.points, t.victoires, t.defaites,
                'equipe' AS ranking_type,
                RANK() OVER (ORDER BY t.points DESC) AS rang
         FROM (
           SELECT le.nom AS pseudo,
                  COALESCE(SUM(lu.points), 0) AS points,
                  COALESCE(SUM(lu.victoires), 0) AS victoires,
                  COALESCE(SUM(lu.defaites), 0) AS defaites
           FROM LigueEquipe le
           LEFT JOIN LigueUtilisateur lu
             ON lu.ligue_id = le.ligue_id AND lu.equipe_id = le.id
           WHERE le.ligue_id = ?
           GROUP BY le.id, le.nom
         ) AS t
         ORDER BY t.points DESC, t.pseudo ASC`,
        [ligueId],
      );
      return res.json(rows);
    }

    const [rows] = await db.execute(
      `SELECT u.pseudo, lu.points, lu.victoires, lu.defaites,
              'joueur' AS ranking_type,
              RANK() OVER (ORDER BY lu.points DESC) AS rang
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       WHERE lu.ligue_id = ?
       ORDER BY lu.points DESC, u.pseudo ASC`,
      [ligueId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureEsportSchema(db);
    const ligueId = req.params.id;

    const [ligues] = await db.execute(
      `SELECT l.*, j.nom AS jeu, u.pseudo AS createur
       FROM Ligue l
       LEFT JOIN JeuEsport j ON j.id = l.jeu_id
       LEFT JOIN Utilisateur u ON u.id = l.createur_id
       WHERE l.id = ? AND l.jeu_id IS NOT NULL`,
      [ligueId],
    );

    if (!ligues.length) {
      return res.status(404).json({ message: "Ligue e-sport introuvable" });
    }

    const [membres] = await db.execute(
      `SELECT u.id, u.pseudo, uj.elo, lu.points, lu.victoires, lu.defaites
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       LEFT JOIN Ligue l ON l.id = lu.ligue_id
       LEFT JOIN UtilisateurJeu uj
         ON uj.utilisateur_id = u.id AND uj.jeu_id = l.jeu_id
       WHERE lu.ligue_id = ?
       ORDER BY lu.points DESC, u.pseudo ASC`,
      [ligueId],
    );

    const ligue = ligues[0];
    ligue.membres = membres;
    ligue.suis = membres.some((m) => Number(m.id) === Number(req.user.id));
    res.json(ligue);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getMatchsEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    const [matchs] = await db.execute(
      `SELECT me.*, j.nom AS jeu, u.pseudo AS createur
       FROM MatchEsport me
       JOIN JeuEsport j ON j.id = me.jeu_id
       JOIN Utilisateur u ON u.id = me.createur_id
       WHERE me.ligue_id = ?
       ORDER BY me.date_heure DESC`,
      [req.params.id],
    );
    res.json(matchs);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.quitterEsportLigue = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      `DELETE FROM LigueUtilisateur WHERE ligue_id = ? AND utilisateur_id = ?`,
      [req.params.id, req.user.id],
    );
    res.json({ message: "Ligue e-sport quittée" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
