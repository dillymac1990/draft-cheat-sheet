// Parses a rankings CSV into [{rank, name, pos, team, tier, bye, adp}].
// Accepts a flexible header (Rank/Overall/Ovr, Name/Player, Pos/Position,
// Team/Tm, Tier, Bye/ByeWeek, ADP/Sleeper ADP — case-insensitive) so
// exports from most ranking sites work without reformatting. Falls back to
// a fixed rank,name,pos,team[,tier[,bye]] column order when no recognizable
// header row is present.
const HEADER_ALIASES = {
  overall: "rank",
  ovr: "rank",
  rk: "rank",
  rank: "rank",
  name: "name",
  player: "name",
  playername: "name",
  pos: "pos",
  position: "pos",
  team: "team",
  tm: "team",
  nflteam: "team",
  tier: "tier",
  bye: "bye",
  byeweek: "bye",
  adp: "adp",
  sleeperadp: "adp",
};

// A bare "Rank" column is ambiguous with sheets that also have a separate
// position-rank column (e.g. "Ovr, Player, Pos, Rank, Tier" where "Rank" is
// really position rank) — so it only fills the overall-rank slot when a
// more specific alias (Overall/Ovr/Rk) hasn't already claimed it.
const AMBIGUOUS_RANK_ALIASES = new Set(["rank"]);

function splitLine(line) {
  // Minimal CSV split: handles quoted fields containing commas.
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function normalizePos(raw) {
  const p = (raw || "").toUpperCase().trim();
  if (["DST", "D/ST", "DEFENSE", "DEF"].includes(p)) return "DEF";
  if (p === "PK") return "K";
  return p;
}

export function parseRankingsCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const firstCells = splitLine(lines[0]).map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
  const colMap = {};
  firstCells.forEach((cell, i) => {
    const field = HEADER_ALIASES[cell];
    if (!field) return;
    if (field === "rank" && AMBIGUOUS_RANK_ALIASES.has(cell) && colMap.rank != null) return;
    colMap[field] = i;
  });
  const hasHeader = colMap.name != null;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (!hasHeader) {
    // Positional fallback: rank,name,pos,team[,tier[,bye]]
    colMap.rank = 0;
    colMap.name = 1;
    colMap.pos = 2;
    colMap.team = 3;
    colMap.tier = 4;
    colMap.bye = 5;
  }

  const rows = [];
  dataLines.forEach((line, i) => {
    const cells = splitLine(line);
    const name = colMap.name != null ? cells[colMap.name] : null;
    if (!name) return;
    const rank = colMap.rank != null && cells[colMap.rank] !== "" ? Number(cells[colMap.rank]) : i + 1;
    rows.push({
      rank: Number.isFinite(rank) ? rank : i + 1,
      name: name.trim(),
      pos: normalizePos(colMap.pos != null ? cells[colMap.pos] : ""),
      team: colMap.team != null ? (cells[colMap.team] || "").trim().toUpperCase() : "",
      tier: colMap.tier != null && cells[colMap.tier] !== "" ? Number(cells[colMap.tier]) || cells[colMap.tier] : null,
      bye: colMap.bye != null && cells[colMap.bye] !== "" ? Number(cells[colMap.bye]) || null : null,
      adp: colMap.adp != null && cells[colMap.adp] !== "" ? Number(cells[colMap.adp]) : null,
    });
  });

  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}
