const { getPool } = require("../config/db");

// GET /api/matchs
exports.getMatchs = async (req, res) => {
  try {
    const db = getPool();
    const { localisation } = req.query;

    let sql = `SELECT ms.*, s.nom AS sport, u.pseudo AS createur
               FROM MatchSport ms
               JOIN Sport s       ON s.id = ms.sport_id
               JOIN Utilisateur u ON u.id = ms.createur_id
               WHERE ms.statut = 'ouvert' AND ms.prive = 0`;
    const params = [];

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
      titre,
      date_heure,
      localisation,
      nb_equipe_a,
      nb_equipe_b,
      nb_remplacants,
      nb_joueurs_max,
      nom_equipe_a,
      nom_equipe_b,
      prive,
    } = req.body;

    if (!sport_id || !date_heure) {
      return res.status(400).json({ message: "sport_id et date_heure requis" });
    }

    // Génération du code d'accès si match privé
    let code_acces = null;
    if (prive) {
      code_acces = Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    const [result] = await db.execute(
      `INSERT INTO MatchSport (sport_id, createur_id, titre, date_heure, localisation, nb_joueurs_max, nb_equipe_a, nb_equipe_b, nb_remplacants, nom_equipe_a, nom_equipe_b, prive, code_acces)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sport_id,
        req.user.id,
        titre || null,
        date_heure,
        localisation || null,
        nb_joueurs_max || 2,
        nb_equipe_a || 1,
        nb_equipe_b || 1,
        nb_remplacants || 0,
        nom_equipe_a || "Équipe A",
        nom_equipe_b || "Équipe B",
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

    const [rows] = await db.execute("SELECT * FROM MatchSport WHERE id = ?", [
      matchId,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ message: "Match introuvable" });
    if (rows[0].statut !== "ouvert")
      return res.status(400).json({ message: "Match non disponible" });

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
      `SELECT ms.*, s.nom AS sport, u.pseudo AS createur
       FROM MatchSport ms
       JOIN Sport s       ON s.id = ms.sport_id
       JOIN Utilisateur u ON u.id = ms.createur_id
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

    res.json({ ...rows[0], participants });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// PUT /api/matchs/:id
exports.updateMatch = async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      "SELECT createur_id FROM MatchSport WHERE id = ?",
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Match introuvable" });
    if (rows[0].createur_id !== req.user.id)
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
    const [rows] = await db.execute(
      "SELECT createur_id FROM MatchSport WHERE id = ?",
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Match introuvable" });
    if (rows[0].createur_id !== req.user.id)
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
    await db.execute(
      `UPDATE ParticipationMatch SET equipe=?, statut='en_attente' WHERE match_id=? AND utilisateur_id=?`,
      [equipe, req.params.id, req.user.id],
    );
    res.json({ message: `Demande envoyée pour l'équipe ${equipe}` });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/valider – créateur valide un joueur dans une équipe
exports.validerJoueur = async (req, res) => {
  try {
    const db = getPool();
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
