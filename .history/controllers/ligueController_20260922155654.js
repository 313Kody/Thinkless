const { getPool } = require("../config/db");
const crypto = require("crypto");

let staffColumnReady = null;
let pouleColumnReady = null;
let eventConfigReady = null;
let leagueTeamMembershipReady = null;

async function ensureStaffColumn(db) {
  if (!staffColumnReady) {
    staffColumnReady = (async () => {
      const [columns] = await db.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'LigueUtilisateur'
           AND COLUMN_NAME IN ('est_staff', 'role_ligue')`,
      );

      const columnNames = columns.map((column) => column.COLUMN_NAME);
      if (!columnNames.includes("est_staff")) {
        await db.execute(
          `ALTER TABLE LigueUtilisateur
           ADD COLUMN est_staff TINYINT(1) NOT NULL DEFAULT 0`,
        );
      }
      if (!columnNames.includes("role_ligue")) {
        await db.execute(
          `ALTER TABLE LigueUtilisateur
           ADD COLUMN role_ligue ENUM('joueur','admin','arbitre','speaker','dj','table_marque')
           NOT NULL DEFAULT 'joueur'`,
        );
      }
    })();
  }

  await staffColumnReady;
}

async function ensurePouleColumn(db) {
  if (!pouleColumnReady) {
    pouleColumnReady = (async () => {
      const [columns] = await db.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'LigueEquipe'
           AND COLUMN_NAME = 'poule'
         LIMIT 1`,
      );

      if (columns.length === 0) {
        await db.execute(
          `ALTER TABLE LigueEquipe ADD COLUMN poule VARCHAR(10) NULL`,
        );
      }
    })();
  }

  await pouleColumnReady;
}

async function ensureEventConfig(db) {
  if (!eventConfigReady) {
    eventConfigReady = (async () => {
      const fields = [
        ["lieu", "VARCHAR(255) NULL"],
        ["date_debut", "DATETIME NULL"],
        ["nb_terrains", "INT UNSIGNED NOT NULL DEFAULT 1"],
        ["terrains", "TEXT NULL"],
      ];
      const [columns] = await db.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Ligue'`,
      );
      const existing = new Set(columns.map((column) => column.COLUMN_NAME));
      for (const [name, definition] of fields) {
        if (!existing.has(name)) {
          await db.execute(
            `ALTER TABLE Ligue ADD COLUMN ${name} ${definition}`,
          );
        }
      }
    })();
  }
  await eventConfigReady;
}

async function ensureLeagueTeamMembership(db) {
  if (!leagueTeamMembershipReady) {
    leagueTeamMembershipReady = (async () => {
      const [columns] = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'LigueEquipe'
           AND COLUMN_NAME = 'capitaine_id' LIMIT 1`,
      );
      if (!columns.length) {
        await db.execute(
          "ALTER TABLE LigueEquipe ADD COLUMN capitaine_id INT UNSIGNED NULL",
        );
      }
      await db.execute(`
        CREATE TABLE IF NOT EXISTS LigueEquipeDemande (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          ligue_id INT UNSIGNED NOT NULL,
          equipe_id INT UNSIGNED NOT NULL,
          utilisateur_id INT UNSIGNED NOT NULL,
          statut ENUM('en_attente','acceptee','refusee') NOT NULL DEFAULT 'en_attente',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          decided_at DATETIME NULL,
          UNIQUE KEY uq_ligue_equipe_demande (equipe_id, utilisateur_id),
          FOREIGN KEY (ligue_id) REFERENCES Ligue(id) ON DELETE CASCADE,
          FOREIGN KEY (equipe_id) REFERENCES LigueEquipe(id) ON DELETE CASCADE,
          FOREIGN KEY (utilisateur_id) REFERENCES Utilisateur(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    })();
  }
  await leagueTeamMembershipReady;
}

async function getLeagueAccess(db, ligueId, userId) {
  const [rows] = await db.execute(
    `SELECT l.id, l.publique, l.createur_id, l.createur_joueur,
            lu.utilisateur_id, lu.est_staff
     FROM Ligue l
     LEFT JOIN LigueUtilisateur lu
       ON lu.ligue_id = l.id AND lu.utilisateur_id = ?
     WHERE l.id = ?
     LIMIT 1`,
    [userId, ligueId],
  );

  if (rows.length === 0) return null;

  const league = rows[0];
  const isCreator = Number(league.createur_id) === Number(userId);
  const isMember = league.utilisateur_id !== null || isCreator;
  const isStaff = Number(league.est_staff) === 1;

  return {
    ...league,
    isCreator,
    isMember,
    isStaff,
    canManage: isCreator || isStaff,
  };
}

function isOrganizationMember(member, ligue) {
  return (
    Number(member.est_staff) === 1 ||
    member.role_ligue !== "joueur" ||
    (Number(member.id) === Number(ligue.createur_id) &&
      Number(ligue.createur_joueur) === 0)
  );
}

function getTerrainName(serializedTerrains, terrainId) {
  try {
    const terrains = JSON.parse(serializedTerrains || "[]");
    return Array.isArray(terrains)
      ? terrains[terrainId - 1] || String(terrainId)
      : String(terrainId);
  } catch (_error) {
    return String(terrainId);
  }
}

function shuffleTeams(teams) {
  const shuffled = [...teams];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]];
  }
  return shuffled;
}

