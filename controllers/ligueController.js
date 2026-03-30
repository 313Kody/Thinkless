const { getPool } = require("../config/db");

// GET /api/ligues
exports.getLigues = async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT l.*, s.nom AS sport, u.pseudo AS createur,
              COUNT(lu.utilisateur_id) AS nb_membres
       FROM Ligue l
       JOIN Sport s        ON s.id = l.sport_id
       JOIN Utilisateur u  ON u.id = l.createur_id
       LEFT JOIN LigueUtilisateur lu ON lu.ligue_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues
exports.createLigue = async (req, res) => {
  try {
    const db = getPool();
    const { sport_id, nom, description, publique } = req.body;

    if (!sport_id || !nom) {
      return res.status(400).json({ message: "sport_id et nom requis" });
    }

    const [result] = await db.execute(
      `INSERT INTO Ligue (sport_id, createur_id, nom, description, publique)
       VALUES (?, ?, ?, ?, ?)`,
      [sport_id, req.user.id, nom, description || null, publique ? 1 : 0],
    );

    // Le créateur rejoint automatiquement sa ligue
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id) VALUES (?, ?)`,
      [result.insertId, req.user.id],
    );

    res.status(201).json({ message: "Ligue créée", id: result.insertId });
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

// GET /api/ligues/:id/classement
exports.classement = async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT u.pseudo, lu.points, lu.victoires, lu.defaites,
              RANK() OVER (ORDER BY lu.points DESC) AS rang
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       WHERE lu.ligue_id = ?`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
