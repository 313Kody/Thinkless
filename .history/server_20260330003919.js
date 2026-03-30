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

app.get("/ping", async (req, res) => {
  try {
    const db = getPool();
    await db.getConnection();
    res.json({ message: "Serveur OK + MariaDB connecté ✅" });
  } catch (err) {
    res.status(500).json({ message: "Erreur DB ❌", error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${process.env.PORT}`);
});
