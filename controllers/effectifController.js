const { getPool } = require("../config/db");
const { parserEffectif } = require("../utils/effectif");
const { attribuerCodeAcces } = require("../utils/schema");
const ligueController = require("./ligueController");
const { jetonRejoindre, jetonValide } = require("../utils/rejoindre");

// ------------------------------------------------------- Lien « rejoindre »

async function chargerEquipePublique(db, equipeId) {
  const [rows] = await db.execute(
    `SELECT le.id, le.nom, le.ligue_id, le.capitaine_id, l.nom AS ligue_nom,
            l.publique, l.code_acces AS ligue_code
     FROM LigueEquipe le JOIN Ligue l ON l.id = le.ligue_id
     WHERE le.id = ? LIMIT 1`,
    [equipeId],
  );
  return rows[0] || null;
}

async function nomCapitaine(db, equipe) {
  const [ghost] = await db.execute(
    "SELECT nom FROM LigueJoueur WHERE equipe_id = ? AND est_capitaine = 1 LIMIT 1",
    [equipe.id],
  );
  if (ghost.length) return ghost[0].nom;
  if (equipe.capitaine_id) {
    const [u] = await db.execute(
      "SELECT pseudo FROM Utilisateur WHERE id = ? LIMIT 1",
      [equipe.capitaine_id],
    );
    if (u.length) return u[0].pseudo;
  }
  return null;
}

