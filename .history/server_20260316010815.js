require("dotenv").config();
const express = require("express");
const db = require("./config/db");
const app = express();
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

app.use(express.json());

app.get("/ping", async (req, res) => {
  try {
    await db.getConnection();
    res.json({ message: "Serveur OK + MariaDB connecté ✅" });
  } catch (err) {
    res.status(500).json({ message: "Erreur DB ❌", error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${process.env.PORT}`);
});
