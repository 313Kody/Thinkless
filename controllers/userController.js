const { getPool } = require("../config/db");

// GET /api/users/:id
exports.getProfil = async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute(
      `SELECT u.id, u.pseudo, u.email, u.localisation, u.avatar_url, u.created_at,
              GROUP_CONCAT(DISTINCT s.nom ORDER BY s.nom) AS sports,
              GROUP_CONCAT(DISTINCT j.nom ORDER BY j.nom) AS jeux
       FROM Utilisateur u
       LEFT JOIN UtilisateurSport us ON us.utilisateur_id = u.id
       LEFT JOIN Sport s             ON s.id = us.sport_id
       LEFT JOIN UtilisateurJeu uj   ON uj.utilisateur_id = u.id
       LEFT JOIN JeuEsport j         ON j.id = uj.jeu_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [req.params.id],
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Utilisateur introuvable" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/users/me
exports.getMe = async (req, res) => {
  req.params.id = req.user.id;
  return exports.getProfil(req, res);
};
