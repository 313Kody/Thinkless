const crypto = require("crypto");

// Jeton stateless du lien « rejoindre mon équipe » : dérivé de l'id d'équipe et du secret serveur.
// Il ne donne aucun droit de capitaine, seulement celui de s'ajouter à l'effectif.
function jetonRejoindre(equipeId) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`rejoindre:${Number(equipeId)}`)
    .digest("hex")
    .slice(0, 16);
}

function jetonValide(equipeId, jeton) {
  const attendu = Buffer.from(jetonRejoindre(equipeId));
  const recu = Buffer.from(String(jeton || ""));
  return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu);
}

module.exports = { jetonRejoindre, jetonValide };
