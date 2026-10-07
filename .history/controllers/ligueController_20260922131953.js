const { getPool } = require("../config/db");
const crypto = require("crypto");

let staffColumnReady = null;
let pouleColumnReady = null;
let eventConfigReady = null;

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
          await db.execute(`ALTER TABLE Ligue ADD COLUMN ${name} ${definition}`);
        }
      }
    })();
  }
  await eventConfigReady;
}

async function getLeagueAccess(db, ligueId, userId) {
  const [rows] = await db.execute(
    `SELECT l.id, l.publique, l.createur_id,
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
  const isMember = league.utilisateur_id !== null;
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
    return Array.isArray(terrains) ? terrains[terrainId - 1] || String(terrainId) : String(terrainId);
  } catch (_error) {
    return String(terrainId);
  }
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
            (Number(ligue.createur_id) === Number(req.user.id) ||
              Number(ligue.est_staff) === 1)
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

    if (![
      "unique",
      "differe",
    ].includes(type_evenement)) {
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
      return res.status(400).json({ message: "nb_poules doit être compris entre 1 et 8" });
    }

    const terrainCount = Number(nb_terrains);
    if (!Number.isInteger(terrainCount) || terrainCount < 1 || terrainCount > 50) {
      return res.status(400).json({ message: "Nombre de terrains invalide" });
    }
    if (type_evenement === "unique" && (!String(lieu || "").trim() || !date_debut)) {
      return res.status(400).json({
        message: "Le lieu et la date de début sont obligatoires pour un événement unique",
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
        Array.isArray(terrains) ? JSON.stringify(terrains) : String(terrains || "").trim() || null,
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
        message: "Cette ligue privée se rejoint uniquement avec son code joueur",
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
    const access = await getLeagueAccess(db, req.params.id, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    if (!access.publique && !access.isMember) {
      return res.status(403).json({ message: "Accès réservé aux membres" });
    }
    const [rows] = await db.execute(
      `SELECT id, nom, poule, created_at FROM LigueEquipe WHERE ligue_id = ? ORDER BY id ASC`,
      [req.params.id],
    );
    res.json(rows);
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
      return res.status(400).json({ message: "Cette ligue n'utilise pas de poules" });
    }
    if (ligues[0].poules_verrouillees) {
      return res.status(409).json({ message: "Les poules sont déjà verrouillées" });
    }

    const [equipes] = await connection.execute(
      "SELECT id, nom FROM LigueEquipe WHERE ligue_id = ? ORDER BY id ASC",
      [ligueId],
    );
    if (equipes.length < 2) {
      return res.status(400).json({ message: "Au moins deux équipes sont nécessaires" });
    }

    const nombrePoules = Number(ligues[0].nb_poules) || 2;
    if (nombrePoules !== 2) {
      return res.status(400).json({ message: "La génération actuelle supporte deux poules" });
    }

    await connection.beginTransaction();
    const taillePouleA = Math.ceil(equipes.length / 2);
    for (const [index, equipe] of equipes.entries()) {
      await connection.execute(
        "UPDATE LigueEquipe SET poule = ? WHERE id = ? AND ligue_id = ?",
        [index < taillePouleA ? "A" : "B", equipe.id, ligueId],
      );
    }
    await connection.commit();

    res.json({
      message: "Poules générées",
      poules: {
        A: equipes.slice(0, taillePouleA),
        B: equipes.slice(taillePouleA),
      },
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
    const startAt = new Date(requestedStartAt || ligues[0].date_debut || "2026-10-24T12:10:00");
    const terrainCount = Number(req.body.terrain_count || ligues[0].nb_terrains) || 1;
    if (Number.isNaN(startAt.getTime()) || durationMinutes <= 0 || rotationMinutes < 0 || terrainCount < 1) {
      return res.status(400).json({ message: "Paramètres de calendrier invalides" });
    }
    const [equipes] = await connection.execute(
      "SELECT id, nom, poule FROM LigueEquipe WHERE ligue_id = ? AND poule IS NOT NULL ORDER BY poule, id",
      [ligueId],
    );
    if (equipes.length < 2) {
      return res.status(400).json({ message: "Générez d'abord les poules" });
    }

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
      return res.status(409).json({ message: "Le calendrier des poules existe déjà", matchs_crees: 0 });
    }

    await connection.beginTransaction();
    for (const [index, [equipeA, equipeB, poule]] of matchs.entries()) {
      const slot = Math.floor(index / terrainCount);
      const date = new Date(startAt.getTime() + slot * (durationMinutes + rotationMinutes) * 60000);
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

    res.status(201).json({ message: "Calendrier généré", matchs_crees: matchs.length });
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
