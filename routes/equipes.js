const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const auth = require("../middlewares/auth");
const equipeController = require("../controllers/equipeController");

const logosDir = path.join(__dirname, "..", "public", "uploads", "team-logos");
fs.mkdirSync(logosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname || "").toLowerCase();
    const ext = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(safeExt)
      ? safeExt
      : ".png";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `team-${req.user.id}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      cb(new Error("Seules les images sont autorisees"));
      return;
    }
    cb(null, true);
  },
});

router.post("/logo", auth, (req, res) => {
  upload.single("logo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload refuse" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier envoye" });
    }

    const logoUrl = `/uploads/team-logos/${req.file.filename}`;
    res.status(201).json({ message: "Logo upload reussi", logo_url: logoUrl });
  });
});

router.get("/mon-equipe", auth, equipeController.getMonEquipeLobby);
router.get("/", auth, equipeController.getEquipes);
router.post("/", auth, equipeController.createEquipe);
router.post("/:id/demande", auth, equipeController.demanderRejoindre);
router.get("/demandes/recues", auth, equipeController.getDemandesRecues);
router.post("/demandes/:id/accepter", auth, equipeController.accepterDemande);
router.post("/demandes/:id/refuser", auth, equipeController.refuserDemande);

module.exports = router;
