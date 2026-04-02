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

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getLevels(kind) {
  return kind === "game" ? GAME_LEVELS : SPORT_LEVELS;
}

function getEloForLevel(kind, label) {
  const levels = getLevels(kind);
  const match = levels.find((item) => normalizeLabel(item.label) === normalizeLabel(label));
  return match ? match.elo : levels[0].elo;
}

function getLevelForElo(kind, elo) {
  const levels = getLevels(kind);
  const numericElo = Number(elo);
  if (!Number.isFinite(numericElo)) {
    return levels[0].label;
  }

  let closest = levels[0];
  for (const level of levels) {
    if (Math.abs(level.elo - numericElo) < Math.abs(closest.elo - numericElo)) {
      closest = level;
    }
  }
  return closest.label;
}

module.exports = {
  SPORT_LEVELS,
  GAME_LEVELS,
  getEloForLevel,
  getLevelForElo,
};