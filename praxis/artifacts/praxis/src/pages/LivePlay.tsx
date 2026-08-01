import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, Hand, Users, Lightbulb } from "lucide-react";
import { NumberLine, BarModel, BalanceScale, check, type MathProblem } from "@/components/MathViz";

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

/** A lean, multiplayer Math Coach player: same manipulatives + Socratic coach as the solo page, but
 *  scores stream to the live-room leaderboard and the coach uses the code-gated hint endpoint. */
function LiveMathPlayer({ problems, code, playerId, onScore }: { problems: MathProblem[]; code: string; playerId: string | null; onScore: (score: number) => void }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [lineVal, setLineVal] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [flags, setFlags] = useState<boolean[]>([]);
  const [fb, setFb] = useState<{ ok: boolean; msg: string } | null>(null);
  const [coach, setCoach] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const p = problems[idx];
  const current = p?.kind === "number" && lineVal != null ? String(lineVal) : typed;
  const post = (f: boolean[]) => onScore(Math.round((f.filter(Boolean).length / Math.max(1, problems.length)) * 100));
  const next = (ok: boolean) => {
    const f = flags.slice(); f[idx] = ok; setFlags(f); post(f);
    if (idx + 1 >= problems.length) setDone(true);
    else { setIdx(idx + 1); setTyped(""); setLineVal(null); setAttempts(0); setFb(null); setCoach([]); }
  };
  const checkIt = () => {
    if (!p || !current) { setFb({ ok: false, msg: "Enter an answer." }); return; }
    if (check(current, p.answer)) { setFb({ ok: true, msg: "Correct! 🎉" }); setTimeout(() => next(true), 800); }
    else { setAttempts((a) => a + 1); setFb({ ok: false, msg: "Not quite — try again or ask the coach." }); }
  };
  const ask = async () => {
    if (!p) return; setBusy(true);
    try { const r = await apiFetch<{ hint: string }>(`/live/${code}/hint`, { method: "POST", body: JSON.stringify({ problem: p.prompt, answer: p.answer, studentAnswer: current || undefined, attempts: Math.max(1, attempts) }) }); setCoach((c) => [...c, r.hint]); }
    catch { setCoach((c) => [...c, "What could you do first? Try one small step."]); }
    finally { setBusy(false); }
  };
  if (done) return <div className="p-6 text-center"><div className="text-4xl mb-2">🏆</div><div className="font-bold">You finished! {flags.filter(Boolean).length}/{problems.length} correct</div><div className="text-sm text-muted-foreground">Your score is on the leaderboard.</div></div>;
  if (!p) return <div className="p-6 text-center text-muted-foreground">No problems in this game.</div>;
  return (
    <div className="p-4 space-y-3">
      <div className="text-xs font-semibold text-indigo-600">Problem {idx + 1}/{problems.length}</div>
      <p className="text-lg font-semibold">{p.prompt}</p>
      {p.visual === "balance" && p.eq ? <BalanceScale eq={p.eq} onSolved={(x) => { setTyped(String(x)); setLineVal(null); }} />
        : p.visual === "bar" && p.bars && p.bars.length ? <BarModel bars={p.bars} onPick={(v) => { setTyped(String(v)); setLineVal(null); }} />
        : p.kind === "number" && typeof p.min === "number" && typeof p.max === "number" ? <NumberLine min={p.min} max={p.max} value={lineVal} onChange={(v) => { setLineVal(v); setTyped(String(v)); }} />
        : null}
      <div className="flex flex-wrap items-center gap-2">
        <input value={typed} onChange={(e) => { setTyped(e.target.value); const n = Number(e.target.value); setLineVal(Number.isFinite(n) && e.target.value.trim() !== "" ? n : null); }} onKeyDown={(e) => { if (e.key === "Enter") checkIt(); }} placeholder="Your answer" className="rounded-xl border-2 border-indigo-200 px-3 py-2 w-36 outline-none focus:border-indigo-500" />
        <Button onClick={checkIt}>Check</Button>
        <Button variant="outline" className="gap-1 border-amber-400/50 text-amber-700" disabled={busy} onClick={ask}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} Coach</Button>
        {fb && <span className={`text-sm font-semibold ${fb.ok ? "text-emerald-700" : "text-amber-700"}`}>{fb.msg}</span>}
      </div>
      {coach.length > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-sm space-y-1">{coach.map((c, i) => <div key={i}>💡 {c}</div>)}</div>}
    </div>
  );
}

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
  const [kind, setKind] = useState<string>("game");
  const [problems, setProblems] = useState<MathProblem[]>([]);
  const [state, setState] = useState<LiveState | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [buzzed, setBuzzed] = useState(false);

  const checkCode = async (c: string) => {
    if (!c || c.length < 4) { setErr("Enter the 4-letter code from your teacher."); return; }
    setErr(null); setBusy(true);
    try {
      const r = await apiFetch<{ ok: boolean; title: string; kind?: string }>(`/live/${c}`);
      setRoomTitle(r.title); setKind(r.kind || "game"); setCode(c); setPhase("name");
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
      setGame(g);
      if (kind === "math-coach") { try { const j = JSON.parse(g.html || "{}"); setProblems(Array.isArray(j.problems) ? j.problems : []); } catch { setProblems([]); } }
      setPhase("play");
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
              {kind === "math-coach"
                ? <LiveMathPlayer problems={problems} code={code} playerId={playerId} onScore={(s) => onSubmit({ score: s })} />
                : <ActivityPlayer html={game.html} embedUrl={game.embedUrl} onSubmit={onSubmit} />}
            </div>
            {myScore != null && kind !== "math-coach" && <div className="text-center text-sm font-semibold text-emerald-700">Your score this round: {myScore} — sent to the leaderboard! 🎉</div>}

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
