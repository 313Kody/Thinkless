const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const auth = require("../middlewares/auth");
const ligueController = require("../controllers/ligueController");
const effectifController = require("../controllers/effectifController");
const liveController = require("../controllers/liveController");
const { schemaMiddleware } = require("../utils/schema");

const teamLogosDir = path.join(
  __dirname,
  "..",
  "public",
  "uploads",
  "team-logos",
);
fs.mkdirSync(teamLogosDir, { recursive: true });
const teamLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, teamLogosDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const safeExtension = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(
        extension,
      )
        ? extension
        : ".png";
      callback(
        null,
        `ligue-team-${req.params.equipeId}-${Date.now()}${safeExtension}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    callback(null, Boolean(file.mimetype?.startsWith("image/"))),
});

router.use(schemaMiddleware);

router.get("/", auth, ligueController.getLigues);
router.post("/", auth, ligueController.createLigue);
router.post("/rejoindre-code", auth, ligueController.rejoindreAvecCode);

// Routes spécifiques AVANT les routes dynamiques
router.get("/:id/classement", auth, ligueController.classement);
router.get("/:id/matchs", auth, ligueController.getMatchsLigue);
router.get("/:id/equipes", auth, ligueController.getEquipes);
router.post("/:id/equipes", auth, effectifController.creerEquipe);
router.put("/:id/equipes/:equipeId", auth, effectifController.modifierEquipe);
router.delete("/:id/equipes/:equipeId", auth, effectifController.supprimerEquipe);
router.post("/:id/equipes/:equipeId/code", auth, effectifController.regenererCode);
router.post("/:id/equipes/:equipeId/capitaine", auth, effectifController.validerCapitaine);
router.get("/:id/equipes/:equipeId/lien-rejoindre", auth, effectifController.lienRejoindre);
router.post(
  "/:id/equipes/:equipeId/joueurs/import",
  auth,
  effectifController.importerEffectif,
);
router.get("/:id/joueurs", auth, effectifController.listerJoueurs);
router.put("/:id/joueurs/:kind/:refId", auth, effectifController.modifierJoueur);
router.delete("/:id/joueurs/:kind/:refId", auth, effectifController.supprimerJoueur);
router.post("/:id/cloturer-poules", auth, effectifController.cloturerPoules);
router.post("/:id/retard", auth, effectifController.appliquerRetard);
router.post("/:id/generate-matches", auth, ligueController.genererCalendrier);
router.post(
  "/:id/equipes/:equipeId/rejoindre",
  auth,
  ligueController.rejoindreEquipe,
);
router.get("/:id/equipes/:equipeId", auth, ligueController.getEquipeLigue);
router.post("/:id/equipes/:equipeId/logo", auth, (req, res) => {
  teamLogoUpload.single("logo")(req, res, (error) => {
    if (error)
      return res
        .status(400)
        .json({ message: error.message || "Upload refusé" });
    return ligueController.uploadLogoEquipeLigue(req, res);
  });
});
router.post(
  "/:id/equipes/:equipeId/demandes/:demandeId/decision",
  auth,
  ligueController.deciderDemandeEquipe,
);
router.put(
  "/:id/membres/:userId/role",
  auth,
  ligueController.modifierRoleMembre,
);
router.put(
  "/:id/membres/:userId/equipe",
  auth,
  ligueController.affecterMembreEquipe,
);
router.put(
  "/:id/equipes/:equipeId/capitaine",
  auth,
  ligueController.designerCapitaine,
);
router.post("/:id/generer-poules", auth, ligueController.genererPoules);
router.post("/:id/generer-calendrier", auth, ligueController.genererCalendrier);
router.post("/:id/verrouiller-poules", auth, ligueController.verrouillerPoules);
router.post("/:id/deverrouiller-poules", auth, ligueController.deverrouillerPoules);
router.post(
  "/:id/generer-phase-finale",
  auth,
  ligueController.genererPhaseFinale,
);
router.post("/:id/rejoindre", auth, ligueController.rejoindre);
router.post("/:id/quitter", auth, ligueController.quitter);

// Route générique à la fin
// Route publique (spectateurs via QR code) : volontairement sans `auth`.
router.get("/:id/live-data", liveController.getLiveData);

router.get("/:id", auth, ligueController.getLigue);
router.put("/:id", auth, ligueController.updateLigue);
router.delete("/:id", auth, ligueController.deleteLigue);

module.exports = router;
