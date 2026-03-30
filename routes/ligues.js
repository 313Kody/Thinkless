const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ligueController = require("../controllers/ligueController");

router.get("/", auth, ligueController.getLigues);
router.post("/", auth, ligueController.createLigue);
router.post("/:id/rejoindre", auth, ligueController.rejoindre);
router.get("/:id/classement", auth, ligueController.classement);

module.exports = router;
