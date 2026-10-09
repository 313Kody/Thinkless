const jwt = require("jsonwebtoken");
const { getPool } = require("../config/db");

// Authentifie un capitaine (token émis par /api/capitaine/login-code ou /claim/:code).
// Le code d'accès est revérifié en base : le régénérer révoque les anciens tokens.
module.exports = async (req, res, next) => {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant" });
  }
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.role !== "capitaine" || !decoded.equipe_id) {
      return res.status(403).json({ message: "Accès capitaine requis" });
    }
    const [rows] = await getPool().execute(
      "SELECT 1 FROM LigueEquipe WHERE id = ? AND code_acces = ? LIMIT 1",
      [decoded.equipe_id, decoded.c],
    );
    if (!rows.length) {
      return res.status(401).json({ message: "Code d'accès révoqué" });
    }
    req.capitaine = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
};
