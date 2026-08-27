import { unstable_cache } from "next/cache";
import { matchKey } from "@/lib/matchPlayer";

// Real average draft position from FantasyFootballCalculator's free,
// unauthenticated API (built from actual community drafts) — Sleeper
// doesn't publish its own ADP anywhere accessible outside a logged-in
// draft-room session. Scoped to this league's actual format so it isn't
// skewed by e.g. Superflex leagues inflating QB value platform-wide.
const TEAMS = process.env.ADP_TEAMS || "10";
const FORMAT = process.env.ADP_FORMAT || "ppr";

const getAdpIndex = unstable_cache(
  async () => {
    const year = new Date().getFullYear();
    const res = await fetch(`https://fantasyfootballcalculator.com/api/v1/adp/${FORMAT}?teams=${TEAMS}&year=${year}`);
    if (!res.ok) throw new Error(`ADP fetch failed: ${res.status}`);
    const data = await res.json();

    const index = {};
    for (const p of data.players || []) {
      const pos = p.position === "PK" ? "K" : p.position;
      index[matchKey(p.name, pos, p.team)] = p.adp;
    }
    return index;
  },
  ["ffc-adp-index", TEAMS, FORMAT],
  { revalidate: 21600 } // 6h — ADP shifts as news breaks during draft season
);

export async function GET() {
  const index = await getAdpIndex();
  return Response.json(index);
}
