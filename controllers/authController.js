const { getPool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getEloForLevel } = require("../utils/rankUtils");

// Validation mot de passe ANSSI
function validerMotDePasse(mdp) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(mdp);
}

exports.register = async (req, res) => {
  try {
    const {
      nom,
      prenom,
      pseudo,
      email,
      mot_de_passe,
      localisation,
      sports,
      jeux,
    } = req.body;

    if (!nom || !prenom || !pseudo || !email || !mot_de_passe) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;
    if (!regex.test(mot_de_passe)) {
      return res.status(400).json({ message: "Mot de passe trop faible" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const db = getPool();

    const [result] = await db.execute(
      "INSERT INTO Utilisateur (nom, prenom, pseudo, email, mot_de_passe, localisation) VALUES (?, ?, ?, ?, ?, ?)",
      [
        nom.trim(),
        prenom.trim(),
        pseudo.trim(),
        email,
        hash,
        localisation || null,
      ],
    );

    const userId = result.insertId;

    // Sauvegarder les sports
    if (sports && sports.length > 0) {
      for (const s of sports) {
        await db.execute(
          "INSERT INTO UtilisateurSport (utilisateur_id, sport_id, elo) VALUES (?, ?, ?)",
          [userId, s.sport_id, getEloForLevel("sport", s.niveau)],
        );
      }
    }

    // Sauvegarder les jeux
    if (jeux && jeux.length > 0) {
      for (const j of jeux) {
        await db.execute(
          "INSERT INTO UtilisateurJeu (utilisateur_id, jeu_id, elo) VALUES (?, ?, ?)",
          [userId, j.jeu_id, getEloForLevel("game", j.niveau)],
        );
      }
    }

    res.status(201).json({ message: "Compte créé", id: userId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Pseudo ou email déjà utilisé" });
    }
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// ---- Connexion simplifiée des capitaines (code d'équipe / magic link) ----
const CAPITAINE_TOKEN_DUREE = "24h";
const TENTATIVES_MAX = 10;
const FENETRE_MS = 10 * 60 * 1000;
const tentatives = new Map();

// Limiteur en mémoire par IP pour freiner le brute-force des codes
function tentativesAutorisees(ip) {
  const maintenant = Date.now();
  const entree = tentatives.get(ip);
  if (!entree || maintenant - entree.debut > FENETRE_MS) {
    tentatives.set(ip, { debut: maintenant, total: 1 });
    return true;
  }
  entree.total += 1;
  return entree.total <= TENTATIVES_MAX;
}

// Vérifie un code et signe un JWT limité à l'équipe concernée
async function ouvrirSessionCapitaine(codeBrut) {
  const code = String(codeBrut || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return null;
  const db = getPool();
  await require("../utils/schema").ensureSchema(db);
  const [rows] = await db.execute(
    `SELECT le.id, le.nom, le.ligue_id, le.code_acces
     FROM LigueEquipe le WHERE le.code_acces = ? LIMIT 1`,
    [code],
  );
  if (!rows.length) return null;
  const equipe = rows[0];
  const token = jwt.sign(
    {
      role: "capitaine",
      equipe_id: equipe.id,
      ligue_id: equipe.ligue_id,
      c: equipe.code_acces,
    },
    process.env.JWT_SECRET,
    { expiresIn: CAPITAINE_TOKEN_DUREE },
  );
  return { token, equipe };
}
exports.ouvrirSessionCapitaine = ouvrirSessionCapitaine;
exports.tentativesAutorisees = tentativesAutorisees;

// POST /api/capitaine/login-code
exports.loginCapitaine = async (req, res) => {
  try {
    if (!tentativesAutorisees(req.ip)) {
      return res
        .status(429)
        .json({ message: "Trop de tentatives, réessayez dans quelques minutes" });
    }
    const session = await ouvrirSessionCapitaine(req.body?.code_acces);
    if (!session) return res.status(401).json({ message: "Code invalide" });
    res.json({
      message: "Connecté en tant que capitaine",
      token: session.token,
      equipe: { id: session.equipe.id, nom: session.equipe.nom },
    });
  } catch (err) {
    console.error("Erreur loginCapitaine :", err);
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
