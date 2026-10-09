// Analyse une liste d'effectif saisie en masse.
// Exemples acceptés : "1 - Chris, 2 - Idriss, 3 - Romann (C)" ou une ligne par joueur.
const LIGNE = /^\s*(?:#?(\d{1,3})\s*[-–.:)]\s*|#?(\d{1,3})\s+)?(.+?)\s*(\(\s*[cC]\s*\))?\s*$/;

function parserEffectif(texte) {
  const joueurs = [];
  const erreurs = [];
  String(texte || "")
    .split(/[\r\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = LIGNE.exec(part);
      const nom = match ? match[3].replace(/\s+/g, " ").trim() : "";
      if (!match || !nom || nom.length > 100) {
        erreurs.push(part);
        return;
      }
      const numero = match[1] ?? match[2];
      joueurs.push({
        numero: numero === undefined ? null : Number(numero),
        nom,
        est_capitaine: Boolean(match[4]),
      });
    });
  return { joueurs, erreurs };
}

module.exports = { parserEffectif };