// GET /api/ligues/:id/equipes/:equipeId/lien-rejoindre – staff ou membre de l'équipe
exports.lienRejoindre = async (req, res) => {
  try {
    const db = getPool();
    const ligueId = Number(req.params.id);
    const equipeId = Number(req.params.equipeId);
    const access = await getAccess(db, ligueId, req.user.id);
    if (!access) return res.status(404).json({ message: "Ligue introuvable" });
    const equipe = await equipeDeLigue(db, ligueId, equipeId);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    if (!access.canManage) {
      const [m] = await db.execute(
        "SELECT 1 FROM LigueUtilisateur WHERE ligue_id = ? AND equipe_id = ? AND utilisateur_id = ? LIMIT 1",
        [ligueId, equipeId, req.user.id],
      );
      if (!m.length) return res.status(403).json({ message: "Interdit" });
    }
    res.json({ chemin: `/rejoindre/${equipeId}/${jetonRejoindre(equipeId)}` });
  } catch (err) {
    console.error("Erreur lienRejoindre :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/rejoindre/:equipeId/:jeton – infos affichées sur la page d'inscription (public)
exports.infosRejoindre = async (req, res) => {
  try {
    const db = getPool();
    const equipeId = Number(req.params.equipeId);
    if (!jetonValide(equipeId, req.params.jeton)) {
      return res.status(404).json({ message: "Lien invalide" });
    }
    const equipe = await chargerEquipePublique(db, equipeId);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    res.json({
      equipe: equipe.nom,
      ligue: equipe.ligue_nom,
      ligue_id: equipe.ligue_id,
      capitaine: await nomCapitaine(db, equipe),
    });
  } catch (err) {
    console.error("Erreur infosRejoindre :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/rejoindre/:equipeId/:jeton { prenom, nom, numero?, veut_etre_capitaine? }
// quickJoin : inscrit un joueur sans compte (ghost). S'il demande le brassard, la candidature
// est stockée dans LigueEquipe.demande_capitaine_id et attend la validation du staff.
exports.quickJoin = async (req, res) => {
  try {
    const db = getPool();
    const equipeId = Number(req.params.equipeId);
    if (!jetonValide(equipeId, req.params.jeton)) {
      return res.status(404).json({ message: "Lien invalide" });
    }
    const equipe = await chargerEquipePublique(db, equipeId);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });

    const nettoyer = (v) =>
      String(v || "")
        .replace(/\s+/g, " ")
        .trim();
    const prenom = nettoyer(req.body?.prenom);
    const nom = nettoyer(req.body?.nom);
    if (!prenom || !nom) {
      return res.status(400).json({ message: "Prénom et nom obligatoires" });
    }
    if (prenom.length > 40 || nom.length > 40) {
      return res.status(400).json({ message: "Prénom/nom trop longs" });
    }
    const complet = `${prenom} ${nom}`;
    const numero = normaliserNumero(req.body?.numero);
    if (Number.isNaN(numero)) {
      return res.status(400).json({ message: "Numéro invalide (0 à 999)" });
    }

    // Candidat capitaine : compte Thinkless obligatoire (créé ou lié), pas de joueur sans compte
    if (req.body?.veut_etre_capitaine) {
      return await candidatureCapitaine(db, req, res, equipe, {
        prenom,
        nom,
        numero,
      });
    }

    const [doublon] = await db.execute(
      "SELECT id FROM LigueJoueur WHERE equipe_id = ? AND LOWER(nom) = LOWER(?) LIMIT 1",
      [equipeId, complet],
    );
    if (!doublon.length) {
      const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM LigueJoueur WHERE equipe_id = ?",
        [equipeId],
      );
      if (total >= 40) {
        return res.status(400).json({ message: "Équipe complète" });
      }
      await db.execute(
        "INSERT INTO LigueJoueur (ligue_id, equipe_id, nom, numero, est_capitaine) VALUES (?, ?, ?, ?, 0)",
        [equipe.ligue_id, equipeId, complet, numero],
      );
    }
    res.status(201).json({
      message: `Bienvenue dans l'équipe ${equipe.nom}`,
      equipe: equipe.nom,
      ligue: equipe.ligue_nom,
      ligue_id: equipe.ligue_id,
      capitaine: await nomCapitaine(db, equipe),
      deja_inscrit: doublon.length > 0,
      candidature_capitaine: false,
      // Le joueur inscrit via le QR de l'équipe peut suivre le live d'une ligue privée
      live_code: Number(equipe.publique) ? null : equipe.ligue_code,
    });
  } catch (err) {
    console.error("Erreur quickJoin :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
exports.rejoindreEquipe = exports.quickJoin;

// Candidature capitaine : crée le compte Thinkless (ou vérifie le mot de passe d'un compte
// existant), inscrit l'utilisateur dans l'équipe puis pose la demande pour le staff.
// LigueEquipe.demande_capitaine_id contient ici l'id de l'UTILISATEUR candidat.
// ... existing code ...

// POST /api/rejoindre/:equipeId/:jeton
// Dans candidatureCapitaine:
async function candidatureCapitaine(
  db,
  req,
  res,
  equipe,
  { prenom, nom, numero },
) {
  const { tentativesAutorisees } = require("./authController");
  const bcrypt = require("bcryptjs");

  if (!tentativesAutorisees(req.ip)) {
    return res
      .status(429)
      .json({ message: "Trop de tentatives, réessayez plus tard" });
  }

  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const motDePasse = String(req.body?.mot_de_passe || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    return res
      .status(400)
      .json({ message: "Email valide obligatoire pour être capitaine" });
  }
  if (!motDePasse) {
    return res
      .status(400)
      .json({
        message: "Mot de passe obligatoire pour créer votre accès capitaine",
      });
  }

  // Vérifier si l'équipe a déjà un capitaine ou une candidature en cours
  const [[eq]] = await db.execute(
    "SELECT demande_capitaine_id FROM LigueEquipe WHERE id = ?",
    [equipe.id],
  );
  if ((await nomCapitaine(db, equipe)) || eq.demande_capitaine_id) {
    return res
      .status(409)
      .json({
        message:
          "Cette équipe a déjà un capitaine ou une candidature en attente",
      });
  }

  let userId;
  const [existants] = await db.execute(
    "SELECT id, mot_de_passe FROM Utilisateur WHERE email = ? LIMIT 1",
    [email],
  );

  if (existants.length) {
    // Vérification mot de passe si le compte existe déjà
    if (!(await bcrypt.compare(motDePasse, existants[0].mot_de_passe))) {
      return res
        .status(401)
        .json({ message: "Mot de passe incorrect pour cet email Thinkless" });
    }
    userId = existants[0].id;
  } else {
    // Exigence de mot de passe fort pour la création du compte
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/.test(motDePasse)) {
      return res.status(400).json({
        message:
          "Mot de passe trop faible (12 caractères min., avec majuscule, minuscule, chiffre et symbole)",
      });
    }
    const base =
      `${prenom}${nom}`.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 40) || "joueur";
    const pseudo = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const [ins] = await db.execute(
      "INSERT INTO Utilisateur (nom, prenom, pseudo, email, mot_de_passe) VALUES (?, ?, ?, ?, ?)",
      [nom, prenom, pseudo, email, await bcrypt.hash(motDePasse, 10)],
    );
    userId = ins.insertId;
  }

  // Effectuer l'affectation et poser la candidature
  const [membre] = await db.execute(
    "SELECT equipe_id FROM LigueUtilisateur WHERE ligue_id = ? AND utilisateur_id = ?",
    [equipe.ligue_id, userId],
  );
  if (!membre.length) {
    await db.execute(
      `INSERT INTO LigueUtilisateur (ligue_id, utilisateur_id, equipe_id, statut, est_staff, role_ligue, numero)
       VALUES (?, ?, ?, 'valide', 0, 'joueur', ?)`,
      [equipe.ligue_id, userId, equipe.id, numero],
    );
  } else if (
    membre[0].equipe_id &&
    Number(membre[0].equipe_id) !== Number(equipe.id)
  ) {
    return res
      .status(409)
      .json({
        message: "Ce compte est déjà dans une autre équipe de la ligue",
      });
  } else {
    await db.execute(
      "UPDATE LigueUtilisateur SET equipe_id = ?, statut = 'valide', numero = COALESCE(?, numero) WHERE ligue_id = ? AND utilisateur_id = ?",
      [equipe.id, numero, equipe.ligue_id, userId],
    );
  }

  await db.execute(
    "UPDATE LigueEquipe SET demande_capitaine_id = ? WHERE id = ?",
    [userId, equipe.id],
  );

  res.status(201).json({
    message: `Bienvenue dans l'équipe ${equipe.nom}`,
    equipe: equipe.nom,
    ligue: equipe.ligue_nom,
    ligue_id: equipe.ligue_id,
    capitaine: null,
    deja_inscrit: membre.length > 0,
    candidature_capitaine: true,
    live_code: Number(equipe.publique) ? null : equipe.ligue_code,
  });
}

// POST /api/ligues/:id/equipes/:equipeId/capitaine { accepter }
exports.validerCapitaine = async (req, res) => {
  try {
    const db = getPool();
    const acces = await exigerGestion(req, res);
    if (!acces) return;

    const ligueId = Number(req.params.id);
    const equipeId = Number(req.params.equipeId);
    const equipe = await equipeDeLigue(db, ligueId, equipeId);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });

    const [[{ demande_capitaine_id: demande }]] = await db.execute(
      "SELECT demande_capitaine_id FROM LigueEquipe WHERE id = ?",
      [equipeId],
    );
    if (!demande)
      return res.status(404).json({ message: "Aucune candidature" });

    // Nettoyage : vérification que la candidature pointe vers un vrai compte Utilisateur
    const [userExists] = await db.execute(
      "SELECT id FROM Utilisateur WHERE id = ? LIMIT 1",
      [demande],
    );
    if (!userExists.length) {
      // Rejeter automatiquement si c'est un identifiant orphelin (anciennes candidatures sans compte)
      await db.execute(
        "UPDATE LigueEquipe SET demande_capitaine_id = NULL WHERE id = ?",
        [equipeId],
      );
      return res
        .status(400)
        .json({
          message:
            "Candidature invalide ou obsolète (aucun compte utilisateur associé).",
        });
    }

    if (req.body?.accepter) {
      await db.execute(
        "UPDATE LigueJoueur SET est_capitaine = 0 WHERE equipe_id = ?",
        [equipeId],
      );
      await db.execute("UPDATE LigueEquipe SET capitaine_id = ? WHERE id = ?", [
        demande,
        equipeId,
      ]);
    }

    await db.execute(
      "UPDATE LigueEquipe SET demande_capitaine_id = NULL WHERE id = ?",
      [equipeId],
    );
    res.json({
      message: req.body?.accepter ? "Capitaine validé" : "Candidature refusée",
    });
  } catch (err) {
    console.error("Erreur validerCapitaine :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// Droits d'un utilisateur sur une ligue (créateur ou staff = gestion)
async function getAccess(db, ligueId, userId) {
  const [rows] = await db.execute(
    `SELECT l.id, l.createur_id, l.poules_verrouillees, lu.est_staff
     FROM Ligue l
     LEFT JOIN LigueUtilisateur lu
       ON lu.ligue_id = l.id AND lu.utilisateur_id = ?
     WHERE l.id = ? LIMIT 1`,
    [userId, ligueId],
  );
  if (!rows.length) return null;
  const ligue = rows[0];
  return {
    ligue,
    canManage:
      Number(ligue.createur_id) === Number(userId) ||
      Number(ligue.est_staff) === 1,
  };
}

// Vérifie les droits de gestion ; renvoie l'accès ou répond directement en erreur
async function exigerGestion(req, res) {
  const db = getPool();
  const access = await getAccess(db, Number(req.params.id), req.user.id);
  if (!access) {
    res.status(404).json({ message: "Ligue introuvable" });
    return null;
  }
  if (!access.canManage) {
    res.status(403).json({ message: "Interdit" });
    return null;
  }
  return access;
}

async function equipeDeLigue(db, ligueId, equipeId) {
  const [rows] = await db.execute(
    "SELECT id, nom, poule, code_acces FROM LigueEquipe WHERE id = ? AND ligue_id = ? LIMIT 1",
    [equipeId, ligueId],
  );
  return rows[0] || null;
}

function normaliserNumero(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : NaN;
}

// Insère les joueurs ghost d'une équipe (option : remplace les ghosts existants)
async function insererEffectif(db, ligueId, equipeId, joueurs, remplacer) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (remplacer) {
      await connection.execute(
        "DELETE FROM LigueJoueur WHERE ligue_id = ? AND equipe_id = ?",
        [ligueId, equipeId],
      );
    }
    const capitaine = joueurs.some((j) => j.est_capitaine);
    if (capitaine) {
      await connection.execute(
        "UPDATE LigueJoueur SET est_capitaine = 0 WHERE ligue_id = ? AND equipe_id = ?",
        [ligueId, equipeId],
      );
    }
    let derniereCapitaine = -1;
    joueurs.forEach((j, i) => {
      if (j.est_capitaine) derniereCapitaine = i;
    });
    for (const [index, joueur] of joueurs.entries()) {
      await connection.execute(
        `INSERT INTO LigueJoueur (ligue_id, equipe_id, nom, numero, est_capitaine)
         VALUES (?, ?, ?, ?, ?)`,
        [
          ligueId,
          equipeId,
          joueur.nom,
          joueur.numero,
          index === derniereCapitaine ? 1 : 0,
        ],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

function lireEffectif(body) {
  const { joueurs, erreurs } = parserEffectif(body?.texte);
  if (erreurs.length) {
    return {
      erreur: `Lignes illisibles : ${erreurs.slice(0, 3).join(" | ")}`,
    };
  }
  if (!joueurs.length) return { erreur: "Aucun joueur détecté" };
  if (joueurs.length > 40) return { erreur: "40 joueurs maximum par import" };
  return { joueurs };
}

// ---------------------------------------------------------------- Staff

// POST /api/ligues/:id/equipes – créer une équipe (poules non verrouillées)
exports.creerEquipe = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    if (access.ligue.poules_verrouillees) {
      return res.status(409).json({ message: "Les poules sont verrouillées" });
    }
    const nom = String(req.body?.nom || "").trim();
    if (!nom || nom.length > 100) {
      return res.status(400).json({ message: "Nom d'équipe invalide" });
    }
    const poule = ["A", "B"].includes(req.body?.poule) ? req.body.poule : null;
    const db = getPool();
    let equipeId;
    try {
      const [result] = await db.execute(
        "INSERT INTO LigueEquipe (ligue_id, nom, poule) VALUES (?, ?, ?)",
        [access.ligue.id, nom, poule],
      );
      equipeId = result.insertId;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Ce nom d'équipe existe déjà" });
      }
      throw err;
    }
    const code = await attribuerCodeAcces(db, equipeId);
    let importes = 0;
    if (req.body?.texte) {
      const lu = lireEffectif(req.body);
      if (lu.erreur) {
        return res.status(201).json({
          id: equipeId,
          code_acces: code,
          message: `Équipe créée, effectif ignoré (${lu.erreur})`,
        });
      }
      await insererEffectif(db, access.ligue.id, equipeId, lu.joueurs, false);
      importes = lu.joueurs.length;
    }
    res.status(201).json({
      id: equipeId,
      code_acces: code,
      importes,
      message: "Équipe créée",
    });
  } catch (err) {
    console.error("Erreur creerEquipe :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// PUT /api/ligues/:id/equipes/:equipeId – renommer / changer de poule
exports.modifierEquipe = async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const ligueId = access.ligue.id;
    const equipe = await equipeDeLigue(
      db,
      ligueId,
      Number(req.params.equipeId),
    );
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });

    const changePoule = req.body?.poule !== undefined;
    if (changePoule && access.ligue.poules_verrouillees) {
      return res.status(409).json({
        message:
          "Poules verrouillées : déverrouillez avant de déplacer une équipe",
      });
    }
    const nouveauNom =
      req.body?.nom === undefined ? equipe.nom : String(req.body.nom).trim();
    if (!nouveauNom || nouveauNom.length > 100) {
      return res.status(400).json({ message: "Nom d'équipe invalide" });
    }
    let nouvellePoule = equipe.poule;
    if (changePoule) {
      if (!["A", "B", null, ""].includes(req.body.poule)) {
        return res.status(400).json({ message: "Poule invalide (A ou B)" });
      }
      nouvellePoule = req.body.poule || null;
    }

    await connection.beginTransaction();
    await connection.execute(
      "UPDATE LigueEquipe SET nom = ?, poule = ? WHERE id = ?",
      [nouveauNom, nouvellePoule, equipe.id],
    );
    // Les matchs référencent les équipes par leur nom
    if (nouveauNom !== equipe.nom) {
      await connection.execute(
        "UPDATE MatchSport SET nom_equipe_a = ? WHERE ligue_id = ? AND nom_equipe_a = ?",
        [nouveauNom, ligueId, equipe.nom],
      );
      await connection.execute(
        "UPDATE MatchSport SET nom_equipe_b = ? WHERE ligue_id = ? AND nom_equipe_b = ?",
        [nouveauNom, ligueId, equipe.nom],
      );
    }
    await connection.commit();
    res.json({ message: "Équipe mise à jour" });
  } catch (err) {
    await connection.rollback().catch(() => {});
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Ce nom d'équipe existe déjà" });
    }
    console.error("Erreur modifierEquipe :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  } finally {
    connection.release();
  }
};

// DELETE /api/ligues/:id/equipes/:equipeId
exports.supprimerEquipe = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const equipe = await equipeDeLigue(
      db,
      access.ligue.id,
      Number(req.params.equipeId),
    );
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });

    const [matchs] = await db.execute(
      `SELECT COUNT(*) AS total FROM MatchSport
       WHERE ligue_id = ? AND statut <> 'annule'
         AND (nom_equipe_a = ? OR nom_equipe_b = ?)`,
      [access.ligue.id, equipe.nom, equipe.nom],
    );
    if (Number(matchs[0].total) > 0) {
      return res.status(409).json({
        message: `Équipe engagée dans ${matchs[0].total} match(s) : annulez-les d'abord`,
      });
    }
    await db.execute("DELETE FROM LigueEquipe WHERE id = ?", [equipe.id]);
    res.json({ message: "Équipe supprimée" });
  } catch (err) {
    console.error("Erreur supprimerEquipe :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/equipes/:equipeId/code – régénère le code (révoque l'ancien)
exports.regenererCode = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const equipe = await equipeDeLigue(
      db,
      access.ligue.id,
      Number(req.params.equipeId),
    );
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    const code = await attribuerCodeAcces(db, equipe.id);
    res.json({ code_acces: code, message: "Nouveau code généré" });
  } catch (err) {
    console.error("Erreur regenererCode :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/equipes/:equipeId/joueurs/import
exports.importerEffectif = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const equipe = await equipeDeLigue(
      db,
      access.ligue.id,
      Number(req.params.equipeId),
    );
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    const lu = lireEffectif(req.body);
    if (lu.erreur) return res.status(400).json({ message: lu.erreur });
    await insererEffectif(
      db,
      access.ligue.id,
      equipe.id,
      lu.joueurs,
      req.body?.remplacer === true,
    );
    res.status(201).json({
      importes: lu.joueurs.length,
      message: `${lu.joueurs.length} joueur(s) importé(s)`,
    });
  } catch (err) {
    console.error("Erreur importerEffectif :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// GET /api/ligues/:id/joueurs – tous les joueurs (comptes + ghosts) pour le dashboard
exports.listerJoueurs = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const [membres] = await db.execute(
      `SELECT 'membre' AS kind, u.id AS ref_id, u.pseudo, u.nom, u.prenom,
              lu.numero, lu.equipe_id, lu.role_ligue, lu.est_staff,
              (le.capitaine_id = u.id) AS est_capitaine
       FROM LigueUtilisateur lu
       JOIN Utilisateur u ON u.id = lu.utilisateur_id
       LEFT JOIN LigueEquipe le ON le.id = lu.equipe_id
       WHERE lu.ligue_id = ?
       ORDER BY u.pseudo ASC`,
      [access.ligue.id],
    );
    const [ghosts] = await db.execute(
      `SELECT 'ghost' AS kind, id AS ref_id, nom AS pseudo, nom, NULL AS prenom,
              numero, equipe_id, 'joueur' AS role_ligue, 0 AS est_staff, est_capitaine
       FROM LigueJoueur WHERE ligue_id = ? ORDER BY nom ASC`,
      [access.ligue.id],
    );
    res.json({ joueurs: [...membres, ...ghosts] });
  } catch (err) {
    console.error("Erreur listerJoueurs :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// PUT /api/ligues/:id/joueurs/:kind/:refId – corriger / transférer un joueur
exports.modifierJoueur = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const ligueId = access.ligue.id;
    const { kind } = req.params;
    const refId = Number(req.params.refId);
    if (!["ghost", "membre"].includes(kind)) {
      return res.status(400).json({ message: "Type de joueur invalide" });
    }

    const numero = normaliserNumero(req.body?.numero);
    if (Number.isNaN(numero)) {
      return res.status(400).json({ message: "Numéro invalide (0 à 999)" });
    }
    let equipeId;
    if (req.body?.equipe_id !== undefined) {
      equipeId =
        req.body.equipe_id === null ? null : Number(req.body.equipe_id);
      if (equipeId !== null && !(await equipeDeLigue(db, ligueId, equipeId))) {
        return res.status(404).json({ message: "Équipe introuvable" });
      }
    }

    if (kind === "ghost") {
      const [rows] = await db.execute(
        "SELECT id, equipe_id FROM LigueJoueur WHERE id = ? AND ligue_id = ?",
        [refId, ligueId],
      );
      if (!rows.length) {
        return res.status(404).json({ message: "Joueur introuvable" });
      }
      const nom =
        req.body?.nom === undefined ? null : String(req.body.nom).trim();
      if (nom !== null && (!nom || nom.length > 100)) {
        return res.status(400).json({ message: "Nom invalide" });
      }
      if (equipeId === null) {
        return res
          .status(400)
          .json({ message: "Un joueur sans compte doit avoir une équipe" });
      }
      const cible = equipeId ?? rows[0].equipe_id;
      const capitaine = req.body?.est_capitaine === true;
      await db.execute(
        `UPDATE LigueJoueur
         SET nom = COALESCE(?, nom), numero = ?, equipe_id = ?, est_capitaine = ?
         WHERE id = ?`,
        [
          nom,
          req.body?.numero === undefined ? null : numero,
          cible,
          capitaine ? 1 : 0,
          refId,
        ],
      );
      if (capitaine) {
        await db.execute(
          "UPDATE LigueJoueur SET est_capitaine = 0 WHERE ligue_id = ? AND equipe_id = ? AND id <> ?",
          [ligueId, cible, refId],
        );
      }
      return res.json({ message: "Joueur mis à jour" });
    }

    const [rows] = await db.execute(
      "SELECT equipe_id FROM LigueUtilisateur WHERE ligue_id = ? AND utilisateur_id = ?",
      [ligueId, refId],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Joueur introuvable" });
    }
    const sets = [];
    const params = [];
    if (req.body?.numero !== undefined) {
      sets.push("numero = ?");
      params.push(numero);
    }
    if (equipeId !== undefined) {
      sets.push("equipe_id = ?");
      params.push(equipeId);
    }
    if (sets.length) {
      await db.execute(
        `UPDATE LigueUtilisateur SET ${sets.join(", ")} WHERE ligue_id = ? AND utilisateur_id = ?`,
        [...params, ligueId, refId],
      );
    }
    // Un capitaine transféré ne garde pas la capitainerie de son ancienne équipe
    if (equipeId !== undefined && Number(rows[0].equipe_id) !== equipeId) {
      await db.execute(
        "UPDATE LigueEquipe SET capitaine_id = NULL WHERE ligue_id = ? AND capitaine_id = ?",
        [ligueId, refId],
      );
    }
    res.json({ message: "Joueur mis à jour" });
  } catch (err) {
    console.error("Erreur modifierJoueur :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// DELETE /api/ligues/:id/joueurs/:kind/:refId – retirer de la ligue (le compte reste)
exports.supprimerJoueur = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const ligueId = access.ligue.id;
    const refId = Number(req.params.refId);
    if (req.params.kind === "ghost") {
      const [result] = await db.execute(
        "DELETE FROM LigueJoueur WHERE id = ? AND ligue_id = ?",
        [refId, ligueId],
      );
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Joueur introuvable" });
      }
      return res.json({ message: "Joueur supprimé" });
    }
    if (req.params.kind !== "membre") {
      return res.status(400).json({ message: "Type de joueur invalide" });
    }
    if (refId === Number(access.ligue.createur_id)) {
      return res
        .status(400)
        .json({ message: "Le créateur ne peut pas être retiré de sa ligue" });
    }
    await db.execute(
      "UPDATE LigueEquipe SET capitaine_id = NULL WHERE ligue_id = ? AND capitaine_id = ?",
      [ligueId, refId],
    );
    const [result] = await db.execute(
      "DELETE FROM LigueUtilisateur WHERE ligue_id = ? AND utilisateur_id = ?",
      [ligueId, refId],
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Joueur introuvable" });
    }
    res.json({ message: "Joueur retiré de la ligue" });
  } catch (err) {
    console.error("Erreur supprimerJoueur :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/cloturer-poules
// Vérifie que tous les matchs de poule sont finis, verrouille les poules puis
// génère la phase finale à partir du classement final.
exports.cloturerPoules = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const db = getPool();
    const ligueId = access.ligue.id;
    const dejaVerrouillees = Number(access.ligue.poules_verrouillees) === 1;

    const [pending] = await db.execute(
      `SELECT COUNT(*) AS total FROM MatchSport
       WHERE ligue_id = ? AND phase = 'poule' AND statut NOT IN ('termine','annule')`,
      [ligueId],
    );
    if (Number(pending[0].total) > 0) {
      return res.status(409).json({
        message: `${pending[0].total} match(s) de poule restent à jouer`,
      });
    }
    const [joues] = await db.execute(
      "SELECT COUNT(*) AS total FROM MatchSport WHERE ligue_id = ? AND phase = 'poule' AND statut = 'termine'",
      [ligueId],
    );
    if (Number(joues[0].total) === 0) {
      return res.status(409).json({ message: "Aucun match de poule terminé" });
    }

    await db.execute("UPDATE Ligue SET poules_verrouillees = 1 WHERE id = ?", [
      ligueId,
    ]);

    // On réutilise genererPhaseFinale en capturant sa réponse
    const resultat = { status: 200, body: null };
    const fauxRes = {
      status(code) {
        resultat.status = code;
        return this;
      },
      json(body) {
        resultat.body = body;
        return this;
      },
    };
    await ligueController.genererPhaseFinale(req, fauxRes);

    if (resultat.status >= 400) {
      if (!dejaVerrouillees) {
        await db.execute(
          "UPDATE Ligue SET poules_verrouillees = 0 WHERE id = ?",
          [ligueId],
        );
      }
      return res.status(resultat.status).json(resultat.body);
    }
    res.status(201).json({
      ...(resultat.body || {}),
      message: "Phase de poules clôturée, phase finale générée",
    });
  } catch (err) {
    console.error("Erreur cloturerPoules :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/ligues/:id/retard – décale les matchs à venir de N minutes
exports.appliquerRetard = async (req, res) => {
  try {
    const access = await exigerGestion(req, res);
    if (!access) return;
    const minutes = Number(req.body?.minutes);
    if (!Number.isInteger(minutes) || minutes === 0) {
      return res
        .status(400)
        .json({ message: "Saisissez un nombre entier de minutes non nul" });
    }
    if (minutes < -60 || minutes > 240) {
      return res
        .status(400)
        .json({ message: "Décalage limité entre -60 et +240 minutes" });
    }
    const db = getPool();
    const params = [minutes, access.ligue.id];
    let filtre = "";
    if (req.body?.terrain_id) {
      filtre = " AND terrain_id = ?";
      params.push(Number(req.body.terrain_id));
    }
    if (req.body?.apres_match_id) {
      const [ref] = await db.execute(
        "SELECT date_heure FROM MatchSport WHERE id = ? AND ligue_id = ?",
        [Number(req.body.apres_match_id), access.ligue.id],
      );
      if (ref.length) {
        filtre += " AND date_heure >= ?";
        params.push(ref[0].date_heure);
      }
    }
    const [result] = await db.execute(
      `UPDATE MatchSport
       SET date_heure = DATE_ADD(date_heure, INTERVAL ? MINUTE)
       WHERE ligue_id = ?
         AND statut NOT IN ('termine','annule')
         AND (statut_match IS NULL OR statut_match = 'programme')${filtre}`,
      params,
    );
    res.json({
      decales: result.affectedRows,
      message: `${result.affectedRows} match(s) décalé(s) de ${minutes > 0 ? "+" : ""}${minutes} min`,
    });
  } catch (err) {
    console.error("Erreur appliquerRetard :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// ------------------------------------------------------------- Capitaine

async function chargerEquipeCapitaine(db, req) {
  const [rows] = await db.execute(
    `SELECT le.id, le.nom, le.poule, le.logo_url, le.ligue_id, l.nom AS ligue_nom
     FROM LigueEquipe le JOIN Ligue l ON l.id = le.ligue_id
     WHERE le.id = ? LIMIT 1`,
    [req.capitaine.equipe_id],
  );
  return rows[0] || null;
}

async function effectifEquipe(db, equipe) {
  const [membres] = await db.execute(
    `SELECT u.pseudo AS nom, lu.numero, (le.capitaine_id = u.id) AS est_capitaine
     FROM LigueUtilisateur lu
     JOIN Utilisateur u ON u.id = lu.utilisateur_id
     JOIN LigueEquipe le ON le.id = lu.equipe_id
     WHERE lu.ligue_id = ? AND lu.equipe_id = ? AND lu.est_staff = 0`,
    [equipe.ligue_id, equipe.id],
  );
  const [ghosts] = await db.execute(
    "SELECT id, nom, numero, est_capitaine FROM LigueJoueur WHERE equipe_id = ?",
    [equipe.id],
  );
  const joueurs = [
    ...membres.map((m) => ({ ...m, compte: true })),
    ...ghosts.map((g) => ({ ...g, compte: false })),
  ];
  joueurs.sort(
    (a, b) =>
      Number(b.est_capitaine) - Number(a.est_capitaine) ||
      (a.numero ?? 999) - (b.numero ?? 999),
  );
  return joueurs;
}

// GET /api/capitaine/equipe
exports.getEquipeCapitaine = async (req, res) => {
  try {
    const db = getPool();
    const equipe = await chargerEquipeCapitaine(db, req);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    equipe.jeton_rejoindre = jetonRejoindre(equipe.id);
    res.json({ equipe, joueurs: await effectifEquipe(db, equipe) });
  } catch (err) {
    console.error("Erreur getEquipeCapitaine :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// POST /api/capitaine/effectif – import en masse par le capitaine
exports.importerEffectifCapitaine = async (req, res) => {
  try {
    const db = getPool();
    const equipe = await chargerEquipeCapitaine(db, req);
    if (!equipe) return res.status(404).json({ message: "Équipe introuvable" });
    const lu = lireEffectif(req.body);
    if (lu.erreur) return res.status(400).json({ message: lu.erreur });
    await insererEffectif(
      db,
      equipe.ligue_id,
      equipe.id,
      lu.joueurs,
      req.body?.remplacer === true,
    );
    res.status(201).json({
      importes: lu.joueurs.length,
      message: `${lu.joueurs.length} joueur(s) importé(s)`,
    });
  } catch (err) {
    console.error("Erreur importerEffectifCapitaine :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};

// DELETE /api/capitaine/joueurs/:id – retire un joueur sans compte de son équipe
exports.supprimerJoueurCapitaine = async (req, res) => {
  try {
    const db = getPool();
    const [result] = await db.execute(
      "DELETE FROM LigueJoueur WHERE id = ? AND equipe_id = ?",
      [Number(req.params.id), req.capitaine.equipe_id],
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Joueur introuvable" });
    }
    res.json({ message: "Joueur supprimé" });
  } catch (err) {
    console.error("Erreur supprimerJoueurCapitaine :", err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};
