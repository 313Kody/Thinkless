const express = require("express");
const app = express();

app.get("/ping", (req, res) => {
  res.json({ message: "ok" });
});

app.listen(3000, () => {
  console.log("Serveur démarré sur http://localhost:3000");
});