async function assignRandomPoules(connection, ligueId, nombrePoules = 2) {
  const [equipes] = await connection.execute(
    "SELECT id, nom FROM LigueEquipe WHERE ligue_id = ? ORDER BY id ASC",
    [ligueId],
  );
  if (equipes.length < 2) {
    throw new Error("Au moins deux équipes sont nécessaires");
  }
  if (nombrePoules !== 2) {
    throw new Error("La génération actuelle supporte deux poules");
  }

  const shuffled = shuffleTeams(equipes);
  const taillePouleA = Math.ceil(shuffled.length / 2);
  for (const [index, equipe] of shuffled.entries()) {
    await connection.execute(
      "UPDATE LigueEquipe SET poule = ? WHERE id = ? AND ligue_id = ?",
      [index < taillePouleA ? "A" : "B", equipe.id, ligueId],
    );
  }

  return {
    A: shuffled.slice(0, taillePouleA),
    B: shuffled.slice(taillePouleA),
  };
}

// GET /api/ligues
exports.getLigues = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    await ensureEventConfig(db);
    const { nom } = req.query;

    let sql = `SELECT l.*, s.nom AS sport, u.pseudo AS createur,
              CASE WHEN mylu.utilisateur_id IS NULL THEN 0 ELSE 1 END AS suis,
              mylu.est_staff AS est_staff,
              COUNT(lu.utilisateur_id) AS nb_membres
       FROM Ligue l
       JOIN Sport s        ON s.id = l.sport_id
       JOIN Utilisateur u  ON u.id = l.createur_id
       LEFT JOIN LigueUtilisateur lu ON lu.ligue_id = l.id
       LEFT JOIN LigueUtilisateur mylu
         ON mylu.ligue_id = l.id AND mylu.utilisateur_id = ?
       WHERE (l.publique = 1 OR mylu.utilisateur_id IS NOT NULL)`;

    const params = [req.user.id];
    if (nom) {
      sql += ` AND l.nom LIKE ?`;
      params.push(`%${nom}%`);
    }

    sql += ` GROUP BY l.id, mylu.utilisateur_id ORDER BY l.id DESC`;

    const [rows] = await db.execute(sql, params);
    res.json(
      rows.map((ligue) => {
        const isMember = Number(ligue.suis) === 1;
        return {
          ...ligue,
          code_joueur: isMember ? ligue.code_acces : null,
          code_acces: isMember ? ligue.code_acces : null,
          code_staff:
            Number(ligue.createur_id) === Number(req.user.id) ||
            Number(ligue.est_staff) === 1
              ? ligue.code_staff
              : null,
        };
      }),
    );
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues
exports.createLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const {
      sport_id,
      nom,
      description,
      publique,
      nb_equipe,
      slots_par_equipe,
      equipes,
      type_evenement = "unique",
      a_poules = true,
      nb_poules = 2,
      pts_victoire = 3,
      pts_nul = 1,
      pts_defaite = 0,
      createur_joueur = true,
      lieu,
      date_debut,
      nb_terrains = 1,
      terrains,
    } = req.body;

    if (!sport_id || !nom) {
      return res.status(400).json({ message: "sport_id et nom requis" });
    }

    if (!["unique", "differe"].includes(type_evenement)) {
      return res.status(400).json({ message: "type_evenement invalide" });
    }

    const numericValues = {
      nb_poules,
      pts_victoire,
      pts_nul,
      pts_defaite,
    };
    for (const [field, value] of Object.entries(numericValues)) {
      if (!Number.isInteger(Number(value)) || Number(value) < 0) {
        return res.status(400).json({ message: `${field} invalide` });
      }
    }

    if (Number(nb_poules) < 1 || Number(nb_poules) > 8) {
      return res
        .status(400)
        .json({ message: "nb_poules doit être compris entre 1 et 8" });
    }

    const terrainCount = Number(nb_terrains);
    if (
      !Number.isInteger(terrainCount) ||
      terrainCount < 1 ||
      terrainCount > 50
    ) {
      return res.status(400).json({ message: "Nombre de terrains invalide" });
    }
    if (
      type_evenement === "unique" &&
      (!String(lieu || "").trim() || !date_debut)
    ) {
      return res.status(400).json({
        message:
          "Le lieu et la date de début sont obligatoires pour un événement unique",
      });
    }

    // Récupérer le sport pour vérifier s'il est solo
    const [sportRows] = await db.execute(`SELECT nom FROM Sport WHERE id = ?`, [
      sport_id,
    ]);
    if (sportRows.length === 0) {
      return res.status(400).json({ message: "Sport non trouvé" });
    }

    const sportNom = sportRows[0].nom
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const soloSports = new Set(["tennis", "badminton", "padel"]);
    const isSoloSport = soloSports.has(sportNom);

    // Pour les sports solo, forcer nb_equipe = 1 (pas d'équipes)
    const finalNbEquipe = isSoloSport ? 1 : Number(nb_equipe) || 2;
    const finalSlotsPar = isSoloSport ? 1 : Number(slots_par_equipe) || 5;

    // Générer code d'accès pour ligues privées
    let code_acces = null;
    if (!publique) {
      code_acces = Math.random().toString(36).substring(2, 10).toUpperCase();
    }
    const code_staff = crypto.randomBytes(4).toString("hex").toUpperCase();

    const [result] = await db.execute(
      `INSERT INTO Ligue (
        sport_id, createur_id, nom, description, publique,
        nb_equipe, slots_par_equipe, code_acces, code_staff,
        type_evenement, a_poules, nb_poules,
        pts_victoire, pts_nul, pts_defaite, createur_joueur,
        lieu, date_debut, nb_terrains, terrains
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sport_id,
        req.user.id,
        nom,
        description || null,
        publique ? 1 : 0,
        finalNbEquipe,
        finalSlotsPar,
        code_acces,
        code_staff,
        type_evenement,
        Boolean(a_poules) ? 1 : 0,
        Number(nb_poules),
        Number(pts_victoire),
        Number(pts_nul),
        Number(pts_defaite),
        Boolean(createur_joueur) ? 1 : 0,
        String(lieu || "").trim() || null,
        date_debut || null,
        terrainCount,
        Array.isArray(terrains)
          ? JSON.stringify(terrains)
          : String(terrains || "").trim() || null,
      ],
    );

    // Le créateur rejoint automatiquement sa ligue (sans équipe si privée)
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id, est_staff, role_ligue)
       VALUES (?, ?, 0, ?)`,
      [result.insertId, req.user.id, createur_joueur ? "joueur" : "admin"],
    );

    // Créer les équipes si la ligue est privée, NON-solo et des équipes sont fournies
    if (
      !publique &&
      !isSoloSport &&
      Array.isArray(equipes) &&
      equipes.length > 0
    ) {
      for (const nomEquipe of equipes) {
        await db.execute(
          `INSERT INTO LigueEquipe (ligue_id, nom) VALUES (?, ?)`,
          [result.insertId, nomEquipe],
        );
      }
    }

    const response = { message: "Ligue créée", id: result.insertId };
    if (code_acces) response.code_acces = code_acces;
    response.code_staff = code_staff;

    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/rejoindre
