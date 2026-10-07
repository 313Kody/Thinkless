const { getPool } = require("../config/db");
const crypto = require("crypto");

const sanitizeText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[<>]/g, "");
};

const generateCode = (prefix = "") => {
  const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
  return prefix ? `${prefix}-${raw}` : raw;
};

const getTableColumns = async (db, tableName) => {
  try {
    const [rows] = await db.execute(`SHOW COLUMNS FROM \`${tableName}\``);
    return rows.map((row) => row.Field);
  } catch (error) {
    return [];
  }
};

const getMembershipTable = async (db) => {
  const tables = ["Utilisateur_Ligue", "LigueUtilisateur"];
  for (const table of tables) {
    const columns = await getTableColumns(db, table);
    if (columns.length > 0) {
      return { table, columns };
    }
  }
  return { table: "LigueUtilisateur", columns: [] };
};

const getLigueFields = async (db) => {
  const columns = await getTableColumns(db, "Ligue");
  return {
    hasEstPrivee: columns.includes("est_privee"),
    hasPublique: columns.includes("publique"),
    hasCodeField: columns.includes("code"),
    hasCodeAcces: columns.includes("code_acces"),
    hasCodeStaff: columns.includes("code_staff"),
    hasTypeEvenement: columns.includes("type_evenement"),
    hasAPoules: columns.includes("a_poules"),
    hasNbPoules: columns.includes("nb_poules"),
    hasPtsVictoire: columns.includes("pts_victoire"),
    hasPtsNul: columns.includes("pts_nul"),
    hasPtsDefaite: columns.includes("pts_defaite"),
    hasCreateurJoueur: columns.includes("createur_joueur"),
    hasCreateurId: columns.includes("createur_id"),
  };
};

const safeBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return !!value || fallback;
};

const normalizeJoinPayload = (req) => {
  const body = req.body || {};
  const code = sanitizeText(body.code || body.code_acces || body.codeStaff || "");
  const isStaffAttempt = safeBoolean(body.est_staff || body.is_staff || body.staff, false);

  return {
    code,
    isStaffAttempt,
    userId: Number(req.user.id),
  };
};

const upsertMembership = async ({ db, ligueId, userId, role = "joueur", estStaff = 0, dateRejoint = new Date() }) => {
  const membership = await getMembershipTable(db);
  const columns = membership.columns;

  if (columns.includes("role") && columns.includes("est_staff") && columns.includes("date_rejoint")) {
    const [existing] = await db.execute(
      `SELECT 1 FROM \`${membership.table}\` WHERE ligue_id = ? AND utilisateur_id = ? LIMIT 1`,
      [ligueId, userId],
    );

    if (existing.length > 0) {
      await db.execute(
        `UPDATE \`${membership.table}\` SET role = ?, est_staff = ?, date_rejoint = ? WHERE ligue_id = ? AND utilisateur_id = ?`,
        [role, estStaff, dateRejoint, ligueId, userId],
      );
      return { updated: true };
    }

    await db.execute(
      `INSERT INTO \`${membership.table}\` (ligue_id, utilisateur_id, role, est_staff, date_rejoint) VALUES (?, ?, ?, ?, ?)`,
      [ligueId, userId, role, estStaff, dateRejoint],
    );
    return { updated: false };
  }

  if (columns.includes("statut") && columns.includes("rejoint_le")) {
    const [existing] = await db.execute(
      `SELECT 1 FROM \`${membership.table}\` WHERE ligue_id = ? AND utilisateur_id = ? LIMIT 1`,
      [ligueId, userId],
    );

    if (existing.length > 0) {
      await db.execute(
        `UPDATE \`${membership.table}\` SET statut = ?, rejoint_le = ? WHERE ligue_id = ? AND utilisateur_id = ?`,
        [role === "staff" ? "valide" : "valide", dateRejoint, ligueId, userId],
      );
      return { updated: true };
    }

    await db.execute(
      `INSERT INTO \`${membership.table}\` (ligue_id, utilisateur_id, statut, rejoint_le) VALUES (?, ?, ?, ?)`,
      [ligueId, userId, "valide", dateRejoint],
    );
    return { updated: false };
  }

  const [existing] = await db.execute(
    `SELECT 1 FROM \`${membership.table}\` WHERE ligue_id = ? AND utilisateur_id = ? LIMIT 1`,
    [ligueId, userId],
  );

  if (existing.length > 0) {
    await db.execute(
      `UPDATE \`${membership.table}\` SET points = points WHERE ligue_id = ? AND utilisateur_id = ?`,
      [ligueId, userId],
    );
    return { updated: true };
  }

  await db.execute(
    `INSERT INTO \`${membership.table}\` (ligue_id, utilisateur_id) VALUES (?, ?)`,
    [ligueId, userId],
  );

  return { updated: false };
};

