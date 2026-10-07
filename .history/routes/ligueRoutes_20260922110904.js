const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ligueController = require("../controllers/ligueController");

router.get("/", auth, ligueController.getLigues);
router.post("/", auth, ligueController.createLigue);
router.post("/join", auth, ligueController.joinLigue);
router.post("/rejoindre-code", auth, ligueController.rejoindreAvecCode);

router.get("/:id/members", auth, ligueController.getLigueMembers);
router.put("/:id/members/:userId/staff", auth, ligueController.toggleStaffStatus);

router.get("/:id/classement", auth, ligueController.classement);
router.get("/:id/matchs", auth, ligueController.getMatchsLigue);
router.get("/:id/equipes", auth, ligueController.getEquipes);
router.post("/:id/rejoindre", auth, ligueController.rejoindre);
router.post("/:id/quitter", auth, ligueController.quitter);

router.get("/:id", auth, ligueController.getLigue);

module.exports = router;