exports.rejoindre = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const access = await getLeagueAccess(db, req.params.id, req.user.id);
    if (!access) {
      return res.status(404).json({ message: "Ligue introuvable" });
    }
    if (!access.publique) {
      return res.status(403).json({
        message:
          "Cette ligue privée se rejoint uniquement avec son code joueur",
      });
    }
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id, est_staff, role_ligue)
       VALUES (?, ?, 0, 'joueur')`,
      [req.params.id, req.user.id],
    );
    res.json({ message: "Ligue rejointe !" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Déjà membre" });
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/rejoindre-code
exports.rejoindreAvecCode = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const code = String(req.body.code_acces || req.body.code_staff || "")
      .trim()
      .toUpperCase();

    if (!code) {
      return res.status(400).json({ message: "Code requis" });
    }

    const [rows] = await db.execute(
      `SELECT *,
              CASE WHEN code_staff = ? THEN 1 ELSE 0 END AS rejoindre_staff
       FROM Ligue
       WHERE (code_acces = ? OR code_staff = ?) AND publique = 0`,
      [code, code, code],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Code invalide ou ligue introuvable" });
    }

    const ligue = rows[0];

    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id, est_staff, role_ligue)
       VALUES (?, ?, ?, ?)`,
      [
        ligue.id,
        req.user.id,
        ligue.rejoindre_staff ? 1 : 0,
        ligue.rejoindre_staff ? "admin" : "joueur",
      ],
    );

    res.json({
      message: ligue.rejoindre_staff
        ? "Ligue rejointe en tant que staff !"
        : "Ligue rejointe !",
      ligue_id: ligue.id,
      est_staff: Boolean(ligue.rejoindre_staff),
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Déjà membre" });
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id/equipes – récupère les équipes pré-créées d'une ligue
exports.getEquipes = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    await ensurePouleColumn(db);
    await ensureLeagueTeamMembership(db);
    const access = await getLeagueAccess(db, req.params.id, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.publique && !access.isMember) {
      return res.status(403).json({ message: "Accès réservé aux membres" });
    }
    const [rows] = await db.execute(
      `SELECT le.id, le.nom, le.poule, le.created_at,
              COUNT(DISTINCT lu.utilisateur_id) AS nb_joueurs,
              capitaine.pseudo AS capitaine_pseudo,
              MAX(CASE WHEN lu.utilisateur_id = ? THEN 1 ELSE 0 END) AS est_mon_equipe
       FROM LigueEquipe le
       LEFT JOIN LigueUtilisateur lu
         ON lu.ligue_id = le.ligue_id AND lu.equipe_id = le.id AND lu.est_staff = 0
      LEFT JOIN Utilisateur capitaine ON capitaine.id = le.capitaine_id
      WHERE le.ligue_id = ?
      GROUP BY le.id, le.nom, le.poule, le.created_at, capitaine.pseudo
       ORDER BY le.poule ASC, le.id ASC`,
      [req.user.id, req.params.id],
    );
    res.json({
      equipes: rows,
      equipe_id: access.isMember ? await getUserLeagueTeamId(db, req.params.id, req.user.id) : null,
      can_choose:
        access.isMember &&
        !access.isStaff &&
        !(access.isCreator && Number(access.createur_joueur) === 0),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id/equipes/:equipeId
exports.getEquipeLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    await ensureLeagueTeamMembership(db);
    const ligueId = Number(req.params.id);
    const equipeId = Number(req.params.equipeId);
    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });

    const [teams] = await db.execute(
      `SELECT le.id, le.nom, le.poule, le.capitaine_id,
              cap.pseudo AS capitaine_pseudo
       FROM LigueEquipe le
       LEFT JOIN Utilisateur cap ON cap.id = le.capitaine_id
       WHERE le.id = ? AND le.ligue_id = ? LIMIT 1`,
      [equipeId, ligueId],
    );
    if (!teams.length) return res.status(404).json({ message: "Équipe introuvable" });

    const [joueurs] = await db.execute(
      `SELECT u.id, u.nom, u.prenom, u.pseudo,
              lu.statut, (u.id = le.capitaine_id) AS est_capitaine
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       JOIN LigueEquipe le ON le.id = lu.equipe_id
       WHERE lu.ligue_id = ? AND lu.equipe_id = ? AND lu.est_staff = 0
       ORDER BY est_capitaine DESC, u.pseudo ASC`,
      [ligueId, equipeId],
    );
    const [demandes] = access.canManage || Number(teams[0].capitaine_id) === Number(req.user.id)
      ? await db.execute(
          `SELECT d.id, d.utilisateur_id, d.statut, u.nom, u.prenom, u.pseudo
           FROM LigueEquipeDemande d
           JOIN Utilisateur u ON u.id = d.utilisateur_id
           WHERE d.ligue_id = ? AND d.equipe_id = ? AND d.statut = 'en_attente'
           ORDER BY d.created_at ASC`,
          [ligueId, equipeId],
        )
      : [[]];
    const currentTeamId = await getUserLeagueTeamId(db, ligueId, req.user.id);
    res.json({
      equipe: { ...teams[0], est_mon_equipe: Number(currentTeamId) === equipeId },
      joueurs,
      demandes,
      can_choose:
        access.isMember &&
        !access.isStaff &&
        !(access.isCreator && Number(access.createur_joueur) === 0),
      can_manage: access.canManage || Number(teams[0].capitaine_id) === Number(req.user.id),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

async function getUserLeagueTeamId(db, ligueId, userId) {
  const [rows] = await db.execute(
    `SELECT equipe_id FROM LigueUtilisateur
     WHERE ligue_id = ? AND utilisateur_id = ? LIMIT 1`,
    [ligueId, userId],
  );
  return rows[0]?.equipe_id ? Number(rows[0].equipe_id) : null;
}

// POST /api/ligues/:id/equipes/:equipeId/rejoindre
exports.rejoindreEquipe = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    await ensureLeagueTeamMembership(db);
    const ligueId = Number(req.params.id);
    const equipeId = Number(req.params.equipeId);
    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.isMember) return res.status(403).json({ message: "Rejoins d'abord la ligue" });
    if (access.isStaff || (access.isCreator && !access.createur_joueur)) {
      return res.status(403).json({ message: "Un membre de l'organisation ne rejoint pas une équipe" });
    }

    const [teamRows] = await db.execute(
      "SELECT id FROM LigueEquipe WHERE id = ? AND ligue_id = ? LIMIT 1",
      [equipeId, ligueId],
    );
    if (!teamRows.length) return res.status(404).json({ message: "Équipe introuvable" });

    const [existing] = await db.execute(
      `SELECT 1 FROM LigueEquipeDemande
       WHERE ligue_id = ? AND equipe_id = ? AND utilisateur_id = ?
         AND statut = 'en_attente' LIMIT 1`,
      [ligueId, equipeId, req.user.id],
    );
    if (!existing.length) {
      await db.execute(
        `INSERT INTO LigueEquipeDemande (ligue_id, equipe_id, utilisateur_id)
         VALUES (?, ?, ?)`,
        [ligueId, equipeId, req.user.id],
      );
    }
    res.status(201).json({ message: "Demande envoyée au capitaine", equipe_id: equipeId });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/equipes/:equipeId/demandes/:demandeId/decision
exports.deciderDemandeEquipe = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    await ensureLeagueTeamMembership(db);
    const ligueId = Number(req.params.id);
    const equipeId = Number(req.params.equipeId);
    const demandeId = Number(req.params.demandeId);
    const decision = req.body.decision === "accepter" ? "acceptee" : "refusee";
    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    const [teamRows] = await db.execute(
      "SELECT capitaine_id FROM LigueEquipe WHERE id = ? AND ligue_id = ? LIMIT 1",
      [equipeId, ligueId],
    );
    if (!teamRows.length) return res.status(404).json({ message: "Équipe introuvable" });
    if (!access.canManage && Number(teamRows[0].capitaine_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Seul le capitaine ou un admin peut décider" });
    }
    const [requests] = await db.execute(
      `SELECT utilisateur_id FROM LigueEquipeDemande
       WHERE id = ? AND ligue_id = ? AND equipe_id = ? AND statut = 'en_attente' LIMIT 1`,
      [demandeId, ligueId, equipeId],
    );
    if (!requests.length) return res.status(404).json({ message: "Demande introuvable" });
    await db.execute(
      "UPDATE LigueEquipeDemande SET statut = ?, decided_at = NOW() WHERE id = ?",
      [decision, demandeId],
    );
    if (decision === "acceptee") {
      await db.execute(
        `UPDATE LigueUtilisateur SET equipe_id = ?, statut = 'valide'
         WHERE ligue_id = ? AND utilisateur_id = ? AND est_staff = 0`,
        [equipeId, ligueId, requests[0].utilisateur_id],
      );
    }
    res.json({ message: decision === "acceptee" ? "Joueur accepté" : "Demande refusée" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/generer-poules
exports.genererPoules = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureStaffColumn(connection);
    await ensurePouleColumn(connection);
    await ensureEventConfig(connection);
    const ligueId = Number(req.params.id);
    const access = await getLeagueAccess(connection, ligueId, req.user.id);

    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.canManage) return res.status(403).json({ message: "Interdit" });

    const [ligues] = await connection.execute(
      "SELECT a_poules, nb_poules, poules_verrouillees FROM Ligue WHERE id = ? LIMIT 1",
      [ligueId],
    );
    if (!ligues[0].a_poules) {
      return res
        .status(400)
        .json({ message: "Cette ligue n'utilise pas de poules" });
    }
    if (ligues[0].poules_verrouillees) {
      return res
        .status(409)
        .json({ message: "Les poules sont déjà verrouillées" });
    }

    const nombrePoules = Number(ligues[0].nb_poules) || 2;

    await connection.beginTransaction();
    const poules = await assignRandomPoules(connection, ligueId, nombrePoules);
    await connection.commit();

    res.json({
      message: "Poules générées",
      poules,
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// POST /api/ligues/:id/generer-calendrier
exports.genererCalendrier = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();

  try {
    await ensureStaffColumn(connection);
    await ensurePouleColumn(connection);
    const ligueId = Number(req.params.id);
    const access = await getLeagueAccess(connection, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.canManage) return res.status(403).json({ message: "Interdit" });

    const requestedStartAt = req.body.start_at;
    const durationMinutes = Number(req.body.duration_minutes) || 8;
    const rotationMinutes = Number(req.body.rotation_minutes) || 2;
    const [ligues] = await connection.execute(
      "SELECT sport_id, nom, type_evenement, lieu, date_debut, nb_terrains, terrains FROM Ligue WHERE id = ? LIMIT 1",
      [ligueId],
    );
    const startAt = new Date(
      requestedStartAt || ligues[0].date_debut || "2026-10-24T12:10:00",
    );
    const terrainCount =
      Number(req.body.terrain_count || ligues[0].nb_terrains) || 1;
    if (
      Number.isNaN(startAt.getTime()) ||
      durationMinutes <= 0 ||
      rotationMinutes < 0 ||
      terrainCount < 1
    ) {
      return res
        .status(400)
        .json({ message: "Paramètres de calendrier invalides" });
    }
    const [leagueRows] = await connection.execute(
      "SELECT a_poules, nb_poules, poules_verrouillees FROM Ligue WHERE id = ? LIMIT 1",
      [ligueId],
    );
    if (!leagueRows[0]?.a_poules) {
      return res
        .status(400)
        .json({ message: "Cette ligue n'utilise pas de poules" });
    }
    if (leagueRows[0].poules_verrouillees) {
      return res
        .status(409)
        .json({ message: "Les poules sont déjà verrouillées" });
    }

    await connection.beginTransaction();
    const [assignmentRows] = await connection.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN poule IS NULL OR poule = '' THEN 1 ELSE 0 END) AS non_affectees
       FROM LigueEquipe
       WHERE ligue_id = ?`,
      [ligueId],
    );
    const needsDraw = Number(assignmentRows[0].non_affectees || 0) > 0;
    const poules = needsDraw
      ? await assignRandomPoules(
          connection,
          ligueId,
          Number(leagueRows[0].nb_poules) || 2,
        )
      : null;
    const [equipes] = await connection.execute(
      "SELECT id, nom, poule FROM LigueEquipe WHERE ligue_id = ? AND poule IS NOT NULL ORDER BY poule, id",
      [ligueId],
    );

    const [existing] = await connection.execute(
      `SELECT nom_equipe_a, nom_equipe_b
       FROM MatchSport
       WHERE ligue_id = ? AND phase = 'poule'`,
      [ligueId],
    );
    const existingPairs = new Set(
      existing.map((match) => `${match.nom_equipe_a}::${match.nom_equipe_b}`),
    );

    const matchs = [];
    for (const poule of ["A", "B"]) {
      const teams = equipes.filter((equipe) => equipe.poule === poule);
      for (let i = 0; i < teams.length; i += 1) {
        for (let j = i + 1; j < teams.length; j += 1) {
          const pairKey = `${teams[i].nom}::${teams[j].nom}`;
          if (!existingPairs.has(pairKey)) {
            matchs.push([teams[i], teams[j], poule]);
          }
        }
      }
    }

    if (matchs.length === 0) {
      await connection.rollback();
      return res
        .status(409)
        .json({
          message: "Le calendrier des poules existe déjà",
          matchs_crees: 0,
        });
    }

    for (const [index, [equipeA, equipeB, poule]] of matchs.entries()) {
      const slot = Math.floor(index / terrainCount);
      const date = new Date(
        startAt.getTime() + slot * (durationMinutes + rotationMinutes) * 60000,
      );
      const terrainId = (index % terrainCount) + 1;
      await connection.execute(
        `INSERT INTO MatchSport (
          sport_id, createur_id, ligue_id, titre, date_heure, localisation,
          nb_joueurs_max, nb_equipe_a, nb_equipe_b, nom_equipe_a, nom_equipe_b,
          statut, prive, poule, phase, terrain_id, terrain_nom, statut_match
        ) VALUES (?, ?, ?, ?, ?, ?, 2, 1, 1, ?, ?, 'ouvert', 0, ?, 'poule', ?, ?, 'programme')`,
        [
          ligues[0].sport_id,
          req.user.id,
          ligueId,
          `${equipeA.nom} vs ${equipeB.nom}`,
          date,
          ligues[0].lieu || null,
          equipeA.nom,
          equipeB.nom,
          poule,
          terrainId,
          getTerrainName(ligues[0].terrains, terrainId),
        ],
      );
    }
    await connection.commit();

    res
      .status(201)
      .json({
        message: "Poules et calendrier générés",
        poules,
        matchs_crees: matchs.length,
      });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// POST /api/ligues/:id/verrouiller-poules
exports.verrouillerPoules = async (req, res) => {
  const db = getPool();
  try {
    await ensureStaffColumn(db);
    const ligueId = Number(req.params.id);
    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.canManage) return res.status(403).json({ message: "Interdit" });

    const [pending] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM MatchSport
       WHERE ligue_id = ? AND phase = 'poule' AND statut NOT IN ('termine', 'annule')`,
      [ligueId],
    );
    if (Number(pending[0].total) > 0) {
      return res.status(409).json({
        message: "Tous les matchs de poule doivent être terminés avant le verrouillage",
      });
    }

    await db.execute(
      "UPDATE Ligue SET poules_verrouillees = 1 WHERE id = ?",
      [ligueId],
    );
    res.json({ message: "Poules verrouillées" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/generer-phase-finale
exports.genererPhaseFinale = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await ensureStaffColumn(connection);
    const ligueId = Number(req.params.id);
    const access = await getLeagueAccess(connection, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.canManage) return res.status(403).json({ message: "Interdit" });

    const [leagueRows] = await connection.execute(
      "SELECT sport_id, lieu, poules_verrouillees FROM Ligue WHERE id = ? LIMIT 1",
      [ligueId],
    );
    if (!leagueRows[0].poules_verrouillees) {
      return res.status(409).json({ message: "Verrouillez d'abord les poules" });
    }

    const [existing] = await connection.execute(
      "SELECT COUNT(*) AS total FROM MatchSport WHERE ligue_id = ? AND phase IN ('classement','quart','demi','finale')",
      [ligueId],
    );
    if (Number(existing[0].total) > 0) {
      return res.status(409).json({ message: "La phase finale existe déjà" });
    }

    const [teams] = await connection.execute(
      "SELECT id, nom, poule FROM LigueEquipe WHERE ligue_id = ? ORDER BY poule, id",
      [ligueId],
    );
    const [matches] = await connection.execute(
      `SELECT nom_equipe_a, nom_equipe_b, score_equipe_a, score_equipe_b
       FROM MatchSport
       WHERE ligue_id = ? AND phase = 'poule' AND statut = 'termine'`,
      [ligueId],
    );
    const rankings = new Map(
      teams.map((team) => [team.nom, {
        nom: team.nom,
        poule: team.poule,
        points: 0,
        victoires: 0,
        nuls: 0,
        defaites: 0,
        difference_buts: 0,
        buts_marques: 0,
      }]),
    );

    for (const match of matches) {
      const teamA = rankings.get(match.nom_equipe_a);
      const teamB = rankings.get(match.nom_equipe_b);
      if (!teamA || !teamB) continue;

      const scoreA = Number(match.score_equipe_a);
      const scoreB = Number(match.score_equipe_b);
      teamA.buts_marques += scoreA;
      teamB.buts_marques += scoreB;
      teamA.difference_buts += scoreA - scoreB;
      teamB.difference_buts += scoreB - scoreA;

      if (scoreA === scoreB) {
        teamA.points += 1;
        teamB.points += 1;
        teamA.nuls += 1;
        teamB.nuls += 1;
      } else if (scoreA > scoreB) {
        teamA.points += 3;
        teamA.victoires += 1;
        teamB.defaites += 1;
      } else {
        teamB.points += 3;
        teamB.victoires += 1;
        teamA.defaites += 1;
      }
    }

    const sortRanking = (poule) => [...rankings.values()]
      .filter((team) => team.poule === poule)
      .sort((a, b) =>
        b.victoires - a.victoires ||
        b.nuls - a.nuls ||
        a.defaites - b.defaites ||
        b.difference_buts - a.difference_buts ||
        b.buts_marques - a.buts_marques ||
        a.nom.localeCompare(b.nom),
      );

    const poolA = sortRanking("A");
    const poolB = sortRanking("B");
    if (poolA.length < 5 || poolB.length < 4) {
      return res.status(400).json({
        message: "Chaque poule doit être complète avant la phase finale",
      });
    }

    const qualifiedMatches = [
      [poolA[4].nom, poolB[3].nom, "classement"],
      [poolA[0].nom, poolB[3].nom, "quart"],
      [poolB[1].nom, poolA[2].nom, "quart"],
      [poolB[0].nom, poolA[3].nom, "quart"],
      [poolA[1].nom, poolB[2].nom, "quart"],
    ];

    await connection.beginTransaction();
    for (const [nomA, nomB, phase] of qualifiedMatches) {
      await connection.execute(
        `INSERT INTO MatchSport (
          sport_id, createur_id, ligue_id, titre, date_heure, localisation,
          nb_joueurs_max, nb_equipe_a, nb_equipe_b, nom_equipe_a, nom_equipe_b,
          statut, prive, phase, statut_match
        ) VALUES (?, ?, ?, ?, NOW(), ?, 2, 1, 1, ?, ?, 'ouvert', 0, ?, 'programme')`,
        [leagueRows[0].sport_id, req.user.id, ligueId, `${nomA} vs ${nomB}`, leagueRows[0].lieu || null, nomA, nomB, phase],
      );
    }
    await connection.commit();
    res.status(201).json({
      message: "Phase finale préparée avec les équipes qualifiées",
      matchs_crees: qualifiedMatches.length,
      matchs: qualifiedMatches.map(([equipeA, equipeB, phase]) => ({
        equipe_a: equipeA,
        equipe_b: equipeB,
        phase,
      })),
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// GET /api/ligues/:id/classement
exports.classement = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const ligueId = req.params.id;
    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.publique && !access.isMember) {
      return res.status(403).json({ message: "Accès réservé aux membres" });
    }

    const [equipes] = await db.execute(
      `SELECT id FROM LigueEquipe WHERE ligue_id = ? LIMIT 1`,
      [ligueId],
    );

    // Si des équipes existent, classement par équipe. Sinon, classement par joueur.
    if (equipes.length > 0) {
      const [rulesRows] = await db.execute(
        "SELECT pts_victoire, pts_nul, pts_defaite FROM Ligue WHERE id = ?",
        [ligueId],
      );
      const rules = rulesRows[0] || {
        pts_victoire: 3,
        pts_nul: 1,
        pts_defaite: 0,
      };
      const [teamRows] = await db.execute(
        "SELECT id, nom, poule FROM LigueEquipe WHERE ligue_id = ? ORDER BY id",
        [ligueId],
      );
      const [matches] = await db.execute(
        `SELECT nom_equipe_a, nom_equipe_b, score_equipe_a, score_equipe_b
         FROM MatchSport
         WHERE ligue_id = ? AND phase = 'poule' AND statut = 'termine'`,
        [ligueId],
      );
      const stats = new Map(
        teamRows.map((team) => [
          team.nom,
          {
            pseudo: team.nom,
            poule: team.poule,
            points: 0,
            matchs_joues: 0,
            victoires: 0,
            nuls: 0,
            defaites: 0,
            buts_marques: 0,
            buts_encaisses: 0,
            difference_buts: 0,
            ranking_type: "equipe",
          },
        ]),
      );
      for (const match of matches) {
        const teamA = stats.get(match.nom_equipe_a);
        const teamB = stats.get(match.nom_equipe_b);
        if (!teamA || !teamB) continue;
        const scoreA = Number(match.score_equipe_a);
        const scoreB = Number(match.score_equipe_b);
        teamA.matchs_joues += 1;
        teamB.matchs_joues += 1;
        teamA.buts_marques += scoreA;
        teamA.buts_encaisses += scoreB;
        teamB.buts_marques += scoreB;
        teamB.buts_encaisses += scoreA;
        if (scoreA === scoreB) {
          teamA.points += Number(rules.pts_nul);
          teamB.points += Number(rules.pts_nul);
          teamA.nuls += 1;
          teamB.nuls += 1;
        } else {
          const winner = scoreA > scoreB ? teamA : teamB;
          const loser = winner === teamA ? teamB : teamA;
          winner.points += Number(rules.pts_victoire);
          loser.points += Number(rules.pts_defaite);
          winner.victoires += 1;
          loser.defaites += 1;
        }
      }
      const rows = [...stats.values()]
        .map((row) => ({
          ...row,
          difference_buts: row.buts_marques - row.buts_encaisses,
        }))
        .sort(
          (a, b) =>
            b.victoires - a.victoires ||
            b.nuls - a.nuls ||
            a.defaites - b.defaites ||
            b.difference_buts - a.difference_buts ||
            b.buts_marques - a.buts_marques ||
            a.pseudo.localeCompare(b.pseudo),
        );
      rows.forEach((row, index) => {
        row.rang = index + 1;
      });
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
    return res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id – détails d'une ligue + membres
exports.getLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const ligueId = req.params.id;
    console.log("🔍 getLigue appelé avec ID:", ligueId);

    const [ligues] = await db.execute(
      `SELECT l.*, s.nom AS sport, u.pseudo AS createur
       FROM Ligue l
       LEFT JOIN Sport s ON s.id = l.sport_id
       LEFT JOIN Utilisateur u ON u.id = l.createur_id
       WHERE l.id = ?`,
      [ligueId],
    );

    console.log("📊 Résultat requête ligue:", ligues.length, ligues);

    if (ligues.length === 0) {
      return res.status(404).json({ message: "Ligue introuvable" });
    }

    const access = await getLeagueAccess(db, ligueId, req.user.id);
    if (!access.publique && !access.isMember) {
      return res.status(403).json({ message: "Accès réservé aux membres" });
    }

    const [membres] = await db.execute(
      `SELECT u.id, u.nom, u.prenom, u.pseudo, us.elo,
                    lu.points, lu.victoires, lu.defaites, lu.est_staff,
                    le.nom AS equipe_nom,
                    le.poule AS equipe_poule,
                    CASE
                WHEN l.createur_id = u.id AND l.createur_joueur = 0 THEN 'admin'
                WHEN lu.est_staff = 1 THEN 'admin'
                ELSE lu.role_ligue
                    END AS role_ligue,
                    0 AS buts, 0 AS passes_decisives, 0 AS contributions
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       LEFT JOIN Ligue l ON l.id = lu.ligue_id
                  LEFT JOIN LigueEquipe le ON le.id = lu.equipe_id
       LEFT JOIN UtilisateurSport us
         ON us.utilisateur_id = u.id AND us.sport_id = l.sport_id
       WHERE lu.ligue_id = ?
      ORDER BY lu.points DESC`,
      [ligueId],
    );

    console.log("👥 Membres trouvés:", membres.length);

    const ligue = ligues[0];
    if (!ligue.code_staff) {
      const generatedCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      await db.execute(
        "UPDATE Ligue SET code_staff = ? WHERE id = ? AND code_staff IS NULL",
        [generatedCode, ligueId],
      );
      ligue.code_staff = generatedCode;
    }
    const isCreator = Number(ligue.createur_id) === Number(req.user.id);
    const currentMember = membres.find(
      (membre) => Number(membre.id) === Number(req.user.id),
    );
    const isStaff = Number(currentMember?.est_staff) === 1;
    const isMember = membres.some(
      (membre) => Number(membre.id) === Number(req.user.id),
    );
    if (!isCreator && !isStaff) {
      ligue.code_staff = null;
    }
    ligue.can_manage = isCreator || isStaff;
    ligue.est_staff = isStaff;
    ligue.membres = membres.filter((membre) =>
      isOrganizationMember(membre, ligue),
    );
    ligue.joueurs = membres.filter(
      (membre) => !isOrganizationMember(membre, ligue),
    );
    ligue.nb_joueurs = ligue.joueurs.length;
    ligue.nb_membres_organisation = ligue.membres.length;
    ligue.suis = isMember;
    ligue.code_joueur = ligue.suis ? ligue.code_acces : null;
    if (!ligue.suis) {
      ligue.code_acces = null;
    }

    res.json(ligue);
  } catch (err) {
    console.error("❌ Erreur getLigue:", err.message, err.sql);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id/matchs – matchs d'une ligue
exports.getMatchsLigue = async (req, res) => {
  try {
    const db = getPool();
    await ensureStaffColumn(db);
    const access = await getLeagueAccess(db, req.params.id, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.publique && !access.isMember) {
      return res.status(403).json({ message: "Accès réservé aux membres" });
    }
    const [matchs] = await db.execute(
      `SELECT ms.*, s.nom AS sport, u.pseudo AS createur
       FROM MatchSport ms
       JOIN Sport s ON s.id = ms.sport_id
       JOIN Utilisateur u ON u.id = ms.createur_id
       WHERE ms.ligue_id = ?
       ORDER BY ms.date_heure DESC`,
      [req.params.id],
    );
    res.json(matchs);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/quitter
exports.quitter = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      `DELETE FROM LigueUtilisateur WHERE ligue_id = ? AND utilisateur_id = ?`,
      [req.params.id, req.user.id],
    );
    res.json({ message: "Ligue quittée" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
