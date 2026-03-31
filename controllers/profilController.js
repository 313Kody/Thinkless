const { getPool } = require("../config/db");
const bcrypt = require("bcryptjs");

exports.getProfil = async (req, res) => {
  try {
    const db = getPool();
    const userId = req.user.id;

    const [users] = await db.execute(
      "SELECT id, pseudo, email, localisation, avatar_url, created_at FROM Utilisateur WHERE id = ?",
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const [sports] = await db.execute(
      `SELECT s.id, s.nom, us.elo, us.victoires, us.defaites
       FROM UtilisateurSport us
       JOIN Sport s ON s.id = us.sport_id
       WHERE us.utilisateur_id = ?`,
      [userId]
    );

    const [jeux] = await db.execute(
      `SELECT j.id, j.nom, j.badge_url, uj.elo, uj.victoires, uj.defaites
       FROM UtilisateurJeu uj
       JOIN JeuEsport j ON j.id = uj.jeu_id
       WHERE uj.utilisateur_id = ?`,
      [userId]
    );

    const [equipe] = await db.execute(
      `SELECT e.id, e.nom, e.logo_url, em.role, e.capitaine_id
       FROM EquipeMembre em
       JOIN EquipeEsport e ON e.id = em.equipe_id
       WHERE em.utilisateur_id = ?`,
      [userId]
    );

    res.json({
      ...users[0],
      sports,
      jeux,
      equipe: equipe.length > 0 ? equipe[0] : null,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.updatePseudo = async (req, res) => {
  try {
    const { pseudo } = req.body;
    if (!pseudo || pseudo.trim().length < 2) {
      return res.status(400).json({ message: "Pseudo invalide (2 caractères min.)" });
    }
    const db = getPool();
    await db.execute(
      "UPDATE Utilisateur SET pseudo = ? WHERE id = ?",
      [pseudo.trim(), req.user.id]
    );
    res.json({ message: "Pseudo mis à jour" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Pseudo déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.updateLocalisation = async (req, res) => {
  try {
    const { localisation } = req.body;
    const db = getPool();
    await db.execute(
      "UPDATE Utilisateur SET localisation = ? WHERE id = ?",
      [localisation || null, req.user.id]
    );
    res.json({ message: "Localisation mise à jour" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { ancien_mdp, nouveau_mdp } = req.body;
    if (!ancien_mdp || !nouveau_mdp) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;
    if (!regex.test(nouveau_mdp)) {
      return res.status(400).json({
        message: "Mot de passe trop faible (12 car. min, majuscule, chiffre, symbole)",
      });
    }

    const db = getPool();
    const [rows] = await db.execute(
      "SELECT mot_de_passe FROM Utilisateur WHERE id = ?",
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const valid = await bcrypt.compare(ancien_mdp, rows[0].mot_de_passe);
    if (!valid) {
      return res.status(401).json({ message: "Ancien mot de passe incorrect" });
    }

    const hash = await bcrypt.hash(nouveau_mdp, 10);
    await db.execute(
      "UPDATE Utilisateur SET mot_de_passe = ? WHERE id = ?",
      [hash, req.user.id]
    );
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.addSport = async (req, res) => {
  try {
    const { sport_id } = req.body;
    if (!sport_id) {
      return res.status(400).json({ message: "sport_id requis" });
    }
    const db = getPool();
    await db.execute(
      "INSERT INTO UtilisateurSport (utilisateur_id, sport_id) VALUES (?, ?)",
      [req.user.id, sport_id]
    );
    res.status(201).json({ message: "Sport ajouté" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Sport déjà ajouté" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.removeSport = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      "DELETE FROM UtilisateurSport WHERE utilisateur_id = ? AND sport_id = ?",
      [req.user.id, req.params.sportId]
    );
    res.json({ message: "Sport retiré" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.addJeu = async (req, res) => {
  try {
    const { jeu_id } = req.body;
    if (!jeu_id) {
      return res.status(400).json({ message: "jeu_id requis" });
    }
    const db = getPool();
    await db.execute(
      "INSERT INTO UtilisateurJeu (utilisateur_id, jeu_id) VALUES (?, ?)",
      [req.user.id, jeu_id]
    );
    res.status(201).json({ message: "Jeu ajouté" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Jeu déjà ajouté" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.removeJeu = async (req, res) => {
  try {
    const db = getPool();
    await db.execute(
      "DELETE FROM UtilisateurJeu WHERE utilisateur_id = ? AND jeu_id = ?",
      [req.user.id, req.params.jeuId]
    );
    res.json({ message: "Jeu retiré" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.quitterEquipe = async (req, res) => {
  try {
    const db = getPool();
    const [check] = await db.execute(
      `SELECT em.role, e.capitaine_id
       FROM EquipeMembre em
       JOIN EquipeEsport e ON e.id = em.equipe_id
       WHERE em.utilisateur_id = ?`,
      [req.user.id]
    );
    if (check.length === 0) {
      return res.status(400).json({ message: "Vous n'êtes dans aucune équipe" });
    }
    if (check[0].capitaine_id === req.user.id) {
      return res.status(403).json({
        message: "Vous êtes capitaine, transférez la capitainerie avant de quitter",
      });
    }
    await db.execute(
      "DELETE FROM EquipeMembre WHERE utilisateur_id = ?",
      [req.user.id]
    );
    res.json({ message: "Vous avez quitté l'équipe" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { mot_de_passe } = req.body;
    if (!mot_de_passe) {
      return res.status(400).json({ message: "Mot de passe requis pour confirmer la suppression" });
    }
    const db = getPool();
    const [rows] = await db.execute(
      "SELECT mot_de_passe FROM Utilisateur WHERE id = ?",
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }
    const valid = await bcrypt.compare(mot_de_passe, rows[0].mot_de_passe);
    if (!valid) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }
    await db.execute("DELETE FROM Utilisateur WHERE id = ?", [req.user.id]);
    res.json({ message: "Compte supprimé" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
