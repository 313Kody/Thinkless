const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const esportController = require("../controllers/esportController");

router.get("/jeux", auth, esportController.getJeux);

router.get("/ligues", auth, esportController.getEsportLigues);
router.post("/ligues", auth, esportController.createEsportLigue);
router.post(
  "/ligues/rejoindre-code",
  auth,
  esportController.rejoindreEsportLigueAvecCode,
);
router.get(
  "/ligues/classement/:jeuId",
  auth,
  esportController.getClassementJeu,
);
router.get(
  "/ligues/:id/classement",
  auth,
  esportController.classementEsportLigue,
);
router.get("/ligues/:id/matchs", auth, esportController.getMatchsEsportLigue);
router.get("/ligues/:id/equipes", auth, esportController.getEsportEquipesLigue);
router.post(
  "/ligues/:id/rejoindre",
  auth,
  esportController.rejoindreEsportLigue,
);
router.post("/ligues/:id/quitter", auth, esportController.quitterEsportLigue);
router.get("/ligues/:id", auth, esportController.getEsportLigue);

router.get("/matchs", auth, esportController.getMatchs);
router.post("/matchs", auth, esportController.createMatch);
router.get("/matchs/:id", auth, esportController.getMatch);
router.post("/matchs/:id/rejoindre", auth, esportController.rejoindreMatch);
router.post("/matchs/:id/convoques", auth, esportController.updateConvocations);
router.post("/matchs/:id/resultat", auth, esportController.enregistrerResultat);

module.exports = router;
