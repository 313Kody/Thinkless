const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const matchController = require("../controllers/matchController");

// Routes fixes en premier
router.get("/", auth, matchController.getMatchs);
router.post("/", auth, matchController.createMatch);
router.post("/rejoindre-code", auth, matchController.rejoindreAvecCode);

// Routes avec :id ensuite
router.get("/:id", auth, matchController.getMatch);
router.put("/:id", auth, matchController.updateMatch);
router.delete("/:id", auth, matchController.deleteMatch);
router.post("/:id/rejoindre", auth, matchController.rejoindreMatch);
router.post("/:id/resultat", auth, matchController.enregistrerResultat);
router.post("/:id/equipe", auth, matchController.choisirEquipe);
router.post("/:id/valider", auth, matchController.validerJoueur);
router.post("/:id/retirer-equipe", auth, matchController.retirerEquipe);
router.post("/:id/retirer", auth, matchController.retirerJoueur);

module.exports = router;
