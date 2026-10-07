const { getPool } = require("../config/db");

// GET /api/ligues
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

// POST /api/ligues
exports.createLigue = async (req, res) => {
  try {
    const db = getPool();
    const {
      sport_id,
      nom,
      description,
      publique,
      nb_equipe,
      slots_par_equipe,
      equipes,
    } = req.body;

    if (!sport_id || !nom) {
      return res.status(400).json({ message: "sport_id et nom requis" });
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
    let finalNbEquipe = isSoloSport ? 1 : nb_equipe || 2;
    let finalSlotsPar = isSoloSport ? 1 : slots_par_equipe || 5;

    // Générer code d'accès pour ligues privées
    let code_acces = null;
    if (!publique) {
      code_acces = Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    const [result] = await db.execute(
      `INSERT INTO Ligue (sport_id, createur_id, nom, description, publique, nb_equipe, slots_par_equipe, code_acces)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sport_id,
        req.user.id,
        nom,
        description || null,
        publique ? 1 : 0,
        finalNbEquipe,
        finalSlotsPar,
        code_acces,
      ],
    );

    // Le créateur rejoint automatiquement sa ligue (sans équipe si privée)
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [result.insertId, req.user.id],
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
    if (code_acces) {
      response.code_acces = code_acces;
    }

    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/rejoindre
exports.rejoindre = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
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
    const { code_acces } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM Ligue WHERE code_acces = ? AND publique = 0",
      [code_acces.toUpperCase()],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Code invalide ou ligue introuvable" });
    }

    const ligue = rows[0];

    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [ligue.id, req.user.id],
    );

    res.json({ message: "Ligue rejointe !", ligue_id: ligue.id });
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
    const [rows] = await db.execute(
      `SELECT id, nom, created_at FROM LigueEquipe WHERE ligue_id = ? ORDER BY id ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id/classement
exports.classement = async (req, res) => {
  try {
    const db = getPool();
    const ligueId = req.params.id;

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

    console.log("👥 Membres trouvés:", membres.length);

    const ligue = ligues[0];
    ligue.membres = membres;
    ligue.suis = membres.some((m) => m.id === req.user.id);

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
