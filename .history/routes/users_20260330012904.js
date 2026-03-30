const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const userController = require("../controllers/userController");

router.get("/me", auth, userController.getMe);
router.get("/:id", userController.getProfil);

module.exports = router;
