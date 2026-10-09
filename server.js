require("dotenv").config();
const express = require("express");
const { getPool } = require("./config/db");
const app = express();

app.use(express.json());
app.use(express.static("public"));

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const matchRoutes = require("./routes/matchs");
app.use("/api/matchs", matchRoutes);

const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

const ligueRoutes = require("./routes/ligues");
app.use("/api/ligues", ligueRoutes);

const profilRoutes = require("./routes/profil");
app.use("/api/profil", profilRoutes);

const equipeRoutes = require("./routes/equipes");
app.use("/api/equipes", equipeRoutes);
app.use("/api/equipes-esport", equipeRoutes);

const esportRoutes = require("./routes/esport");
app.use("/api/esport", esportRoutes);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/accueil.html");
});

app.use("/api/capitaine", require("./routes/capitaine"));

// Inscription publique d'un joueur via le QR de l'équipe (schéma assuré par le middleware)
{
  const effectifController = require("./controllers/effectifController");
  const { schemaMiddleware } = require("./utils/schema");
  app.get("/api/rejoindre/:equipeId/:jeton", schemaMiddleware, effectifController.infosRejoindre);
  app.post("/api/rejoindre/:equipeId/:jeton", schemaMiddleware, effectifController.quickJoin);
  app.get("/rejoindre/:equipeId/:jeton", (req, res) => {
    res.sendFile(__dirname + "/public/rejoindre.html");
  });
}

// Magic link capitaine : valide le code, stocke le token puis redirige
app.get("/claim/:code", async (req, res) => {
  try {
    const { tentativesAutorisees, ouvrirSessionCapitaine } = require("./controllers/authController");
    if (!tentativesAutorisees(req.ip)) {
      return res.status(429).send("Trop de tentatives, réessayez plus tard.");
    }
    const session = await ouvrirSessionCapitaine(req.params.code);
    if (!session) {
      return res.status(404).send("Code d'équipe invalide ou révoqué.");
    }
    const donnees = JSON.stringify({
      token: session.token,
      nom: session.equipe.nom,
    }).replace(/</g, "\\u003c");
    res.set("Cache-Control", "no-store").type("html").send(
      `<!doctype html><meta charset="utf-8"><title>Connexion capitaine</title>
<p>Connexion en cours…</p>
<script>
const d = ${donnees};
localStorage.setItem("capitaine_token", d.token);
localStorage.setItem("capitaine_equipe", d.nom);
location.replace("/capitaine");
</script>`,
    );
  } catch (err) {
    console.error("Erreur /claim :", err);
    res.status(500).send("Erreur serveur");
  }
});

app.get("/capitaine", (req, res) => {
  res.sendFile(__dirname + "/public/capitaine.html");
});

app.get("/ligues/:id/live", (req, res) => {
  res.sendFile(__dirname + "/public/ligue-live.html");
});

// Pages staff (l'accès réel est contrôlé par l'API via le JWT)
app.get("/ligues/:id/dashboard", (req, res) => {
  res.sendFile(__dirname + "/public/staff-dashboard.html");
});
app.get("/ligues/:id/gestion", (req, res) => {
  res.sendFile(__dirname + "/public/staff-ligue.html");
});

app.get("/ping", async (req, res) => {
  try {
    const db = getPool();
    await db.getConnection();
    res.json({ message: "Serveur OK + MariaDB connecté ✅" });
  } catch (err) {
    res.status(500).json({ message: "Erreur DB ❌", error: err.message });
  }
});

app.get("/api/jeux", async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute("SELECT * FROM JeuEsport ORDER BY nom");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});
// Route sports (simple, pas besoin de controller séparé)
app.get("/api/sports", async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.execute("SELECT * FROM Sport ORDER BY nom");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${process.env.PORT}`);
});
