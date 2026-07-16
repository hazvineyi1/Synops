/**
 * Generic activity template engine — the single source of truth for building interactive,
 * gamified activities from a small structured SPEC (the content). Used by:
 *  - the no-code builder (author fills a form -> spec -> renderActivity),
 *  - the AI generator (Claude returns a spec -> renderActivity),
 *  - the pre-built library seed (specs -> renderActivity at build time).
 *
 * Every renderer returns a SELF-CONTAINED HTML body (inline <style> + <script>, vanilla JS,
 * no network) that runs in the sandbox player and calls SynopsActivity.submit(payload, score).
 * The runtime scripts are written with string concatenation and HTML entities (no template
 * literals, no unicode escapes) so they survive being embedded in this file verbatim.
 */

export type InteractionType = "quiz" | "flashcards" | "matching" | "order" | "categorize";

export interface QuizSpec { questions: { q: string; options: { t: string; correct: boolean; why?: string }[] }[] }
export interface FlashcardsSpec { cards: { front: string; back: string }[] }
export interface MatchingSpec { pairs: { left: string; right: string }[] }
export interface OrderSpec { items: string[] } // in the CORRECT order; the UI shuffles
export interface CategorizeSpec { buckets: string[]; items: { text: string; bucket: string }[] }
export type ActivitySpec = QuizSpec | FlashcardsSpec | MatchingSpec | OrderSpec | CategorizeSpec;

export interface TemplateMeta {
  type: InteractionType;
  label: string;
  blurb: string;
  defaultBloom: string;
  itemNoun: string;
}

export const TEMPLATES: TemplateMeta[] = [
  { type: "quiz", label: "Quiz", blurb: "Multiple-choice questions with instant feedback.", defaultBloom: "Understand", itemNoun: "question" },
  { type: "flashcards", label: "Flashcards", blurb: "Flip a card to reveal the answer; self-rate recall.", defaultBloom: "Remember", itemNoun: "card" },
  { type: "matching", label: "Matching pairs", blurb: "Match each item to its partner.", defaultBloom: "Understand", itemNoun: "pair" },
  { type: "order", label: "Order / sequence", blurb: "Tap items into the correct order.", defaultBloom: "Apply", itemNoun: "step" },
  { type: "categorize", label: "Categorize / sort", blurb: "Sort items into the right buckets.", defaultBloom: "Analyze", itemNoun: "item" },
];

/* Empty specs for the builder to start from. */
export function emptySpec(type: InteractionType): ActivitySpec {
  switch (type) {
    case "quiz": return { questions: [{ q: "", options: [{ t: "", correct: true, why: "" }, { t: "", correct: false }] }] };
    case "flashcards": return { cards: [{ front: "", back: "" }] };
    case "matching": return { pairs: [{ left: "", right: "" }] };
    case "order": return { items: ["", ""] };
    case "categorize": return { buckets: ["", ""], items: [{ text: "", bucket: "" }] };
  }
}

/** Is a spec complete enough to render/save? Returns an error string or null. */
export function validateSpec(type: InteractionType, spec: ActivitySpec): string | null {
  const nonEmpty = (s: string) => !!s && s.trim().length > 0;
  if (type === "quiz") {
    const qs = (spec as QuizSpec).questions;
    if (!qs.length) return "Add at least one question.";
    for (const q of qs) {
      if (!nonEmpty(q.q)) return "Every question needs text.";
      if (q.options.filter((o) => nonEmpty(o.t)).length < 2) return "Every question needs at least two options.";
      if (!q.options.some((o) => o.correct && nonEmpty(o.t))) return "Mark a correct option for every question.";
    }
  } else if (type === "flashcards") {
    const cs = (spec as FlashcardsSpec).cards;
    if (cs.filter((c) => nonEmpty(c.front) && nonEmpty(c.back)).length < 1) return "Add at least one card with a front and back.";
  } else if (type === "matching") {
    const ps = (spec as MatchingSpec).pairs;
    if (ps.filter((p) => nonEmpty(p.left) && nonEmpty(p.right)).length < 2) return "Add at least two complete pairs.";
  } else if (type === "order") {
    const it = (spec as OrderSpec).items;
    if (it.filter(nonEmpty).length < 2) return "Add at least two steps.";
  } else if (type === "categorize") {
    const cg = spec as CategorizeSpec;
    if (cg.buckets.filter(nonEmpty).length < 2) return "Add at least two buckets.";
    if (cg.items.filter((i) => nonEmpty(i.text) && nonEmpty(i.bucket)).length < 2) return "Add at least two items with a bucket.";
  }
  return null;
}

