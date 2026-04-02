const { getPool } = require("../config/db");

async function getMatchAuthorizationContext(connection, matchId) {
  const [rows] = await connection.execute(
    `SELECT ms.*, l.createur_id AS ligue_createur_id
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
    const winningTeamId = winnerTeam === "A" ? equipeA.id : equipeB.id;
    const losingTeamId = loserTeam === "A" ? equipeA.id : equipeB.id;

    await connection.execute(
      `UPDATE LigueUtilisateur
       SET points = points + 3,
           victoires = victoires + 1
       WHERE ligue_id = ? AND equipe_id = ?`,
      [match.ligue_id, winningTeamId],
    );

    await connection.execute(
      `UPDATE LigueUtilisateur
       SET defaites = defaites + 1
       WHERE ligue_id = ? AND equipe_id = ?`,
      [match.ligue_id, losingTeamId],
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

// GET /api/matchs
exports.getMatchs = async (req, res) => {
  try {
    const db = getPool();
    const { localisation } = req.query;

    let sql = `SELECT ms.*, s.nom AS sport, u.pseudo AS createur
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
    const {
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
    } = req.body;

    if (!sport_id || !date_heure) {
      return res.status(400).json({ message: "sport_id et date_heure requis" });
    }

    let finalLigueId = null;
    if (ligue_id !== undefined && ligue_id !== null && ligue_id !== "") {
      finalLigueId = Number(ligue_id);
      if (!Number.isInteger(finalLigueId) || finalLigueId <= 0) {
        return res.status(400).json({ message: "ligue_id invalide" });
      }

      const [ligueRows] = await db.execute(
        `SELECT createur_id
         FROM Ligue
         WHERE id = ?
         LIMIT 1`,
        [finalLigueId],
      );

      if (ligueRows.length === 0) {
        return res.status(404).json({ message: "Ligue introuvable" });
      }

      if (Number(ligueRows[0].createur_id) !== Number(req.user.id)) {
        return res.status(403).json({
          message: "Seul le createur de la ligue peut ajouter un match",
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
      `INSERT INTO MatchSport (sport_id, createur_id, ligue_id, titre, date_heure, localisation, nb_joueurs_max, nb_equipe_a, nb_equipe_b, nb_remplacants, nom_equipe_a, nom_equipe_b, prive, code_acces)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const [rows] = await db.execute(
      `SELECT ms.*, s.nom AS sport, u.pseudo AS createur,
              l.createur_id AS ligue_createur_id
       FROM MatchSport ms
       JOIN Sport s       ON s.id = ms.sport_id
       JOIN Utilisateur u ON u.id = ms.createur_id
       LEFT JOIN Ligue l  ON l.id = ms.ligue_id
       WHERE ms.id = ?`,
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Match introuvable" });

    const [participants] = await db.execute(
      `SELECT u.id, u.pseudo, pm.equipe, pm.statut
       FROM ParticipationMatch pm
       JOIN Utilisateur u ON u.id = pm.utilisateur_id
       WHERE pm.match_id = ?`,
      [req.params.id],
    );

    const match = rows[0];
    const canJoin = await canJoinMatch(db, match, req.user.id);
    res.json({
      ...match,
      can_manage: canManageMatch(match, req.user.id),
      can_join: canJoin,
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
    const match = await getMatchAuthorizationContext(db, req.params.id);
    if (!match) return res.status(404).json({ message: "Match introuvable" });
    if (!canManageMatch(match, req.user.id))
      return res.status(403).json({ message: "Interdit" });

    const {
      titre,
      date_heure,
      localisation,
      nom_equipe_a,
      nom_equipe_b,
      nb_equipe_a,
      nb_equipe_b,
      nb_remplacants,
    } = req.body;

    await db.execute(
      `UPDATE MatchSport SET titre=?, date_heure=?, localisation=?, nom_equipe_a=?, nom_equipe_b=?, nb_equipe_a=?, nb_equipe_b=?, nb_remplacants=?, nb_joueurs_max=? WHERE id=?`,
      [
        titre,
        date_heure,
        localisation,
        nom_equipe_a,
        nom_equipe_b,
        nb_equipe_a,
        nb_equipe_b,
        nb_remplacants,
        nb_equipe_a + nb_equipe_b + nb_remplacants,
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

// POST /api/matchs/:id/resultat – créateur enregistre le score final
exports.enregistrerResultat = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
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

    if (scoreA === scoreB) {
      return res
        .status(400)
        .json({ message: "Un vainqueur doit être déterminé" });
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

    if (match.createur_id !== req.user.id) {
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

    const winnerTeam = scoreA > scoreB ? "A" : "B";
    const loserTeam = winnerTeam === "A" ? "B" : "A";

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

    if (winnerParticipant && loserParticipant) {
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

    const winningIds = [
      ...new Set(winningParticipants.map((item) => item.utilisateur_id)),
    ];
    const losingIds = [
      ...new Set(losingParticipants.map((item) => item.utilisateur_id)),
    ];

    for (const utilisateurId of winningIds) {
      await connection.execute(
        `UPDATE UtilisateurSport
         SET victoires = victoires + 1
         WHERE utilisateur_id = ? AND sport_id = ?`,
        [utilisateurId, match.sport_id],
      );
    }

    for (const utilisateurId of losingIds) {
      await connection.execute(
        `UPDATE UtilisateurSport
         SET defaites = defaites + 1
         WHERE utilisateur_id = ? AND sport_id = ?`,
        [utilisateurId, match.sport_id],
      );
    }

    await connection.execute(
      `UPDATE MatchSport
       SET score_equipe_a = ?,
           score_equipe_b = ?,
           vainqueur_equipe = ?,
           statut = 'termine'
       WHERE id = ?`,
      [scoreA, scoreB, winnerTeam, match.id],
    );

    await applyLeagueStandingUpdate(connection, match, winnerTeam, loserTeam);

    await connection.commit();
    return res.json({
      message: "Résultat enregistré",
      score_equipe_a: scoreA,
      score_equipe_b: scoreB,
      vainqueur_equipe: winnerTeam,
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
