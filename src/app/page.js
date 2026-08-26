"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowRight, Trash2 } from "lucide-react";
import { parseRankingsCsv } from "@/lib/parseCsv";
import { loadJSON, saveJSON, clearAll } from "@/lib/storage";
import { POS_COLOR } from "@/lib/posColors";

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [leagueId, setLeagueId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLeagueId(loadJSON("leagueId", ""));
    const savedCsv = loadJSON("rankingsCsv", "");
    if (savedCsv) {
      setCsvText(savedCsv);
      setRows(parseRankingsCsv(savedCsv));
    }
    setFileName(loadJSON("rankingsFileName", ""));
  }, []);

  function handleCsvText(text) {
    setCsvText(text);
    setError("");
    try {
      const parsed = parseRankingsCsv(text);
      setRows(parsed);
      if (text.trim() && !parsed.length) setError("Couldn't find any player rows in that CSV.");
    } catch {
      setRows([]);
      setError("Couldn't parse that CSV.");
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
    saveJSON("rankingsCsv", csvText);
    saveJSON("rankingsFileName", fileName);
    saveJSON("rankings", rows);
    router.push("/board");
  }

  function handleClear() {
    clearAll();
    setLeagueId("");
    setCsvText("");
    setRows([]);
    setFileName("");
    setError("");
  }

  return (
    <main className="flex-1 flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-black text-slate-100">Draft Cheat Sheet</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Load your rankings, point it at your Sleeper league, and it'll cross off players live as they're picked.
        </p>

        <section className="mt-8">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Sleeper League ID
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 1185408325105057792"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Found in your league's URL: sleeper.com/leagues/<span className="text-slate-400">1185408325105057792</span>/team
          </p>
        </section>

        <section className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Your Rankings (CSV)
          </label>

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

          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

          {rows.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">{rows.length} players loaded</span>
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
