const { getPool } = require("../config/db");

let schemaReadyPromise = null;
let roleColumnCache = null;

async function ensureEquipeSchema(db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = Promise.all([
      db.execute(`
      CREATE TABLE IF NOT EXISTS EquipeMembre (
        equipe_id INT UNSIGNED NOT NULL,
        utilisateur_id INT UNSIGNED NOT NULL UNIQUE,
        role ENUM('capitaine','joueur') NOT NULL DEFAULT 'joueur',
        rejoint_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (equipe_id, utilisateur_id),
        CONSTRAINT fk_em_equipe FOREIGN KEY (equipe_id)
          REFERENCES EquipeEsport(id) ON DELETE CASCADE,
        CONSTRAINT fk_em_utilisateur FOREIGN KEY (utilisateur_id)
          REFERENCES Utilisateur(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `),
      db.execute(`
      CREATE TABLE IF NOT EXISTS EquipeDemande (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        equipe_id INT UNSIGNED NOT NULL,
        utilisateur_id INT UNSIGNED NOT NULL,
        statut ENUM('en_attente','acceptee','refusee') NOT NULL DEFAULT 'en_attente',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_at DATETIME NULL,
        UNIQUE KEY uq_equipe_demande_unique (equipe_id, utilisateur_id),
        KEY idx_equipe_demande_statut (statut),
        CONSTRAINT fk_ed_equipe FOREIGN KEY (equipe_id)
          REFERENCES EquipeEsport(id) ON DELETE CASCADE,
        CONSTRAINT fk_ed_utilisateur FOREIGN KEY (utilisateur_id)
          REFERENCES Utilisateur(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `),
    ]);
  }

  await schemaReadyPromise;
}

async function getMyTeamId(db, userId) {
  const [rows] = await db.execute(
    `SELECT equipe_id
     FROM EquipeMembre
     WHERE utilisateur_id = ?
     LIMIT 1`,
    [userId],
  );
  return rows.length > 0 ? Number(rows[0].equipe_id) : null;
}

