const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const header = req.headers["authorization"];

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Un token capitaine ne donne jamais accès aux routes d'un compte utilisateur
    if (decoded.role === "capitaine") {
      return res.status(403).json({ message: "Token capitaine non autorisé" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
};
