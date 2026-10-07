const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const auth = require("../middlewares/auth");
const ligueController = require("../controllers/ligueController");

const teamLogosDir = path.join(__dirname, "..", "public", "uploads", "team-logos");
fs.mkdirSync(teamLogosDir, { recursive: true });
const teamLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, teamLogosDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const safeExtension = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension) ? extension : ".png";
      callback(null, `ligue-team-${req.params.equipeId}-${Date.now()}${safeExtension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, Boolean(file.mimetype?.startsWith("image/"))),
});

router.get("/", auth, ligueController.getLigues);
router.post("/", auth, ligueController.createLigue);
router.post("/rejoindre-code", auth, ligueController.rejoindreAvecCode);

// Routes spécifiques AVANT les routes dynamiques
router.get("/:id/classement", auth, ligueController.classement);
router.get("/:id/matchs", auth, ligueController.getMatchsLigue);
router.get("/:id/equipes", auth, ligueController.getEquipes);
router.post(
  "/:id/equipes/:equipeId/rejoindre",
  auth,
  ligueController.rejoindreEquipe,
);
router.get("/:id/equipes/:equipeId", auth, ligueController.getEquipeLigue);
router.post("/:id/equipes/:equipeId/logo", auth, (req, res) => {
  teamLogoUpload.single("logo")(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || "Upload refusé" });
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
router.post(
  "/:id/generer-phase-finale",
  auth,
  ligueController.genererPhaseFinale,
);
router.post("/:id/rejoindre", auth, ligueController.rejoindre);
router.post("/:id/quitter", auth, ligueController.quitter);

// Route générique à la fin
router.get("/:id", auth, ligueController.getLigue);

module.exports = router;
