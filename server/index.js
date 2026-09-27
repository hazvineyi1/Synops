"use strict";
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { q, migrate, audit } = require("./db");
const A = require("./auth");
const C = require("./content/grn01");
const AI = require("./ai");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
  next();
});
// CSRF defence for cookie auth: mutating API calls must carry a custom header (not sendable cross-site without CORS).
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) && req.get("X-DJH") !== "1") return res.status(403).json({ error: "Missing request header." });
  next();
});
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use(wrap(A.loadUser));

const LID = "GRN01";
const ROUTES_OK = ["inv", "pro", "jud"];
const trimStr = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/* ---------- health ---------- */
app.get("/healthz", wrap(async (_req, res) => { await q("SELECT 1"); res.type("text").send("ok"); }));
app.get("/robots.txt", (_req, res) => res.type("text").send("User-agent: *\nDisallow: /\n"));

/* ---------- auth ---------- */
app.post("/api/auth/register", wrap(async (req, res) => {
  if (A.limited("reg:" + req.ip, 10, 3600e3)) return res.status(429).json({ error: "Too many requests. Try again later." });
  const b = req.body || {};
  const errs = {};
  const name = trimStr(b.name, 120), email = trimStr(b.email, 200).toLowerCase(), prole = trimStr(b.prole, 80), unit = trimStr(b.unit, 200), institution = trimStr(b.institution, 120);
  const route = ROUTES_OK.includes(b.route) ? b.route : null, lang = b.lang === "en" ? "en" : "uk";
  if (!name) errs.name = "Enter your full name.";
  if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid work email.";
  if (!institution) errs.institution = "Choose your institution type.";
  if (!unit) errs.unit = "Enter your institution or unit.";
  if (!prole) errs.prole = "Choose your professional role.";
  if (!route) errs.route = "Choose your route.";
  if (typeof b.password !== "string" || b.password.length < 12) errs.password = "Use at least 12 characters.";
  if (!b.terms) errs.terms = "Accept the terms to continue.";
  if (Object.keys(errs).length) return res.status(400).json({ errors: errs });
  const auto = process.env.AUTO_APPROVE === "1";
  const r = await q(`INSERT INTO users(email,name,prole,route,institution,unit,lang,pw_hash,status,approved_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, name, prole, route, institution, unit, lang, A.hashPassword(b.password), auto ? "active" : "pending", auto ? new Date() : null]);
  // Same response whether or not the email exists, so accounts cannot be enumerated.
  if (r.rows[0]) await audit(r.rows[0].id, "access requested", auto ? "auto-approved" : "pending");
  res.status(201).json({ status: auto ? "active" : "pending" });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const email = trimStr(req.body && req.body.email, 200).toLowerCase(), pw = (req.body && req.body.password) || "";
  if (A.limited("login:" + req.ip, 20, 900e3) || A.limited("login:" + email, 8, 900e3)) return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  const r = await q("SELECT * FROM users WHERE email=$1", [email]);
  const u = r.rows[0];
  if (!u || !A.verifyPassword(pw, u.pw_hash)) return res.status(401).json({ error: "That email and password do not match an approved account." });
  if (u.status === "pending") return res.status(403).json({ error: "Your access request is waiting for approval by your institution." });
  if (u.status !== "active") return res.status(403).json({ error: "This account is not active. Contact your training coordinator." });
  await A.createSession(res, u.id);
  await audit(u.id, "signed in", null);
  res.json({ user: A.publicUser(u) });
}));
app.post("/api/auth/logout", wrap(async (req, res) => { await A.destroySession(req, res); res.json({ ok: true }); }));
app.get("/api/me", (req, res) => res.json({ user: A.publicUser(req.user), ai: AI.aiEnabled() }));
app.patch("/api/me", A.requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.route && ROUTES_OK.includes(b.route)) await q("UPDATE users SET route=$1 WHERE id=$2", [b.route, req.user.id]);
  if (b.lang && ["uk", "en"].includes(b.lang)) await q("UPDATE users SET lang=$1 WHERE id=$2", [b.lang, req.user.id]);
  const r = await q("SELECT * FROM users WHERE id=$1", [req.user.id]);
  res.json({ user: A.publicUser(r.rows[0]) });
}));

/* ---------- admin: approvals ---------- */
app.get("/api/admin/pending", A.requireRole("admin"), wrap(async (_req, res) => {
  const r = await q("SELECT id,email,name,prole,route,institution,unit,created_at FROM users WHERE status='pending' ORDER BY created_at");
  res.json({ pending: r.rows });
}));
app.post("/api/admin/users/:id/approve", A.requireRole("admin"), wrap(async (req, res) => {
  const r = await q("UPDATE users SET status='active', approved_at=now(), approved_by=$1 WHERE id=$2 AND status='pending' RETURNING id", [req.user.id, req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "No pending request found." });
  await audit(req.user.id, "approved account", req.params.id);
  res.json({ ok: true });
}));

/* ---------- lesson content ---------- */
app.get("/api/lessons/grn01", A.requireUser, (_req, res) => res.json(C.publicContent()));

async function getResults(uid) {
  const r = await q("SELECT item_id, first_value, latest_value, correct, attempts, passed_at, reflection IS NOT NULL AS has_reflection FROM item_results WHERE user_id=$1 AND lesson_id=$2", [uid, LID]);
  const o = {}; r.rows.forEach((x) => (o[x.item_id] = x)); return o;
}
async function recordItem(uid, item, value, correct, reflection) {
  await q(`INSERT INTO item_results(user_id,lesson_id,item_id,first_value,latest_value,correct,attempts,reflection,passed_at)
           VALUES ($1,$2,$3,$4,$4,$5,1,$6, CASE WHEN $5 THEN now() END)
           ON CONFLICT (user_id,lesson_id,item_id) DO UPDATE SET latest_value=EXCLUDED.latest_value, correct=EXCLUDED.correct,
             attempts=item_results.attempts+1, reflection=COALESCE(EXCLUDED.reflection, item_results.reflection),
             passed_at=COALESCE(item_results.passed_at, EXCLUDED.passed_at), updated_at=now()`, [uid, LID, item, value, correct, reflection || null]);
}

/* Server-side checks. Answer keys never leave the server. */
app.post("/api/lessons/grn01/check", A.requireUser, wrap(async (req, res) => {
  const { item, value, reflection } = req.body || {};
  const v = trimStr(value, 4);
  if (item === "DIAG") { // both answers submitted together; baseline, not scored
    const ans = (req.body && req.body.answers) || {};
    if (!ans.D01 || !ans.D02) return res.status(400).json({ error: "Answer both questions before submitting." });
    const out = {};
    for (const d of C.DIAG) { const ok = ans[d.id] === d.key; await recordItem(req.user.id, d.id, trimStr(ans[d.id], 4), ok); out[d.id] = { correct: ok, feedback: d.fb, expected: d.key }; }
    return res.json({ results: out });
  }
  const vc = C.VC.find((x) => x.id === item);
  if (vc) {
    const idx = C.VC.indexOf(vc), results = await getResults(req.user.id);
    if (idx > 0 && !(results[C.VC[idx - 1].id] && results[C.VC[idx - 1].id].passed_at)) return res.status(409).json({ error: "Complete the previous checkpoint first." });
    const ok = v === vc.key; const refl = trimStr(reflection, 2000);
    if (ok && !refl && req.body.final) return res.status(400).json({ error: "Write a reflection to continue." });
    await recordItem(req.user.id, vc.id, v, ok, ok && refl ? refl : null);
    const after = (await getResults(req.user.id))[vc.id];
    return res.json({ correct: ok, feedback: ok ? vc.fb : "Not yet. Look again at what was observed versus concluded, then try again.", unlocked: !!(ok && after && after.has_reflection) });
  }
  const sk = C.SORT.find((x) => x.id === item);
  if (sk) { const ok = value === sk.key; await recordItem(req.user.id, sk.id, trimStr(value, 12), ok); return res.json({ correct: ok, expected: sk.key }); }
  if (item === "S05") { const ok = v === C.ROUTE_KEY; await recordItem(req.user.id, "S05", v, ok); return res.json({ correct: ok, feedback: ok ? C.ROUTE_FB.right : C.ROUTE_FB.wrong }); }
  if (item === "S08") { const ok = v === C.HANDLE.key; await recordItem(req.user.id, "S08", v, ok); return res.json({ correct: ok, feedback: C.HANDLE.fb[v] || "" }); }
  if (item === "S03") { await recordItem(req.user.id, "S03", v, v === "b"); return res.json({ ok: true }); }
  res.status(400).json({ error: "Unknown item." });
}));

app.post("/api/lessons/grn01/quiz", A.requireUser, wrap(async (req, res) => {
  const ans = (req.body && req.body.answers) || {};
  const missing = C.QUIZ.filter((x) => !ans[x.id]).map((x) => x.id);
  if (missing.length) return res.status(400).json({ error: "Answer all five questions.", missing });
  let correct = 0; const items = {};
  C.QUIZ.forEach((x) => { const ok = ans[x.id] === x.key; if (ok) correct++; items[x.id] = { correct: ok, feedback: x.fb }; });
  const q5 = ans.Q5 === C.QUIZ[4].key;
  const clean = {}; C.QUIZ.forEach((x) => (clean[x.id] = trimStr(ans[x.id], 4)));
  const r = await q("INSERT INTO quiz_attempts(user_id,lesson_id,key_version,answers,correct,q5_correct) VALUES ($1,$2,$3,$4,$5,$6) RETURNING rule_met, id", [req.user.id, LID, C.LESSON.quizKeyVersion, clean, correct, q5]);
  res.json({ correct, q5, ruleMet: r.rows[0].rule_met, items });
}));

app.get("/api/lessons/grn01/model", A.requireUser, wrap(async (req, res) => {
  const sub = await q("SELECT id FROM submissions WHERE user_id=$1 AND lesson_id=$2 LIMIT 1", [req.user.id, LID]);
  const reason = sub.rows[0] ? "post_submission" : "self_study_before_submission";
  if (!sub.rows[0] && req.query.confirm !== "1") return res.status(409).json({ error: "Viewing the model before you submit marks this attempt as model-exposed.", needsConfirm: true });
  await q("INSERT INTO model_exposures(user_id,lesson_id,reason) VALUES ($1,$2,$3)", [req.user.id, LID, reason]);
  res.json({ reason, brief: C.MODEL_BRIEF, summary: C.MODEL_SUMMARY, note: "Draft model authored for the pilot prototype; approved model comes from storyboard v1.1." });
}));

/* ---------- progress (optimistic concurrency) ---------- */
app.get("/api/progress/grn01", A.requireUser, wrap(async (req, res) => {
  const r = await q("SELECT state, seq, updated_at FROM progress WHERE user_id=$1 AND lesson_id=$2", [req.user.id, LID]);
  res.json(r.rows[0] || { state: {}, seq: 0, updated_at: null });
}));
app.put("/api/progress/grn01", A.requireUser, wrap(async (req, res) => {
  const { state, seq } = req.body || {};
  if (typeof state !== "object" || state === null || !Number.isInteger(seq)) return res.status(400).json({ error: "Bad save request." });
  if (JSON.stringify(state).length > 150000) return res.status(413).json({ error: "Too much text to save at once." });
  const up = await q(`INSERT INTO progress(user_id,lesson_id,state,seq,updated_at) VALUES ($1,$2,$3,1,now())
                      ON CONFLICT (user_id,lesson_id) DO UPDATE SET state=EXCLUDED.state, seq=progress.seq+1, updated_at=now()
                      WHERE progress.seq=$4 RETURNING seq, updated_at`, [req.user.id, LID, state, seq]);
  if (!up.rows[0]) { const cur = await q("SELECT state, seq, updated_at FROM progress WHERE user_id=$1 AND lesson_id=$2", [req.user.id, LID]); return res.status(409).json({ error: "Saved elsewhere since you opened this page.", current: cur.rows[0] }); }
  res.json(up.rows[0]);
}));

/* ---------- submissions (idempotent, immutable) ---------- */
app.post("/api/lessons/grn01/submissions", A.requireUser, wrap(async (req, res) => {
  const key = trimStr(req.get("Idempotency-Key"), 80);
  if (!key) return res.status(400).json({ error: "Missing Idempotency-Key." });
  const prior = await q("SELECT receipt, attempt, created_at, model_exposed, route FROM submissions WHERE user_id=$1 AND idem_key=$2", [req.user.id, key]);
  if (prior.rows[0]) return res.status(200).json({ ...prior.rows[0], replay: true });
  if (req.user.route === "jud") return res.status(403).json({ error: "The judiciary task for this stop is not open yet. Nothing here counts toward a judiciary result." });
  const b = req.body || {}, rows = b.rows || {}, errs = [];
  const snap = { rows: {}, summary: trimStr(b.summary, 6000) };
  C.PROPS.forEach((p) => {
    const r = rows[p.id] || {}; const cards = Array.isArray(r.cards) ? r.cards.filter((c) => /^C0[1-6]$/.test(c)) : [];
    const row = { cards, sup: trimStr(r.sup, 3000), alt: trimStr(r.alt, 3000), next: trimStr(r.next, 3000), hand: trimStr(r.hand, 1500) };
    if (!cards.length) errs.push(p.id + ": card IDs"); ["sup", "alt", "next", "hand"].forEach((k) => { if (!row[k]) errs.push(p.id + ": " + k); });
    snap.rows[p.id] = row;
  });
  if (!snap.summary) errs.push("summary");
  if (errs.length) return res.status(400).json({ error: "Complete every field before submitting.", missing: errs });
  const exposed = (await q("SELECT 1 FROM model_exposures WHERE user_id=$1 AND lesson_id=$2 AND reason='self_study_before_submission' LIMIT 1", [req.user.id, LID])).rows.length > 0;
  const attempt = (await q("SELECT count(*)::int n FROM submissions WHERE user_id=$1 AND lesson_id=$2", [req.user.id, LID])).rows[0].n + 1;
  const receipt = "DJH-GRN01-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const ins = await q(`INSERT INTO submissions(user_id,lesson_id,idem_key,receipt,route,attempt,content_version,rubric_version,model_exposed,snapshot)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id,idem_key) DO NOTHING RETURNING receipt, attempt, created_at, model_exposed, route`,
    [req.user.id, LID, key, receipt, req.user.route, attempt, C.LESSON.version, C.LESSON.rubricVersion, exposed, snap]);
  if (!ins.rows[0]) { const again = await q("SELECT receipt, attempt, created_at, model_exposed, route FROM submissions WHERE user_id=$1 AND idem_key=$2", [req.user.id, key]); return res.json({ ...again.rows[0], replay: true }); }
  await audit(req.user.id, "brief submitted", receipt);
  res.status(201).json(ins.rows[0]);
}));

/* ---------- status: completion computed on the server ---------- */
async function status(uid) {
  const res = await getResults(uid);
  const quiz = (await q("SELECT correct, q5_correct, rule_met FROM quiz_attempts WHERE user_id=$1 AND lesson_id=$2 ORDER BY id", [uid, LID])).rows;
  const sub = (await q("SELECT receipt, attempt, created_at, model_exposed, route FROM submissions WHERE user_id=$1 AND lesson_id=$2 ORDER BY id DESC LIMIT 1", [uid, LID])).rows[0] || null;
  const exposures = (await q("SELECT reason FROM model_exposures WHERE user_id=$1 AND lesson_id=$2", [uid, LID])).rows;
  const prog = (await q("SELECT state, updated_at FROM progress WHERE user_id=$1 AND lesson_id=$2", [uid, LID])).rows[0];
  const st = (prog && prog.state) || {};
  const vcPassed = C.VC.filter((v) => res[v.id] && res[v.id].passed_at && res[v.id].has_reflection).length;
  const reqs = [
    ["Orientation acknowledged", !!st.ack],
    ["Opening diagnostic submitted", !!(res.D01 && res.D02)],
    ["First approach and inquiry recorded", !!(res.S03 && st.inquiryFirst)],
    ["Four recording checkpoints", vcPassed === 4],
    ["Safe-handling check correct", !!(res.S08 && res.S08.correct && st.derived)],
    ["Brief submitted", !!sub],
    ["Quiz rule met (4 of 5 including Q5)", quiz.some((x) => x.rule_met)],
    ["Model comparison viewed", exposures.some((x) => x.reason === "post_submission")],
    ["Five self-review selections", !!(st.self && Object.keys(st.self).length >= 5)],
    ["Transfer habit chosen", !!st.transfer],
  ];
  const done = reqs.filter((r) => r[1]).length;
  const complete = done === reqs.length;
  const visited = Object.keys(st.visited || {}).length;
  return { reqs, done, total: reqs.length, complete, label: complete ? "Self-study complete · not reviewed" : (visited || done) ? "In progress" : "Not started",
    percent: complete ? 100 : Math.min(99, Math.round((Math.max(visited, done * 1.5) / C.ORDER.length) * 100)), screen: st.screen || "S01", updatedAt: prog ? prog.updated_at : null,
    vcPassed, quizAttempts: quiz.length, submission: sub, modelExposedBeforeSubmit: exposures.some((x) => x.reason === "self_study_before_submission"),
    results: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { correct: v.correct, attempts: v.attempts, passed: !!v.passed_at, first: v.first_value, reflected: v.has_reflection }])) };
}
app.get("/api/lessons/grn01/status", A.requireUser, wrap(async (req, res) => res.json(await status(req.user.id))));

app.get("/api/dashboard", A.requireUser, wrap(async (req, res) => {
  const s = await status(req.user.id);
  const chats = (await q("SELECT count(*)::int n FROM chat_messages WHERE user_id=$1 AND role='learner'", [req.user.id])).rows[0].n;
  res.json({ user: A.publicUser(req.user), status: s, chats, ai: AI.aiEnabled(),
    announcements: [{ title: "Welcome to the Digital Justice Hub", by: "Course team", date: "2026-09-24", body: "The Pillaging Case is open for self-paced study. Start any time and go at your own pace; your place is saved. Reviewers score submitted briefs in the order received. Fictional material only." }],
    todo: [{ tag: "Next", title: "Continue the Pillaging Case", note: "About 60 minutes in short topics · your place is saved", link: "#/course/grn01" },
           { tag: "Then", title: C.ROUTES[req.user.route === "jud" ? "pro" : req.user.route].product, note: "Topic 12 · no deadline · reviewed after you submit", link: "#/course/grn01" },
           { tag: "Any time", title: "Recorded expert session", note: "Optional · watch when it suits you" }] });
}));

/* ---------- AI case guide ---------- */
app.get("/api/chat/grn01", A.requireUser, wrap(async (req, res) => {
  const r = await q("SELECT id, role, source, screen, content, created_at FROM chat_messages WHERE user_id=$1 AND lesson_id=$2 ORDER BY id DESC LIMIT 60", [req.user.id, LID]);
  res.json({ messages: r.rows.reverse(), ai: AI.aiEnabled() });
}));
app.post("/api/chat/grn01", A.requireUser, wrap(async (req, res) => {
  const message = trimStr(req.body && req.body.message, 1500), screen = trimStr(req.body && req.body.screen, 6);
  if (!message) return res.status(400).json({ error: "Write a message first." });
  if (A.limited("chat:" + req.user.id, 20, 600e3)) return res.status(429).json({ error: "You have sent a lot of messages. Wait a few minutes and try again." });
  const hist = (await q("SELECT role, content FROM chat_messages WHERE user_id=$1 AND lesson_id=$2 AND source<>'blocked' ORDER BY id DESC LIMIT 10", [req.user.id, LID])).rows.reverse();
  const turns = (await q("SELECT count(*)::int n FROM chat_messages WHERE user_id=$1 AND lesson_id=$2 AND role='guide'", [req.user.id, LID])).rows[0].n;
  const out = await AI.reply({ routeKey: req.user.route, screenId: C.ORDER.includes(screen) ? screen : null, history: hist, message, turnIndex: turns });
  if (out.source !== "blocked") await q("INSERT INTO chat_messages(user_id,lesson_id,role,source,screen,content) VALUES ($1,$2,'learner','learner',$3,$4)", [req.user.id, LID, screen || null, message]);
  const g = await q("INSERT INTO chat_messages(user_id,lesson_id,role,source,screen,content) VALUES ($1,$2,'guide',$3,$4,$5) RETURNING id, role, source, screen, content, created_at", [req.user.id, LID, out.source, screen || null, out.text]);
  res.json({ reply: g.rows[0], note: out.note || null });
}));

/* ---------- static front end ---------- */
app.use(express.static(path.join(__dirname, "..", "public"), { index: "index.html", maxAge: "5m" }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Something went wrong on our side. Your work on screen is not lost; try again." }); });

(async () => {
  await migrate();
  await A.seedDemo();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`DJH app on :${port} · AI ${AI.aiEnabled() ? "on (" + AI.MODEL + ")" : "off (authored fallback)"}`));
})().catch((e) => { console.error("Startup failed", e); process.exit(1); });
