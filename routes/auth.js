const express = require("express");
const router = express.Router();

// Import controllers on demand to avoid DB connection at startup
router.post("/register", async (req, res) => {
  try {
    const authController = require("../controllers/authController");
    await authController.register(req, res);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const authController = require("../controllers/authController");
    await authController.login(req, res);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

module.exports = router;
