const { getPool } = require("../config/db");

// Endpoint public (sans authentification) : ne renvoyer que des données
// d'affichage spectateur. Jamais de codes d'accès, e-mails ou identifiants.

function parseTerrainNames(serialized) {
  try {
    const parsed = JSON.parse(serialized || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function terrainLabel(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return "Terrain";
  return /^\d+$/.test(clean) ? `Terrain ${clean}` : clean;
}

function matchStatus(row) {
  if (row.statut_match === "termine" || row.statut === "termine") {
    return "termine";
  }
  return row.statut_match === "en_cours" ? "en_cours" : "a_venir";
}

function hasScore(status, value) {
  return status !== "a_venir" ? Number(value ?? 0) : null;
}

function buildStandings(teams, matches, rules) {
  const table = new Map(
    teams.map((team) => [
      team.nom,
      {
        nom: team.nom,
        logo_url: team.logo_url,
        poule: team.poule,
        points: 0,
        joues: 0,
        victoires: 0,
        nuls: 0,
        defaites: 0,
        buts_marques: 0,
        buts_encaisses: 0,
      },
    ]),
  );

  for (const match of matches) {
    const a = table.get(match.nom_equipe_a);
    const b = table.get(match.nom_equipe_b);
    if (!a || !b) continue;
    const scoreA = Number(match.score_equipe_a ?? 0);
    const scoreB = Number(match.score_equipe_b ?? 0);
    a.joues += 1;
    b.joues += 1;
    a.buts_marques += scoreA;
    a.buts_encaisses += scoreB;
    b.buts_marques += scoreB;
    b.buts_encaisses += scoreA;
    if (scoreA === scoreB) {
      a.nuls += 1;
      b.nuls += 1;
      a.points += rules.pts_nul;
      b.points += rules.pts_nul;
    } else {
      const winner = scoreA > scoreB ? a : b;
      const loser = winner === a ? b : a;
      winner.victoires += 1;
      loser.defaites += 1;
      winner.points += rules.pts_victoire;
      loser.points += rules.pts_defaite;
    }
  }

  // Même ordre de tri que GET /api/ligues/:id/classement pour rester cohérent.
  return [...table.values()]
    .map((row) => ({
      ...row,
      difference_buts: row.buts_marques - row.buts_encaisses,
    }))
    .sort(
      (x, y) =>
        y.victoires - x.victoires ||
        y.nuls - x.nuls ||
        x.defaites - y.defaites ||
        y.difference_buts - x.difference_buts ||
        y.buts_marques - x.buts_marques ||
        x.nom.localeCompare(y.nom),
    )
    .map((row, index) => ({ ...row, rang: index + 1 }));
}

// GET /api/ligues/:id/live-data
exports.getLiveData = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const ligueId = Number(req.params.id);
    if (!Number.isInteger(ligueId) || ligueId < 1) {
      return res.status(400).json({ message: "Identifiant de ligue invalide" });
    }

    const db = getPool();
    const [ligues] = await db.execute(
      `SELECT id, nom, lieu, nb_terrains, terrains, publique, code_acces,
              pts_victoire, pts_nul, pts_defaite,
              DATE_FORMAT(date_debut, '%Y-%m-%d %H:%i:%s') AS date_debut
       FROM Ligue WHERE id = ? LIMIT 1`,
      [ligueId],
    );
    if (ligues.length === 0) {
      return res.status(404).json({ message: "Ligue introuvable" });
    }
    const ligue = ligues[0];
    // Ligue privée : la vue live exige le code de ligue (?code=...)
    const codeFourni = String(req.query.code || "").trim().toUpperCase();
    const codeLigue = String(ligue.code_acces || "").toUpperCase();
    if (!Number(ligue.publique) && (!codeLigue || codeFourni !== codeLigue)) {
      return res.status(403).json({ message: "Code de ligue requis" });
    }
    delete ligue.publique;
    delete ligue.code_acces;
    const terrainNames = parseTerrainNames(ligue.terrains);

    const [matchRows] = await db.execute(
      `SELECT ms.id, ms.nom_equipe_a, ms.nom_equipe_b, ms.score_equipe_a,
              ms.score_equipe_b, ms.statut, ms.statut_match, ms.phase, ms.poule,
              ms.terrain_id, ms.terrain_nom, ms.chrono_duree_secondes,
              ms.tirs_au_but_a, ms.tirs_au_but_b,
              DATE_FORMAT(ms.date_heure, '%Y-%m-%d %H:%i:%s') AS date_heure,
              CASE WHEN ms.statut_match = 'en_cours' AND ms.chrono_demarre_le IS NOT NULL
                THEN ms.chrono_secondes + GREATEST(0, TIMESTAMPDIFF(SECOND, ms.chrono_demarre_le, NOW()))
                ELSE ms.chrono_secondes END AS chrono_ecoule,
              ea.logo_url AS logo_a, eb.logo_url AS logo_b
       FROM MatchSport ms
       LEFT JOIN LigueEquipe ea ON ea.ligue_id = ms.ligue_id AND ea.nom = ms.nom_equipe_a
       LEFT JOIN LigueEquipe eb ON eb.ligue_id = ms.ligue_id AND eb.nom = ms.nom_equipe_b
       WHERE ms.ligue_id = ? AND ms.statut <> 'annule'
       ORDER BY ms.date_heure ASC, ms.terrain_id ASC, ms.id ASC`,
      [ligueId],
    );

    const matchs = matchRows.map((row) => {
      const statut = matchStatus(row);
      const terrainId = Number(row.terrain_id) || 1;
      return {
        id: row.id,
        date_heure: row.date_heure,
        statut,
        phase: row.phase,
        poule: row.poule,
        terrain: {
          id: terrainId,
          nom: terrainLabel(
            row.terrain_nom || terrainNames[terrainId - 1] || terrainId,
          ),
        },
        equipe_a: { nom: row.nom_equipe_a, logo_url: row.logo_a || null },
        equipe_b: { nom: row.nom_equipe_b, logo_url: row.logo_b || null },
        score_a: hasScore(statut, row.score_equipe_a),
        score_b: hasScore(statut, row.score_equipe_b),
        tirs_au_but:
          row.tirs_au_but_a !== null && row.tirs_au_but_b !== null
            ? { a: row.tirs_au_but_a, b: row.tirs_au_but_b }
            : null,
        chrono_ecoule: statut === "en_cours" ? Number(row.chrono_ecoule) : null,
        duree_secondes: Number(row.chrono_duree_secondes) || 0,
      };
    });

    const terrainMap = new Map();
    const terrainCount = Math.max(Number(ligue.nb_terrains) || 1, 1);
    for (let id = 1; id <= terrainCount; id += 1) {
      terrainMap.set(id, terrainLabel(terrainNames[id - 1] ?? id));
    }
    for (const match of matchs) {
      if (!terrainMap.has(match.terrain.id)) {
        terrainMap.set(match.terrain.id, match.terrain.nom);
      }
    }
    const terrains = [...terrainMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, nom]) => ({ id, nom }));

    const [teams] = await db.execute(
      "SELECT nom, poule, logo_url FROM LigueEquipe WHERE ligue_id = ? ORDER BY id",
      [ligueId],
    );
    const [pouleMatches] = await db.execute(
      `SELECT nom_equipe_a, nom_equipe_b, score_equipe_a, score_equipe_b
       FROM MatchSport
       WHERE ligue_id = ? AND phase = 'poule' AND statut = 'termine'`,
      [ligueId],
    );
    const classement = buildStandings(teams, pouleMatches, {
      pts_victoire: Number(ligue.pts_victoire ?? 3),
      pts_nul: Number(ligue.pts_nul ?? 1),
      pts_defaite: Number(ligue.pts_defaite ?? 0),
    });

    const [statRows] = await db.execute(
      `SELECT u.pseudo,
              SUM(s.buts) AS buts,
              SUM(s.passes_decisives) AS passes,
              MAX(CASE s.equipe WHEN 'A' THEN ms.nom_equipe_a ELSE ms.nom_equipe_b END) AS equipe,
              MAX(lu.numero) AS numero
       FROM StatsJoueurMatch s
       JOIN MatchSport ms ON ms.id = s.match_id
       JOIN Utilisateur u ON u.id = s.utilisateur_id
       LEFT JOIN LigueUtilisateur lu
         ON lu.ligue_id = ms.ligue_id AND lu.utilisateur_id = u.id
       WHERE ms.ligue_id = ?
       GROUP BY u.id, u.pseudo`,
      [ligueId],
    );
    const players = statRows.map((row) => ({
      pseudo: row.pseudo,
      equipe: row.equipe,
      numero: row.numero ?? null,
      buts: Number(row.buts) || 0,
      passes: Number(row.passes) || 0,
    }));
    const top = (key) =>
      players
        .filter((player) => player[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.pseudo.localeCompare(b.pseudo))
        .slice(0, 10);

    res.json({
      ligue: {
        id: ligue.id,
        nom: ligue.nom,
        lieu: ligue.lieu,
        date_debut: ligue.date_debut,
      },
      terrains,
      matchs,
      classement,
      stats: { buteurs: top("buts"), passeurs: top("passes") },
      genere_le: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Erreur live-data :", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
