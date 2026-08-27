// Client-side helpers that call our own /api/sleeper proxy.
async function get(path) {
  const res = await fetch(`/api/sleeper/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper request failed: ${path} (${res.status})`);
  return res.json();
}

async function tryGet(path) {
  try {
    return await get(path);
  } catch {
    return null;
  }
}

// Sleeper league/draft URLs both end in a long numeric id (17-19 digits) —
// pull that out regardless of URL shape so the input field accepts a bare
// id, a league URL, or a draft URL interchangeably.
export function extractSleeperId(input) {
  const match = String(input || "").match(/\d{15,}/);
  return match ? match[0] : "";
}

export async function fetchLeague(leagueId) {
  return get(`league/${leagueId}`);
}

// Accepts either a league id or a draft id (a solo/mock draft has its own
// draft_id that isn't listed under any league's /drafts endpoint, so it
// can't be "resolved" the normal way — it has to be hit directly). Tries
// league first since that's the common case, falls back to treating the
// id as a draft id. Returns { leagueId, draftId } — leagueId is null for a
// standalone draft with no league behind it (team names then fall back to
// "Team {rosterId}").
export async function resolveLeagueAndDraft(rawId) {
  const id = extractSleeperId(rawId);
  if (!id) throw new Error("No Sleeper id found in that input");

  const league = await tryGet(`league/${id}`);
  if (league?.name) {
    const draftId = await resolveDraftId(id);
    if (draftId) return { leagueId: id, draftId };
  }

  const draft = await tryGet(`draft/${id}`);
  if (draft?.draft_id) {
    return { leagueId: draft.metadata?.league_id || null, draftId: draft.draft_id };
  }

  throw new Error("Couldn't find a league or draft with that id");
}

// A league can have multiple drafts across seasons; the most relevant one
// for a live cheat sheet is whichever is actively drafting, falling back to
// the most recently created draft otherwise.
export async function resolveDraftId(leagueId) {
  const drafts = await get(`league/${leagueId}/drafts`);
  if (!drafts?.length) return null;
  const drafting = drafts.find((d) => d.status === "drafting");
  if (drafting) return drafting.draft_id;
  const preDraft = drafts.find((d) => d.status === "pre_draft" || d.status === "paused");
  if (preDraft) return preDraft.draft_id;
  return drafts[0].draft_id;
}

export async function fetchDraft(draftId) {
  return get(`draft/${draftId}`);
}

export async function fetchPicks(draftId) {
  return get(`draft/${draftId}/picks`);
}

export async function fetchLeagueUsers(leagueId) {
  return get(`league/${leagueId}/users`);
}

export async function fetchLeagueRosters(leagueId) {
  return get(`league/${leagueId}/rosters`);
}

// Maps roster_id -> team/owner display name for pick attribution.
export function buildRosterIndex(users, rosters) {
  const index = {};
  for (const r of rosters) {
    const u = users.find((u) => u.user_id === r.owner_id);
    index[r.roster_id] = {
      teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      ownerId: r.owner_id,
    };
  }
  return index;
}

// Standard snake-draft "who's on the clock" for a given overall pick number
// (1-indexed) that hasn't happened yet. `draft.slot_to_roster_id` maps
// draft slot -> roster; odd rounds go slot 1..N, even rounds reverse.
export function rosterIdForPick(draft, overallPick) {
  const numTeams = draft.settings?.teams || Object.keys(draft.slot_to_roster_id || {}).length;
  if (!numTeams) return null;
  const round = Math.ceil(overallPick / numTeams);
  const indexInRound = (overallPick - 1) % numTeams;
  const slot = round % 2 === 1 ? indexInRound + 1 : numTeams - indexInRound;
  return draft.slot_to_roster_id?.[slot] ?? null;
}
