(function () {
  const SPORT_LEVELS = [
    { label: "Bronze", elo: 1000 },
    { label: "Silver", elo: 1200 },
    { label: "Gold", elo: 1400 },
    { label: "Platinum", elo: 1600 },
    { label: "Diamond", elo: 1800 },
    { label: "Master", elo: 2000 },
  ];

  const GAME_LEVELS = [
    { label: "Iron", elo: 800 },
    { label: "Bronze", elo: 1000 },
    { label: "Silver", elo: 1200 },
    { label: "Gold", elo: 1400 },
    { label: "Platinum", elo: 1600 },
    { label: "Diamond", elo: 1800 },
    { label: "Master", elo: 2000 },
    { label: "Grandmaster", elo: 2200 },
    { label: "Challenger", elo: 2400 },
  ];

  function getLevels(kind) {
    return kind === "game" ? GAME_LEVELS : SPORT_LEVELS;
  }

  function getLevelForElo(kind, elo) {
    const levels = getLevels(kind);
    const numericElo = Number(elo);
    if (!Number.isFinite(numericElo)) {
      return levels[0].label;
    }

    let closest = levels[0];
    for (const level of levels) {
      if (
        Math.abs(level.elo - numericElo) < Math.abs(closest.elo - numericElo)
      ) {
        closest = level;
      }
    }
    return closest.label;
  }

  function getEloForLevel(kind, label) {
    const levels = getLevels(kind);
    const normalized = String(label || "")
      .trim()
      .toLowerCase();
    const match = levels.find(
      (level) => level.label.toLowerCase() === normalized,
    );
    return match ? match.elo : levels[0].elo;
  }

  function formatRank(kind, elo) {
    return `${getLevelForElo(kind, elo)} (${Number(elo) || getEloForLevel(kind, getLevelForElo(kind, elo))} ELO)`;
  }

  window.RankUtils = {
    SPORT_LEVELS,
    GAME_LEVELS,
    getLevels,
    getLevelForElo,
    getEloForLevel,
    formatRank,
  };
})();
