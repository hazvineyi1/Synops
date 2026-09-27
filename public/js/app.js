// Digital Justice Hub pilot front end. No build step; ES module.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hm = (d) => { const x = new Date(d); return String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
const wc = (s) => (s || "").trim() ? s.trim().split(/\s+/).length : 0;
const chip = (cls, t) => `<span class="chip ${cls}">${esc(t)}</span>`;
function announce(m) { const l = $("#live"); l.textContent = ""; setTimeout(() => (l.textContent = m), 30); }
const RCOL = { inv: "var(--r-inv)", pro: "var(--r-pro)", jud: "var(--r-jud)" };

/* ---------------- api ---------------- */
async function api(method, url, body, headers = {}) {
  const res = await fetch(url, { method, credentials: "same-origin", headers: { "X-DJH": "1", ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await res.json(); } catch (_) {}
  if (!res.ok) { const e = new Error(data.error || "Request failed (" + res.status + ")"); e.status = res.status; e.data = data; throw e; }
  return data;
}

/* ---------------- i18n (interface chrome) ---------------- */
const T = {
  en: { brand: "Digital Justice Hub", sub: "Learning and professional resources", home: "Dashboard", course: "Pillaging Case", guide: "Case guide", admin: "Approvals", signout: "Sign out", signin: "Sign in", request: "Request access", saved: "Saved", saving: "Saving…", failed: "Not saved. Your text is still here.", retry: "Retry", prev: "Previous", next: "Next", continue: "Continue", resume: "Resume", start: "Start" },
  uk: { brand: "Цифровий хаб правосуддя", sub: "Навчання та професійні ресурси", home: "Панель", course: "Справа про розграбування", guide: "Помічник зі справи", admin: "Затвердження", signout: "Вийти", signin: "Увійти", request: "Подати запит", saved: "Збережено", saving: "Збереження…", failed: "Не збережено. Ваш текст залишається тут.", retry: "Повторити", prev: "Назад", next: "Далі", continue: "Продовжити", resume: "Продовжити", start: "Почати" },
};
const S = { lang: localGet("djh.lang") || "en", me: null, ai: false, content: null, prog: { state: {}, seq: 0 }, status: null, chat: [], chatOpen: localGet("djh.chat") !== "0", saveState: "idle", savedAt: null, errs: {}, sending: false, pending: {} };
const t = (k) => (T[S.lang] && T[S.lang][k]) || T.en[k] || k;
function localGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

/* ---------------- header ---------------- */
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="8" fill="#13294B"/><path d="M7 13h8c5 0 5 7 10 7h8" stroke="#3DD6C4" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M7 20h26" stroke="#F5B942" stroke-width="3.2" stroke-linecap="round"/><path d="M7 27h8c5 0 5-7 10-7h8" stroke="#FF8B66" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
const ICON_CHAT = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>`;
function paintHeader(active) {
  document.documentElement.lang = S.lang;
  const me = S.me;
  const nav = me ? [["#/dashboard", t("home"), "dashboard"], ["#/course/grn01", t("course"), "course"], ["#/guide", t("guide"), "guide"]].concat(me.role === "admin" ? [["#/admin", t("admin"), "admin"]] : []) : [];
  $("#site").innerHTML = `<div class="minibar"><div class="wrap">
    <a class="brand" href="${me ? "#/dashboard" : "#/login"}">${LOGO}<span><b>${esc(t("brand"))}</b><span>${esc(t("sub"))}</span></span></a>
    <div class="hright">
      ${me ? `<a class="ibtn" href="#/guide" aria-label="${esc(t("guide"))}" title="${esc(t("guide"))}">${ICON_CHAT}</a>` : ""}
      <div class="langsw" role="group" aria-label="Interface language"><button type="button" data-lang="uk" lang="uk" aria-pressed="${S.lang === "uk"}">УКР</button><button type="button" data-lang="en" lang="en" aria-pressed="${S.lang === "en"}">EN</button></div>
      ${me ? `<span class="avatar" aria-hidden="true">${esc(me.name.charAt(0))}</span><span class="who"><b>${esc(me.name)}</b><span>${esc(me.prole)}</span></span><button type="button" class="btn small" data-act="logout">${esc(t("signout"))}</button>` : ""}
    </div></div></div>
    ${nav.length ? `<nav class="navbar" aria-label="Main"><ul>${nav.map((n) => `<li><a href="${n[0]}"${active === n[2] ? ' aria-current="page"' : ""}>${esc(n[1])}</a></li>`).join("")}</ul></nav>` : ""}`;
}

/* ---------------- router ---------------- */
async function route() {
  const h = location.hash.replace(/^#\/?/, "") || "";
  const [p1, p2, p3] = h.split("/");
  if (!S.me && !["login", "register", "registered"].includes(p1)) { location.hash = "#/login"; return; }
  if (S.me && (p1 === "" || p1 === "login" || p1 === "register")) { location.hash = "#/dashboard"; return; }
  try {
    if (p1 === "login") return vLogin();
    if (p1 === "register") return vRegister();
    if (p1 === "registered") return vRegistered();
    if (p1 === "dashboard") return await vDashboard();
    if (p1 === "course" && p2 === "grn01") return await vPlayer(p3);
    if (p1 === "guide") return await vGuide();
    if (p1 === "admin") return await vAdmin();
    location.hash = "#/dashboard";
  } catch (e) {
    if (e.status === 401) { S.me = null; location.hash = "#/login"; return; }
    $("#main").innerHTML = `<div class="notice crit"><p>${esc(e.message)}</p></div>`;
  }
}
function setMain(html, active, focusSel) {
  paintHeader(active);
  $("#main").innerHTML = html;
  const f = focusSel && $(focusSel);
  if (f) { f.setAttribute("tabindex", "-1"); f.focus(); } else $("#main").focus({ preventScroll: true });
}

/* ---------------- auth views ---------------- */
function mapArt() {
  return `<svg viewBox="0 0 600 220" role="img" aria-label="Three routes, investigation, prosecution and judiciary, meeting at shared stops"><g fill="none" stroke-linecap="round" stroke-width="8">
  <path d="M10 96H120C160 96 160 40 200 40H300C340 40 340 96 380 96H590" stroke="#3DD6C4"/><path d="M10 116H590" stroke="#F5B942"/><path d="M10 136H250C290 136 290 190 330 190H430C470 190 470 136 510 136H590" stroke="#FF8B66"/></g>
  <g fill="#fff" stroke="#0F1D33" stroke-width="3"><rect x="68" y="82" width="20" height="68" rx="10"/><rect x="520" y="82" width="20" height="68" rx="10"/></g><rect x="224" y="78" width="26" height="76" rx="13" fill="#F5B942" stroke="#0F1D33" stroke-width="3"/></svg>`;
}
function fieldErr(k) { return S.errs[k] ? `<span class="err" id="e-${k}">${esc(S.errs[k])}</span>` : ""; }
function inv(k) { return S.errs[k] ? ` aria-invalid="true" aria-describedby="e-${k}"` : ""; }
function errSummary() { const k = Object.keys(S.errs); if (!k.length) return ""; return `<div class="notice crit" id="errsum" role="alert"><p><b>${k.length} thing${k.length > 1 ? "s" : ""} to fix</b></p><ul class="small">${k.map((x) => `<li><a href="#f-${x}" data-focus="f-${x}">${esc(S.errs[x])}</a></li>`).join("")}</ul></div>`; }
function vLogin(msg) {
  setMain(`<div class="login"><div class="loginart"><p class="eyebrow" style="color:#A8B6CB">${esc(t("brand"))}</p><h1>Practical learning for justice professionals investigating and prosecuting international crimes</h1><p>Courses, reference resources and professional discussion for prosecutors, investigators, analysts and judges in Ukraine. Each role follows its own route through the same cases.</p>${mapArt()}</div>
  <div class="logincard"><h2 id="loginH">${esc(t("signin"))}</h2>${msg ? `<div class="notice ok"><p>${esc(msg)}</p></div>` : ""}<div id="loginErr"></div>
  <form id="loginForm" class="stack" novalidate><div class="field"><label for="f-email">Work email</label><input id="f-email" type="email" autocomplete="username" required></div><div class="field"><label for="f-password">Password</label><input id="f-password" type="password" autocomplete="current-password" required></div><button class="btn primary" type="submit">${esc(t("signin"))}</button></form>
  <p class="small">No account? <a href="#/register">${esc(t("request"))}</a></p>
  <details class="panel soft small"><summary style="cursor:pointer;font-weight:700">Pilot demonstration accounts</summary><p style="margin-top:.5rem">Prosecutor: demo.prosecutor@justice.example<br>Investigator: demo.investigator@justice.example<br>Judge: demo.judge@justice.example<br>Coordinator: demo.admin@justice.example<br>Password: provided by your coordinator.</p></details>
  <p class="small muted">For approved justice actors only. The Hub holds fictional training material, never case files or evidence.</p></div></div>`, null);
}
const PROLES = [["Prosecutor", "pro"], ["Prosecution support", "pro"], ["Police investigator", "inv"], ["Police analyst", "inv"], ["SSU investigator", "inv"], ["Judge", "jud"], ["Judicial staff", "jud"], ["Other approved justice actor", "pro"]];
const INST = ["Prosecutor's office", "National Police", "Security Service of Ukraine (SSU)", "Court", "Training Centre of Prosecutors of Ukraine", "Other approved justice body"];
const RNAMES = { inv: "Investigation", pro: "Prosecution", jud: "Judiciary" };
function vRegister() {
  const r = S.reg || (S.reg = { lang: "uk" });
  const sel = (id, label, opts, val) => `<div class="field"><label for="f-${id}">${label} <span aria-hidden="true" class="err">*</span></label><select id="f-${id}" data-reg="${id}"${inv(id)}><option value="">Choose</option>${opts.map((o) => `<option value="${esc(o[0])}"${val === o[0] ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select>${fieldErr(id)}</div>`;
  const inp = (id, label, type, hint, ac) => `<div class="field"><label for="f-${id}">${label} <span aria-hidden="true" class="err">*</span>${hint ? ` <span class="hint">${hint}</span>` : ""}</label><input id="f-${id}" type="${type}" data-reg="${id}" value="${esc(r[id] || "")}"${ac ? ` autocomplete="${ac}"` : ""}${inv(id)}>${fieldErr(id)}</div>`;
  const suggested = (PROLES.find((p) => p[0] === r.prole) || [])[1];
  setMain(`<div class="authwrap"><h1 id="regH">Request access</h1><p class="muted">For prosecutors, investigators, analysts, judges and other approved justice actors. Your institution approves each request.</p>${errSummary()}
  <form id="regForm" class="panel stack" novalidate>
   ${inp("name", "Full name", "text", "", "name")}${inp("email", "Work email", "email", "Your official institutional address.", "email")}
   ${sel("institution", "Institution type", INST.map((x) => [x, x]), r.institution)}${inp("unit", "Institution or unit name", "text", "", "organization")}
   ${sel("prole", "Professional role", PROLES.map((p) => [p[0], p[0]]), r.prole)}
   <fieldset${inv("route")}><legend>Your route <span aria-hidden="true" class="err">*</span>${suggested ? ` <span class="hint">Suggested for your role: ${RNAMES[suggested]}</span>` : ""}</legend><div class="routes3">${["inv", "pro", "jud"].map((k) => `<label class="choice${r.route === k ? " sel" : ""}" style="border-top:4px solid ${RCOL[k]}"><input type="radio" name="route" data-reg="route" value="${k}"${r.route === k ? " checked" : ""}><span><b>${RNAMES[k]}</b>${k === "jud" ? '<br><span class="small muted">Tasks planned, not open yet</span>' : ""}</span></label>`).join("")}</div>${fieldErr("route")}</fieldset>
   ${inp("password", "Choose a password", "password", "At least 12 characters. A short phrase is easier to remember.", "new-password")}
   <label class="choice${r.terms ? " sel" : ""}"><input id="f-terms" type="checkbox" data-reg="terms"${r.terms ? " checked" : ""}${inv("terms")}><span>I accept the terms of use and privacy notice. I understand the Hub is for training and reference only, and I will not enter real case information.</span></label>${fieldErr("terms")}
   <button class="btn primary" type="submit">Send request</button></form><p class="small">Already approved? <a href="#/login">${esc(t("signin"))}</a></p></div>`, null, Object.keys(S.errs).length ? "#errsum" : "#regH");
}
function vRegistered() {
  setMain(`<div class="authwrap"><div class="notice ok" role="status"><p><b>Request received.</b></p></div><div class="panel stack-s"><p>Your training coordinator will confirm your role. You can sign in as soon as your account is approved.</p><p class="small muted">Nothing is visible to other members until then.</p><a class="btn primary" href="#/login">${esc(t("signin"))}</a></div></div>`, null);
}

/* ---------------- dashboard ---------------- */
function banner() {
  return `<svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="160" fill="#13294B"/><path d="M0 58H90C120 58 120 34 150 34H200C230 34 230 58 260 58H320" stroke="#3DD6C4" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M0 80H320" stroke="#F5B942" stroke-width="7" stroke-linecap="round"/><path d="M0 102H160C190 102 190 128 220 128H320" stroke="#FF8B66" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="146" y="44" width="18" height="72" rx="9" fill="#F5B942" stroke="#13294B" stroke-width="3"/></svg>`;
}
async function vDashboard() {
  const d = await api("GET", "/api/dashboard"); S.ai = d.ai; const st = d.status, me = d.user; S.me = me;
  const routeKey = me.route, R = S.content ? S.content.routes : null;
  const hr = new Date().getHours(), greet = S.lang === "uk" ? (hr < 12 ? "Доброго ранку" : hr < 18 ? "Добрий день" : "Добрий вечір") : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const routeCards = `<div class="routes3">${["inv", "pro", "jud"].map((k) => `<div class="rcard${k === routeKey ? " mine" : ""}" style="border-top-color:${RCOL[k]}"><b>${RNAMES[k]}${k === routeKey ? " · your route" : ""}</b><span class="muted">${esc(({ inv: "Corroboration brief", pro: "Evidence-gap brief before charging", jud: "Bench note (planned)" })[k])}</span></div>`).join("")}</div>`;
  const statusChip = st.complete ? chip("accent", st.label) : st.percent ? chip("warn", st.label) : chip("", st.label);
  setMain(`<div class="stack-s" style="margin-bottom:1.25rem"><h1 id="dashH">${esc(greet + ", " + me.name.split(" ")[0])}</h1><p class="small muted">${esc(me.prole)} · ${esc(me.unit || "")} · <span class="rbar" style="background:${RCOL[routeKey]}"></span> ${RNAMES[routeKey]} route</p></div>
  <div class="wgrid"><div class="wcol">
   <section class="widget" aria-labelledby="wc"><div class="whead"><h2 id="wc">Continue learning</h2></div><div class="wbody"><div class="coursecard">${banner()}<div class="cbody"><span class="eyebrow">Course 3 · GRN01 · pilot draft</span><h3 style="font-size:1.2rem">Pillaging Case evidence review</h3><p class="small muted">${esc(st.screen)} · ${st.updatedAt ? "last saved " + new Date(st.updatedAt).toLocaleString() : "not started yet"}</p><div class="meter" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.percent}"><i style="width:${st.percent}%"></i></div><div class="row"><span class="small">${st.percent}%</span>${statusChip}</div><div class="row">${routeKey === "jud" ? `<a class="btn" href="#/course/grn01">Preview the shared case</a>` : `<a class="btn primary" href="#/course/grn01">${st.percent ? t("resume") : t("start")}</a>`}<a class="btn" href="#/guide">Ask the case guide</a></div>${routeKey === "jud" ? '<p class="small notice">The judiciary task for this stop is being designed and reviewed separately. You can preview the shared case; nothing counts toward a judiciary result yet.</p>' : ""}</div></div></div></section>
   <section class="widget" aria-labelledby="wr"><div class="whead"><h2 id="wr">Routes at this stop</h2></div><div class="wbody stack-s"><p class="small muted">Everyone studies the same fictional case. Your route decides what you produce and who reviews it.</p>${routeCards}</div></section>
   <section class="widget" aria-labelledby="wq"><div class="whead"><h2 id="wq">What completion requires</h2><span class="small muted">${st.done} of ${st.total}</span></div><div class="wbody"><ul class="check">${st.reqs.map((r) => `<li><span class="${r[1] ? "y" : "n"}" aria-hidden="true">${r[1] ? "✓" : "○"}</span><span>${esc(r[0])}<span class="sr">${r[1] ? " done" : " not yet"}</span></span></li>`).join("")}</ul><p class="small muted" style="margin-top:.6rem">Self-study completion is not a reviewed result or a professional certification.</p>${st.submission ? `<p class="small">Latest submission: <span class="mono">${esc(st.submission.receipt)}</span>${st.submission.model_exposed ? " · model-exposed" : ""}</p>` : ""}</div></section>
  </div><div class="wcol">
   <section class="widget" aria-labelledby="wg"><div class="whead"><h2 id="wg">Case guide</h2>${d.ai ? chip("ok", "AI on") : chip("", "Authored mode")}</div><div class="wbody stack-s"><p class="small">Ask questions about the fictional file. The guide answers with questions, cites cards C01 to C06 and never writes your brief.</p><p class="small muted">${d.chats} message${d.chats === 1 ? "" : "s"} so far</p><a class="btn" href="#/guide">Open the case guide</a></div></section>
   <section class="widget" aria-labelledby="wt"><div class="whead"><h2 id="wt">Work to do</h2></div><div class="wbody"><ul class="todo">${d.todo.map((x) => { const dt = new Date(x.date + "T12:00:00"); return `<li><span class="dt"><b>${String(dt.getDate()).padStart(2, "0")}</b>${dt.toLocaleString("en", { month: "short" }).toUpperCase()}</span><span class="stack-s" style="gap:0">${x.link ? `<a href="${x.link}">${esc(x.title)}</a>` : `<span>${esc(x.title)}</span>`}<span class="small muted">${esc(x.note)}</span></span></li>`; }).join("")}</ul></div></section>
   <section class="widget" aria-labelledby="wa"><div class="whead"><h2 id="wa">Announcements</h2></div><div class="wbody">${d.announcements.map((a) => `<article class="stack-s" style="gap:.2rem"><b>${esc(a.title)}</b><span class="small muted">${esc(a.by)} · ${esc(a.date)}</span><p class="small">${esc(a.body)}</p></article>`).join("")}</div></section>
  </div></div>`, "dashboard", "#dashH");
}

/* ---------------- course player ---------------- */
let saveTimer = null;
function P() { return S.prog.state; }
function saveSoon() { S.saveState = "saving"; paintSave(); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow() {
  clearTimeout(saveTimer);
  try {
    const r = await api("PUT", "/api/progress/grn01", { state: S.prog.state, seq: S.prog.seq });
    S.prog.seq = r.seq; S.saveState = "saved"; S.savedAt = r.updated_at; paintSave(); return true;
  } catch (e) {
    if (e.status === 409 && e.data && e.data.current) {
      S.prog.seq = e.data.current.seq; // another tab saved; keep this tab's text and save on top
      return saveNow();
    }
    S.saveState = "failed"; paintSave(); announce(t("failed")); return false;
  }
}
function paintSave() {
  const el = $("#savestate"); if (!el) return;
  el.className = "savestate " + (S.saveState === "idle" ? "" : S.saveState);
  el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${S.saveState === "saved" ? t("saved") + " " + hm(S.savedAt) : S.saveState === "saving" ? t("saving") : S.saveState === "failed" ? t("failed") : "No changes yet"}</span>${S.saveState === "failed" ? ` <button class="btn small" data-act="retrySave">${t("retry")}</button>` : ""}`;
}
async function loadCourse() {
  if (!S.content) S.content = await api("GET", "/api/lessons/grn01");
  const pr = await api("GET", "/api/progress/grn01"); S.prog = { state: pr.state || {}, seq: pr.seq || 0 }; S.savedAt = pr.updated_at;
  S.status = await api("GET", "/api/lessons/grn01/status");
  if (!S.chat.length) { const c = await api("GET", "/api/chat/grn01"); S.chat = c.messages; S.ai = c.ai; }
}
const routeInfo = () => S.content.routes[S.me.route === "jud" ? "pro" : S.me.route];
async function vPlayer(screen) {
  await loadCourse();
  const C = S.content, st = P();
  const sc = C.order.includes(screen) ? screen : st.screen || "S01";
  if (sc !== screen) { history.replaceState(null, "", "#/course/grn01/" + sc); }
  st.screen = sc; st.visited = st.visited || {}; if (!st.visited[sc]) { st.visited[sc] = true; saveSoon(); }
  renderPlayer();
}
function renderPlayer(keepFocus) {
  const chatDraft = $("#chatIn") ? $("#chatIn").value : "";
  const C = S.content, st = P(), sc = st.screen, i = C.order.indexOf(sc), prev = C.order[i - 1], next = C.order[i + 1], block = nextBlock(sc);
  const toc = C.units.map((u) => `<li><div class="unit"><span>${u.n}. ${esc(u.en)}</span><span class="mono">${u.mins} min</span></div><ol>${u.screens.map((s) => `<li><a href="#/course/grn01/${s}"${s === sc ? ' aria-current="step"' : ""}><span class="sid">${s}</span><span>${esc(C.titles[s])}</span>${st.visited[s] && s !== sc ? '<span class="tick" aria-label="visited">✓</span>' : ""}</a></li>`).join("")}</ol></li>`).join("");
  const guideCol = S.chatOpen ? `<aside class="guidecol" aria-label="Case guide">${chatPanel(false)}</aside>` : "";
  const html = `<p class="small" style="margin-bottom:.6rem"><a href="#/dashboard">${esc(t("home"))}</a> / Course 3 / GRN01 · <span class="rbar" style="background:${RCOL[S.me.route]}"></span> ${RNAMES[S.me.route]} route</p>
  <div class="player${S.chatOpen ? " with-guide" : ""}"><nav class="toc" aria-label="Lesson contents"><p class="eyebrow">Lesson contents · 7 units</p><ol>${toc}</ol></nav>
  <div style="min-width:0">${S.me.route === "jud" ? '<div class="notice" style="margin-bottom:1rem"><p>The judiciary task for this stop is planned. You are previewing the shared case with the prosecution task; submission is closed for the judiciary route.</p></div>' : ""}
   <div class="topnav"><div class="row" style="gap:.8rem"><span class="small muted">Topic ${i + 1} of ${C.order.length}</span><div id="savestate" class="savestate" role="status"></div></div><div class="row" style="gap:.35rem"><button class="btn small" data-act="toggleChat" aria-pressed="${S.chatOpen}">${S.chatOpen ? "Hide" : "Show"} case guide</button>${prev ? `<a class="btn small" href="#/course/grn01/${prev}">‹ ${t("prev")}</a>` : ""}${next ? (block ? `<button class="btn small" disabled title="${esc(block)}">${t("next")} ›</button>` : `<a class="btn small" href="#/course/grn01/${next}">${t("next")} ›</a>`) : ""}</div></div>
   <section class="screen" aria-labelledby="scrH">${screenBody(sc)}</section>
   <div class="pager">${prev ? `<a class="btn" href="#/course/grn01/${prev}">‹ ${esc(C.titles[prev])}</a>` : "<span></span>"}${next ? `<div class="stack-s" style="align-items:flex-end">${block ? `<button class="btn primary" disabled aria-describedby="blk">${t("continue")}: ${esc(C.titles[next])} ›</button><p id="blk" class="small muted">${esc(block)}</p>` : `<a class="btn primary" href="#/course/grn01/${next}">${t("continue")}: ${esc(C.titles[next])} ›</a>`}</div>` : ""}</div>
  </div>${guideCol}</div>`;
  if (keepFocus) { const a = document.activeElement, id = a && a.id; const sx = scrollX, sy = scrollY; paintHeader("course"); $("#main").innerHTML = html; scrollTo(sx, sy); if (id && $("#" + CSS.escape(id))) $("#" + CSS.escape(id)).focus({ preventScroll: true }); }
  else setMain(html, "course", "#scrH");
  paintSave(); scrollChat(); if (chatDraft && $("#chatIn")) $("#chatIn").value = chatDraft;
}
function nextBlock(sc) {
  const st = P(), R = (S.status && S.status.results) || {};
  if (sc === "S01" && !st.ack) return "Confirm the fictional-material acknowledgement to start.";
  if (sc === "S02" && !(R.D01 && R.D02)) return "Submit both diagnostic answers to continue.";
  if (sc === "S08" && !(R.S08 && R.S08.correct && st.derived)) return "Choose the authorised handling option and confirm the source-record check.";
  return "";
}
const H = (id, title, sub) => `<div class="stack-s"><span class="sidtag">${id}</span><h1 id="scrH">${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</div>`;
function choices(name, opts, sel, reveal, key) {
  return opts.map((o) => { let cls = sel === o[0] ? "sel" : ""; if (reveal && sel === o[0]) cls = key != null ? (o[0] === key ? "right" : "wrong") : reveal === true ? cls : reveal; return `<label class="choice ${cls}"><input type="radio" name="${name}" value="${o[0]}"${sel === o[0] ? " checked" : ""}><span>${esc(o[1])}</span></label>`; }).join("");
}
function srcCard(c) { const L = c.en; return `<article class="srccard"><div class="top"><span class="cid">${c.id}</span>${chip(c.status === "narrative" ? "" : "warn", S.content.status.en[c.status])}</div><h3>${esc(L.name)}</h3><p class="small">${esc(L.avail)}</p><p class="missing">∅ ${esc(L.miss)}</p></article>`; }
function desk() { return `<details class="desk"><summary>Source desk: cards C01 to C06</summary><div class="stack-s" style="padding:0 1rem .5rem"><p class="small notice">All six cards derive from one fictional scenario. Six IDs are not six independent sources.</p></div><div class="grid">${S.content.cards.map(srcCard).join("")}</div></details>`; }
function ta(id, bind, label, hint, val, minH) { return `<div class="field"><label for="${id}">${label}${hint ? ` <span class="hint">${hint}</span>` : ""}</label><textarea id="${id}" data-bind="${bind}"${minH ? ` style="min-height:${minH}"` : ""}>${esc(val || "")}</textarea></div>`; }
function get(path) { return path.split(".").reduce((o, k) => (o ? o[k] : undefined), P()); }
function set(path, v) { const ks = path.split("."); let o = P(); ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = v; }

function screenBody(sc) {
  const C = S.content, st = P(), R = S.status.results || {}, RI = routeInfo();
  switch (sc) {
    case "S01": return H("S01", "Pillaging Case evidence review", "Who this is for, what you will produce and how long it takes.") +
      `<div class="grid"><div class="panel stack-s"><p class="eyebrow">You will produce</p><p>${esc(RI.task)}, plus a short analytical summary. It is written for the next reader, not a verdict or a finding of guilt.</p></div><div class="panel stack-s"><p class="eyebrow">Time</p><p class="small">About 60 minutes in 7 resumable units, plus the context recording checkpoints. Your work saves as you go.</p></div></div>
      <div class="panel stack-s"><p class="eyebrow">Outcomes</p><ul style="margin:0;padding-left:1.1rem">${C.outcomes[S.lang === "uk" ? "uk" : "en"].map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>
      <div class="notice warn"><p><b>Content notice.</b> This lesson concerns alleged property crimes during armed occupation. No graphic imagery. The case is fictional.</p></div>
      <label class="choice${st.ack ? " sel" : ""}"><input type="checkbox" id="ack" data-check="ack"${st.ack ? " checked" : ""}><span>I understand this lesson uses fictional material only, and I will not enter real case information, names or evidence anywhere in the Hub.</span></label>`;
    case "S02": {
      const done = R.D01 && R.D02, fb = st.diagFb || {};
      return H("S02", "Opening diagnostic", "Two questions to see where you start. Not scored.") + C.diag.map((d) => `<fieldset class="panel stack-s"><legend><span class="mono small muted">${d.id}</span> ${esc(d.q)}</legend>${choices(d.id, d.opts, (st.diag || {})[d.id] || (R[d.id] && R[d.id].first), done ? true : false)}${done && fb[d.id] ? `<div class="notice ${fb[d.id].correct ? "ok" : ""}" role="status"><p><b>${fb[d.id].correct ? "Matches the expected reasoning." : "Compare with the expected reasoning."}</b> ${esc(fb[d.id].feedback)}</p></div>` : ""}</fieldset>`).join("") +
        (done ? `<p class="small muted">Baseline recorded on the server.</p>` : `<div class="row"><button class="btn primary" data-act="diag">Submit both answers</button><span id="diagErr" class="err" role="alert"></span></div>`) + `<p class="notice draft small">Draft items pending storyboard v1.1 wording.</p>`;
    }
    case "S03": return H("S03", "The case opens", "Read the account as it reaches you. Decide how you would begin.") + `<div class="narrative">${esc(C.narrative.en)}</div>
      <fieldset class="stack-s"><legend>How would you begin?</legend>${choices("approach", C.approach, st.approach)}</fieldset>${st.approach ? `<div class="notice ${st.approach === "b" ? "ok" : ""}" role="status"><p>${esc(C.approachFb[st.approach])}</p></div>` : ""}
      ${ta("inq", "inquiry", "Write the first inquiry you would make", "Your first version is kept for comparison at the end.", st.inquiry)}`;
    case "S03V": return screenVideo();
    case "S04A": return H("S04A", "Source status and the source desk", "Keep three things apart: narrative, unseen evidence and inference.") + `<div class="grid"><div class="panel stack-s"><p class="eyebrow">Scenario narrative</p><p class="small">What the fictional account says. A starting point, not proof.</p></div><div class="panel stack-s"><p class="eyebrow">Unseen evidence</p><p class="small">Material the file says exists but you have not seen.</p></div><div class="panel stack-s"><p class="eyebrow">Inference</p><p class="small">What you conclude. Label it as yours.</p></div></div><p class="notice small">Six card IDs, one fictional origin.</p><div class="grid">${C.cards.map(srcCard).join("")}</div>
      <fieldset class="panel stack"><legend>Sort each statement</legend>${C.sort.map((k) => { const v = (st.sort || {})[k.id], res = (st.sortRes || {})[k.id]; return `<div class="field"><label for="sort-${k.id}">${esc(k.s)}</label><select id="sort-${k.id}" data-sort="${k.id}"><option value="">Choose</option>${Object.keys(C.sortLabels).map((x) => `<option value="${x}"${v === x ? " selected" : ""}>${C.sortLabels[x]}</option>`).join("")}</select>${res ? `<span class="small" style="color:${res.correct ? "var(--ok)" : "var(--crit)"}">${res.correct ? "Correct." : "Expected: " + C.sortLabels[res.expected] + "."}</span>` : ""}</div>`; }).join("")}<div><button class="btn" data-act="sortCheck">Check sorting</button></div></fieldset>`;
    case "S04B": return H("S04B", "Support and limits", "For each card, note what it supports and where that support stops.") + desk() + C.cards.map((c) => ta("note-" + c.id, "notes." + c.id, `<span class="mono">${c.id}</span> ${esc(c.en.name)}`, "", (st.notes || {})[c.id], "4.5rem")).join("") +
      (st.notesModel ? `<div class="panel soft stack-s"><p class="eyebrow">Model notes (two examples)</p><p class="small"><span class="mono">C05</span> Supports that movements to C's silos were described. Stops short of A's grain: no imagery, metadata, analysis or link to A.</p><p class="small"><span class="mono">C06</span> Supports that receipts are said to exist. Stops at contents, parties and any link to A, and cannot show consent.</p></div>` : `<div><button class="btn" data-act="notesModel">Compare with model notes</button></div>`);
    case "S05": { const res = st.routeRes; return H("S05", "Testing the route claims", "Two movements are described. Test whether they are the same.") + `<div class="panel"><p><b>Route 1 (C03):</b> A's farm → undisclosed location.</p><p><b>Route 2 (C05, described, unseen):</b> occupied farms → C's silos.</p><p class="muted small">Is there a link between the two destinations?</p></div>
      <fieldset class="stack-s"><legend>${esc(C.routeClaim.q)}</legend>${choices("routeClaim", C.routeClaim.opts, st.routeClaim, res ? (res.correct ? "right" : "wrong") : false)}</fieldset>${res ? `<div class="notice ${res.correct ? "ok" : ""}" role="status"><p>${esc(res.feedback)}</p></div>` : ""}`; }
    case "S06A": { const n = st.worked || 1; return H("S06A", "Worked reasoning: receipts alone", "Reveal each step when you are ready.") + `<ol class="steps">${C.worked.slice(0, n).map((x) => `<li><p>${esc(x)}</p></li>`).join("")}</ol>${n < C.worked.length ? `<div><button class="btn" data-act="worked">Show step ${n + 1} of ${C.worked.length}</button></div>` : `<p class="small muted">All steps shown.</p>`}`; }
    case "S06B": return H("S06B", "Rewrite an overconfident claim", "Claim no more than the cards support.") + `<blockquote class="narrative" style="margin:0">${esc(C.overclaim)}</blockquote>${ta("rw", "rewrite", "Your rewrite", "Name the cards and say what is missing.", st.rewrite)}` +
      (st.rwCompared ? `<div class="panel soft stack-s"><p class="eyebrow">One cautious version</p><p>${esc(C.modelRewrite)}</p><p class="small muted">Matching words is not the goal.</p></div>` : `<div><button class="btn" data-act="rwCompare"${wc(st.rewrite) < 5 ? " disabled" : ""}>Compare with a cautious version</button></div>`);
    case "S07": return H("S07", "Corroboration plan", "For each proposition: material to seek, why, and what could change your interpretation.") + desk() + C.props.map((p) => `<fieldset class="brief-row"><legend><span class="mono">${p.id}</span> ${esc(p.en)}</legend><div class="fgrid">${ta(`pl-${p.id}-m`, `plan.${p.id}.m`, "Material sought", "", ((st.plan || {})[p.id] || {}).m, "4.5rem")}${ta(`pl-${p.id}-p`, `plan.${p.id}.p`, "Purpose", "", ((st.plan || {})[p.id] || {}).p, "4.5rem")}</div>${ta(`pl-${p.id}-c`, `plan.${p.id}.c`, "What could change the interpretation", "", ((st.plan || {})[p.id] || {}).c, "4rem")}</fieldset>`).join("");
    case "S08": { const res = st.handleRes; return H("S08", "Safe handling", "Choose, then explain in two sentences.") + `<fieldset class="stack-s"><legend>${esc(C.handle.q)}</legend>${choices("handle", C.handle.opts, st.handle, res ? (res.correct ? "right" : "wrong") : false)}</fieldset>${res ? `<div class="notice ${res.correct ? "ok" : "crit"}" role="status"><p>${esc(res.feedback)}</p>${res.correct ? "" : "<p class='small'>Choose again. The correct response is required before the brief.</p>"}</div>` : ""}
      ${ta("ht", "handleText", "Your two-sentence response to the colleague", "", st.handleText)}<label class="choice${st.derived ? " sel" : ""}"><input type="checkbox" data-check="derived"${st.derived ? " checked" : ""}><span>Source-record check: my notes and brief come only from the fictional cards C01 to C06.</span></label><p class="small muted">There is no file upload anywhere in this lesson, by design.</p>`; }
    case "S09A": return screenBrief();
    case "S09B": return screenSubmit();
    case "S10A": return screenQuiz();
    case "S10B": return screenFinish();
  }
  return "";
}
function screenVideo() {
  const C = S.content, st = P(), R = S.status.results || {};
  const passed = C.vc.filter((v) => R[v.id] && R[v.id].passed && R[v.id].reflected).length;
  const cur = C.vc[passed], ans = (st.vcAns || {}), res = (st.vcRes || {});
  let h = H("S03V", "Context recording", "Four checkpoints pause the recording. Each needs the correct choice and a short reflection, saved on the server before the next segment opens.") + `<div class="notice draft"><p><b>Media status: awaiting approved master.</b> This runs the descriptive transcript route with draft placeholder text.</p></div><div class="gate"><div class="transcript"><p class="small" style="color:#A8B6CB">Descriptive transcript route · ${passed} of 4 checkpoints complete</p>${C.vc.slice(0, Math.min(passed + 1, 4)).map((v) => `<div class="seg"><p class="small" style="color:#A8B6CB">${esc(v.seg)}</p><p>${esc(v.tr)}</p></div>`).join("")}${passed >= 4 ? '<p style="color:#6FCF97;font-weight:700">All four checkpoints complete.</p>' : ""}</div>`;
  if (cur) {
    const r = res[cur.id];
    h += `<div class="cpoint" role="group" aria-labelledby="vcq"><p class="eyebrow">Checkpoint ${cur.id} · recording paused</p><fieldset class="stack-s"><legend id="vcq">${esc(cur.q)}</legend>${choices("vc", cur.opts, ans[cur.id], r ? (r.correct ? "right" : "wrong") : false)}</fieldset>${r ? `<div class="notice ${r.correct ? "ok" : "crit"}" role="status"><p>${esc(r.feedback)}</p></div>` : ""}`;
    if (r && r.correct) h += `${ta("vcr", "vcRefl." + cur.id, esc(cur.refl), "Saved, not scored.", (st.vcRefl || {})[cur.id], "4rem")}<div><button class="btn primary" data-act="vcContinue"${((st.vcRefl || {})[cur.id] || "").trim() ? "" : " disabled"}>Continue recording</button></div>`;
    else if (r && !r.correct) h += `<div><button class="btn primary" data-act="vcRetry">Try again</button></div>`;
    else h += `<div><button class="btn primary" data-act="vcSubmit"${ans[cur.id] ? "" : " disabled"}>Submit answer</button></div>`;
    h += `<p class="small muted">Skipping ahead is not possible. If saving fails, the next segment stays locked.</p></div>`;
  }
  return h + "</div>";
}
function briefComplete() { const b = P().brief || {}; return S.content.props.every((p) => { const r = (b.rows || {})[p.id] || {}; return (r.cards || []).length && ["sup", "alt", "next", "hand"].every((k) => (r[k] || "").trim()); }) && wc(b.summary) > 0; }
function screenBrief() {
  const C = S.content, st = P(), RI = routeInfo(), b = st.brief || {};
  const fld = (p, k, label) => ta(`b-${p}-${k}`, `brief.rows.${p}.${k}`, label, "", ((b.rows || {})[p] || {})[k], "5rem");
  return H("S09A", RI.product, `Three rows, one per proposition, written for the ${RI.name.toLowerCase()} route.`) +
    `<details class="panel"><summary style="cursor:pointer;font-weight:700">Review rubric (five dimensions, 0 to 2 each)</summary><div class="tablewrap" style="margin-top:.6rem"><table><thead><tr><th>Dimension</th><th>0</th><th>1</th><th>2</th></tr></thead><tbody>${C.rubric.map((r) => `<tr><td><b>${esc(r.en)}</b></td>${r.d.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>` + desk() +
    C.props.map((p) => { const r = (b.rows || {})[p.id] || {}; return `<fieldset class="brief-row"><legend><span class="mono">${p.id}</span> ${esc(p.en)}</legend><div class="field"><span id="cl-${p.id}" style="font-weight:600">Supporting card IDs</span><div class="cardpick" role="group" aria-labelledby="cl-${p.id}">${C.cards.map((c) => `<label><input type="checkbox" data-bcard="${p.id}|${c.id}"${(r.cards || []).includes(c.id) ? " checked" : ""}>${c.id}</label>`).join("")}</div></div><div class="fgrid">${fld(p.id, "sup", "Support and limitation")}${fld(p.id, "alt", "Alternative or missing information")}${fld(p.id, "next", esc(RI.nextLabel))}${fld(p.id, "hand", "Handling condition")}</div></fieldset>`; }).join("") +
    `<div class="field"><label for="sum">Analytical summary <span class="hint">${esc(RI.sumPrompt)} Suggested 120 to 180 words; quality is not judged by length.</span></label><textarea id="sum" data-bind="brief.summary" style="min-height:10rem">${esc(b.summary || "")}</textarea><span class="small muted" id="wcount" aria-live="polite">${wc(b.summary)} words</span></div>` +
    (S.status.submission ? "" : `<div class="panel soft stack-s"><p class="small">You can compare with the model brief before submitting, as self-study. The server records this attempt as model-exposed for any reviewer.</p><div class="row"><button class="btn small" data-act="modelEarly">View model brief now</button><span id="modelMsg" class="small" role="status"></span></div></div>`) + (S.model ? modelHtml() : "");
}
function modelHtml() { const m = S.model; return `<div class="panel soft stack"><div class="row"><p class="eyebrow">Model brief</p>${m.reason === "self_study_before_submission" ? chip("warn", "Model-exposed attempt") : ""}</div>${m.brief.map((x) => `<div class="stack-s"><p><b><span class="mono">${x.p}</span> Cards: ${x.cards.join(", ")}</b></p><p class="small"><b>Support and limitation.</b> ${esc(x.sup)}</p><p class="small"><b>Alternative or missing.</b> ${esc(x.alt)}</p><p class="small"><b>Next step.</b> ${esc(x.next)}</p><p class="small"><b>Handling.</b> ${esc(x.hand)}</p></div>`).join("")}<p><b>Summary.</b> ${esc(m.summary)}</p><p class="small notice draft">${esc(m.note)}</p></div>`; }
function previewTable(b) { const C = S.content; return `<div class="tablewrap"><table><thead><tr><th>Proposition</th><th>Cards</th><th>Support and limitation</th><th>Alternative or missing</th><th>Next</th><th>Handling</th></tr></thead><tbody>${C.props.map((p) => { const r = (b.rows || {})[p.id] || {}; return `<tr><td><span class="mono">${p.id}</span> ${esc(p.en)}</td><td class="mono">${esc((r.cards || []).join(", ") || "-")}</td><td>${esc(r.sup || "-")}</td><td>${esc(r.alt || "-")}</td><td>${esc(r.next || "-")}</td><td>${esc(r.hand || "-")}</td></tr>`; }).join("")}</tbody></table></div><div class="panel soft"><p class="eyebrow">Summary · ${wc(b.summary)} words</p><p>${esc(b.summary || "-")}</p></div>`; }
function screenSubmit() {
  const st = P(), sub = S.status.submission;
  let h = H("S09B", "Preview and submit", "A submission must be complete. It becomes a fixed, versioned record on the server.");
  if (sub) return h + `<div class="notice ok" role="status"><p><b>Submitted.</b> Receipt <span class="mono">${esc(sub.receipt)}</span> · ${new Date(sub.created_at).toLocaleString()} · Attempt ${sub.attempt} · ${sub.model_exposed ? "Model-exposed" : "Independent"}</p><p class="small">This record cannot be edited.</p></div>` + previewTable(st.brief || {});
  const complete = briefComplete();
  h += previewTable(st.brief || {});
  if (S.me.route === "jud") return h + `<div class="notice"><p>Submission is closed for the judiciary route until its task is approved.</p></div>`;
  if (!complete) h += `<div class="notice crit"><p>Complete every row (card IDs and four fields) and the summary before submitting. <a href="#/course/grn01/S09A">Return to the brief</a></p></div>`;
  h += `<div id="subErr" role="alert"></div><div class="row"><button class="btn primary" data-act="submit"${complete ? "" : " disabled"}>Submit brief</button></div>`;
  return h;
}
function screenQuiz() {
  const C = S.content, st = P(), res = st.quizRes;
  let h = H("S10A", "Final knowledge check", "At least 4 correct, and Q5 on safe handling must be correct. Graded on the server; you can retry.");
  h += C.quiz.map((q) => { const sel = (st.quizAns || {})[q.id], r = res && res.items[q.id]; return `<fieldset class="panel stack-s"><legend><span class="mono small muted">${q.id}</span> ${esc(q.q)} ${q.safe ? chip("warn", "Required") : ""}</legend>${choices("quiz-" + q.id, q.opts, sel, r ? (r.correct ? "right" : "wrong") : false)}${r ? `<p class="small" style="color:${r.correct ? "var(--ok)" : "var(--crit)"}">${r.correct ? "Correct. " : "Not correct. "}${esc(r.feedback)}</p>` : ""}</fieldset>`; }).join("");
  if (res) h += `<div class="notice ${res.ruleMet ? "ok" : "crit"}" id="quizRes" role="status"><p><b>${res.correct} of 5 correct. ${res.ruleMet ? "Quiz rule met." : res.correct >= 4 ? "Rule not met: Q5 safe handling must be correct." : "Rule not met: at least 4 correct are needed."}</b></p></div><div class="row">${res.ruleMet ? `<a class="btn primary" href="#/course/grn01/S10B">${t("continue")}</a>` : `<button class="btn primary" data-act="quizRetry">Retry the check</button>`}</div>`;
  else h += `<div class="row"><button class="btn primary" data-act="quiz">Submit answers</button><span id="quizErr" class="err" role="alert"></span></div>`;
  return h + `<p class="small muted">Attempts recorded: ${S.status.quizAttempts}</p>`;
}
function screenFinish() {
  const C = S.content, st = P(), s = S.status;
  let h = H("S10B", "Compare, self-review and transfer", "See how your thinking moved, rate your brief honestly, and choose one habit to take back to work.");
  if (!s.submission) return h + `<div class="notice"><p>Submit your brief first. The model brief stays withheld until then.</p></div>`;
  h += `<div class="grid"><div class="panel stack-s"><p class="eyebrow">Your first inquiry (S03)</p><p class="small">${esc(st.inquiryFirst || "(none recorded)")}</p></div><div class="panel stack-s"><p class="eyebrow">Your submitted summary</p><p class="small">${esc((st.brief || {}).summary || "")}</p></div></div>`;
  h += S.model ? modelHtml() : `<div><button class="btn primary" data-act="compare">Show the model brief for comparison</button></div>`;
  h += `<fieldset class="panel stack"><legend>Self-review: how does your brief look now?</legend><p class="small muted">Your own view, not the reviewer score.</p>${C.rubric.map((r) => { const v = (st.self || {})[r.id]; return `<fieldset class="stack-s"><legend class="small">${esc(r.en)}</legend><div class="row">${["Supported", "Needs revision", "Unsure"].map((o) => `<label class="choice${v === o ? " sel" : ""}" style="padding:.35rem .7rem"><input type="radio" name="self-${r.id}" value="${o}"${v === o ? " checked" : ""}><span class="small">${o}</span></label>`).join("")}</div></fieldset>`; }).join("")}</fieldset>`;
  h += `<fieldset class="stack-s"><legend>Choose one transfer habit</legend>${choices("transfer", C.transfer, st.transfer)}</fieldset>`;
  h += `<div class="panel stack-s"><p class="eyebrow">Your result (computed on the server)</p><p>${s.complete ? chip("accent", s.label) : chip("", s.label)}</p><ul class="check">${s.reqs.map((r) => `<li><span class="${r[1] ? "y" : "n"}" aria-hidden="true">${r[1] ? "✓" : "○"}</span><span>${esc(r[0])}</span></li>`).join("")}</ul><button class="btn small" data-act="refreshStatus">Refresh result</button><p class="small muted">Self-study completion is not a reviewed result or certification.</p></div>`;
  return h;
}

/* ---------------- case guide chat ---------------- */
function fmtGuide(text) { return esc(text).replace(/\[(C0[1-6])\]/g, '<span class="cite">$1</span>'); }
function chatMsgs() {
  if (!S.chat.length) return `<p class="small muted">Ask about the fictional file. Try a starter below.</p>`;
  return S.chat.map((m) => `<div class="msg ${m.role}${m.source === "blocked" ? " blocked" : ""}">${m.role === "guide" ? fmtGuide(m.content) : esc(m.content)}${m.role === "guide" ? `<span class="src">${m.source === "ai" ? "AI guide · grounded in C01 to C06" : m.source === "blocked" ? "Not sent" : "Authored question"}</span>` : ""}</div>`).join("") + (S.sending ? '<p class="typing" role="status">Guide is thinking…</p>' : "");
}
function chatPanel(full) {
  const sc = (S.prog.state || {}).screen;
  const starters = ["What does C05 actually show?", "Is the receipt evidence of a sale?", "What is inference in my first inquiry?", "What should I ask for next?"];
  return `<section class="chat${full ? " full" : ""}" aria-labelledby="chatH"><header><div class="t"><b id="chatH">Case guide</b><span class="small muted">${S.ai ? "AI, grounded in cards C01 to C06" : "Authored questions (AI not configured)"}${sc && !full ? " · on " + sc : ""}</span></div>${full ? "" : `<button class="btn small" data-act="toggleChat" aria-label="Hide case guide">Hide</button>`}</header>
  <div class="msgs" id="msgs" aria-live="polite">${chatMsgs()}</div>
  <form id="chatForm" novalidate><div class="starters" aria-label="Suggested questions">${starters.map((s) => `<button type="button" data-starter="${esc(s)}">${esc(s)}</button>`).join("")}</div><label class="sr" for="chatIn">Message to the case guide</label><div class="row"><textarea id="chatIn" placeholder="Ask about the fictional file. No real names or case details." ${S.sending ? "disabled" : ""}></textarea><button class="btn primary" type="submit"${S.sending ? " disabled" : ""}>Send</button></div><p class="small muted" style="margin:0">The guide asks questions and never writes your brief. Messages are stored with your training record.</p><p id="chatErr" class="err" role="alert"></p></form></section>`;
}
function scrollChat() { const m = $("#msgs"); if (m) m.scrollTop = m.scrollHeight; }
function repaintChat() { const m = $("#msgs"); if (m) { m.innerHTML = chatMsgs(); scrollChat(); } const f = $("#chatForm"); if (f) { $("#chatIn").disabled = S.sending; f.querySelector("button[type=submit]").disabled = S.sending; } }
async function sendChat(text) {
  text = (text || "").trim(); if (!text || S.sending) return;
  S.chat.push({ role: "learner", source: "learner", content: text }); S.sending = true; const ci = $("#chatIn"); if (ci) ci.value = ""; const ce = $("#chatErr"); if (ce) ce.textContent = ""; repaintChat();
  try {
    const r = await api("POST", "/api/chat/grn01", { message: text, screen: (S.prog.state || {}).screen || null });
    if (r.reply.source === "blocked") S.chat.pop();
    S.chat.push(r.reply); if (r.note) S.chat.push({ role: "guide", source: "authored", content: r.note });
    announce("Guide replied");
  } catch (e) { S.chat.pop(); const el = $("#chatErr"); if (el) el.textContent = e.message; if ($("#chatIn")) $("#chatIn").value = text; }
  S.sending = false; repaintChat(); const inp = $("#chatIn"); if (inp) inp.focus();
}
async function vGuide() {
  if (!S.content) S.content = await api("GET", "/api/lessons/grn01");
  const c = await api("GET", "/api/chat/grn01"); S.chat = c.messages; S.ai = c.ai;
  if (!S.prog.state.screen) { try { const pr = await api("GET", "/api/progress/grn01"); S.prog = { state: pr.state || {}, seq: pr.seq }; } catch (_) {} }
  setMain(`<div class="wgrid"><div>${chatPanel(true)}</div><aside class="wcol"><section class="widget"><div class="whead"><h2 id="guideH">About the case guide</h2></div><div class="wbody stack-s small"><p>The guide knows only the fictional narrative and cards C01 to C06. It answers with questions, cites cards in brackets and never writes your brief, gives verdicts or reveals quiz answers.</p><p>If AI is unavailable, you get authored questions instead, labelled as such. Your work is never lost.</p><p class="muted">Do not paste real names, places, evidence or contact details. Messages with emails or phone numbers are not sent.</p><a class="btn small" href="#/course/grn01">Back to the lesson</a></div></section><section class="widget"><div class="whead"><h2>Source cards</h2></div><div class="wbody stack-s">${S.content.cards.map((c) => `<p class="small"><span class="cite">${c.id}</span> <b>${esc(c.en.name)}</b> · ${esc(S.content.status.en[c.status])}</p>`).join("")}</div></section></aside></div>`, "guide", "#chatIn");
  scrollChat();
}

/* ---------------- admin approvals ---------------- */
async function vAdmin() {
  const d = await api("GET", "/api/admin/pending");
  setMain(`<h1 id="admH">Access requests</h1><p class="muted" style="margin:.4rem 0 1rem">Approve only people your institution has confirmed as justice actors.</p>${d.pending.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Route</th><th>Institution</th><th>Requested</th><th></th></tr></thead><tbody>${d.pending.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.prole)}</td><td>${RNAMES[u.route]}</td><td>${esc(u.institution)} · ${esc(u.unit)}</td><td>${new Date(u.created_at).toLocaleString()}</td><td><button class="btn small primary" data-approve="${u.id}">Approve</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="panel soft"><p>No pending requests.</p></div>`}`, "admin", "#admH");
}

/* ---------------- events ---------------- */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act],[data-lang],[data-focus],[data-starter],[data-approve]"); if (!el) return;
  const d = el.dataset;
  if (d.lang) { S.lang = d.lang; localSet("djh.lang", d.lang); if (S.me) api("PATCH", "/api/me", { lang: d.lang }).catch(() => {}); route(); return; }
  if (d.focus) { e.preventDefault(); const f = document.getElementById(d.focus); if (f) f.focus(); return; }
  if (d.starter) { sendChat(d.starter); return; }
  if (d.approve) { el.disabled = true; try { await api("POST", `/api/admin/users/${d.approve}/approve`); announce("Approved"); vAdmin(); } catch (x) { el.disabled = false; announce(x.message); } return; }
  const a = d.act, st = P();
  try {
    if (a === "logout") { await api("POST", "/api/auth/logout"); S.me = null; S.content = null; S.chat = []; location.hash = "#/login"; return; }
    if (a === "retrySave") return saveNow();
    if (a === "toggleChat") { S.chatOpen = !S.chatOpen; localSet("djh.chat", S.chatOpen ? "1" : "0"); renderPlayer(); return; }
    if (a === "diag") { const ans = st.diag || {}; if (!ans.D01 || !ans.D02) { $("#diagErr").textContent = "Answer both questions before submitting."; return; } const r = await api("POST", "/api/lessons/grn01/check", { item: "DIAG", answers: ans }); st.diagFb = r.results; await refreshStatus(); saveSoon(); renderPlayer(); announce("Diagnostic submitted"); return; }
    if (a === "sortCheck") { st.sortRes = {}; for (const k of S.content.sort) { if ((st.sort || {})[k.id]) st.sortRes[k.id] = await api("POST", "/api/lessons/grn01/check", { item: k.id, value: st.sort[k.id] }); } saveSoon(); renderPlayer(true); announce("Sorting checked"); return; }
    if (a === "notesModel") { st.notesModel = true; saveSoon(); renderPlayer(true); return; }
    if (a === "worked") { st.worked = (st.worked || 1) + 1; saveSoon(); renderPlayer(true); return; }
    if (a === "rwCompare") { st.rwCompared = true; saveSoon(); renderPlayer(true); return; }
    if (a === "vcSubmit" || a === "vcRetry" || a === "vcContinue") {
      const R = S.status.results || {}, passed = S.content.vc.filter((v) => R[v.id] && R[v.id].passed && R[v.id].reflected).length, cur = S.content.vc[passed];
      st.vcRes = st.vcRes || {}; st.vcAns = st.vcAns || {};
      if (a === "vcRetry") { delete st.vcRes[cur.id]; delete st.vcAns[cur.id]; renderPlayer(); $("#vcq") && $("#vcq").focus(); return; }
      if (a === "vcSubmit") { st.vcRes[cur.id] = await api("POST", "/api/lessons/grn01/check", { item: cur.id, value: st.vcAns[cur.id] }); saveSoon(); renderPlayer(true); announce(st.vcRes[cur.id].correct ? "Correct" : "Not yet"); return; }
      el.disabled = true;
      try { const r = await api("POST", "/api/lessons/grn01/check", { item: cur.id, value: st.vcAns[cur.id], reflection: (st.vcRefl || {})[cur.id], final: true }); if (!r.unlocked) throw new Error("Not saved"); await refreshStatus(); saveSoon(); renderPlayer(); announce("Checkpoint saved. Next segment open."); }
      catch (x) { el.disabled = false; announce("Checkpoint not saved. The next segment stays locked. Try again."); const m = el.parentElement; if (m) m.insertAdjacentHTML("beforeend", `<p class="err" role="alert">${esc(x.message)}. The next segment stays locked.</p>`); }
      return;
    }
    if (a === "modelEarly") { try { S.model = await api("GET", "/api/lessons/grn01/model"); } catch (x) { if (x.data && x.data.needsConfirm) { $("#modelMsg").innerHTML = `${esc(x.message)} <button class="btn small" data-act="modelConfirm">Yes, show the model</button>`; return; } throw x; } renderPlayer(true); return; }
    if (a === "modelConfirm") { S.model = await api("GET", "/api/lessons/grn01/model?confirm=1"); await refreshStatus(); renderPlayer(true); announce("Model shown. This attempt is recorded as model-exposed."); return; }
    if (a === "compare") { S.model = await api("GET", "/api/lessons/grn01/model"); await refreshStatus(); renderPlayer(true); return; }
    if (a === "submit") {
      el.disabled = true; st.idemKey = st.idemKey || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
      await saveNow();
      try { await api("POST", "/api/lessons/grn01/submissions", st.brief, { "Idempotency-Key": st.idemKey }); await refreshStatus(); delete st.idemKey; saveSoon(); renderPlayer(); announce("Brief submitted"); }
      catch (x) { el.disabled = false; $("#subErr").innerHTML = `<div class="notice crit"><p>${esc(x.message)} Your brief is safe on this screen. Trying again will not create a second record.</p></div>`; }
      return;
    }
    if (a === "quiz") { const ans = st.quizAns || {}; try { st.quizRes = await api("POST", "/api/lessons/grn01/quiz", { answers: ans }); } catch (x) { $("#quizErr").textContent = x.message; return; } await refreshStatus(); saveSoon(); renderPlayer(); $("#quizRes") && $("#quizRes").focus(); return; }
    if (a === "quizRetry") { st.quizRes = null; st.quizAns = {}; saveSoon(); renderPlayer(); return; }
    if (a === "refreshStatus") { await saveNow(); await refreshStatus(); renderPlayer(true); return; }
  } catch (x) { announce(x.message); console.error(x); }
});
async function refreshStatus() { S.status = await api("GET", "/api/lessons/grn01/status"); }
document.addEventListener("change", async (e) => {
  const el = e.target, n = el.name || "", st = S.prog.state;
  if (el.dataset.reg) { const k = el.dataset.reg; S.reg[k] = el.type === "checkbox" ? el.checked : el.value; if (k === "prole" && !S.reg.route) { const p = PROLES.find((x) => x[0] === el.value); if (p) S.reg.route = p[1]; } if (["prole", "route", "terms"].includes(k)) vRegister(); return; }
  if (!$(".player")) return;
  if (el.dataset.check) { st[el.dataset.check] = el.checked; saveSoon(); renderPlayer(true); return; }
  if (el.dataset.sort) { st.sort = st.sort || {}; st.sort[el.dataset.sort] = el.value; saveSoon(); return; }
  if (el.dataset.bcard) { const [p, c] = el.dataset.bcard.split("|"); const rows = ((st.brief = st.brief || {}).rows = st.brief.rows || {}); const r = (rows[p] = rows[p] || {}); r.cards = r.cards || []; const i = r.cards.indexOf(c); if (el.checked && i < 0) r.cards.push(c); if (!el.checked && i > -1) r.cards.splice(i, 1); r.cards.sort(); saveSoon(); return; }
  if (n === "D01" || n === "D02") { st.diag = st.diag || {}; st.diag[n] = el.value; saveSoon(); renderPlayer(true); return; }
  if (n === "approach") { st.approach = el.value; saveSoon(); api("POST", "/api/lessons/grn01/check", { item: "S03", value: el.value }).then(refreshStatus).catch(() => {}); renderPlayer(true); return; }
  if (n === "vc") { const R = S.status.results || {}; const cur = S.content.vc.filter((v) => R[v.id] && R[v.id].passed && R[v.id].reflected).length; st.vcAns = st.vcAns || {}; st.vcAns[S.content.vc[cur].id] = el.value; renderPlayer(true); return; }
  if (n === "routeClaim") { st.routeClaim = el.value; st.routeRes = await api("POST", "/api/lessons/grn01/check", { item: "S05", value: el.value }); saveSoon(); renderPlayer(true); return; }
  if (n === "handle") { st.handle = el.value; st.handleRes = await api("POST", "/api/lessons/grn01/check", { item: "S08", value: el.value }); await refreshStatus(); saveSoon(); renderPlayer(true); return; }
  if (n.startsWith("quiz-")) { if (st.quizRes) return; st.quizAns = st.quizAns || {}; st.quizAns[n.slice(5)] = el.value; saveSoon(); renderPlayer(true); return; }
  if (n.startsWith("self-")) { st.self = st.self || {}; st.self[n.slice(5)] = el.value; saveSoon(); renderPlayer(true); return; }
  if (n === "transfer") { st.transfer = el.value; saveSoon(); renderPlayer(true); return; }
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.reg && el.type !== "checkbox" && el.type !== "radio" && el.tagName !== "SELECT") { S.reg[el.dataset.reg] = el.value; return; }
  if (el.dataset.bind && $(".player")) {
    set(el.dataset.bind, el.value); const st = P();
    if (el.dataset.bind === "inquiry" && !st.inquiryFirst && el.value.trim().length > 15) { /* first version recorded when leaving S03 */ }
    if (el.dataset.bind === "brief.summary") { const w = $("#wcount"); if (w) w.textContent = wc(el.value) + " words"; }
    if (el.dataset.bind.startsWith("vcRefl.")) { const b = $('[data-act="vcContinue"]'); if (b) b.disabled = !el.value.trim(); }
    if (el.dataset.bind === "rewrite") { const b = $('[data-act="rwCompare"]'); if (b) b.disabled = wc(el.value) < 5; }
    saveSoon();
  }
});
document.addEventListener("keydown", (e) => { if (e.target.id === "chatIn" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(e.target.value); } });
document.addEventListener("submit", async (e) => {
  const f = e.target; e.preventDefault();
  if (f.id === "chatForm") { sendChat($("#chatIn").value); return; }
  if (f.id === "loginForm") {
    const btn = f.querySelector("button"); btn.disabled = true;
    try { const r = await api("POST", "/api/auth/login", { email: $("#f-email").value, password: $("#f-password").value }); S.me = r.user; if (r.user.lang) { S.lang = localGet("djh.lang") || r.user.lang; } location.hash = "#/dashboard"; }
    catch (x) { btn.disabled = false; $("#loginErr").innerHTML = `<div class="notice crit" role="alert"><p>${esc(x.message)}</p></div>`; }
    return;
  }
  if (f.id === "regForm") {
    try { await api("POST", "/api/auth/register", S.reg); S.errs = {}; S.reg = null; location.hash = "#/registered"; }
    catch (x) { S.errs = (x.data && x.data.errors) || { name: x.message }; vRegister(); }
  }
});
// Record the learner's first inquiry when they leave S03 (kept for the end-of-lesson comparison).
window.addEventListener("hashchange", () => {
  const st = S.prog && S.prog.state;
  if (st && st.screen === "S03" && !st.inquiryFirst && (st.inquiry || "").trim()) { st.inquiryFirst = st.inquiry; saveSoon(); }
  if (st && S.saveState === "saving") saveNow();
  if (!/S09|S10/.test(location.hash)) S.model = null;
  route();
});
window.addEventListener("beforeunload", (e) => { if (S.saveState === "saving" || S.saveState === "failed") { e.preventDefault(); e.returnValue = ""; } });

(async function boot() {
  try { const r = await api("GET", "/api/me"); S.me = r.user; S.ai = r.ai; if (S.me && !localGet("djh.lang")) S.lang = S.me.lang; } catch (_) {}
  route();
})();