async function hasRoleColumn(db) {
  if (roleColumnCache !== null) {
    return roleColumnCache;
  }

  const [rows] = await db.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'EquipeMembre'
       AND COLUMN_NAME = 'role'
     LIMIT 1`,
  );

  roleColumnCache = rows.length > 0;
  return roleColumnCache;
}

async function addTeamMember(db, equipeId, userId, role = "joueur") {
  const withRole = await hasRoleColumn(db);

  if (withRole) {
    await db.execute(
      `INSERT INTO EquipeMembre (equipe_id, utilisateur_id, role)
       VALUES (?, ?, ?)`,
      [equipeId, userId, role],
    );
    return;
  }

  await db.execute(
    `INSERT INTO EquipeMembre (equipe_id, utilisateur_id)
     VALUES (?, ?)`,
    [equipeId, userId],
  );
}

// GET /api/equipes/mon-equipe
exports.getMonEquipeLobby = async (req, res) => {
  try {
    const db = getPool();
    await ensureEquipeSchema(db);

    const userId = Number(req.user.id);
    const myTeamId = await getMyTeamId(db, userId);
    if (!myTeamId) {
      return res.status(404).json({ message: "Aucune equipe rejointe" });
    }

    const [teamRows] = await db.execute(
      `SELECT e.id, e.nom, e.logo_url, e.capitaine_id,
              u.pseudo AS capitaine
       FROM EquipeEsport e
       JOIN Utilisateur u ON u.id = e.capitaine_id
       WHERE e.id = ?
       LIMIT 1`,
      [myTeamId],
    );

    if (teamRows.length === 0) {
      return res.status(404).json({ message: "Equipe introuvable" });
    }

    const withRole = await hasRoleColumn(db);
    const roleField = withRole
      ? "em.role"
      : "CASE WHEN e.capitaine_id = u.id THEN 'capitaine' ELSE 'joueur' END";

    const [members] = await db.execute(
      `SELECT u.id, u.pseudo, u.localisation, u.avatar_url,
              ${roleField} AS role
       FROM EquipeMembre em
       JOIN Utilisateur u ON u.id = em.utilisateur_id
       JOIN EquipeEsport e ON e.id = em.equipe_id
       WHERE em.equipe_id = ?
       ORDER BY (e.capitaine_id = u.id) DESC, u.pseudo ASC`,
      [myTeamId],
    );

    const memberIds = members.map((m) => Number(m.id));
    if (memberIds.length === 0) {
      return res.json({
        equipe: teamRows[0],
        membres: [],
      });
    }

    const placeholders = memberIds.map(() => "?").join(",");
    const [sportRows] = await db.execute(
      `SELECT us.utilisateur_id,
              s.id AS sport_id,
              s.nom AS sport,
              us.elo,
              us.victoires,
              us.defaites
       FROM UtilisateurSport us
       JOIN Sport s ON s.id = us.sport_id
       WHERE us.utilisateur_id IN (${placeholders})
       ORDER BY s.nom ASC`,
      memberIds,
    );

    const [esportRows] = await db.execute(
      `SELECT uj.utilisateur_id,
              j.id AS jeu_id,
              j.nom AS jeu,
              uj.elo,
              uj.victoires,
              uj.defaites
       FROM UtilisateurJeu uj
       JOIN JeuEsport j ON j.id = uj.jeu_id
       WHERE uj.utilisateur_id IN (${placeholders})
       ORDER BY j.nom ASC`,
      memberIds,
    );

    const byMember = new Map();
    for (const m of members) {
      byMember.set(Number(m.id), {
        ...m,
        sports: [],
        esports: [],
      });
    }

    for (const s of sportRows) {
      const member = byMember.get(Number(s.utilisateur_id));
      if (member) {
        member.sports.push(s);
      }
    }

    for (const e of esportRows) {
      const member = byMember.get(Number(e.utilisateur_id));
      if (member) {
        member.esports.push(e);
      }
    }

    res.json({
      equipe: teamRows[0],
      membres: Array.from(byMember.values()),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/equipes?nom=
exports.getEquipes = async (req, res) => {
  try {
    const db = getPool();
    await ensureEquipeSchema(db);

    const userId = Number(req.user.id);
    const nom = (req.query.nom || "").trim();
    const myTeamId = await getMyTeamId(db, userId);

    const likeNom = `%${nom}%`;
    const [rows] = await db.execute(
      `SELECT e.id, e.nom, e.logo_url, e.capitaine_id,
              u.pseudo AS capitaine,
              COUNT(em.utilisateur_id) AS nb_membres,
              d.id AS demande_id,
              d.statut AS demande_statut
       FROM EquipeEsport e
       JOIN Utilisateur u ON u.id = e.capitaine_id
       LEFT JOIN EquipeMembre em ON em.equipe_id = e.id
       LEFT JOIN EquipeDemande d
         ON d.equipe_id = e.id AND d.utilisateur_id = ?
       WHERE (? = '' OR e.nom LIKE ?)
       GROUP BY e.id, e.nom, e.logo_url, e.capitaine_id, u.pseudo, d.id, d.statut
       ORDER BY e.id DESC`,
      [userId, nom, likeNom],
    );

    const mapped = rows.map((team) => {
      const teamId = Number(team.id);
      const isCaptain = Number(team.capitaine_id) === userId;
      const isMyTeam = myTeamId !== null && teamId === myTeamId;
      const requestStatus = team.demande_statut || null;
      const alreadyInOtherTeam = myTeamId !== null && !isMyTeam;

      let canRequest = false;
      if (!isCaptain && !isMyTeam && !alreadyInOtherTeam && !requestStatus) {
        canRequest = true;
      }

      return {
        ...team,
        nb_membres: Number(team.nb_membres || 0),
        is_captain: isCaptain,
        is_my_team: isMyTeam,
        my_team_id: myTeamId,
        can_request: canRequest,
      };
    });

    res.json({
      my_team_id: myTeamId,
      equipes: mapped,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/equipes
exports.createEquipe = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureEquipeSchema(connection);
    await connection.beginTransaction();

    const userId = Number(req.user.id);
    const nom = (req.body.nom || "").trim();
    const logoUrl = (req.body.logo_url || "").trim() || null;

    if (nom.length < 2) {
      return res
        .status(400)
        .json({
          message: "Le nom de l'equipe doit faire au moins 2 caracteres",
        });
    }

    const myTeamId = await getMyTeamId(connection, userId);
    if (myTeamId !== null) {
      await connection.rollback();
      return res.status(409).json({
        message:
          "Tu fais deja partie d'une equipe, quitte-la avant d'en creer une autre",
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO EquipeEsport (nom, capitaine_id, logo_url)
       VALUES (?, ?, ?)`,
      [nom, userId, logoUrl],
    );

    await addTeamMember(connection, result.insertId, userId, "capitaine");
    await connection.commit();

    res.status(201).json({
      message: "Equipe creee",
      id: result.insertId,
    });
  } catch (err) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Nom d'equipe deja utilise" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// POST /api/equipes/:id/demande
