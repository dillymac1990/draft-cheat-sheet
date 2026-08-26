// Client-side helpers that call our own /api/sleeper proxy.
async function get(path) {
  const res = await fetch(`/api/sleeper/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper request failed: ${path} (${res.status})`);
  return res.json();
}

export async function fetchLeague(leagueId) {
  return get(`league/${leagueId}`);
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