/* Strip empty rows before rendering/saving. */
function clean(type: InteractionType, spec: ActivitySpec): ActivitySpec {
  const ne = (s: string) => !!s && s.trim().length > 0;
  if (type === "quiz") return { questions: (spec as QuizSpec).questions.filter((q) => ne(q.q)).map((q) => ({ q: q.q, options: q.options.filter((o) => ne(o.t)) })) };
  if (type === "flashcards") return { cards: (spec as FlashcardsSpec).cards.filter((c) => ne(c.front) && ne(c.back)) };
  if (type === "matching") return { pairs: (spec as MatchingSpec).pairs.filter((p) => ne(p.left) && ne(p.right)) };
  if (type === "order") return { items: (spec as OrderSpec).items.filter(ne) };
  const cg = spec as CategorizeSpec;
  return { buckets: cg.buckets.filter(ne), items: cg.items.filter((i) => ne(i.text) && ne(i.bucket)) };
}

/* ── Shared styling injected into every activity ── */
const BASE = `<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style>`;

// Shared result helper source (concatenated into each runtime). Renders a score, an
// encouraging line, and a "Start again" button (window.__ax is each runtime's start fn).
const DONE = "function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class=\"ax-res\"><div class=\"ax-score\">'+p+'%</div><p>'+axmsg(p)+'</p><button class=\"ax-restart\" onclick=\"window.__ax&&window.__ax()\">Start again</button><p style=\"color:#94a3b8;font-size:12px;margin-top:10px\">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}";

function wrap(runtime: string, spec: ActivitySpec): string {
  return BASE + '<div class="ax" id="r"></div><script>(' + runtime + ')(' + JSON.stringify(spec) + ');</script>';
}

/* ── Runtimes (vanilla JS, invoked with the spec) ── */

const QUIZ = "function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');" + DONE +
"function start(){i=0;c=0;st=0;render();}window.__ax=start;" +
"function hd(){var p=Math.round(i/qs.length*100);return '<p class=\"ax-inst\">Choose the best answer. You will see feedback after each question.</p><div class=\"ax-hd\"><span class=\"ax-chip\">&#11088; '+c+' correct</span><span class=\"ax-chip\">&#128293; '+st+' streak</span><span class=\"ax-chip\">Question '+(i+1)+' of '+qs.length+'</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div>';}" +
"function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class=\"ax-q\">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}" +
"function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class=\"ax-msg '+(op.correct?'ok':'no')+'\">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}" +
"start();}";

const FLASH = "function(S){var cs=S.cards||[];var i,known,flipped,rated;var r=document.getElementById('r');" + DONE +
"function start(){i=0;known=0;flipped=false;rated=cs.map(function(){return null;});render();}window.__ax=start;" +
"function render(){if(i>=cs.length){return done(Math.round(known/cs.length*100),{known:known,total:cs.length});}var card=cs[i];flipped=false;var p=Math.round(i/cs.length*100);r.innerHTML='<p class=\"ax-inst\">Read the prompt, tap the card to flip, then say if you knew it.</p><div class=\"ax-hd\"><span class=\"ax-chip\">Card '+(i+1)+' of '+cs.length+'</span><span class=\"ax-chip\">&#9989; '+known+' known</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div><div class=ax-card id=card>'+card.front+'</div><div id=ctl></div>';document.getElementById('card').onclick=flip;ctl();}" +
"function ctl(){var h='<button class=ax-next id=f>Flip card</button>';if(i>0){h+=' <button class=ax-restart id=prev>Previous</button>';}document.getElementById('ctl').innerHTML=h;document.getElementById('f').onclick=flip;var pv=document.getElementById('prev');if(pv){pv.onclick=function(){i--;render();};}}" +
"function flip(){if(flipped)return;flipped=true;var card=cs[i];document.getElementById('card').innerHTML='<div><div style=\"font-size:12px;color:#64748b;margin-bottom:6px;letter-spacing:.06em\">ANSWER</div>'+card.back+'</div>';document.getElementById('ctl').innerHTML='<button class=ax-btn id=y style=\"border-color:#16a34a\">&#9989; I knew it</button><button class=ax-btn id=x>&#128260; Review again</button>';document.getElementById('y').onclick=function(){if(rated[i]!=='known'){known++;rated[i]='known';}i++;render();};document.getElementById('x').onclick=function(){if(rated[i]==='known'){known--;}rated[i]='review';i++;render();};}" +
"start();}";

