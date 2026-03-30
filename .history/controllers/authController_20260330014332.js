const { getPool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Validation mot de passe ANSSI
function validerMotDePasse(mdp) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(mdp);
}

exports.register = async (req, res) => {
  try {
    const { pseudo, email, mot_de_passe, localisation } = req.body;

    if (!pseudo || !email || !mot_de_passe) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);

    const db = getPool();
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

exports.login = async (req, res) => {
  try {
    const { email, mot_de_passe } = req.body;

    if (!email || !mot_de_passe) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const db = getPool();
    const [rows] = await db.execute(
      "SELECT * FROM Utilisateur WHERE email = ?",
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

    if (!valid) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    const token = jwt.sign(
      { id: user.id, pseudo: user.pseudo, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Connecté",
      token,
      user: { id: user.id, pseudo: user.pseudo },
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