exports.demanderRejoindre = async (req, res) => {
  try {
    const db = getPool();
    await ensureEquipeSchema(db);

    const equipeId = Number(req.params.id);
    const userId = Number(req.user.id);

    if (!Number.isInteger(equipeId) || equipeId <= 0) {
      return res.status(400).json({ message: "Equipe invalide" });
    }

    const [teamRows] = await db.execute(
      `SELECT id, capitaine_id
       FROM EquipeEsport
       WHERE id = ?
       LIMIT 1`,
      [equipeId],
    );

    if (teamRows.length === 0) {
      return res.status(404).json({ message: "Equipe introuvable" });
    }

    if (Number(teamRows[0].capitaine_id) === userId) {
      return res
        .status(400)
        .json({ message: "Tu es deja le createur de cette equipe" });
    }

    const myTeamId = await getMyTeamId(db, userId);
    if (myTeamId !== null) {
      return res
        .status(409)
        .json({ message: "Tu fais deja partie d'une equipe" });
    }

    const [existingRequests] = await db.execute(
      `SELECT id, statut
       FROM EquipeDemande
       WHERE equipe_id = ? AND utilisateur_id = ?
       LIMIT 1`,
      [equipeId, userId],
    );

    if (existingRequests.length > 0) {
      const statut = existingRequests[0].statut;
      if (statut === "refusee") {
        return res.status(403).json({
          message:
            "Demande deja refusee pour cette equipe, tu ne peux pas retenter",
        });
      }
      if (statut === "en_attente") {
        return res.status(409).json({ message: "Demande deja en attente" });
      }
      return res
        .status(409)
        .json({ message: "Demande deja traitee pour cette equipe" });
    }

    await db.execute(
      `INSERT INTO EquipeDemande (equipe_id, utilisateur_id, statut)
       VALUES (?, ?, 'en_attente')`,
      [equipeId, userId],
    );

    res.status(201).json({ message: "Demande envoyee au createur" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/equipes/demandes/recues
exports.getDemandesRecues = async (req, res) => {
  try {
    const db = getPool();
    await ensureEquipeSchema(db);

    const userId = Number(req.user.id);
    const [rows] = await db.execute(
      `SELECT d.id, d.equipe_id, d.utilisateur_id, d.statut, d.created_at,
              e.nom AS equipe_nom,
              u.pseudo AS demandeur_pseudo,
              u.localisation AS demandeur_localisation
       FROM EquipeDemande d
       JOIN EquipeEsport e ON e.id = d.equipe_id
       JOIN Utilisateur u ON u.id = d.utilisateur_id
       WHERE e.capitaine_id = ?
         AND d.statut = 'en_attente'
       ORDER BY d.created_at DESC`,
      [userId],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/equipes/demandes/:id/accepter
exports.accepterDemande = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureEquipeSchema(connection);

    const demandeId = Number(req.params.id);
    const userId = Number(req.user.id);

    if (!Number.isInteger(demandeId) || demandeId <= 0) {
      return res.status(400).json({ message: "Demande invalide" });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT d.id, d.equipe_id, d.utilisateur_id, d.statut,
              e.capitaine_id, e.nom AS equipe_nom
       FROM EquipeDemande d
       JOIN EquipeEsport e ON e.id = d.equipe_id
       WHERE d.id = ?
       FOR UPDATE`,
      [demandeId],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Demande introuvable" });
    }

    const demande = rows[0];
    if (Number(demande.capitaine_id) !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: "Interdit" });
    }

    if (demande.statut !== "en_attente") {
      await connection.rollback();
      return res.status(409).json({ message: "Demande deja traitee" });
    }

    const [alreadyTeam] = await connection.execute(
      `SELECT equipe_id
       FROM EquipeMembre
       WHERE utilisateur_id = ?
       LIMIT 1`,
      [demande.utilisateur_id],
    );

    if (alreadyTeam.length > 0) {
      await connection.execute(
        `UPDATE EquipeDemande
         SET statut = 'refusee', decided_at = NOW()
         WHERE id = ?`,
        [demandeId],
      );
      await connection.commit();
      return res.status(409).json({
        message:
          "Le joueur est deja dans une autre equipe, la demande a ete refusee",
      });
    }

    await addTeamMember(
      connection,
      demande.equipe_id,
      demande.utilisateur_id,
      "joueur",
    );

    await connection.execute(
      `UPDATE EquipeDemande
       SET statut = 'acceptee', decided_at = NOW()
       WHERE id = ?`,
      [demandeId],
    );

    await connection.commit();
    res.json({ message: `Demande acceptee pour ${demande.equipe_nom}` });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// POST /api/equipes/demandes/:id/refuser
exports.refuserDemande = async (req, res) => {
  try {
    const db = getPool();
    await ensureEquipeSchema(db);

    const demandeId = Number(req.params.id);
    const userId = Number(req.user.id);

    if (!Number.isInteger(demandeId) || demandeId <= 0) {
      return res.status(400).json({ message: "Demande invalide" });
    }

    const [rows] = await db.execute(
      `SELECT d.id, d.statut, e.capitaine_id
       FROM EquipeDemande d
       JOIN EquipeEsport e ON e.id = d.equipe_id
       WHERE d.id = ?
       LIMIT 1`,
      [demandeId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Demande introuvable" });
    }

    if (Number(rows[0].capitaine_id) !== userId) {
      return res.status(403).json({ message: "Interdit" });
    }

    if (rows[0].statut !== "en_attente") {
      return res.status(409).json({ message: "Demande deja traitee" });
    }

    await db.execute(
      `UPDATE EquipeDemande
       SET statut = 'refusee', decided_at = NOW()
       WHERE id = ?`,
      [demandeId],
    );

    res.json({ message: "Demande refusee" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
