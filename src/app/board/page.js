"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings, ChevronDown, ChevronUp, AlertTriangle, Star } from "lucide-react";
import { loadJSON, saveJSON } from "@/lib/storage";
import { buildRankingsIndex, matchPick, rowKey, matchKey } from "@/lib/matchPlayer";
import { POS_COLOR, POS_ORDER } from "@/lib/posColors";
import {
  resolveLeagueAndDraft,
  fetchDraft,
  fetchPicks,
  fetchLeagueUsers,
  fetchLeagueRosters,
  fetchAdp,
  buildRosterIndex,
  rosterIdForPick,
  pickRosterId,
} from "@/lib/sleeperClient";

const PICKS_POLL_MS = 4000;
const DRAFT_POLL_MS = 20000;

export default function BoardPage() {
  const [rankings, setRankings] = useState(null); // null = not yet loaded from storage
  const [savedId, setSavedId] = useState(""); // raw league/draft id or URL from setup

  const [draftId, setDraftId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [picks, setPicks] = useState([]);
  const [rosterIndex, setRosterIndex] = useState({});
  const [myRosterId, setMyRosterId] = useState("");
  const [manualOverrides, setManualOverrides] = useState(() => new Set());
  const [targets, setTargets] = useState(() => new Set());
  const [adpIndex, setAdpIndex] = useState({});
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [hideDrafted, setHideDrafted] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  // --- Load saved rankings + league/draft id from setup page ---
  useEffect(() => {
    const savedRankings = loadJSON("rankings", []);
    setRankings(savedRankings);
    setSavedId(loadJSON("leagueId", ""));
    setMyRosterId(loadJSON("myRosterId", ""));
    setManualOverrides(new Set(loadJSON("manualOverrides", [])));
    setTargets(new Set(loadJSON("targets", [])));
  }, []);

  // --- Real ADP from FantasyFootballCalculator (Sleeper doesn't publish
  // its own ADP anywhere accessible outside a logged-in draft room). One-
  // shot fetch; doesn't change during a draft session. ---
  useEffect(() => {
    fetchAdp()
      .then(setAdpIndex)
      .catch(() => {}); // non-critical — column just shows "—" if this fails
  }, []);

  // --- Resolve league/draft id -> draft id, users/rosters. Accepts either
  // a real league (whose current draft gets auto-resolved) or a standalone
  // draft id directly — a solo/mock draft has no discoverable league, so
  // it must be hit as a draft id. Team names fall back to "Team {id}"
  // when there's no league behind the draft to pull real names from. ---
  useEffect(() => {
    if (!savedId) return;
    let cancelled = false;
    (async () => {
      try {
        const { leagueId, draftId: dId } = await resolveLeagueAndDraft(savedId);
        if (cancelled) return;
        if (!dId) {
          setLoadError("No draft found for that league yet.");
          return;
        }
        setDraftId(dId);
        if (leagueId) {
          const [users, rosters] = await Promise.all([fetchLeagueUsers(leagueId), fetchLeagueRosters(leagueId)]);
          if (!cancelled) setRosterIndex(buildRosterIndex(users, rosters));
        }
      } catch {
        if (!cancelled) setLoadError("Couldn't reach Sleeper. Check the league/draft id and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  // --- Poll draft metadata (status, settings) ---
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const d = await fetchDraft(draftId);
        if (!cancelled) setDraft(d);
      } catch {
        // transient — next tick will retry
      }
      if (!cancelled) timer = setTimeout(tick, DRAFT_POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftId]);

  // --- Poll picks while the draft is active ---
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const p = await fetchPicks(draftId);
        if (!cancelled) setPicks(p);
      } catch {
        // transient — next tick will retry
      }
      if (!cancelled && draft?.status !== "complete") timer = setTimeout(tick, PICKS_POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftId, draft?.status]);

  const rankingsIndex = useMemo(() => buildRankingsIndex(rankings || []), [rankings]);

  // --- Reconcile picks against rankings ---
  const { draftedInfo, unmatched } = useMemo(() => {
    const info = new Map(); // rowKey -> { pickNo, round, rosterId, teamName }
    const missed = [];
    for (const pick of picks) {
      if (!pick.player_id) continue;
      const row = matchPick(rankingsIndex, pick);
      const rosterId = pickRosterId(draft, pick);
      const teamName = rosterIndex[rosterId]?.teamName || `Team ${rosterId}`;
      if (row) {
        info.set(rowKey(row), { pickNo: pick.pick_no, round: pick.round, rosterId, teamName });
      } else {
        const meta = pick.metadata || {};
        const name = `${meta.first_name || ""} ${meta.last_name || ""}`.trim() || meta.team || pick.player_id;
        missed.push({ pickNo: pick.pick_no, name, pos: meta.position || "?", teamName });
      }
    }
    return { draftedInfo: info, unmatched: missed };
  }, [picks, rankingsIndex, rosterIndex, draft]);

  function toggleManual(key) {
    setManualOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveJSON("manualOverrides", [...next]);
      return next;
    });
  }

  function toggleTarget(key) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveJSON("targets", [...next]);
      return next;
    });
  }

  function handleMyTeam(rosterId) {
    setMyRosterId(rosterId);
    saveJSON("myRosterId", rosterId);
  }

  const rosterOptions = useMemo(
    () =>
      Object.entries(rosterIndex)
        .map(([id, r]) => ({ id, teamName: r.teamName }))
        .sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [rosterIndex]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rankings || []).filter((r) => {
      if (posFilter !== "ALL" && r.pos !== posFilter) return false;
      const key = rowKey(r);
      const drafted = draftedInfo.has(key) || manualOverrides.has(key);
      if (hideDrafted && drafted) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.team?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rankings, posFilter, hideDrafted, search, draftedInfo, manualOverrides]);

  // Counts within the currently filtered view, so "Tier 4 · 6 players"
  // reflects e.g. just the RBs in tier 4 when the RB filter is active.
  const tierCounts = useMemo(() => {
    const counts = {};
    for (const r of filtered) {
      if (r.tier == null) continue;
      counts[r.tier] = (counts[r.tier] || 0) + 1;
    }
    return counts;
  }, [filtered]);

  const bestAvailable = useMemo(() => {
    const out = {};
    for (const pos of POS_ORDER) {
      out[pos] = (rankings || []).find((r) => {
        if (r.pos !== pos) return false;
        const key = rowKey(r);
        return !draftedInfo.has(key) && !manualOverrides.has(key);
      });
    }
    return out;
  }, [rankings, draftedInfo, manualOverrides]);

  const recentPicks = useMemo(() => [...picks].sort((a, b) => b.pick_no - a.pick_no).slice(0, 8), [picks]);

  const numTeams = draft?.settings?.teams || rosterOptions.length;
  const totalPicks = numTeams && draft?.settings?.rounds ? numTeams * draft.settings.rounds : null;
  const nextPickNo = picks.length + 1;
  const draftComplete = draft?.status === "complete" || (totalPicks && nextPickNo > totalPicks);
  const onClockRosterId = draft && !draftComplete ? rosterIdForPick(draft, nextPickNo) : null;
  const onClockTeam = onClockRosterId != null ? rosterIndex[onClockRosterId]?.teamName : null;

  let picksUntilMe = null;
  if (draft && myRosterId && !draftComplete) {
    for (let p = nextPickNo; p < nextPickNo + numTeams * 2; p++) {
      if (String(rosterIdForPick(draft, p)) === String(myRosterId)) {
        picksUntilMe = p - nextPickNo;
        break;
      }
    }
  }

  if (rankings === null) {
    return <main className="flex-1 flex items-center justify-center text-sm text-slate-500">Loading…</main>;
  }

  if (!rankings.length || !savedId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-sm text-slate-400">No rankings or league loaded yet.</p>
        <Link href="/" className="text-emerald-400 text-sm font-semibold hover:underline">
          Go to setup →
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black text-slate-100">{draft?.metadata?.name || "Draft Board"}</h1>
          <StatusPill draft={draft} draftComplete={draftComplete} />
        </div>
        <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <Settings size={13} />
          Setup
        </Link>
      </header>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg px-3 py-2">
          <AlertTriangle size={14} />
          {loadError}
        </div>
      )}

      {draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
          {!draftComplete ? (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">On the Clock</div>
                <div className="text-sm font-bold text-slate-100">{onClockTeam || "—"}</div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Pick</div>
                <div className="text-sm font-mono font-bold text-slate-100">
                  {nextPickNo}
                  {totalPicks ? ` / ${totalPicks}` : ""}
                </div>
              </div>
              {picksUntilMe != null && (
                <>
                  <div className="h-8 w-px bg-slate-800" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Your Turn In</div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {picksUntilMe === 0 ? "Now" : `${picksUntilMe} pick${picksUntilMe === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-sm font-bold text-slate-300">Draft complete</div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">My Team</span>
            <select
              value={myRosterId}
              onChange={(e) => handleMyTeam(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 px-2 py-1.5 focus:outline-none"
            >
              <option value="">— select —</option>
              {rosterOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.teamName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player or team…"
              className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
            />
            <div className="flex flex-wrap gap-1">
              {["ALL", ...POS_ORDER].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className="text-xs font-bold px-2.5 py-2 rounded-md transition-colors"
                  style={
                    posFilter === pos
                      ? { background: pos === "ALL" ? "#e2e8f0" : POS_COLOR[pos], color: "#0f172a" }
                      : { background: "#1e293b", color: "#94a3b8" }
                  }
                >
                  {pos}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 px-1 cursor-pointer select-none">
              <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
              Hide drafted
            </label>
          </div>

          <p className="text-[11px] text-slate-600 mb-2">
            <span className="text-rose-400 font-semibold">ADP</span> column red = the field drafts them earlier than
            you do (heads up) · <span className="text-emerald-400 font-semibold">green</span> = later than you do
            (possible value). Real average draft position from FantasyFootballCalculator.
          </p>

          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="font-semibold px-2 py-2 w-8"></th>
                    <th className="text-left font-semibold px-3 py-2 w-12">#</th>
                    <th className="text-left font-semibold px-3 py-2">Player</th>
                    <th className="text-left font-semibold px-3 py-2 w-16">Tier</th>
                    <th
                      className="text-left font-semibold px-3 py-2 w-16"
                      title="Real average draft position from FantasyFootballCalculator, scoped to this league's format."
                    >
                      ADP
                    </th>
                    <th className="text-right font-semibold px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const key = rowKey(r);
                    const showTierHeader = r.tier != null && (i === 0 || filtered[i - 1].tier !== r.tier);
                    return (
                      <Fragment key={key}>
                        {showTierHeader && (
                          <tr className="bg-slate-800/60">
                            <td colSpan={6} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Tier {r.tier}
                              <span className="ml-1.5 text-slate-600 font-normal normal-case">
                                · {tierCounts[r.tier]} player{tierCounts[r.tier] === 1 ? "" : "s"}
                              </span>
                            </td>
                          </tr>
                        )}
                        <PlayerRow
                          row={r}
                          draftedInfo={draftedInfo.get(key)}
                          manual={manualOverrides.has(key)}
                          isTarget={targets.has(key)}
                          adp={adpIndex[matchKey(r.name, r.pos, r.team)]}
                          isMine={
                            draftedInfo.get(key)?.rosterId != null && String(draftedInfo.get(key).rosterId) === String(myRosterId)
                          }
                          onToggle={() => toggleManual(key)}
                          onToggleTarget={() => toggleTarget(key)}
                        />
                      </Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-600 text-xs py-8">
                        No players match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="lg:w-72 shrink-0 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Best Available</div>
            <div className="flex flex-col gap-1.5">
              {POS_ORDER.map((pos) => (
                <div key={pos} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-8 shrink-0 text-center font-bold rounded px-1 py-0.5"
                    style={{ background: `${POS_COLOR[pos]}30`, color: POS_COLOR[pos] }}
                  >
                    {pos}
                  </span>
                  <span className="text-slate-300 truncate">{bestAvailable[pos]?.name || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Recent Picks</div>
            <div className="flex flex-col gap-1.5">
              {recentPicks.length === 0 && <div className="text-xs text-slate-600">No picks yet.</div>}
              {recentPicks.map((p) => {
                const meta = p.metadata || {};
                const name = `${meta.first_name || ""} ${meta.last_name || ""}`.trim() || meta.team || p.player_id;
                const rosterId = pickRosterId(draft, p);
                const teamName = rosterIndex[rosterId]?.teamName || `Team ${rosterId}`;
                return (
                  <div key={p.pick_no} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="text-slate-600 font-mono shrink-0">{p.pick_no}.</span>
                      <span className="text-slate-200 truncate">{name}</span>
                      {meta.position && (
                        <span
                          className="text-[9px] font-bold px-1 rounded shrink-0"
                          style={{ background: `${POS_COLOR[meta.position] || "#64748b"}30`, color: POS_COLOR[meta.position] || "#94a3b8" }}
                        >
                          {meta.position}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 truncate shrink-0 max-w-[40%]">{teamName}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {unmatched.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <button
                onClick={() => setShowUnmatched((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] uppercase tracking-wide text-amber-400"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {unmatched.length} unmatched pick{unmatched.length === 1 ? "" : "s"}
                </span>
                {showUnmatched ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showUnmatched && (
                <div className="mt-2 flex flex-col gap-1">
                  {unmatched.map((u) => (
                    <div key={u.pickNo} className="text-xs text-amber-200/80">
                      {u.pickNo}. {u.name} ({u.pos}) — not in your rankings
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

const STATUS_LABEL = { drafting: "Live", paused: "Paused", pre_draft: "Pre-Draft" };
const STATUS_STYLE = {
  drafting: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-amber-500/15 text-amber-400",
  pre_draft: "bg-amber-500/15 text-amber-400",
};

function StatusPill({ draft, draftComplete }) {
  if (!draft) return null;
  const label = draftComplete ? "Complete" : STATUS_LABEL[draft.status] || "Pre-Draft";
  const style = draftComplete ? "bg-slate-700/40 text-slate-400" : STATUS_STYLE[draft.status] || "bg-amber-500/15 text-amber-400";
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md ${style}`}>{label}</span>;
}

function PlayerRow({ row, draftedInfo, manual, isTarget, adp, isMine, onToggle, onToggleTarget }) {
  const drafted = Boolean(draftedInfo || manual);
  const bgClass = drafted
    ? isMine
      ? "bg-emerald-500/10"
      : "bg-slate-900/60"
    : isTarget
    ? "bg-amber-500/5 hover:bg-amber-500/10"
    : "hover:bg-slate-900/60";
  return (
    <tr onClick={onToggle} className={`border-b border-slate-900 cursor-pointer transition-colors ${bgClass}`}>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleTarget}
          className="p-1 -m-1"
          aria-label={isTarget ? "Remove target" : "Mark as target"}
        >
          <Star size={14} className={isTarget ? "fill-amber-400 text-amber-400" : "text-slate-700 hover:text-slate-500"} />
        </button>
      </td>
      <td className="px-3 py-2 font-mono text-slate-500">{row.rank}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-black w-7 text-center shrink-0 rounded px-1 py-0.5"
            style={{ background: `${POS_COLOR[row.pos] || "#64748b"}30`, color: POS_COLOR[row.pos] || "#94a3b8" }}
          >
            {row.pos || "?"}
          </span>
          <span className={`truncate font-medium ${drafted ? "line-through text-slate-600" : "text-slate-100"}`}>
            {row.name}
          </span>
          {row.team && <span className="text-[10px] text-slate-600 font-mono shrink-0">{row.team}</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-500">{row.tier ?? ""}</td>
      <td className="px-3 py-2 font-mono">
        {adp != null ? (
          <span className={adp < row.rank ? "text-rose-400" : adp > row.rank ? "text-emerald-400" : "text-slate-500"}>
            {adp.toFixed(1)}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {drafted ? (
          <span className={`text-[10px] font-semibold ${isMine ? "text-emerald-400" : "text-slate-500"}`}>
            {draftedInfo ? `R${draftedInfo.round}.${draftedInfo.pickNo} · ${draftedInfo.teamName}` : "Drafted"}
            {isMine ? " · MINE" : ""}
          </span>
        ) : (
          <span className="text-[10px] text-slate-700">Available</span>
        )}
      </td>
    </tr>
  );
}