const isUserAdminOfLigue = async (db, ligueId, userId) => {
  const membership = await getMembershipTable(db);
  const table = membership.table;
  const columns = membership.columns;

  if (columns.includes("role")) {
    const [rows] = await db.execute(
      `SELECT role FROM \`${table}\` WHERE ligue_id = ? AND utilisateur_id = ? LIMIT 1`,
      [ligueId, userId],
    );
    return rows.length > 0 && rows[0].role === "admin";
  }

  const [rows] = await db.execute(
    `SELECT createur_id FROM Ligue WHERE id = ? LIMIT 1`,
    [ligueId],
  );

  if (rows.length > 0) {
    return Number(rows[0].createur_id) === Number(userId);
  }

  return false;
};

exports.getLigues = async (req, res) => {
  try {
    const db = getPool();
    const { nom } = req.query;

    let sql = `SELECT l.*, s.nom AS sport, u.pseudo AS createur,
              CASE WHEN mylu.utilisateur_id IS NULL THEN 0 ELSE 1 END AS suis,
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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.createLigue = async (req, res) => {
  try {
    const db = getPool();
    const body = req.body || {};

    const sportId = Number(body.sport_id ?? body.sportId);
    const nom = sanitizeText(body.nom || "");
    const description = sanitizeText(body.description || "");
    const isPublic = safeBoolean(body.publique ?? body.est_privee === false ?? body.public, true);
    const createurJoueur = safeBoolean(body.createur_joueur ?? body.createurJoueur, true);
    const typeEvenement = (body.type_evenement || "unique").toString();
    const aPoules = safeBoolean(body.a_poules ?? body.withPoules, true);
    const nbPoules = Number(body.nb_poules || 2);
    const ptsVictoire = Number(body.pts_victoire ?? 3);
    const ptsNul = Number(body.pts_nul ?? 1);
    const ptsDefaite = Number(body.pts_defaite ?? 0);

    if (!sportId || !nom) {
      return res.status(400).json({ message: "sport_id et nom requis" });
    }

    const [sportRows] = await db.execute(`SELECT nom FROM Sport WHERE id = ?`, [sportId]);
    if (sportRows.length === 0) {
      return res.status(400).json({ message: "Sport non trouvé" });
    }

    const codeJoueur = sanitizeText(body.code || body.code_acces || "");
    const codeStaff = sanitizeText(body.code_staff || body.codeStaff || generateCode("STAFF"));

    const ligueFields = await getLigueFields(db);
    const columns = [];
    const values = [];

    columns.push("sport_id", "createur_id", "nom", "description");
    values.push(sportId, req.user.id, nom, description || null);

    if (ligueFields.hasPublique) {
      columns.push("publique");
      values.push(isPublic ? 1 : 0);
    }

    if (ligueFields.hasEstPrivee) {
      columns.push("est_privee");
      values.push(isPublic ? 0 : 1);
    }

    if (ligueFields.hasCodeField) {
      columns.push("code");
      values.push(codeJoueur || null);
    }

    if (ligueFields.hasCodeAcces) {
      columns.push("code_acces");
      values.push(codeJoueur || null);
    }

    if (ligueFields.hasCodeStaff) {
      columns.push("code_staff");
      values.push(codeStaff || null);
    }

    if (ligueFields.hasTypeEvenement) {
      columns.push("type_evenement");
      values.push(typeEvenement);
    }

    if (ligueFields.hasAPoules) {
      columns.push("a_poules");
      values.push(aPoules ? 1 : 0);
    }

    if (ligueFields.hasNbPoules) {
      columns.push("nb_poules");
      values.push(Number(nbPoules) || 2);
    }

    if (ligueFields.hasPtsVictoire) {
      columns.push("pts_victoire");
      values.push(Number(ptsVictoire) || 3);
    }

    if (ligueFields.hasPtsNul) {
      columns.push("pts_nul");
      values.push(Number(ptsNul) || 1);
    }

    if (ligueFields.hasPtsDefaite) {
      columns.push("pts_defaite");
      values.push(Number(ptsDefaite) || 0);
    }

    if (ligueFields.hasCreateurJoueur) {
      columns.push("createur_joueur");
      values.push(createurJoueur ? 1 : 0);
    }

    const placeholders = columns.map(() => "?").join(", ");
    const [result] = await db.execute(
      `INSERT INTO Ligue (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    const ligueId = result.insertId;
    const role = createurJoueur ? "admin" : "admin";

    await upsertMembership({
      db,
      ligueId,
      userId: req.user.id,
      role,
      estStaff: 0,
    });

    const response = {
      message: "Ligue créée avec succès",
      ligueId,
      code: codeJoueur || null,
      code_staff: codeStaff || null,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("createLigue error:", error);
    res.status(500).json({ message: "Erreur lors de la création de la ligue", error: error.message });
  }
};

exports.joinLigue = async (req, res) => {
  try {
    const db = getPool();
    const { code, isStaffAttempt } = normalizeJoinPayload(req);

    if (!code) {
      return res.status(400).json({ message: "Code requis pour rejoindre la ligue" });
    }

    const [rows] = await db.execute(
      `SELECT * FROM Ligue WHERE (code = ? OR code_acces = ? OR code_staff = ?) LIMIT 1`,
      [code, code, code],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Code invalide ou ligue introuvable" });
    }

    const ligue = rows[0];
    const isStaffCode = code === ligue.code_staff || (ligue.code_staff && code.toUpperCase() === String(ligue.code_staff).toUpperCase());
    const isPublic = Number(ligue.publique ?? ligue.est_privee ?? 1) === 1;

    if (isStaffCode || isStaffAttempt) {
      if (!ligue.code_staff || code.toUpperCase() !== String(ligue.code_staff).toUpperCase()) {
        return res.status(403).json({ message: "Code staff invalide pour cette ligue" });
      }

      await upsertMembership({
        db,
        ligueId: ligue.id,
        userId: req.user.id,
        role: "staff",
        estStaff: 1,
      });

      return res.status(200).json({
        message: "Vous avez rejoint la ligue avec le statut staff",
        ligueId: ligue.id,
        role: "staff",
      });
    }

    if (!isPublic && !isStaffCode) {
      const isPlayerCode = code === ligue.code || code === ligue.code_acces;
      if (!isPlayerCode) {
        return res.status(403).json({ message: "Code joueur invalide pour cette ligue" });
      }
    }

    await upsertMembership({
      db,
      ligueId: ligue.id,
      userId: req.user.id,
      role: "joueur",
      estStaff: 0,
    });

    res.status(200).json({
      message: "Vous avez rejoint la ligue",
      ligueId: ligue.id,
      role: "joueur",
      est_staff: 0,
    });
  } catch (error) {
    console.error("joinLigue error:", error);
    res.status(500).json({ message: "Erreur lors de la jointure à la ligue", error: error.message });
  }
};

exports.toggleStaffStatus = async (req, res) => {
  try {
    const db = getPool();
    const { id, userId } = req.params;
    const { est_staff, staff } = req.body || {};

    const isAdmin = await isUserAdminOfLigue(db, id, req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ message: "Accès refusé : vous devez être admin de la ligue" });
    }

    const newFlag = safeBoolean(est_staff ?? staff, false) ? 1 : 0;
    const newRole = newFlag ? "staff" : "joueur";

    const membership = await getMembershipTable(db);
    const targetColumns = membership.columns;

    if (targetColumns.includes("role") && targetColumns.includes("est_staff")) {
      await db.execute(
        `UPDATE \`${membership.table}\` SET role = ?, est_staff = ? WHERE ligue_id = ? AND utilisateur_id = ?`,
        [newRole, newFlag, id, userId],
      );
      return res.json({ message: "Statut staff mis à jour", role: newRole, est_staff: newFlag });
    }

    return res.status(400).json({ message: "Le schéma de membres ne supporte pas le statut staff" });
  } catch (error) {
    console.error("toggleStaffStatus error:", error);
    res.status(500).json({ message: "Erreur lors de la mise à jour du statut staff", error: error.message });
  }
};

