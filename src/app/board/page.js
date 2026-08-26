"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Settings, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { loadJSON, saveJSON } from "@/lib/storage";
import { buildRankingsIndex, matchPick, rowKey } from "@/lib/matchPlayer";
import { POS_COLOR, POS_ORDER } from "@/lib/posColors";
import {
  resolveDraftId,
  fetchDraft,
  fetchPicks,
  fetchLeagueUsers,
  fetchLeagueRosters,
  buildRosterIndex,
  rosterIdForPick,
} from "@/lib/sleeperClient";

const PICKS_POLL_MS = 4000;
const DRAFT_POLL_MS = 20000;

export default function BoardPage() {
  const [rankings, setRankings] = useState(null); // null = not yet loaded from storage
  const [leagueId, setLeagueId] = useState("");

  const [draftId, setDraftId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [picks, setPicks] = useState([]);
  const [rosterIndex, setRosterIndex] = useState({});
  const [myRosterId, setMyRosterId] = useState("");
  const [manualOverrides, setManualOverrides] = useState(() => new Set());
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [hideDrafted, setHideDrafted] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  // --- Load saved rankings + league from setup page ---
  useEffect(() => {
    const savedRankings = loadJSON("rankings", []);
    const savedLeagueId = loadJSON("leagueId", "");
    setRankings(savedRankings);
    setLeagueId(savedLeagueId);
    setMyRosterId(loadJSON("myRosterId", ""));
    setManualOverrides(new Set(loadJSON("manualOverrides", [])));
  }, []);

  // --- Resolve league -> draft, users/rosters (once leagueId is known) ---
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (async () => {
      try {
        const [dId, users, rosters] = await Promise.all([
          resolveDraftId(leagueId),
          fetchLeagueUsers(leagueId),
          fetchLeagueRosters(leagueId),
        ]);
        if (cancelled) return;
        if (!dId) {
          setLoadError("No draft found for this league yet.");
          return;
        }
        setDraftId(dId);
        setRosterIndex(buildRosterIndex(users, rosters));
      } catch {
        if (!cancelled) setLoadError("Couldn't reach Sleeper. Check the league ID and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

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
      const teamName = rosterIndex[pick.roster_id]?.teamName || `Team ${pick.roster_id}`;
      if (row) {
        info.set(rowKey(row), { pickNo: pick.pick_no, round: pick.round, rosterId: pick.roster_id, teamName });
      } else {
        const meta = pick.metadata || {};
        const name = `${meta.first_name || ""} ${meta.last_name || ""}`.trim() || meta.team || pick.player_id;
        missed.push({ pickNo: pick.pick_no, name, pos: meta.position || "?", teamName });
      }
    }
    return { draftedInfo: info, unmatched: missed };
  }, [picks, rankingsIndex, rosterIndex]);

  function toggleManual(key) {
    setManualOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveJSON("manualOverrides", [...next]);
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

  if (!rankings.length || !leagueId) {
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

          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-12">#</th>
                    <th className="text-left font-semibold px-3 py-2">Player</th>
                    <th className="text-left font-semibold px-3 py-2 w-16">Tier</th>
                    <th className="text-right font-semibold px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <PlayerRow
                      key={rowKey(r)}
                      row={r}
                      draftedInfo={draftedInfo.get(rowKey(r))}
                      manual={manualOverrides.has(rowKey(r))}
                      isMine={
                        draftedInfo.get(rowKey(r))?.rosterId != null &&
                        String(draftedInfo.get(rowKey(r)).rosterId) === String(myRosterId)
                      }
                      onToggle={() => toggleManual(rowKey(r))}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-600 text-xs py-8">
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
                const teamName = rosterIndex[p.roster_id]?.teamName || `Team ${p.roster_id}`;
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

function StatusPill({ draft, draftComplete }) {
  if (!draft) return null;
  const label = draftComplete ? "Complete" : draft.status === "drafting" ? "Live" : "Pre-Draft";
  const style = draftComplete
    ? "bg-slate-700/40 text-slate-400"
    : draft.status === "drafting"
    ? "bg-emerald-500/15 text-emerald-400"
    : "bg-amber-500/15 text-amber-400";
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md ${style}`}>{label}</span>;
}

function PlayerRow({ row, draftedInfo, manual, isMine, onToggle }) {
  const drafted = Boolean(draftedInfo || manual);
  return (
    <tr
      onClick={onToggle}
      className={`border-b border-slate-900 cursor-pointer transition-colors ${
        drafted ? (isMine ? "bg-emerald-500/10" : "bg-slate-900/60") : "hover:bg-slate-900/60"
      }`}
    >
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
