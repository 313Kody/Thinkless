const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const effectifController = require("../controllers/effectifController");
const authCapitaine = require("../middlewares/authCapitaine");
const { schemaMiddleware } = require("../utils/schema");

router.use(schemaMiddleware);

router.post("/login-code", authController.loginCapitaine);
router.get("/equipe", authCapitaine, effectifController.getEquipeCapitaine);
router.post(
  "/effectif",
  authCapitaine,
  effectifController.importerEffectifCapitaine,
);
router.delete(
  "/joueurs/:id",
  authCapitaine,
  effectifController.supprimerJoueurCapitaine,
);

module.exports = router;
