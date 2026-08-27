// Reconciles a user's rankings CSV against Sleeper draft picks. The two
// sources spell names differently (suffixes, punctuation, accents), so
// matching is done on a normalized name, and defenses are matched on team
// abbreviation instead of name since Sleeper and ranking sites disagree
// wildly on how to spell "team defense."
const TEAM_ABBR = {
  ARIZONA: "ARI", CARDINALS: "ARI", ARI: "ARI",
  ATLANTA: "ATL", FALCONS: "ATL", ATL: "ATL",
  BALTIMORE: "BAL", RAVENS: "BAL", BAL: "BAL",
  BUFFALO: "BUF", BILLS: "BUF", BUF: "BUF",
  CAROLINA: "CAR", PANTHERS: "CAR", CAR: "CAR",
  CHICAGO: "CHI", BEARS: "CHI", CHI: "CHI",
  CINCINNATI: "CIN", BENGALS: "CIN", CIN: "CIN",
  CLEVELAND: "CLE", BROWNS: "CLE", CLE: "CLE",
  DALLAS: "DAL", COWBOYS: "DAL", DAL: "DAL",
  DENVER: "DEN", BRONCOS: "DEN", DEN: "DEN",
  DETROIT: "DET", LIONS: "DET", DET: "DET",
  GREENBAY: "GB", PACKERS: "GB", GB: "GB", GNB: "GB",
  HOUSTON: "HOU", TEXANS: "HOU", HOU: "HOU",
  INDIANAPOLIS: "IND", COLTS: "IND", IND: "IND",
  JACKSONVILLE: "JAX", JAGUARS: "JAX", JAX: "JAX", JAC: "JAX",
  KANSASCITY: "KC", CHIEFS: "KC", KC: "KC", KAN: "KC",
  LASVEGAS: "LV", RAIDERS: "LV", LV: "LV", LVR: "LV", OAK: "LV",
  LACHARGERS: "LAC", CHARGERS: "LAC", LAC: "LAC",
  LARAMS: "LAR", RAMS: "LAR", LAR: "LAR",
  MIAMI: "MIA", DOLPHINS: "MIA", MIA: "MIA",
  MINNESOTA: "MIN", VIKINGS: "MIN", MIN: "MIN",
  NEWENGLAND: "NE", PATRIOTS: "NE", NE: "NE", NWE: "NE",
  NEWORLEANS: "NO", SAINTS: "NO", NO: "NO", NOR: "NO",
  NYGIANTS: "NYG", GIANTS: "NYG", NYG: "NYG",
  NYJETS: "NYJ", JETS: "NYJ", NYJ: "NYJ",
  PHILADELPHIA: "PHI", EAGLES: "PHI", PHI: "PHI",
  PITTSBURGH: "PIT", STEELERS: "PIT", PIT: "PIT",
  SANFRANCISCO: "SF", "49ERS": "SF", NINERS: "SF", SF: "SF", SFO: "SF",
  SEATTLE: "SEA", SEAHAWKS: "SEA", SEA: "SEA",
  TAMPABAY: "TB", BUCCANEERS: "TB", BUCS: "TB", TB: "TB", TAM: "TB",
  TENNESSEE: "TEN", TITANS: "TEN", TEN: "TEN",
  WASHINGTON: "WAS", COMMANDERS: "WAS", WAS: "WAS", WSH: "WAS",
};

export function teamAbbr(raw) {
  const key = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return TEAM_ABBR[key] || (raw || "").toUpperCase().slice(0, 3);
}

const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V"]);

export function normalizeName(raw) {
  return (raw || "")
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "") // strip accents
    .toUpperCase()
    .replace(/[.'`-]/g, "")
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ")
    .trim();
}

function normalizePosForMatch(pos) {
  const p = (pos || "").toUpperCase();
  if (p === "DST" || p === "D/ST") return "DEF";
  return p;
}

// Shared identity for the rankings index, Sleeper pick matching, and ADP
// matching — any source giving a name/pos/team ends up comparable. DEF
// entries key on team abbreviation; everyone else keys on normalized full
// name. Position isn't included in the key — name collisions across
// positions are rare enough not to matter here, and dropping it avoids
// mismatches when a source mislabels a position (e.g. FLEX-only exports).
export function matchKey(name, pos, team) {
  if (normalizePosForMatch(pos) === "DEF") return `DEF|${teamAbbr(team || name)}`;
  return `NAME|${normalizeName(name)}`;
}

// Builds a name/team -> ranking-row lookup from the parsed CSV rows.
export function buildRankingsIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    index.set(matchKey(row.name, row.pos, row.team), row);
  }
  return index;
}

// Stable identity for a ranking row — used as a Map/Set key for
// drafted-status tracking (auto-matched picks, manual overrides, target
// stars). Deliberately excludes rank: rankings get re-tiered/reordered as
// news breaks, and a rank-based key would silently orphan every star and
// manual mark a user set before their last edit to the sheet.
export function rowKey(row) {
  return `${normalizeName(row.name)}|${row.pos}`;
}

// Given a Sleeper pick object, returns the matching ranking row (or null).
export function matchPick(index, pick) {
  const meta = pick.metadata || {};
  const pos = meta.position || pick.position || "";
  const name =
    normalizePosForMatch(pos) === "DEF"
      ? meta.team || `${meta.first_name || ""} ${meta.last_name || ""}`.trim()
      : `${meta.first_name || ""} ${meta.last_name || ""}`.trim();
  const team = meta.team || pick.player_id || "";
  return index.get(matchKey(name, pos, team)) || null;
}
