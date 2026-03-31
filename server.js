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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/accueil.html");
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
