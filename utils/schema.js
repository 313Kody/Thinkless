const crypto = require("crypto");
const { getPool } = require("../config/db");

let schemaReady = null;

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genererCodeAcces(longueur = 8) {
  let code = "";
  for (let i = 0; i < longueur; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function columnExists(db, table, column) {
  const [rows] = await db.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

// Génère un code unique pour une équipe (réessaie en cas de collision)
async function attribuerCodeAcces(db, equipeId) {
  for (let essai = 0; essai < 10; essai += 1) {
    try {
      const code = genererCodeAcces();
      await db.execute("UPDATE LigueEquipe SET code_acces = ? WHERE id = ?", [
        code,
        equipeId,
      ]);
      return code;
    } catch (err) {
      if (err.code !== "ER_DUP_ENTRY") throw err;
    }
  }
  throw new Error("Impossible de générer un code d'accès unique");
}

// Crée / complète le schéma nécessaire aux effectifs, numéros et capitaines.
// Idempotent : les appels suivants réutilisent la même promesse.
async function ensureSchema(db = getPool()) {
  if (!schemaReady) {
    schemaReady = (async () => {
      if (!(await columnExists(db, "LigueUtilisateur", "numero"))) {
        await db.execute(
          "ALTER TABLE LigueUtilisateur ADD COLUMN numero INT NULL",
        );
      }
      if (!(await columnExists(db, "LigueEquipe", "code_acces"))) {
        await db.execute(
          "ALTER TABLE LigueEquipe ADD COLUMN code_acces VARCHAR(10) NULL, ADD UNIQUE KEY uq_ligue_equipe_code (code_acces)",
        );
      }
      if (!(await columnExists(db, "LigueEquipe", "demande_capitaine_id"))) {
        // Candidature capitaine : id du LigueJoueur qui demande, à valider par le staff
        await db.execute(
          "ALTER TABLE LigueEquipe ADD COLUMN demande_capitaine_id INT UNSIGNED NULL",
        );
      }
      // Joueurs « ghost » : présents dans une équipe sans compte Thinkless
      await db.execute(`
        CREATE TABLE IF NOT EXISTS LigueJoueur (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          ligue_id INT UNSIGNED NOT NULL,
          equipe_id INT UNSIGNED NOT NULL,
          nom VARCHAR(100) NOT NULL,
          numero INT NULL,
          est_capitaine TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ligue_id) REFERENCES Ligue(id) ON DELETE CASCADE,
          FOREIGN KEY (equipe_id) REFERENCES LigueEquipe(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      const [sansCode] = await db.execute(
        "SELECT id FROM LigueEquipe WHERE code_acces IS NULL",
      );
      for (const equipe of sansCode) {
        await attribuerCodeAcces(db, equipe.id);
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

// Compatibilité : ancien nom
const ensureNumeroColumn = ensureSchema;

// Middleware Express : garantit le schéma avant les routes concernées
function schemaMiddleware(_req, res, next) {
  ensureSchema().then(
    () => next(),
    (err) => {
      console.error("Erreur ensureSchema :", err);
      res.status(500).json({ message: "Erreur de schéma", error: err.message });
    },
  );
}

module.exports = {
  ensureSchema,
  ensureNumeroColumn,
  schemaMiddleware,
  attribuerCodeAcces,
  genererCodeAcces,
};
