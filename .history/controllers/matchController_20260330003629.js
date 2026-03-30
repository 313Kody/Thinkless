const db = require("../config/db");

// GET /api/matchs
exports.getMatchs = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ms.*, s.nom AS sport, u.pseudo AS createur
       FROM MatchSport ms
       JOIN Sport s       ON s.id = ms.sport_id
       JOIN Utilisateur u ON u.id = ms.createur_id
       WHERE ms.statut = 'ouvert'
       ORDER BY ms.date_heure ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs
exports.createMatch = async (req, res) => {
  try {
    const { sport_id, titre, date_heure, localisation, nb_joueurs_max } =
      req.body;

    if (!sport_id || !date_heure) {
      return res.status(400).json({ message: "sport_id et date_heure requis" });
    }

    const [result] = await db.execute(
      `INSERT INTO MatchSport (sport_id, createur_id, titre, date_heure, localisation, nb_joueurs_max)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sport_id,
        req.user.id,
        titre || null,
        date_heure,
        localisation || null,
        nb_joueurs_max || 2,
      ],
    );

    await db.execute(
      "INSERT INTO ParticipationMatch (match_id, utilisateur_id) VALUES (?, ?)",
      [result.insertId, req.user.id],
    );

    res.status(201).json({ message: "Match créé", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/matchs/:id/rejoindre
exports.rejoindreMatch = async (req, res) => {
  try {
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
