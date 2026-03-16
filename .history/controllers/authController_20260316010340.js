const db = require("../config/db");
const bcrypt = require("bcrypt");

exports.register = async (req, res) => {
  try {
    const { pseudo, email, mot_de_passe, localisation } = req.body;

    if (!pseudo || !email || !mot_de_passe) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);

    const [result] = await db.execute(
      "INSERT INTO Utilisateur (pseudo, email, mot_de_passe, localisation) VALUES (?, ?, ?, ?)",
      [pseudo, email, hash, localisation || null],
    );

    res.status(201).json({ message: "Compte créé", id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Pseudo ou email déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
