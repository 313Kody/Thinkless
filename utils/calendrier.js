// Planification Round-Robin : répartit des affiches sur des créneaux et des
// terrains sans qu'une équipe joue deux matchs au même créneau.
// pairs : [{ a, b, poule }] ; retourne [{ slot, terrain, a, b, poule }]
function planifierRoundRobin(pairs, terrainCount) {
  const restantes = pairs.map((pair, index) => ({ ...pair, index }));
  const dernierCreneau = new Map(); // équipe -> dernier créneau joué
  const planning = [];
  let slot = 0;

  while (restantes.length > 0) {
    const occupees = new Set();
    let terrain = 1;

    // On privilégie les équipes qui ont attendu le plus longtemps
    const triees = [...restantes].sort((x, y) => {
      const repos = (p) =>
        Math.min(
          dernierCreneau.has(p.a) ? slot - dernierCreneau.get(p.a) : 99,
          dernierCreneau.has(p.b) ? slot - dernierCreneau.get(p.b) : 99,
        );
      return repos(y) - repos(x) || x.index - y.index;
    });

    for (const pair of triees) {
      if (terrain > terrainCount) break;
      if (occupees.has(pair.a) || occupees.has(pair.b)) continue;
      occupees.add(pair.a);
      occupees.add(pair.b);
      dernierCreneau.set(pair.a, slot);
      dernierCreneau.set(pair.b, slot);
      planning.push({ slot, terrain, a: pair.a, b: pair.b, poule: pair.poule });
      restantes.splice(restantes.indexOf(pair), 1);
      terrain += 1;
    }
    slot += 1;
  }
  return planning;
}

module.exports = { planifierRoundRobin };
