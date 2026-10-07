const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const auth = require("../middlewares/auth");
const p = require("../controllers/profilController");

const avatarsDir = path.join(__dirname, "..", "public", "uploads", "profile-avatars");
fs.mkdirSync(avatarsDir, { recursive: true });

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, avatarsDir),
	filename: (req, file, cb) => {
		const safeExt = path.extname(file.originalname || "").toLowerCase();
		const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
		const ext = allowed.includes(safeExt) ? safeExt : ".png";
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		cb(null, `avatar-${req.user.id}-${unique}${ext}`);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 2 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!file.mimetype || !file.mimetype.startsWith("image/")) {
			cb(new Error("Seules les images sont autorisees"));
			return;
		}
		cb(null, true);
	},
});

router.get("/", auth, p.getProfil);
router.post("/photo", auth, upload.single("avatar"), p.updateAvatar);
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
