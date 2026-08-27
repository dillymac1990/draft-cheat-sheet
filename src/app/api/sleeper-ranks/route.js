import { unstable_cache } from "next/cache";
import { rowKey } from "@/lib/matchPlayer";

// Sleeper has no public ADP endpoint. `search_rank` on the player object —
// their internal overall rank, driving in-app search/best-available order
// — is the closest available signal for "is the field valuing this player
// higher or lower than my own board."
const FANTASY_POS = new Set(["QB", "RB", "WR", "TE", "K"]);

// The full /players/nfl file is ~15MB — over Next's fetch-cache item size
// limit, so a plain cached fetch silently falls back to uncached. Fetch it
// once, reduce it to {rowKey: rank}, and cache that (a few hundred KB)
// instead. Same pattern as the sibling League Dashboard app's player fetch.
const getRankIndex = unstable_cache(
  async () => {
    const res = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!res.ok) throw new Error(`Sleeper players fetch failed: ${res.status}`);
    const players = await res.json();

    const index = {};
    for (const p of Object.values(players)) {
      if (!p.search_rank || !FANTASY_POS.has(p.position)) continue;
      const name = p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      if (!name) continue;
      const key = rowKey({ name, pos: p.position });
      // A handful of name+position collisions are possible (rare) — keep
      // whichever entry Sleeper itself ranks higher (lower number).
      if (index[key] == null || p.search_rank < index[key]) index[key] = p.search_rank;
    }
    return index;
  },
  ["sleeper-search-rank-index"],
  { revalidate: 86400 }
);

export async function GET() {
  const index = await getRankIndex();
  return Response.json(index);
}
