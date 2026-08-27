"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowRight, Trash2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { parseRankingsCsv } from "@/lib/parseCsv";
import { loadJSON, saveJSON, clearAll } from "@/lib/storage";
import { POS_COLOR } from "@/lib/posColors";

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [leagueId, setLeagueId] = useState("");
  const [rows, setRows] = useState([]);

  // Rankings normally come from the published Google Sheet, fetched fresh
  // on every visit — manual CSV paste/upload is a fallback for when that
  // fetch fails or the user wants to test a different list.
  const [sheetStatus, setSheetStatus] = useState("loading"); // loading | loaded | error
  const [sheetError, setSheetError] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [manualError, setManualError] = useState("");

  useEffect(() => {
    setLeagueId(loadJSON("leagueId", ""));
    loadFromSheet();
  }, []);

  async function loadFromSheet() {
    setSheetStatus("loading");
    setSheetError("");
    try {
      const res = await fetch("/api/rankings", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const csv = await res.text();
      const parsed = parseRankingsCsv(csv);
      if (!parsed.length) throw new Error("empty");
      setRows(parsed);
      setSheetStatus("loaded");
    } catch {
      setSheetStatus("error");
      setSheetError("Couldn't load your Google Sheet — check it's published to web, or use the manual option below.");
      setShowManual(true);
    }
  }

  function handleCsvText(text) {
    setCsvText(text);
    setManualError("");
    try {
      const parsed = parseRankingsCsv(text);
      setRows(parsed);
      if (text.trim() && !parsed.length) setManualError("Couldn't find any player rows in that CSV.");
    } catch {
      setManualError("Couldn't parse that CSV.");
    }
  }

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => handleCsvText(String(reader.result || ""));
    reader.readAsText(file);
  }

  const posCounts = rows.reduce((acc, r) => {
    acc[r.pos] = (acc[r.pos] || 0) + 1;
    return acc;
  }, {});

  const canContinue = leagueId.trim().length > 0 && rows.length > 0;

  function handleContinue() {
    saveJSON("leagueId", leagueId.trim());
    saveJSON("rankings", rows);
    router.push("/board");
  }

  function handleClear() {
    clearAll();
    setLeagueId("");
    setCsvText("");
    setFileName("");
    setManualError("");
    loadFromSheet();
  }

  return (
    <main className="flex-1 flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-black text-slate-100">Draft Cheat Sheet</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Your rankings, pulled live from Google Sheets, crossed off as picks come in during your Sleeper draft.
        </p>

        <section className="mt-8">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Sleeper League or Draft
          </label>
          <input
            type="text"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="League ID, draft ID, or a sleeper.com URL"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Paste your league's URL (sleeper.com/leagues/<span className="text-slate-400">…</span>) for its live draft,
            or a mock/practice draft's URL (sleeper.com/draft/nfl/<span className="text-slate-400">…</span>) — either works.
          </p>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your Rankings</label>
            <button
              onClick={loadFromSheet}
              disabled={sheetStatus === "loading"}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={sheetStatus === "loading" ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="border border-slate-800 rounded-lg p-4 bg-slate-900">
            {sheetStatus === "loading" && <p className="text-sm text-slate-400">Loading from your Google Sheet…</p>}

            {sheetStatus === "loaded" && (
              <>
                <p className="text-sm text-slate-200">Loaded from your Google Sheet</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 mr-1">{rows.length} players</span>
                  {Object.entries(posCounts).map(([pos, count]) => (
                    <span
                      key={pos}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${POS_COLOR[pos] || "#64748b"}30`, color: POS_COLOR[pos] || "#94a3b8" }}
                    >
                      {pos} {count}
                    </span>
                  ))}
                </div>
              </>
            )}

            {sheetStatus === "error" && (
              <div className="flex items-start gap-2 text-amber-300">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <p className="text-sm">{sheetError}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowManual((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showManual ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Use a different list instead
          </button>

          {showManual && (
            <div className="mt-3">
              <div
                className="border border-dashed border-slate-700 rounded-lg p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-slate-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Upload size={16} className="text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{fileName || "Upload a CSV file"}</span>
                </div>
                <span className="text-xs text-slate-500 shrink-0">Browse</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              <p className="text-xs text-slate-600 my-2 text-center">— or paste it below —</p>

              <textarea
                value={csvText}
                onChange={(e) => {
                  setFileName("");
                  handleCsvText(e.target.value);
                }}
                placeholder={"rank,name,pos,team,tier\n1,Ja'Marr Chase,WR,CIN,1\n2,Bijan Robinson,RB,ATL,1\n..."}
                rows={6}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 resize-y"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Columns: <span className="font-mono text-slate-400">rank, name, pos, team</span>, plus optional{" "}
                <span className="font-mono text-slate-400">tier, bye</span>. Header row optional.
              </p>

              {manualError && <p className="mt-2 text-xs text-rose-400">{manualError}</p>}
            </div>
          )}
        </section>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-2"
          >
            <Trash2 size={13} />
            Clear saved data
          </button>

          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Go to Draft Board
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </main>
  );
}
