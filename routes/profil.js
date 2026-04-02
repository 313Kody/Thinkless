const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const p = require("../controllers/profilController");

router.get("/", auth, p.getProfil);
router.put("/pseudo", auth, p.updatePseudo);
router.put("/localisation", auth, p.updateLocalisation);
router.put("/password", auth, p.updatePassword);
router.post("/sports", auth, p.addSport);
router.put("/sports/:sportId", auth, p.updateSportLevel);
router.delete("/sports/:sportId", auth, p.removeSport);
router.post("/jeux", auth, p.addJeu);
router.put("/jeux/:jeuId", auth, p.updateJeuLevel);
router.delete("/jeux/:jeuId", auth, p.removeJeu);
router.delete("/equipe", auth, p.quitterEquipe);
router.delete("/", auth, p.deleteAccount);

module.exports = router;