exports.getLigueMembers = async (req, res) => {
  try {
    const db = getPool();
    const ligueId = req.params.id;
    const membership = await getMembershipTable(db);
    const table = membership.table;

    const query = `
      SELECT 
        u.id,
        u.pseudo,
        u.email,
        u.photo_url,
        m.role,
        m.est_staff,
        m.date_rejoint,
        m.date_rejoint AS date_rejoint_raw
      FROM \`${table}\` m
      JOIN Utilisateur u ON u.id = m.utilisateur_id
      WHERE m.ligue_id = ?
      ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, u.pseudo ASC
    `;

    if (membership.columns.includes("role")) {
      const [rows] = await db.execute(query, [ligueId]);
      return res.json(rows);
    }

    const [rows] = await db.execute(
      `SELECT u.id, u.pseudo, u.email, u.photo_url,
        CASE WHEN l.createur_id = u.id THEN 'admin' WHEN m.statut = 'valide' THEN 'joueur' ELSE 'joueur' END AS role,
        0 AS est_staff,
        m.rejoint_le AS date_rejoint
       FROM \`${table}\` m
       JOIN Utilisateur u ON u.id = m.utilisateur_id
       JOIN Ligue l ON l.id = m.ligue_id
       WHERE m.ligue_id = ?
       ORDER BY u.pseudo ASC`,
      [ligueId],
    );

    res.json(rows);
  } catch (error) {
    console.error("getLigueMembers error:", error);
    res.status(500).json({ message: "Erreur lors du chargement des membres", error: error.message });
  }
};

