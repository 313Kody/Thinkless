const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const matchController = require("../controllers/matchController");

router.get("/", auth, matchController.getMatchs);
router.post("/", auth, matchController.createMatch);
router.post("/:id/rejoindre", auth, matchController.rejoindreMatch);

module.exports = router;
