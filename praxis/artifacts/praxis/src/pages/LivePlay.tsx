import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, Hand, Users } from "lucide-react";

interface LiveState {
  title: string; buzzOpen: boolean; playerCount: number;
  players: { name: string; team: string; score: number }[];
  teams: { team: string; total: number; players: number }[];
  buzzes: { name: string; team: string }[];
}
const TEAMS = ["Red", "Blue", "Green", "Gold", "Solo"];
const TEAM_COLOR: Record<string, string> = {
  Red: "bg-red-500", Blue: "bg-blue-500", Green: "bg-emerald-500", Gold: "bg-amber-500", Solo: "bg-slate-500",
};

/**
 * Public "join a live game" screen. A student enters the code their teacher shows, picks a name and
 * team, then plays the game — their score streams to the shared leaderboard, and they can buzz in.
 * No account required (code-gated).
 */
export function LivePlay({ params }: { params?: { code?: string } }) {
  const [code, setCode] = useState((params?.code || "").toUpperCase());
  const [phase, setPhase] = useState<"code" | "name" | "play">("code");
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [team, setTeam] = useState("Solo");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [game, setGame] = useState<{ html: string; embedUrl?: string | null; instructions?: string | null } | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [buzzed, setBuzzed] = useState(false);

  const checkCode = async (c: string) => {
    if (!c || c.length < 4) { setErr("Enter the 4-letter code from your teacher."); return; }
    setErr(null); setBusy(true);
    try {
      const r = await apiFetch<{ ok: boolean; title: string }>(`/live/${c}`);
      setRoomTitle(r.title); setCode(c); setPhase("name");
    } catch { setErr("No game with that code. Double-check with your teacher."); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (params?.code) void checkCode(params.code.toUpperCase()); /* eslint-disable-next-line */ }, []);

  const join = async () => {
    if (!name.trim()) { setErr("Type your name first."); return; }
    setErr(null); setBusy(true);
    try {
      const r = await apiFetch<{ playerId: string }>(`/live/${code}/join`, { method: "POST", body: JSON.stringify({ name: name.trim(), team }) });
      setPlayerId(r.playerId);
      const g = await apiFetch<{ html: string; embedUrl?: string | null; instructions?: string | null }>(`/live/${code}/activity`);
      setGame(g); setPhase("play");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not join."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (phase !== "play" || !playerId) return;
    let alive = true;
    const tick = async () => {
      try { const s = await apiFetch<LiveState>(`/live/${code}/state?playerId=${playerId}`); if (alive) setState(s); } catch { /* transient */ }
    };
    void tick();
    const iv = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [phase, playerId, code]);

  const onSubmit = async (r: { score: number | null }) => {
    const s = typeof r.score === "number" ? r.score : 0;
    setMyScore(s);
    try { await apiFetch(`/live/${code}/score`, { method: "POST", body: JSON.stringify({ playerId, score: s }) }); } catch { /* ignore */ }
  };

  const buzz = async () => {
    try { await apiFetch(`/live/${code}/buzz`, { method: "POST", body: JSON.stringify({ playerId }) }); setBuzzed(true); setTimeout(() => setBuzzed(false), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-indigo-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <div className="text-3xl font-black tracking-tight text-indigo-700">🎮 Live Game</div>
          {roomTitle && <div className="text-muted-foreground mt-1">{roomTitle}</div>}
        </div>

        {err && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 text-center">{err}</div>}

        {phase === "code" && (
          <div className="rounded-2xl bg-white shadow-sm border p-6 space-y-4 max-w-sm mx-auto text-center">
            <label className="text-sm font-semibold text-muted-foreground">Game code</label>
            <input
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") void checkCode(code); }}
              placeholder="ABCD" autoFocus
              className="w-full text-center text-4xl font-black tracking-[0.3em] uppercase rounded-xl border-2 border-indigo-200 py-4 focus:border-indigo-500 outline-none"
            />
            <Button className="w-full h-12 text-lg" disabled={busy} onClick={() => void checkCode(code)}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enter"}
            </Button>
          </div>
        )}

        {phase === "name" && (
          <div className="rounded-2xl bg-white shadow-sm border p-6 space-y-4 max-w-sm mx-auto">
            <div>
              <label className="text-sm font-semibold text-muted-foreground">Your name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void join(); }}
                placeholder="Type your name" className="w-full mt-1 rounded-xl border-2 border-indigo-200 px-3 py-3 text-lg focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-muted-foreground">Team</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {TEAMS.map((t) => (
                  <button key={t} onClick={() => setTeam(t)}
                    className={`px-3 py-2 rounded-full text-sm font-bold text-white transition ${TEAM_COLOR[t]} ${team === t ? "ring-4 ring-offset-1 ring-indigo-300 scale-105" : "opacity-70"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full h-12 text-lg" disabled={busy} onClick={() => void join()}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Join the game →"}
            </Button>
          </div>
        )}

        {phase === "play" && game && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white border shadow-sm p-3">
              <div className="text-sm"><span className="font-bold">{name}</span> <span className={`ml-1 text-xs text-white px-2 py-0.5 rounded-full ${TEAM_COLOR[team]}`}>{team}</span></div>
              <Button size="sm" onClick={() => void buzz()} className={`gap-1 ${buzzed ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                <Hand className="h-4 w-4" /> {buzzed ? "Buzzed!" : "Buzz in"}
              </Button>
            </div>

            <div className="rounded-2xl overflow-hidden border shadow-sm bg-white">
              <ActivityPlayer html={game.html} embedUrl={game.embedUrl} onSubmit={onSubmit} />
            </div>
            {myScore != null && <div className="text-center text-sm font-semibold text-emerald-700">Your score this round: {myScore} — sent to the leaderboard! 🎉</div>}

            {state && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white border shadow-sm p-4">
                  <div className="flex items-center gap-2 font-bold mb-2"><Trophy className="h-4 w-4 text-amber-500" /> Leaderboard</div>
                  <ol className="space-y-1 text-sm">
                    {state.players.slice(0, 8).map((p, i) => (
                      <li key={i} className={`flex justify-between rounded px-2 py-1 ${p.name === name ? "bg-indigo-50 font-semibold" : ""}`}>
                        <span>{i + 1}. {p.name} <span className={`text-[10px] text-white px-1.5 rounded-full ${TEAM_COLOR[p.team] || "bg-slate-500"}`}>{p.team}</span></span>
                        <span className="font-bold">{p.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-2xl bg-white border shadow-sm p-4">
                  <div className="flex items-center gap-2 font-bold mb-2"><Users className="h-4 w-4 text-indigo-500" /> Teams</div>
                  <ul className="space-y-1 text-sm">
                    {state.teams.map((t) => (
                      <li key={t.team} className="flex justify-between rounded px-2 py-1">
                        <span><span className={`inline-block w-3 h-3 rounded-full mr-2 ${TEAM_COLOR[t.team] || "bg-slate-500"}`} />{t.team} <span className="text-xs text-muted-foreground">({t.players})</span></span>
                        <span className="font-bold">{t.total}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
