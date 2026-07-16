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
</style>`;

// Shared result helper source (concatenated into each runtime).
const DONE = "function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class=\"ax-res\"><div class=\"ax-score\">'+p+'%</div><p>Nice work.</p><p style=\"color:#64748b\">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}";

function wrap(runtime: string, spec: ActivitySpec): string {
  return BASE + '<div class="ax" id="r"></div><script>(' + runtime + ')(' + JSON.stringify(spec) + ');</script>';
}

/* ── Runtimes (vanilla JS, invoked with the spec) ── */

const QUIZ = "function(S){var qs=S.questions||[];var i=0,c=0,st=0,ans=false;var r=document.getElementById('r');" + DONE +
"function hd(){var p=Math.round(i/qs.length*100);return '<div class=\"ax-hd\"><span class=\"ax-chip\">&#11088; '+c+' correct</span><span class=\"ax-chip\">&#128293; '+st+' streak</span><span class=\"ax-chip\">Q '+(i+1)+' of '+qs.length+'</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div>';}" +
"function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class=\"ax-q\">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}" +
"function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML=why?('<div class=ax-why>'+(op.correct?'&#9989; ':'&#10060; ')+why+'</div>'):'';document.getElementById('n').disabled=false;}render();}";

const FLASH = "function(S){var cs=S.cards||[];var i=0,known=0,flipped=false;var r=document.getElementById('r');" + DONE +
"function render(){if(i>=cs.length){return done(Math.round(known/cs.length*100),{known:known,total:cs.length});}var card=cs[i];flipped=false;var p=Math.round(i/cs.length*100);r.innerHTML='<div class=\"ax-hd\"><span class=\"ax-chip\">Card '+(i+1)+' of '+cs.length+'</span><span class=\"ax-chip\">&#9989; '+known+' known</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div><div class=ax-card id=card>'+card.front+'</div><div id=ctl></div>';document.getElementById('card').onclick=flip;document.getElementById('ctl').innerHTML='<button class=ax-next id=f>Flip card</button>';document.getElementById('f').onclick=flip;}" +
"function flip(){if(flipped)return;flipped=true;var card=cs[i];document.getElementById('card').innerHTML='<div><div style=\"font-size:13px;color:#64748b;margin-bottom:6px\">ANSWER</div>'+card.back+'</div>';document.getElementById('ctl').innerHTML='<button class=ax-btn id=y style=\"border-color:#16a34a\">&#9989; I knew it</button><button class=ax-btn id=x>&#128260; Need review</button>';document.getElementById('y').onclick=function(){known++;i++;render();};document.getElementById('x').onclick=function(){i++;render();};}render();}";

const MATCH = "function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var lefts=ps.map(function(p){return p.left;});var rights=ps.map(function(p){return p.right;}).slice();for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel=null,done_=0,st=0;var r=document.getElementById('r');" + DONE +
"function render(){r.innerHTML='<div class=\"ax-hd\"><span class=\"ax-chip\">&#128279; '+done_+' of '+total+' matched</span><span class=\"ax-chip\">&#128293; '+st+' streak</span></div><p style=\"color:#475569;font-size:14px\">Tap an item on the left, then its match on the right.</p><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div>';var L=document.getElementById('L'),R=document.getElementById('R');lefts.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){sel=k;paint();};b.id='l'+k;L.appendChild(b);});rights.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){choose(k,b);};R.appendChild(b);});paint();}" +
"function paint(){lefts.forEach(function(x,k){var e=document.getElementById('l'+k);if(e)e.classList.toggle('sel',sel===k);});}" +
"function choose(rk,btn){if(sel===null)return;var want=ps[sel].right;if(rights[rk]===want){btn.classList.add('ok');btn.disabled=true;var le=document.getElementById('l'+sel);if(le){le.classList.remove('sel');le.classList.add('ok');le.disabled=true;}lefts[sel]=null;rights[rk]=null;sel=null;done_++;st++;if(done_>=total)return done(100,{matched:done_,total:total});}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);sel=null;paint();}}render();}";

const ORDER = "function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool=correct.slice();for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}var next=0,st=0;var r=document.getElementById('r');" + DONE +
"function render(){var p=Math.round(next/total*100);var h='<div class=\"ax-hd\"><span class=\"ax-chip\">Step '+(next)+' of '+total+' placed</span><span class=\"ax-chip\">&#128293; '+st+' streak</span></div><div class=\"ax-bar\"><i style=\"width:'+p+'%\"></i></div><p style=\"color:#475569;font-size:14px\">Tap the items in the correct order.</p><div id=seq style=\"margin:8px 0\"></div><div id=pool></div>';r.innerHTML=h;var sq=document.getElementById('seq');for(var k=0;k<next;k++){var d=document.createElement('div');d.className='ax-btn ok';d.innerHTML='<span class=ax-num>'+(k+1)+'</span>'+correct[k];sq.appendChild(d);}var pl=document.getElementById('pool');pool.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){tap(k,b);};pl.appendChild(b);});}" +
"function tap(k,btn){if(pool[k]===correct[next]){pool[k]=null;next++;st++;if(next>=total)return done(100,{ordered:next,total:total});render();}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);}}render();}";

const CAT = "function(S){var buckets=S.buckets||[];var items=(S.items||[]).slice();for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}var total=items.length;var placed=0,correct=0,st=0,sel=null;var r=document.getElementById('r');" + DONE +
"function render(){var h='<div class=\"ax-hd\"><span class=\"ax-chip\">'+placed+' of '+total+' sorted</span><span class=\"ax-chip\">&#11088; '+correct+' correct</span><span class=\"ax-chip\">&#128293; '+st+' streak</span></div><p style=\"color:#475569;font-size:14px\">Tap an item, then the bucket it belongs in.</p><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div>';r.innerHTML=h;var pool=document.getElementById('pool');items.forEach(function(it,k){if(it===null)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';d.innerHTML='<h4>'+bk+'</h4><div class=in></div>';d.onclick=function(){drop(bk,d);};cat.appendChild(d);});}" +
"function drop(bk,el){if(sel===null)return;var it=items[sel];if(it.bucket===bk){correct++;st++;}else{st=0;}var tag=document.createElement('span');tag.className='ax-tag ax-placed';tag.textContent=it.text+(it.bucket===bk?' ✔':' → '+it.bucket);el.querySelector('.in').appendChild(tag);items[sel]=null;sel=null;placed++;if(placed>=total)return done(Math.round(correct/total*100),{correct:correct,total:total});render();}render();}";

const RUNTIMES: Record<InteractionType, string> = { quiz: QUIZ, flashcards: FLASH, matching: MATCH, order: ORDER, categorize: CAT };

/** Render a spec to a self-contained gamified HTML body. */
export function renderActivity(type: InteractionType, spec: ActivitySpec): string {
  return wrap(RUNTIMES[type], clean(type, spec));
}