const MATCH = "function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var rights=ps.map(function(p,idx){return {t:p.right,pi:idx};});for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel,matched,wrong,ldone,rdone;var r=document.getElementById('r');" + DONE +
"function start(){sel=null;matched=0;wrong=0;ldone=ps.map(function(){return false;});rdone=rights.map(function(){return false;});render();}window.__ax=start;" +
"function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}" +
"function render(){r.innerHTML='<p class=\"ax-inst\">Tap a term on the left, then tap its matching definition on the right.</p><div class=\"ax-hd\"><span class=\"ax-chip\">&#128279; '+matched+' of '+total+' matched</span></div><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div><div class=ax-msg id=msg style=\"visibility:hidden\">.</div>';var L=document.getElementById('L'),R=document.getElementById('R');ps.forEach(function(p,k){var b=document.createElement('button');b.className='ax-btn'+(ldone[k]?' ax-lock':'')+(sel===k?' sel':'');b.textContent=p.left;b.disabled=ldone[k];if(!ldone[k]){b.onclick=function(){sel=k;render();};}L.appendChild(b);});rights.forEach(function(rt,k){var b=document.createElement('button');b.className='ax-btn'+(rdone[k]?' ax-lock':'');b.textContent=rt.t;b.disabled=rdone[k];if(!rdone[k]){b.onclick=function(){choose(k);};}R.appendChild(b);});}" +
"function choose(k){if(sel===null){setMsg('First tap a term on the left.',false);return;}var rt=rights[k];if(rt.pi===sel){ldone[sel]=true;rdone[k]=true;matched++;sel=null;if(matched>=total){render();return done(Math.round(100*total/(total+wrong)),{matched:matched,wrong:wrong});}render();setMsg('&#9989; Matched!',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not a match - try again.',false);}}" +
"start();}";

const ORDER = "function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool,next,wrong;var r=document.getElementById('r');" + DONE +
"function start(){pool=correct.map(function(x){return {t:x,used:false};});for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}next=0;wrong=0;render();}window.__ax=start;" +
"function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}" +
"function render(){var p=Math.round(next/total*100);r.innerHTML='<p class=\"ax-inst\">Tap the steps in the correct order. Tap the last placed step to undo it.</p><div class=\"ax-hd\"><span class=\"ax-chip\">'+next+' of '+total+' placed</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div><div id=seq style=\"margin:8px 0\"></div><div id=pool></div><div class=ax-msg id=msg style=\"visibility:hidden\">.</div>';var sq=document.getElementById('seq');for(var k=0;k<next;k++){(function(kk){var d=document.createElement('button');d.className='ax-btn ax-lock';d.innerHTML='<span class=ax-num>'+(kk+1)+'</span>'+correct[kk];if(kk===next-1){d.onclick=undo;d.title='Undo';}sq.appendChild(d);})(k);}var pl=document.getElementById('pool');pool.forEach(function(it,k){if(it.used)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=it.t;b.onclick=function(){tap(k);};pl.appendChild(b);});}" +
"function tap(k){var it=pool[k];if(it.t===correct[next]){it.used=true;next++;if(next>=total){render();return done(Math.round(100*total/(total+wrong)),{ordered:next,wrong:wrong});}render();setMsg('&#9989; Correct step.',true);}else{wrong++;render();setMsg('&#10060; Not the next step - try another.',false);}}" +
"function undo(){if(next<=0)return;next--;var val=correct[next];for(var k=0;k<pool.length;k++){if(pool[k].t===val&&pool[k].used){pool[k].used=false;break;}}render();}" +
"start();}";

const CAT = "function(S){var buckets=S.buckets||[];var items0=(S.items||[]).slice();var items,total,placed,wrong,sel;var r=document.getElementById('r');" + DONE +
"function start(){items=items0.map(function(it){return {text:it.text,bucket:it.bucket,done:false};});for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}total=items.length;placed=0;wrong=0;sel=null;render();}window.__ax=start;" +
"function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}" +
"function render(){r.innerHTML='<p class=\"ax-inst\">Tap an item, then tap the bucket it belongs in.</p><div class=\"ax-hd\"><span class=\"ax-chip\">'+placed+' of '+total+' sorted</span></div><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div><div class=ax-msg id=msg style=\"visibility:hidden\">.</div>';var pool=document.getElementById('pool');items.forEach(function(it,k){if(it.done)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';var inside='';items.forEach(function(it){if(it.done&&it.bucket===bk){inside+='<span class=\"ax-tag ax-placed\">'+it.text+'</span>';}});d.innerHTML='<h4>'+bk+'</h4><div class=in>'+inside+'</div>';d.onclick=function(){drop(bk);};cat.appendChild(d);});}" +
"function drop(bk){if(sel===null){setMsg('First tap an item to place.',false);return;}var it=items[sel];if(it.bucket===bk){it.done=true;placed++;sel=null;if(placed>=total){render();return done(Math.round(100*total/(total+wrong)),{sorted:placed,wrong:wrong});}render();setMsg('&#9989; Correct.',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not that bucket - try again.',false);}}" +
"start();}";

const RUNTIMES: Record<InteractionType, string> = { quiz: QUIZ, flashcards: FLASH, matching: MATCH, order: ORDER, categorize: CAT };

/** Render a spec to a self-contained gamified HTML body. */
export function renderActivity(type: InteractionType, spec: ActivitySpec): string {
  return wrap(RUNTIMES[type], clean(type, spec));
}
// engine v2: instructions, feedback messages, retry-until-correct, restart.