exports.getLigues = async (req, res) => {
  try {
    const db = getPool();
    const { nom } = req.query;

    let sql = `SELECT l.*, s.nom AS sport, u.pseudo AS createur,
              CASE WHEN mylu.utilisateur_id IS NULL THEN 0 ELSE 1 END AS suis,
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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.rejoindre = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [req.params.id, req.user.id],
    );
    res.json({ message: "Ligue rejointe !" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Déjà membre" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.rejoindreAvecCode = async (req, res) => {
  try {
    const db = getPool();
    const { code_acces } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM Ligue WHERE code_acces = ? AND publique = 0",
      [code_acces.toUpperCase()],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Code invalide ou ligue introuvable" });
    }

    const ligue = rows[0];

    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [ligue.id, req.user.id],
    );

    res.json({ message: "Ligue rejointe !", ligue_id: ligue.id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Déjà membre" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getEquipes = async (req, res) => {
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

exports.classement = async (req, res) => {
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
    return res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getLigue = async (req, res) => {
  try {
    const db = getPool();
    const ligueId = req.params.id;

    const [ligues] = await db.execute(
      `SELECT l.*, s.nom AS sport, u.pseudo AS createur
       FROM Ligue l
       LEFT JOIN Sport s ON s.id = l.sport_id
       LEFT JOIN Utilisateur u ON u.id = l.createur_id
       WHERE l.id = ?`,
      [ligueId],
    );

    if (ligues.length === 0) {
      return res.status(404).json({ message: "Ligue introuvable" });
    }

    const [membres] = await db.execute(
      `SELECT u.id, u.pseudo, us.elo, lu.points, lu.victoires, lu.defaites
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       LEFT JOIN Ligue l ON l.id = lu.ligue_id
       LEFT JOIN UtilisateurSport us
         ON us.utilisateur_id = u.id AND us.sport_id = l.sport_id
       WHERE lu.ligue_id = ?
       ORDER BY lu.points DESC`,
      [ligueId],
    );

    const ligue = ligues[0];
    ligue.membres = membres;
    ligue.suis = membres.some((m) => Number(m.id) === Number(req.user.id));

    res.json(ligue);
  } catch (err) {
    console.error("Erreur getLigue:", err.message, err.sql);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.getMatchsLigue = async (req, res) => {
  try {
    const db = getPool();
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
