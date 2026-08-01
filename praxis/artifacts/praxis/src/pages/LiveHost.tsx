import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Trophy, Hand, Users, RotateCcw, ArrowLeft } from "lucide-react";

interface LiveState {
  title: string; buzzOpen: boolean; playerCount: number;
  players: { name: string; team: string; score: number }[];
  teams: { team: string; total: number; players: number }[];
  buzzes: { name: string; team: string }[];
}
const TEAM_COLOR: Record<string, string> = {
  Red: "bg-red-500", Blue: "bg-blue-500", Green: "bg-emerald-500", Gold: "bg-amber-500", Solo: "bg-slate-500",
};

/**
 * Teacher-facing "host" screen: shows the big join code + link for students, and a live leaderboard,
 * team totals and buzzer feed that refresh every 1.5s. Built to be projected on the class screen.
 */
export function LiveHost({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<LiveState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const s = await apiFetch<LiveState>(`/live/${code}/state`); if (alive) { setState(s); setErr(null); } }
      catch { if (alive) setErr("This game has ended or the code is wrong."); }
    };
    void tick();
    const iv = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, [code]);

  const resetBuzz = async () => { try { await apiFetch(`/live/${code}/buzz-reset`, { method: "POST" }); } catch { /* ignore */ } };
  const joinUrl = `${typeof location !== "undefined" ? location.origin : ""}/live/${code}`;

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => setLocation("/activities")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Done
          </Button>
          <div className="font-semibold truncate">{state?.title ?? "Live game"}</div>
          <div className="ml-auto text-sm text-white/70">{state?.playerCount ?? 0} joined</div>
        </div>

        {/* Join panel */}
        <div className="rounded-3xl bg-indigo-600 p-6 text-center mb-6">
          <div className="text-sm uppercase tracking-widest text-white/80">Join at</div>
          <div className="text-2xl font-bold">{joinUrl.replace(/^https?:\/\//, "")}</div>
          <div className="mt-3 text-sm uppercase tracking-widest text-white/80">Game code</div>
          <div className="text-7xl font-black tracking-[0.2em]">{code}</div>
          {err && <div className="mt-3 text-amber-200 text-sm">{err}</div>}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Leaderboard */}
          <div className="md:col-span-2 rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 font-bold mb-3"><Trophy className="h-5 w-5 text-amber-400" /> Leaderboard</div>
            {(state?.players.length ?? 0) === 0 ? (
              <div className="text-white/50 text-sm py-6 text-center">Waiting for players to join and play…</div>
            ) : (
              <ol className="space-y-1">
                {state!.players.slice(0, 12).map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/5">
                    <span className="flex items-center gap-2">
                      <span className={`w-6 text-center font-black ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-700" : "text-white/60"}`}>{i + 1}</span>
                      {p.name}
                      <span className={`text-[10px] text-white px-1.5 rounded-full ${TEAM_COLOR[p.team] || "bg-slate-500"}`}>{p.team}</span>
                    </span>
                    <span className="text-xl font-black">{p.score}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Teams + buzzer */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2 font-bold mb-3"><Users className="h-5 w-5 text-indigo-300" /> Teams</div>
              {(state?.teams.length ?? 0) === 0 ? (
                <div className="text-white/50 text-sm">No teams yet.</div>
              ) : (
                <ul className="space-y-1">
                  {state!.teams.map((t) => (
                    <li key={t.team} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/5">
                      <span className="flex items-center gap-2"><span className={`inline-block w-3 h-3 rounded-full ${TEAM_COLOR[t.team] || "bg-slate-500"}`} />{t.team} <span className="text-xs text-white/50">({t.players})</span></span>
                      <span className="font-black">{t.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-bold"><Hand className="h-5 w-5 text-amber-400" /> Buzzed in</div>
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => void resetBuzz()}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
              {(state?.buzzes.length ?? 0) === 0 ? (
                <div className="text-white/50 text-sm">Nobody yet. Ask a question!</div>
              ) : (
                <ol className="space-y-1">
                  {state!.buzzes.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-white/5">
                      <span className={`w-6 text-center font-black ${i === 0 ? "text-amber-400" : "text-white/60"}`}>{i + 1}</span>
                      {b.name} <span className={`text-[10px] text-white px-1.5 rounded-full ${TEAM_COLOR[b.team] || "bg-slate-500"}`}>{b.team}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
