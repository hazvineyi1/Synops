/**
 * Reusable K-12 "game-show" activity templates.
 *
 * Each template is a pure function that turns CONTENT (categories, questions, word lists…) into a
 * single self-contained, sandboxed HTML activity, the same contract the module quiz engine uses:
 * it posts `{ type:'activity_result', score }` to its parent when finished, so it plugs straight into
 * the existing ActivityPlayer and submission flow with zero new wiring.
 *
 * The mechanic that transfers across every band is *turn-taking with visible stakes*, so these are
 * built for solo self-play AND whole-class projected play (a teacher drives one screen, learners take
 * turns). They are content-parameterized, so ONE template serves many grade levels with different
 * content. Networked team/breakout play (shared live leaderboard, chat-buzzer) is deliberately left to
 * a later phase, it needs realtime session infrastructure this single-service stack doesn't have yet.
 */

export type Band = "k2" | "35" | "68" | "912";
export const BAND_LABEL: Record<Band, string> = { k2: "K–2", "35": "Grades 3–5", "68": "Grades 6–8", "912": "Grades 9–12" };

// ── Shared sandbox shell ─────────────────────────────────────────────────────
const CSS = ":root{--indigo:#4F46E5;--amber:#F59E0B;--ink:#1f2430;--ok:#15803d;--no:#b91c1c;--pap:#FBF7EF}"
  + "*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:var(--ink);margin:0;padding:16px;background:var(--pap);overflow-x:hidden}"
  + "h2{margin:.1rem 0 .5rem;font-size:1.2rem;text-align:center}#stars{text-align:center;font-weight:800;font-size:1.15rem;margin-bottom:8px;color:var(--indigo)}"
  + ".hint{color:#6b7280;text-align:center;font-weight:600;margin:10px 0}.bar{height:10px;background:#eee;border-radius:8px;overflow:hidden;margin:14px 0 6px}"
  + ".fill{height:100%;width:0;background:linear-gradient(90deg,#F59E0B,#15803d);transition:.4s}.done{display:none;text-align:center;font-weight:800;font-size:1.4rem;color:var(--ok);margin:14px 0}"
  + "button{font:inherit;cursor:pointer}.btn{border:2px solid #e6e0d0;background:#fff;border-radius:14px;padding:12px 16px;font-weight:700;font-size:1.05rem;transition:.15s}"
  + ".btn:hover{border-color:var(--indigo);transform:translateY(-1px)}.btn.ok{border-color:var(--ok);background:#e9f7ee}.btn.no{border-color:var(--no);background:#fdecec;animation:sh .4s}"
  + ".btn:disabled{opacity:.55;cursor:default;transform:none}@keyframes sh{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}"
  + "@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.09)}100%{transform:scale(1)}}.pop{animation:pop .45s}"
  + ".cf{position:fixed;top:-30px;font-size:1.7rem;animation:fall linear forwards;z-index:9;pointer-events:none}@keyframes fall{to{transform:translateY(110vh) rotate(360deg);opacity:.85}}"
  + ".grid{display:grid;gap:8px}input.tx{font:inherit;font-size:1.05rem;padding:10px 12px;border:2px solid #e6e0d0;border-radius:12px;width:100%;max-width:280px}"
  + ".card{background:#fff;border:2px solid #f0e9da;border-radius:16px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.05)}.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}"
  + ".slot{border:2px dashed #cdc7b8;border-radius:12px;padding:10px 12px;font-weight:700;min-height:44px;display:flex;justify-content:space-between;gap:10px;align-items:center}"
  + ".slot.filled{border-style:solid;border-color:var(--ok);background:#e9f7ee}.tile{width:44px;height:52px;border:2px solid #e6e0d0;background:#fff;border-radius:10px;font-weight:800;font-size:1.3rem}"
  + ".tile.used{opacity:.35;pointer-events:none}.bcell{aspect-ratio:1;border:2px solid #e6e0d0;background:#fff;border-radius:12px;font-weight:800;font-size:1.05rem;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px}"
  + ".bcell.mark{background:#e9f7ee;border-color:var(--ok);color:var(--ok)}.bcell.free{background:#eef0fb;border-color:var(--indigo);color:var(--indigo)}.blank{display:inline-block;min-width:22px;border-bottom:3px solid var(--ink);margin:0 2px;text-align:center;font-weight:800;font-size:1.4rem}"
  // ── Themed stages: a game-show / adventure look per game, with white cards kept readable on top. ──
  + ".stage{min-height:340px;padding:16px;margin:-16px}.banner{text-align:center;padding:12px 10px;margin:-16px -16px 12px;font-weight:900;letter-spacing:1px;font-size:1.15rem}"
  + ".t-jeopardy{background:linear-gradient(160deg,#0a1a63,#1a2f9c)}.t-jeopardy>h2,.t-jeopardy>#stars{color:#fff}.t-jeopardy .banner{background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#0a1a63}"
  + ".t-feud{background:linear-gradient(160deg,#0b3a6b,#12508c)}.t-feud>h2,.t-feud>#stars{color:#fff}.t-feud .banner{background:linear-gradient(90deg,#22d3ee,#0891b2);color:#04263f}"
  + ".t-escape{background:linear-gradient(160deg,#23262d,#33373f)}.t-escape>h2,.t-escape>#stars{color:#f8fafc}.t-escape .banner{background:linear-gradient(90deg,#b45309,#f59e0b);color:#2b1a02}"
  + ".t-wheel{background:linear-gradient(160deg,#efe6ff,#f7f2ff)}.t-wheel .banner{background:linear-gradient(90deg,#8b5cf6,#a78bfa);color:#fff}"
  + ".t-bingo{background:linear-gradient(160deg,#e6fbf6,#f2fffb)}.t-bingo .banner{background:linear-gradient(90deg,#14b8a6,#2dd4bf);color:#04302a}"
  + ".t-password{background:linear-gradient(160deg,#fff4e6,#fff9f2)}.t-password .banner{background:linear-gradient(90deg,#f97316,#fb923c);color:#3a1a02}"
  + ".t-jeopardy .hint,.t-feud .hint,.t-escape .hint{color:#e5e7eb}"
  // Escape-room door: swings open when the last lock is solved.
  + ".door-wrap{perspective:600px;display:inline-block;margin:2px auto 0}.door-frame{width:78px;height:104px;background:#1f2937;border-radius:8px;padding:6px;position:relative;box-shadow:inset 0 0 0 3px #f59e0b}"
  + ".door{width:100%;height:100%;background:linear-gradient(135deg,#7c4a03,#b45309);border-radius:5px;transform-origin:left center;transition:transform 1s ease;position:relative;transform-style:preserve-3d}"
  + ".door:before{content:'';position:absolute;right:8px;top:46px;width:9px;height:9px;border-radius:50%;background:#fde68a}.door.open{transform:rotateY(-105deg)}.door-frame.lit{box-shadow:inset 0 0 0 3px #22c55e,0 0 22px #22c55e}"
  + ".lockrow{display:flex;gap:6px;justify-content:center;margin-top:8px}.lockdot{font-size:1.3rem;filter:grayscale(1);opacity:.6;transition:.3s}.lockdot.open{filter:none;opacity:1;transform:scale(1.15)}"
  // AI opponent ("Coach Bot") controls + race bar.
  + ".botctl{text-align:center;font-size:.85rem;color:#94a3b8;margin:8px 0}.botctl button{border:2px solid #e6e0d0;background:#fff;color:var(--ink);border-radius:10px;padding:3px 11px;font-weight:700;margin:0 3px;cursor:pointer}.botctl button:hover{border-color:var(--indigo)}"
  + "#botrow{display:flex;align-items:center;gap:8px;margin:4px 0}#botrow span{font-size:.8rem;font-weight:800;color:#ef4444;white-space:nowrap}#botrow .bar{flex:1;margin:0}#bf{background:linear-gradient(90deg,#ef4444,#f59e0b)}"
  + ".rematch{border:2px solid var(--indigo);background:#fff;color:var(--indigo);border-radius:12px;padding:6px 16px;font-weight:800;cursor:pointer;margin-top:8px}";

const COMMON = "function $(i){return document.getElementById(i);}"
  + "function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}"
  + "function report(s){try{parent.postMessage({type:'activity_result',score:Math.round(s),payload:{}},'*');}catch(e){}}"
  + "function setBar(p){var f=$('f');if(f)f.style.width=Math.max(0,Math.min(100,Math.round(p)))+'%';}"
  + "function pts(n){var s=$('stars');if(s)s.textContent=n;}"
  + "function speak(t){try{if('speechSynthesis'in window){window.speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.rate=.95;window.speechSynthesis.speak(u);}}catch(e){}}"
  + "function confetti(){for(var i=0;i<36;i++){var s=document.createElement('span');s.className='cf';s.style.left=(Math.random()*100)+'vw';s.style.animationDuration=(1.6+Math.random()*1.5)+'s';s.style.animationDelay=(Math.random()*.4)+'s';s.textContent=['🎉','⭐','🌟','🎊','✨','🏆'][i%6];document.body.appendChild(s);(function(x){setTimeout(function(){x.remove();},3600);})(s);}}"
  + "function burst(el,kind){try{var r=el.getBoundingClientRect();var set=['🎈','⭐','🎉','✨'];for(var i=0;i<9;i++){var s=document.createElement('span');s.className='cf';s.style.left=((r.left||0)+Math.random()*Math.max(r.width||20,20))+'px';s.style.top=((r.top||0))+'px';s.style.animationDuration='1.2s';s.style.animationDelay=(Math.random()*.2)+'s';s.textContent=set[i%set.length];document.body.appendChild(s);(function(x){setTimeout(function(){x.remove();},1500);})(s);}}catch(e){}}"
  + "var BOT={on:false,dur:0,t0:0,iv:null,frac:0};"
  + "function botTick(){var e=(Date.now()-BOT.t0)/1000;BOT.frac=Math.min(1,e/BOT.dur);var bf=$('bf');if(bf)bf.style.width=Math.round(BOT.frac*100)+'%';var s=$('botlbl');if(s)s.textContent=BOT.frac>=1?'🤖 Bot: done!':'🤖 Coach Bot';if(BOT.frac>=1&&BOT.iv){clearInterval(BOT.iv);BOT.iv=null;}}"
  + "function botStart(dur){if(BOT.on)return;BOT.on=true;BOT.dur=dur;BOT.t0=Date.now();var tog=$('bottog');if(tog)tog.style.display='none';var row=$('botrow');if(row)row.style.display='flex';botTick();BOT.iv=setInterval(botTick,300);}"
  + "function botInit(){var e=$('bote'),m=$('botm'),h=$('both');if(e)e.onclick=function(){botStart(90);};if(m)m.onclick=function(){botStart(60);};if(h)h.onclick=function(){botStart(40);};}"
  + "function endGame(pct,msg){if(BOT.iv){clearInterval(BOT.iv);BOT.iv=null;}var extra='';if(BOT.on){var beat=BOT.frac<1;extra=beat?'<div style=\"color:#15803d;margin-top:4px\">You beat the 🤖 Coach Bot! 🏆</div>':'<div style=\"color:#b91c1c;margin-top:4px\">The 🤖 Coach Bot finished first, so close! Try a rematch.</div>';extra+='<div><button class=\"rematch\" id=\"rematch\">🔁 Rematch</button></div>';}setBar(100);var d=$('done');if(d){d.innerHTML='🎉 '+(msg||('You scored '+Math.round(pct)+'%'))+extra;d.style.display='block';var rb=$('rematch');if(rb)rb.onclick=function(){location.reload();};}var h2=$('hint');if(h2)h2.style.display='none';confetti();setTimeout(function(){report(pct);},1300);}"
  + "botInit();";

function page(title: string, data: unknown, script: string, theme = "default", banner = ""): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const cls = theme && theme !== "default" ? " t-" + theme : "";
  return "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<style>" + CSS + "</style>"
    + "<div class=\"stage" + cls + "\">"
    + (banner ? "<div class=\"banner\">" + banner + "</div>" : "")
    + "<h2>" + title + "</h2><div id=\"stars\"></div><div id=\"app\"></div>"
    + "<div class=\"bar\"><div class=\"fill\" id=\"f\"></div></div>"
    + "<div id=\"botrow\" style=\"display:none\"><span id=\"botlbl\">🤖 Coach Bot</span><div class=\"bar\"><div class=\"fill\" id=\"bf\"></div></div></div>"
    + "<div id=\"bottog\" class=\"botctl\">Play against the Coach Bot? <button id=\"bote\">🤖 Easy</button><button id=\"botm\">Medium</button><button id=\"both\">Hard</button></div>"
    + "<p id=\"hint\" class=\"hint\"></p><div id=\"done\" class=\"done\"></div>"
    + "</div>"
    + "<script>var DATA=" + json + ";" + COMMON + "\n" + script + "</script>";
}

// ── 1) JEOPARDY ──────────────────────────────────────────────────────────────
function buildJeopardy(c: unknown): string {
  const script = "var cats=DATA.categories;var totalPts=0,got=0,cells=0,doneCells=0;"
    + "cats.forEach(function(x){x.clues.forEach(function(q){totalPts+=q.value;cells++;});});pts('0 pts');"
    + "var board=document.createElement('div');board.className='grid';board.style.gridTemplateColumns='repeat('+cats.length+',1fr)';"
    + "cats.forEach(function(x){var h=document.createElement('div');h.className='card';h.style.cssText='text-align:center;font-weight:800;background:#4F46E5;color:#fff';h.textContent=x.name;board.appendChild(h);});"
    + "var rows=Math.max.apply(null,cats.map(function(x){return x.clues.length;}));"
    + "for(var r=0;r<rows;r++){(function(r){cats.forEach(function(x){var q=x.clues[r];var b=document.createElement('button');b.className='btn';b.style.width='100%';if(!q){b.style.visibility='hidden';board.appendChild(b);return;}b.textContent=q.value;b.style.color='#F59E0B';b.style.fontSize='1.3rem';b.onclick=function(){openClue(q,b);};board.appendChild(b);});})(r);}"
    + "$('app').appendChild(board);$('hint').textContent='Tap a point value, then pick the correct answer!';"
    + "function norm(s){return String(s||'').toLowerCase().replace(/[\\s.,;:!?$]/g,'').replace(/^[a-z]=/,'');}"
    + "function openClue(q,b){if(b.disabled)return;var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:18px;z-index:20';"
    + "var p=document.createElement('div');p.className='card';p.style.cssText='max-width:520px;width:100%;text-align:center';p.innerHTML='<div style=\"font-weight:800;color:#4F46E5;margin-bottom:8px\">'+q.value+' points</div><div style=\"font-size:1.2rem;margin:10px 0 14px\">'+q.clue+'</div>';"
    + "var tries=0,solved=false;"
    + "var fb=document.createElement('div');fb.style.cssText='min-height:22px;font-weight:700;margin:10px 0 2px';"
    + "function fin(){if(ov.parentNode)document.body.removeChild(ov);if(doneCells===cells)endGame(got/totalPts*100,'Final score: '+got+' points!');}"
    + "function win(){if(solved)return;solved=true;b.disabled=true;b.classList.add('ok');got+=q.value;pts(got+' pts');doneCells++;setBar(doneCells/cells*100);fb.style.color='#15803d';fb.textContent='\\u2713 Correct! +'+q.value;burst(b,'balloon');setTimeout(fin,900);}"
    + "function miss(){if(solved)return;solved=true;b.disabled=true;b.classList.add('no');doneCells++;setBar(doneCells/cells*100);setTimeout(fin,900);}"
    // Multiple-choice: every clue is answered by tapping one of its options. Correct → win();
    // each wrong tap shows 'Try again', and after 2 misses the answer is revealed then scored 0.
    + "var choices=(q.options&&q.options.length)?q.options.slice():[q.answer];"
    + "var grid=document.createElement('div');grid.className='grid';grid.style.gap='8px';grid.style.marginTop='6px';var abtns=[];"
    + "function reveal(){abtns.forEach(function(x){if(norm(x.textContent)===norm(q.answer))x.classList.add('ok');x.disabled=true;});}"
    + "shuffle(choices).forEach(function(o){var ab=document.createElement('button');ab.className='btn';ab.style.width='100%';ab.textContent=o;ab.onclick=function(){if(solved||ab.disabled)return;if(norm(o)===norm(q.answer)){abtns.forEach(function(x){x.disabled=true;});win();}else{ab.disabled=true;ab.classList.add('no');tries++;fb.style.color='#b91c1c';if(tries>=2){fb.textContent='Answer: '+q.answer;reveal();setTimeout(miss,1200);}else{fb.textContent='Try again!';}}};abtns.push(ab);grid.appendChild(ab);});"
    + "p.appendChild(grid);p.appendChild(fb);ov.appendChild(p);document.body.appendChild(ov);}";
  return page((c as { title?: string }).title || "Jeopardy", c, script, "jeopardy", "🎰 JEOPARDY");
}

// ── 2) FAMILY FEUD ───────────────────────────────────────────────────────────
function buildFeud(c: unknown): string {
  const script = "var rounds=DATA.rounds;var ri=0,earned=0,possible=0;rounds.forEach(function(r){r.answers.forEach(function(a){possible+=a.points;});});"
    + "function render(){var r=rounds[ri];$('app').innerHTML='';var strikes=0,found=0;pts('Round '+(ri+1)+'/'+rounds.length);setBar(ri/rounds.length*100);"
    + "var qc=document.createElement('div');qc.className='card';qc.style.textAlign='center';qc.innerHTML='<div style=\"font-size:.8rem;color:#6b7280;font-weight:700\">We surveyed the class…</div><div style=\"font-size:1.15rem;font-weight:800;margin-top:6px\">'+r.question+'</div>';$('app').appendChild(qc);"
    + "var ranked=r.answers.slice().sort(function(a,b){return b.points-a.points;});var board=document.createElement('div');board.className='grid';board.style.margin='12px 0';var slotEls={};"
    + "ranked.forEach(function(a,i){var s=document.createElement('div');s.className='slot';s.innerHTML='<span>'+(i+1)+'.  ▒▒▒▒▒</span><span class=\"pts\">'+a.points+'</span>';s.querySelector('.pts').style.visibility='hidden';board.appendChild(s);slotEls[a.text.toLowerCase()]=s;});$('app').appendChild(board);"
    + "var strikeEl=document.createElement('div');strikeEl.style.cssText='text-align:center;font-weight:800;color:#b91c1c;min-height:24px';$('app').appendChild(strikeEl);"
    + "var pool=shuffle(r.answers.map(function(a){return a.text;}).concat(r.distractors||[]));var opts=document.createElement('div');opts.className='row';opts.style.marginTop='6px';"
    + "pool.forEach(function(t){var b=document.createElement('button');b.className='btn';b.textContent=t;b.onclick=function(){if(b.disabled)return;var hit=r.answers.filter(function(a){return a.text.toLowerCase()===t.toLowerCase();})[0];if(hit){b.disabled=true;b.classList.add('ok');var s=slotEls[t.toLowerCase()];s.classList.add('filled');s.querySelector('span').textContent='✓ '+hit.text;s.querySelector('.pts').style.visibility='visible';earned+=hit.points;found++;if(found===r.answers.length)next();}else{b.disabled=true;b.classList.add('no');strikes++;strikeEl.textContent='❌'.repeat(strikes);if(strikes>=3){revealRest();}}};opts.appendChild(b);});$('app').appendChild(opts);"
    + "function revealRest(){r.answers.forEach(function(a){var s=slotEls[a.text.toLowerCase()];if(!s.classList.contains('filled')){s.querySelector('span').textContent=a.text;s.querySelector('.pts').style.visibility='visible';}});[].slice.call(opts.querySelectorAll('button')).forEach(function(x){x.disabled=true;});setTimeout(next,1400);}"
    + "}function next(){ri++;if(ri>=rounds.length){endGame(earned/possible*100,'You found '+earned+' of '+possible+' survey points!');}else{setTimeout(render,700);}}render();";
  return page((c as { title?: string }).title || "Family Feud", c, script, "feud", "📋 SURVEY SAYS…");
}

// ── 3) BINGO ─────────────────────────────────────────────────────────────────
function buildBingo(c: unknown): string {
  const script = "var pool=DATA.pool.slice();var size=DATA.size||5;var free=size%2===1;var need=size*size-(free?1:0);"
    + "if(pool.length<need){size=4;free=false;need=16;}var chosen=shuffle(pool).slice(0,need);var grid=[];var k=0;"
    + "for(var i=0;i<size*size;i++){if(free&&i===Math.floor(size*size/2)){grid.push('★');}else{grid.push(chosen[k++]);}}"
    + "var cells=[];var marked=[];var gEl=document.createElement('div');gEl.className='grid';gEl.style.gridTemplateColumns='repeat('+size+',1fr)';gEl.style.maxWidth='420px';gEl.style.margin='0 auto';"
    + "grid.forEach(function(v,i){var b=document.createElement('button');b.className='bcell'+(v==='★'?' free':'');b.textContent=v;marked[i]=(v==='★');if(v==='★')b.classList.add('mark');b.onclick=function(){if(v===current||v==='★'){b.classList.add('mark');marked[i]=true;checkWin();}};cells.push(b);gEl.appendChild(b);});"
    + "var wrap=document.createElement('div');wrap.appendChild(gEl);var callBox=document.createElement('div');callBox.style.cssText='text-align:center;margin:14px 0';callBox.innerHTML='<div id=\"call\" style=\"font-size:1.6rem;font-weight:800;color:#4F46E5;min-height:40px\">, </div>';"
    + "var nb=document.createElement('button');nb.className='btn';nb.textContent='📢 Next call';var order=shuffle(chosen.slice());var ci=-1;var current=null;"
    + "nb.onclick=function(){ci++;if(ci>=order.length){nb.disabled=true;return;}current=order[ci];$('call').textContent=current;speak(String(current));setBar(ci/order.length*70);};callBox.appendChild(nb);"
    + "$('app').appendChild(callBox);$('app').appendChild(wrap);$('hint').textContent='Tap \"Next call\", then tap that square if it is on your card. Get a full line to win!';var won=false;"
    + "function line(idx){return idx.every(function(i){return marked[i];});}function checkWin(){if(won)return;var w=false;var n=size;"
    + "for(var r=0;r<n;r++){var row=[];for(var col=0;col<n;col++)row.push(r*n+col);if(line(row))w=true;}"
    + "for(var col2=0;col2<n;col2++){var cl=[];for(var r2=0;r2<n;r2++)cl.push(r2*n+col2);if(line(cl))w=true;}"
    + "var d1=[],d2=[];for(var d=0;d<n;d++){d1.push(d*n+d);d2.push(d*n+(n-1-d));}if(line(d1)||line(d2))w=true;"
    + "if(w){won=true;endGame(100,'BINGO! 🎉');}}";
  return page((c as { title?: string }).title || "Bingo", c, script, "bingo", "🎱 BINGO");
}

// ── 4) PASSWORD / TABOO (clue-by-clue word guess) ────────────────────────────
function buildPassword(c: unknown): string {
  const script = "var items=DATA.items;var ii=0,score=0,possible=items.length*5;"
    + "function render(){var it=items[ii];$('app').innerHTML='';pts('Word '+(ii+1)+'/'+items.length);setBar(ii/items.length*100);var shown=1;"
    + "var cc=document.createElement('div');cc.className='card';cc.innerHTML='<div style=\"font-weight:800;color:#4F46E5;text-align:center;margin-bottom:8px\">Guess the word from the clues</div>';"
    + "var clues=document.createElement('div');cc.appendChild(clues);function paintClues(){clues.innerHTML='';it.clues.slice(0,shown).forEach(function(cl,i){var p=document.createElement('div');p.style.cssText='padding:6px 0;font-size:1.05rem';p.textContent='• '+cl;clues.appendChild(p);});}paintClues();$('app').appendChild(cc);"
    + "var moreWrap=document.createElement('div');moreWrap.style.textAlign='center';moreWrap.style.margin='10px 0';var more=document.createElement('button');more.className='btn';more.textContent='Need another clue (−1)';more.onclick=function(){if(shown<it.clues.length){shown++;paintClues();if(shown>=it.clues.length)more.disabled=true;}};moreWrap.appendChild(more);if(it.clues.length>1)$('app').appendChild(moreWrap);"
    + "var opts=document.createElement('div');opts.className='row';shuffle(it.options).forEach(function(o){var b=document.createElement('button');b.className='btn';b.textContent=o;b.onclick=function(){if(b.disabled)return;if(o.toLowerCase()===it.answer.toLowerCase()){b.classList.add('ok');var earn=Math.max(1,6-shown);score+=earn;[].slice.call(opts.querySelectorAll('button')).forEach(function(x){x.disabled=true;});more.disabled=true;setTimeout(next,700);}else{b.disabled=true;b.classList.add('no');if(shown<it.clues.length){shown++;paintClues();}}};opts.appendChild(b);});$('app').appendChild(opts);}"
    + "function next(){ii++;if(ii>=items.length){endGame(score/possible*100,'You scored '+score+' of '+possible+'!');}else{render();}}render();";
  return page((c as { title?: string }).title || "Password", c, script, "password", "🔑 PASSWORD");
}

// ── 5) WHEEL / LETTER-REVEAL (Wheel of Fortune + Guess the Sound) ─────────────
function buildWheel(c: unknown): string {
  const script = "var puzzles=DATA.puzzles;var pi=0,score=0,possible=puzzles.length*100;"
    + "function render(){var pz=puzzles[pi];$('app').innerHTML='';pts('Puzzle '+(pi+1)+'/'+puzzles.length);setBar(pi/puzzles.length*100);var wrong=0;var phrase=pz.phrase.toUpperCase();var revealed={};"
    + "var hintc=document.createElement('div');hintc.className='card';hintc.style.textAlign='center';hintc.innerHTML='<span style=\"font-weight:800;color:#4F46E5\">Hint:</span> '+(pz.hint||', ');"
    + "if(pz.say){var sb=document.createElement('button');sb.className='btn';sb.style.marginLeft='8px';sb.textContent='🔊 Hear it';sb.onclick=function(){speak(pz.say);};hintc.appendChild(sb);}$('app').appendChild(hintc);"
    + "var pv=document.createElement('div');pv.style.cssText='text-align:center;margin:16px 0;line-height:2.2';$('app').appendChild(pv);"
    + "function paint(){pv.innerHTML='';phrase.split('').forEach(function(ch){if(/[A-Z0-9]/.test(ch)){var s=document.createElement('span');s.className='blank';s.textContent=revealed[ch]?ch:'';pv.appendChild(s);}else if(ch===' '){pv.appendChild(document.createTextNode('\\u00A0\\u00A0'));}else{var t=document.createElement('span');t.textContent=ch;t.style.margin='0 2px';pv.appendChild(t);}});}paint();"
    + "var kb=document.createElement('div');kb.className='row';kb.style.maxWidth='520px';kb.style.margin='0 auto';'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function(L){var b=document.createElement('button');b.className='btn';b.style.cssText='min-width:40px;padding:8px 10px';b.textContent=L;b.onclick=function(){if(b.disabled)return;b.disabled=true;if(phrase.indexOf(L)>=0){b.classList.add('ok');revealed[L]=true;paint();if(solved()){var earn=Math.max(20,100-wrong*15);score+=earn;[].slice.call(kb.querySelectorAll('button')).forEach(function(x){x.disabled=true;});setTimeout(next,800);}}else{b.classList.add('no');wrong++;}};kb.appendChild(b);});$('app').appendChild(kb);$('hint').textContent='Tap letters to fill in the answer. Fewer wrong guesses = more points!';"
    + "function solved(){return phrase.split('').every(function(ch){return !/[A-Z0-9]/.test(ch)||revealed[ch];});}}"
    + "function next(){pi++;if(pi>=puzzles.length){endGame(score/possible*100,'You solved them! '+score+' points');}else{render();}}render();";
  return page((c as { title?: string }).title || "Wheel", c, script, "wheel", "🎡 WHEEL");
}

// ── 6) ESCAPE ROOM (sequential locked stages) ────────────────────────────────
function buildEscape(c: unknown): string {
  const banner = '<div class="door-wrap"><div class="door-frame" id="doorframe"><div class="door" id="door"></div></div></div><div style="margin-top:4px">🚪 ESCAPE ROOM</div><div class="lockrow" id="lockrow"></div>';
  const script = "var stages=DATA.stages;var si=0,hintsUsed=0,tries=0;"
    + "var lr=$('lockrow');if(lr){lr.innerHTML='';for(var i=0;i<stages.length;i++){var dd=document.createElement('span');dd.className='lockdot';dd.textContent='🔒';lr.appendChild(dd);}}"
    + "function openDoor(){var dr=$('door');if(dr)dr.classList.add('open');var df=$('doorframe');if(df)df.classList.add('lit');}"
    + "var intro=document.createElement('div');intro.className='card';intro.style.textAlign='center';intro.innerHTML='🔒 '+(DATA.intro||'Solve each lock to escape!');$('app').appendChild(intro);"
    + "var stageBox=document.createElement('div');$('app').appendChild(stageBox);"
    + "function render(){var st=stages[si];stageBox.innerHTML='';pts('Lock '+(si+1)+'/'+stages.length);setBar(si/stages.length*100);"
    + "var c1=document.createElement('div');c1.className='card';c1.innerHTML='<div style=\"font-weight:800;color:#4F46E5;margin-bottom:6px\">Lock '+(si+1)+'</div><div style=\"font-size:1.08rem\">'+st.prompt+'</div>';stageBox.appendChild(c1);"
    + "var fb=document.createElement('div');fb.style.cssText='text-align:center;font-weight:700;min-height:22px;margin:8px 0';"
    + "function solved(){var dots=lr?lr.querySelectorAll('.lockdot'):[];if(dots[si]){dots[si].classList.add('open');dots[si].textContent='🔓';}si++;if(si>=stages.length){openDoor();endGame(Math.max(40,100-hintsUsed*10-tries*3),'You escaped! 🎉🔓');}else{c1.style.borderColor='#15803d';setTimeout(render,700);}}"
    + "if(st.choices){var opts=document.createElement('div');opts.className='row';shuffle(st.choices).forEach(function(o){var b=document.createElement('button');b.className='btn';b.textContent=o;b.onclick=function(){if(b.disabled)return;if(o.toLowerCase()===String(st.answer).toLowerCase()){b.classList.add('ok');[].slice.call(opts.querySelectorAll('button')).forEach(function(x){x.disabled=true;});solved();}else{b.disabled=true;b.classList.add('no');tries++;fb.textContent='That lock did not open. Try again.';}};opts.appendChild(b);});stageBox.appendChild(opts);}"
    + "else{var wrap=document.createElement('div');wrap.className='row';var inp=document.createElement('input');inp.className='tx';inp.placeholder='Enter the code…';var go=document.createElement('button');go.className='btn';go.textContent='Unlock';function tryIt(){var v=(inp.value||'').trim().toLowerCase();if(!v)return;if(v===String(st.answer).toLowerCase()){go.classList.add('ok');inp.disabled=true;go.disabled=true;solved();}else{tries++;fb.textContent='🔒 Still locked. Check your work.';inp.classList.add('no');setTimeout(function(){inp.classList.remove('no');},400);}}go.onclick=tryIt;inp.addEventListener('keydown',function(e){if(e.key==='Enter')tryIt();});wrap.appendChild(inp);wrap.appendChild(go);stageBox.appendChild(wrap);}"
    + "stageBox.appendChild(fb);if(st.hint){var hw=document.createElement('div');hw.style.textAlign='center';var hb=document.createElement('button');hb.className='btn';hb.style.fontSize='.9rem';hb.textContent='💡 Hint (−10)';hb.onclick=function(){hintsUsed++;fb.textContent='💡 '+st.hint;hb.disabled=true;};hw.appendChild(hb);stageBox.appendChild(hw);}}render();";
  return page((c as { title?: string }).title || "Escape Room", c, script, "escape", banner);
}

// ── 7) MILLIONAIRE (rising money ladder + 50:50 lifeline) ────────────────────
function buildMillionaire(c: unknown): string {
  const script = "var app=$('app');var qs=DATA.questions;var i=0,won=0,total=0,life=true;"
    + "qs.forEach(function(q,idx){q.__v=q.value||((idx+1)*100);total+=q.__v;});pts('$0');"
    + "function render(){app.innerHTML='';var q=qs[i];"
    + "var lad=document.createElement('div');lad.className='card';lad.style.cssText='text-align:center;font-weight:800';lad.innerHTML='Question '+(i+1)+' of '+qs.length+', for <span style=\"color:#F59E0B\">$'+q.__v+'</span><div style=\"font-size:.8rem;color:#6b7280\">Banked: $'+won+'</div>';app.appendChild(lad);"
    + "var d=document.createElement('div');d.className='q';d.innerHTML='<p class=\"qt\">'+q.q+'</p>';var opts=shuffle(q.options.map(function(o,k){return{o:o,k:k};}));"
    + "if(life){var fifty=document.createElement('button');fifty.className='btn';fifty.style.cssText='display:block;margin:0 auto 10px';fifty.textContent='💡 50:50';fifty.onclick=function(){life=false;fifty.remove();var wrong=opts.filter(function(p){return p.k!==q.answer;});shuffle(wrong).slice(0,2).forEach(function(p){var b=btns[p.k];if(b){b.disabled=true;b.style.visibility='hidden';}});};d.appendChild(fifty);}"
    + "var btns={};opts.forEach(function(p){var b=document.createElement('button');b.className='opt';b.innerHTML='<span>'+p.o+'</span><span class=\"mk\"></span>';btns[p.k]=b;b.onclick=function(){if(d.dataset.done)return;var mk=b.querySelector('.mk');if(p.k===q.answer){d.dataset.done='1';b.classList.add('correct');mk.textContent='✅';burst(b,'balloon');won+=q.__v;pts('$'+won);i++;setBar(i/qs.length*100);if(i>=qs.length)setTimeout(function(){endGame(100,'You won it all! $'+won+' 🏆');},700);else setTimeout(render,800);}else{b.classList.add('wrong');mk.textContent='❌';[].slice.call(d.querySelectorAll('.opt')).forEach(function(x){x.disabled=true;});setTimeout(function(){endGame(won/total*100,'You banked $'+won+'! Great run.');},900);}};d.appendChild(b);});"
    + "app.appendChild(d);}$('hint').textContent='Answer to climb the money ladder! One wrong answer banks what you have.';render();";
  return page((c as { title?: string }).title || "Millionaire", c, script, "jeopardy", "💰 MILLIONAIRE");
}

// ── 8) SEQUENCE (tap items into the correct order) ───────────────────────────
function buildSequence(c: unknown): string {
  const script = "var app=$('app');var rounds=DATA.rounds;var ri=0;"
    + "function render(){app.innerHTML='';var r=rounds[ri];pts('Round '+(ri+1)+'/'+rounds.length);setBar(ri/rounds.length*100);"
    + "var qc=document.createElement('div');qc.className='card';qc.style.textAlign='center';qc.innerHTML='<b>'+r.prompt+'</b>';app.appendChild(qc);"
    + "var slots=document.createElement('div');slots.style.cssText='display:flex;flex-direction:column;gap:6px;margin:10px 0';var n=r.items.length;var next=0;var slotEls=[];for(var s=0;s<n;s++){var se=document.createElement('div');se.className='slot';se.innerHTML='<span>'+(s+1)+'.</span><span></span>';slots.appendChild(se);slotEls.push(se);}app.appendChild(slots);"
    + "var pool=document.createElement('div');pool.className='row';shuffle(r.items.slice()).forEach(function(it){var b=document.createElement('button');b.className='btn';b.textContent=it;b.onclick=function(){if(b.dataset.done)return;if(it===r.items[next]){b.dataset.done='1';b.classList.add('ok');b.disabled=true;var se=slotEls[next];se.classList.add('filled');se.querySelectorAll('span')[1].textContent=it;next++;if(next===n){setTimeout(nextRound,700);}}else{b.classList.add('no');setTimeout(function(){b.classList.remove('no');},450);}};pool.appendChild(b);});app.appendChild(pool);}"
    + "function nextRound(){ri++;if(ri>=rounds.length){endGame(100,'You ordered them all! 🎉');}else{setTimeout(render,500);}}$('hint').textContent='Tap the items in the correct order, from first to last.';render();";
  return page((c as { title?: string }).title || "Put It In Order", c, script, "wheel", "🔢 PUT IT IN ORDER");
}

// ── 9) CATEGORIZE (sort items into the right groups) ─────────────────────────
function buildCategorize(c: unknown): string {
  const script = "var app=$('app');var cats=DATA.categories;var items=DATA.items.slice();var total=items.length,placed=0;pts('0 / '+total);"
    + "var zwrap=document.createElement('div');zwrap.style.cssText='display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap';var zones={};cats.forEach(function(cat){var z=document.createElement('div');z.style.cssText='flex:1;min-width:120px;border:3px dashed #cdc7b8;border-radius:16px;padding:8px;min-height:120px;display:flex;flex-direction:column;gap:6px';var h=document.createElement('div');h.textContent=cat;h.style.cssText='font-weight:800;text-align:center;color:#4F46E5';z.appendChild(h);z.onclick=function(){place(cat,z);};zones[cat]=z;zwrap.appendChild(z);});app.appendChild(zwrap);"
    + "var pool=document.createElement('div');pool.className='row';var sel=null;shuffle(items).forEach(function(it){var b=document.createElement('button');b.className='opt';b.style.width='auto';b.textContent=it.text;b.__cat=it.category;b.onclick=function(){if(b.dataset.done)return;[].slice.call(pool.querySelectorAll('.opt')).forEach(function(x){x.style.outline='';});b.style.outline='3px solid #4F46E5';sel=b;};pool.appendChild(b);});app.appendChild(pool);"
    + "function place(cat,z){if(!sel)return;if(sel.__cat===cat){sel.dataset.done='1';sel.classList.add('correct');sel.style.outline='';sel.disabled=true;z.appendChild(sel);burst(sel,'balloon');placed++;pts(placed+' / '+total);setBar(placed/total*100);sel=null;if(placed===total)setTimeout(function(){endGame(100,'You sorted them all! 🎉');},550);}else{z.style.animation='sh .4s';setTimeout(function(){z.style.animation='';},450);sel.style.outline='';sel=null;}}"
    + "$('hint').textContent='Tap an item, then tap the group it belongs to.';";
  return page((c as { title?: string }).title || "Sort It Out", c, script, "bingo", "🗂️ SORT IT OUT");
}

// ── Sample content per band (seeds the demo library) ─────────────────────────
type Sample = { title: string; instructions: string; content: unknown };

function sampleJeopardy(band: Band): Sample {
  if (band === "35") return { title: "Review Jeopardy, Grade 4", instructions: "Pick a category and point value. Read the clue aloud, agree on an answer, then reveal it and score yourselves.", content: { title: "Grade 4 Review Jeopardy", categories: [
    { name: "Math", clues: [{ value: 100, clue: "6 × 7", answer: "42", options: ["42", "36", "48", "54"] }, { value: 200, clue: "The name for the answer to a division problem", answer: "Quotient", options: ["Quotient", "Product", "Sum", "Remainder"] }, { value: 300, clue: "¾ written as a decimal", answer: "0.75", options: ["0.75", "0.34", "0.5", "0.43"] }] },
    { name: "Science", clues: [{ value: 100, clue: "The gas plants breathe in", answer: "Carbon dioxide", options: ["Carbon dioxide", "Oxygen", "Nitrogen", "Helium"] }, { value: 200, clue: "Water changing to gas", answer: "Evaporation", options: ["Evaporation", "Condensation", "Freezing", "Melting"] }, { value: 300, clue: "The center of our solar system", answer: "The Sun", options: ["The Sun", "The Earth", "The Moon", "Jupiter"] }] },
    { name: "Reading", clues: [{ value: 100, clue: "What the whole story is mostly about", answer: "The main idea", options: ["The main idea", "A small detail", "The title", "A synonym"] }, { value: 200, clue: "A word that means the same as another", answer: "A synonym", options: ["A synonym", "An antonym", "A rhyme", "A syllable"] }, { value: 300, clue: "Words near an unknown word that hint at its meaning", answer: "Context clues", options: ["Context clues", "The glossary", "The index", "The title"] }] },
  ] } };
  if (band === "912") return { title: "Unit Review Jeopardy, HS", instructions: "Teams choose a value, discuss, and lock an answer before revealing. Track points on the board.", content: { title: "High School Unit Review", categories: [
    { name: "Biology", clues: [{ value: 200, clue: "The powerhouse of the cell", answer: "Mitochondria", options: ["Mitochondria", "Nucleus", "Ribosome", "Chloroplast"] }, { value: 400, clue: "The process plants use to make food from light", answer: "Photosynthesis", options: ["Photosynthesis", "Respiration", "Digestion", "Fermentation"] }, { value: 600, clue: "Molecule that carries genetic instructions", answer: "DNA", options: ["DNA", "RNA", "ATP", "Protein"] }] },
    { name: "Algebra", clues: [{ value: 200, clue: "Slope of y = 3x + 2", answer: "3", options: ["3", "2", "-3", "1/3"] }, { value: 400, clue: "Solve: 2x − 4 = 10", answer: "x = 7", options: ["x = 7", "x = 3", "x = 5", "x = 14"] }, { value: 600, clue: "The quadratic formula solves equations of this form", answer: "ax² + bx + c = 0", options: ["ax² + bx + c = 0", "y = mx + b", "a² + b² = c²", "x + y = 0"] }] },
    { name: "US History", clues: [{ value: 200, clue: "Year the Declaration of Independence was signed", answer: "1776", options: ["1776", "1492", "1812", "1865"] }, { value: 400, clue: "First 10 amendments to the Constitution", answer: "The Bill of Rights", options: ["The Bill of Rights", "The Preamble", "The Articles of Confederation", "The Federalist Papers"] }, { value: 600, clue: "President during the Civil War", answer: "Abraham Lincoln", options: ["Abraham Lincoln", "George Washington", "Thomas Jefferson", "Ulysses S. Grant"] }] },
  ] } };
  return { title: "Unit Review Jeopardy, Middle School", instructions: "Pick a value, read the clue, discuss as a team, then reveal and score.", content: { title: "Middle School Review", categories: [
    { name: "Life Science", clues: [{ value: 100, clue: "Organelle that makes energy in a cell", answer: "Mitochondria", options: ["Mitochondria", "Nucleus", "Cell wall", "Vacuole"] }, { value: 200, clue: "Flow of energy: producers → consumers →", answer: "Decomposers", options: ["Decomposers", "Predators", "Producers", "The sun"] }, { value: 300, clue: "The process of cell division for growth", answer: "Mitosis", options: ["Mitosis", "Meiosis", "Osmosis", "Digestion"] }] },
    { name: "Pre-Algebra", clues: [{ value: 100, clue: "−5 + 8", answer: "3", options: ["3", "-3", "13", "-13"] }, { value: 200, clue: "The value of x in x/4 = 5", answer: "20", options: ["20", "9", "1.25", "1"] }, { value: 300, clue: "20% of 60", answer: "12", options: ["12", "6", "30", "120"] }] },
    { name: "Geography", clues: [{ value: 100, clue: "Largest ocean on Earth", answer: "Pacific", options: ["Pacific", "Atlantic", "Indian", "Arctic"] }, { value: 200, clue: "The imaginary line at 0° latitude", answer: "The Equator", options: ["The Equator", "The Prime Meridian", "The Tropic of Cancer", "The Axis"] }, { value: 300, clue: "Continent the Sahara Desert is on", answer: "Africa", options: ["Africa", "Asia", "Australia", "South America"] }] },
  ] } };
}

function sampleFeud(band: Band): Sample {
  const base = band === "912"
    ? { title: "Class Survey Feud, HS", rounds: [
        { question: "Name a renewable energy source.", answers: [{ text: "Solar", points: 40 }, { text: "Wind", points: 30 }, { text: "Hydro", points: 18 }, { text: "Geothermal", points: 12 }], distractors: ["Coal", "Gasoline"] },
        { question: "Name a branch of the US government.", answers: [{ text: "Legislative", points: 45 }, { text: "Executive", points: 35 }, { text: "Judicial", points: 20 }], distractors: ["Military", "Federal"] },
      ] }
    : band === "68"
    ? { title: "Class Survey Feud, Middle", rounds: [
        { question: "Name a state of matter.", answers: [{ text: "Solid", points: 40 }, { text: "Liquid", points: 33 }, { text: "Gas", points: 20 }, { text: "Plasma", points: 7 }], distractors: ["Metal", "Ice cube"] },
        { question: "Name a part of a plant cell.", answers: [{ text: "Cell wall", points: 38 }, { text: "Chloroplast", points: 30 }, { text: "Nucleus", points: 22 }, { text: "Vacuole", points: 10 }], distractors: ["Lungs", "Engine"] },
      ] }
    : { title: "Class Survey Feud, Grade 5", rounds: [
        { question: "Name a planet in our solar system.", answers: [{ text: "Earth", points: 35 }, { text: "Mars", points: 28 }, { text: "Jupiter", points: 22 }, { text: "Saturn", points: 15 }], distractors: ["The Moon", "The Sun"] },
        { question: "Name a punctuation mark.", answers: [{ text: "Period", points: 40 }, { text: "Comma", points: 30 }, { text: "Question mark", points: 20 }, { text: "Exclamation point", points: 10 }], distractors: ["Letter", "Number"] },
      ] };
  return { title: base.title, instructions: "Read the survey question. Tap answers you think were most popular, three misses ends the round. Reveal all the data at the end.", content: base };
}

function sampleBingo(band: Band): Sample {
  if (band === "k2") return { title: "Sight-Word Bingo, K–2", instructions: "Tap ‘Next call’ to hear a word, then tap it on your card. Fill a whole line, across, down, or corner-to-corner, to win!", content: { title: "Sight-Word Bingo", size: 4, pool: ["the", "and", "is", "to", "you", "was", "for", "are", "with", "his", "they", "at", "be", "this", "have", "from", "one", "had", "not", "but"] } };
  return { title: "Multiplication Bingo, Grade 3–5", instructions: "Tap ‘Next call’ to hear a product, then tap that number on your card. Get a full line to win!", content: { title: "Products Bingo", size: 5, pool: ["12", "16", "18", "20", "24", "28", "30", "36", "42", "48", "54", "56", "63", "64", "72", "81", "6", "9", "15", "25", "35", "40", "45", "49", "27", "32"] } };
}

function samplePassword(band: Band): Sample {
  const content = band === "68"
    ? { title: "Vocabulary Password, Middle", items: [
        { answer: "Photosynthesis", clues: ["Plants do it", "It uses sunlight", "It makes glucose and oxygen"], options: ["Respiration", "Photosynthesis", "Digestion", "Evaporation"] },
        { answer: "Democracy", clues: ["A type of government", "People have a say", "They vote for leaders"], options: ["Monarchy", "Dictatorship", "Democracy", "Anarchy"] },
        { answer: "Hypothesis", clues: ["Used in science", "An educated guess", "You test it with an experiment"], options: ["Conclusion", "Hypothesis", "Variable", "Theory"] },
      ] }
    : { title: "Vocabulary Password, Grade 4", items: [
        { answer: "Habitat", clues: ["A place", "Animals live there", "It has food, water, and shelter"], options: ["Habitat", "Weather", "Forest fire", "Migration"] },
        { answer: "Fraction", clues: ["A math word", "It is part of a whole", "It has a top and bottom number"], options: ["Fraction", "Angle", "Sum", "Pattern"] },
        { answer: "Predict", clues: ["Something readers do", "It means to guess what happens next", "You use clues from the story"], options: ["Predict", "Summarize", "Rhyme", "Whisper"] },
      ] };
  return { title: content.title, instructions: "Read the first clue and guess the word. Stuck? Reveal another clue, but the fewer you use, the more points you earn.", content };
}

function sampleWheel(band: Band): Sample {
  if (band === "k2") return { title: "Guess the Word, K–2", instructions: "Tap letters to fill in the mystery word. Use the hint, and tap ‘Hear it’ to sound it out!", content: { title: "Guess the Word", puzzles: [
    { phrase: "SUN", hint: "It is bright and up in the sky in the day", say: "sun" },
    { phrase: "FROG", hint: "A green animal that hops and says ribbit", say: "frog" },
    { phrase: "APPLE", hint: "A red or green fruit that is crunchy", say: "apple" },
  ] } };
  return { title: "Mystery Phrase, Grade 3–5", instructions: "Reveal the hidden phrase by guessing letters. Fewer wrong guesses means more points!", content: { title: "Mystery Phrase", puzzles: [
    { phrase: "MAIN IDEA", hint: "What a whole text is mostly about" },
    { phrase: "WATER CYCLE", hint: "Evaporation, condensation, precipitation…" },
    { phrase: "UNITED STATES", hint: "The country whose capital is Washington, D.C." },
  ] } };
}

function sampleEscape(band: Band): Sample {
  if (band === "912") return { title: "Escape the Lab, HS Review", instructions: "Solve each lock in order using what you know. Enter the code or pick the answer to open the next lock and escape.", content: { intro: "The lab door is locked. Solve each puzzle to escape!", stages: [
    { prompt: "Balance it: 2 H₂ + O₂ → ? H₂O. Enter the coefficient.", answer: "2", hint: "Count hydrogen atoms on the left." },
    { prompt: "Solve for x: 3x − 9 = 18.", answer: "9", hint: "Add 9, then divide by 3." },
    { prompt: "Which branch of government can declare a law unconstitutional?", answer: "Judicial", choices: ["Legislative", "Executive", "Judicial"], hint: "Think of the Supreme Court." },
  ] } };
  if (band === "68") return { title: "Escape the Island, Middle Review", instructions: "Work through each lock in order. Use the hint if you’re stuck, but it costs points.", content: { intro: "You’re stranded! Solve each lock to signal for rescue.", stages: [
    { prompt: "A recipe needs 3 cups for 4 people. How many cups for 8 people?", answer: "6", hint: "Double everything." },
    { prompt: "What is the powerhouse of the cell?", answer: "Mitochondria", choices: ["Nucleus", "Mitochondria", "Ribosome"], hint: "It makes energy." },
    { prompt: "Unscramble this landform: T-A-N-M-O-U-N-I", answer: "Mountain", hint: "It’s very tall." },
  ] } };
  return { title: "Escape the Treehouse, Grade 4", instructions: "Open each lock in order. Enter the answer or pick the right choice. Use a hint only if you need it.", content: { intro: "The treehouse ladder is locked! Solve each puzzle to climb down.", stages: [
    { prompt: "What is 8 × 4?", answer: "32", hint: "8, 16, 24, …" },
    { prompt: "Which word is a synonym for ‘happy’?", answer: "Joyful", choices: ["Angry", "Joyful", "Tired"], hint: "It means very glad." },
    { prompt: "How many sides does a hexagon have?", answer: "6", hint: "‘Hex’ means six." },
  ] } };
}

function sampleMillionaire(band: Band): Sample {
  const c = band === "912"
    ? { title: "Science Millionaire, HS", questions: [
        { q: "The powerhouse of the cell is the…", options: ["Mitochondria", "Nucleus", "Ribosome", "Vacuole"], answer: 0, value: 100 },
        { q: "Water's chemical formula is…", options: ["CO₂", "H₂O", "O₂", "NaCl"], answer: 1, value: 200 },
        { q: "The process plants use to make food is…", options: ["Respiration", "Digestion", "Photosynthesis", "Fermentation"], answer: 2, value: 300 },
        { q: "Force = mass × …", options: ["velocity", "acceleration", "distance", "energy"], answer: 1, value: 500 },
        { q: "The pH of a neutral solution is…", options: ["0", "7", "14", "1"], answer: 1, value: 800 },
        { q: "DNA is shaped like a…", options: ["Single line", "Double helix", "Circle", "Square"], answer: 1, value: 1000 },
      ] }
    : band === "68"
    ? { title: "Review Millionaire, Middle", questions: [
        { q: "6 × 7 =", options: ["42", "36", "48", "54"], answer: 0, value: 100 },
        { q: "The gas plants release is…", options: ["Carbon dioxide", "Oxygen", "Nitrogen", "Helium"], answer: 1, value: 200 },
        { q: "A synonym for 'happy' is…", options: ["Sad", "Joyful", "Angry", "Tired"], answer: 1, value: 300 },
        { q: "20% of 50 is…", options: ["5", "10", "20", "25"], answer: 1, value: 500 },
        { q: "The largest ocean is the…", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2, value: 800 },
        { q: "Which is a prime number?", options: ["9", "15", "21", "13"], answer: 3, value: 1000 },
      ] }
    : { title: "Review Millionaire, Grade 4", questions: [
        { q: "5 + 8 =", options: ["12", "13", "14", "15"], answer: 1, value: 100 },
        { q: "How many days are in a week?", options: ["5", "6", "7", "8"], answer: 2, value: 200 },
        { q: "A baby dog is called a…", options: ["Kitten", "Puppy", "Cub", "Calf"], answer: 1, value: 300 },
        { q: "3 × 4 =", options: ["7", "12", "10", "9"], answer: 1, value: 500 },
        { q: "Which animal is a mammal?", options: ["Shark", "Frog", "Whale", "Eagle"], answer: 2, value: 800 },
        { q: "How many sides does a triangle have?", options: ["2", "3", "4", "5"], answer: 1, value: 1000 },
      ] };
  return { title: c.title, instructions: "Answer each question to climb the money ladder. Use your one 50:50 wisely, a wrong answer banks what you've already won.", content: c };
}

function sampleSequence(band: Band): Sample {
  const c = band === "k2"
    ? { title: "Put It In Order, K–2", rounds: [
        { prompt: "Put the numbers in order, smallest first", items: ["1", "2", "3", "4", "5"] },
        { prompt: "Order the life of a butterfly", items: ["Egg", "Caterpillar", "Chrysalis", "Butterfly"] },
        { prompt: "Order your morning", items: ["Wake up", "Brush teeth", "Eat breakfast", "Go to school"] },
      ] }
    : band === "68"
    ? { title: "Put It In Order, Middle", rounds: [
        { prompt: "Order the steps of the scientific method", items: ["Ask a question", "Form a hypothesis", "Do an experiment", "Analyze results", "Draw a conclusion"] },
        { prompt: "Order these planets from the Sun outward", items: ["Mercury", "Venus", "Earth", "Mars"] },
        { prompt: "Order these numbers from least to greatest", items: ["-3", "0", "2", "5", "9"] },
      ] }
    : { title: "Put It In Order, Grade 3–5", rounds: [
        { prompt: "Order the water cycle", items: ["Evaporation", "Condensation", "Precipitation", "Collection"] },
        { prompt: "Order these from smallest to largest", items: ["Ant", "Cat", "Horse", "Elephant"] },
        { prompt: "Order the numbers from least to greatest", items: ["12", "19", "24", "31"] },
      ] };
  return { title: c.title, instructions: "Tap the items in the correct order, from first to last. Wrong taps just bounce back, keep trying!", content: c };
}

function sampleCategorize(band: Band): Sample {
  const c = band === "k2"
    ? { title: "Sort It Out, K–2", categories: ["Animals", "Not Animals"], items: [
        { text: "Dog", category: "Animals" }, { text: "Cat", category: "Animals" }, { text: "Fish", category: "Animals" }, { text: "Rock", category: "Not Animals" }, { text: "Chair", category: "Not Animals" }, { text: "Cup", category: "Not Animals" }] }
    : band === "68"
    ? { title: "States of Matter, Middle", categories: ["Solid", "Liquid", "Gas"], items: [
        { text: "Ice", category: "Solid" }, { text: "Rock", category: "Solid" }, { text: "Water", category: "Liquid" }, { text: "Milk", category: "Liquid" }, { text: "Steam", category: "Gas" }, { text: "Air", category: "Gas" }, { text: "Wood", category: "Solid" }, { text: "Juice", category: "Liquid" }] }
    : band === "912"
    ? { title: "Energy Sources, HS", categories: ["Renewable", "Nonrenewable"], items: [
        { text: "Solar", category: "Renewable" }, { text: "Wind", category: "Renewable" }, { text: "Hydro", category: "Renewable" }, { text: "Coal", category: "Nonrenewable" }, { text: "Oil", category: "Nonrenewable" }, { text: "Natural gas", category: "Nonrenewable" }, { text: "Geothermal", category: "Renewable" }] }
    : { title: "Living or Nonliving, Grade 3–5", categories: ["Living", "Nonliving"], items: [
        { text: "Tree", category: "Living" }, { text: "Dog", category: "Living" }, { text: "Flower", category: "Living" }, { text: "Rock", category: "Nonliving" }, { text: "Water", category: "Nonliving" }, { text: "Toy car", category: "Nonliving" }, { text: "Bird", category: "Living" }] };
  return { title: c.title, instructions: "Tap an item, then tap the group it belongs in. Sort them all to win!", content: c };
}

// ── Registry (the repository catalog of built templates) ─────────────────────
export interface GameTemplate {
  key: string;
  name: string;
  blurb: string;
  bands: Band[];
  build: (content: unknown) => string;
  sample: (band: Band) => Sample;
  // For the AI generator: the exact JSON shape the model must return, and a shape-check so a malformed
  // generation never reaches the renderer.
  schemaHint: string;
  validate: (content: unknown) => boolean;
}

// Small shape helpers for the validators below.
const arr = (x: unknown): x is unknown[] => Array.isArray(x) && x.length > 0;
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

const SCHEMA: Record<string, { hint: string; validate: (c: unknown) => boolean }> = {
  jeopardy: {
    hint: '{"title":"short title","categories":[{"name":"Category","clues":[{"value":100,"clue":"the clue/prompt","answer":"the answer","options":["the answer","distractor","distractor","distractor"]}]}]}, exactly 3 categories, each with 3 clues at values 100, 200, 300 (rising difficulty). Keep answers short. Every clue is answered by MULTIPLE CHOICE, so "options" is REQUIRED: 3–4 plausible choices that MUST include the exact "answer" string verbatim.',
    validate: (c) => obj(c) && arr(c.categories) && c.categories.every((cat) => obj(cat) && str(cat.name) && arr(cat.clues) && cat.clues.every((q) => obj(q) && typeof q.value === "number" && str(q.clue) && str(q.answer) && arr(q.options) && (q.options as unknown[]).some((o) => str(o) && (o as string).toLowerCase() === (q.answer as string).toLowerCase()))),
  },
  feud: {
    hint: '{"title":"short title","rounds":[{"question":"Name a…","answers":[{"text":"answer","points":40}],"distractors":["wrong but plausible"]}]}, 2 rounds; each round has 4 answers whose points sum to about 100 (most popular = highest), plus 2 distractors.',
    validate: (c) => obj(c) && arr(c.rounds) && c.rounds.every((r) => obj(r) && str(r.question) && arr(r.answers) && r.answers.every((a) => obj(a) && str(a.text) && typeof a.points === "number")),
  },
  bingo: {
    hint: '{"title":"short title","size":5,"pool":["term or number", "…"]}, pool of at least 24 short items (facts, vocabulary, or numbers) that a teacher can call out.',
    validate: (c) => obj(c) && Array.isArray(c.pool) && (c.pool as unknown[]).length >= 16 && (c.pool as unknown[]).every((x) => str(x) || typeof x === "number"),
  },
  password: {
    hint: '{"title":"short title","items":[{"answer":"the word","clues":["clue 1 (broad)","clue 2","clue 3 (specific)"],"options":["the word","distractor","distractor","distractor"]}]}, 5 items; options MUST include the exact answer plus 3 distractors.',
    validate: (c) => obj(c) && arr(c.items) && c.items.every((it) => obj(it) && str(it.answer) && arr(it.clues) && arr(it.options) && (it.options as unknown[]).some((o) => str(o) && (o as string).toLowerCase() === (it.answer as string).toLowerCase())),
  },
  wheel: {
    hint: '{"title":"short title","puzzles":[{"phrase":"KEY PHRASE","hint":"a clue to the phrase"}]}, 3 puzzles; phrases are short key terms/phrases (letters, spaces, and digits only).',
    validate: (c) => obj(c) && arr(c.puzzles) && c.puzzles.every((p) => obj(p) && str(p.phrase)),
  },
  escape: {
    hint: '{"intro":"one-line story setup","stages":[{"prompt":"the puzzle/question","answer":"the exact answer or code","hint":"a helpful hint","choices":["optional multiple-choice options incl. the answer"]}]}, 3 stages in order; include "choices" only when it should be multiple-choice, otherwise the student types the answer.',
    validate: (c) => obj(c) && arr(c.stages) && c.stages.every((s) => obj(s) && str(s.prompt) && (str(s.answer) || typeof s.answer === "number")),
  },
  millionaire: {
    hint: '{"title":"short title","questions":[{"q":"question","options":["correct answer","distractor","distractor","distractor"],"answer":0,"value":100}]}, 6 questions RISING in difficulty; 3-4 options each; "answer" is the index (0-based) of the correct option; "value" rises down the ladder (100, 200, 300, …).',
    validate: (c) => obj(c) && arr(c.questions) && c.questions.every((q) => obj(q) && str(q.q) && arr(q.options) && typeof q.answer === "number" && q.answer >= 0 && q.answer < (q.options as unknown[]).length),
  },
  sequence: {
    hint: '{"title":"short title","rounds":[{"prompt":"Put these in order from first to last","items":["first","second","third","fourth"]}]}, 3 rounds; each "items" list is 3-5 things written IN THE CORRECT ORDER (the game shuffles them for the learner).',
    validate: (c) => obj(c) && arr(c.rounds) && c.rounds.every((r) => obj(r) && str(r.prompt) && arr(r.items) && (r.items as unknown[]).length >= 2 && (r.items as unknown[]).every(str)),
  },
  categorize: {
    hint: '{"title":"short title","categories":["Group A","Group B"],"items":[{"text":"a thing","category":"Group A"}]}, 2-3 categories and 6-9 items; each item.category MUST exactly match one of the categories.',
    validate: (c) => { if (!obj(c) || !arr(c.categories) || !arr(c.items)) return false; const names = (c.categories as unknown[]).map(String); return (c.items as unknown[]).every((it) => obj(it) && str(it.text) && names.indexOf(String(it.category)) >= 0); },
  },
};

export const GAME_TEMPLATES: GameTemplate[] = [
  { key: "jeopardy", name: "Jeopardy", blurb: "Category board with point values, the classic content-review show. Great for whole-class team review.", bands: ["35", "68", "912"], build: buildJeopardy, sample: sampleJeopardy, schemaHint: SCHEMA.jeopardy.hint, validate: SCHEMA.jeopardy.validate },
  { key: "feud", name: "Family Feud", blurb: "Class-survey guessing game, reveals ranked answers as a live data lesson.", bands: ["35", "68", "912"], build: buildFeud, sample: sampleFeud, schemaHint: SCHEMA.feud.hint, validate: SCHEMA.feud.validate },
  { key: "bingo", name: "Bingo", blurb: "Caller-and-card recognition game for numbers, letters, sight words, or facts. Read-aloud built in.", bands: ["k2", "35"], build: buildBingo, sample: sampleBingo, schemaHint: SCHEMA.bingo.hint, validate: SCHEMA.bingo.validate },
  { key: "password", name: "Password / Taboo", blurb: "Clue-by-clue vocabulary guessing, fewer clues used means more points.", bands: ["35", "68"], build: buildPassword, sample: samplePassword, schemaHint: SCHEMA.password.hint, validate: SCHEMA.password.validate },
  { key: "wheel", name: "Wheel / Guess the Word", blurb: "Letter-reveal puzzle (Wheel of Fortune + ‘Guess the Sound’) for words and key phrases.", bands: ["k2", "35"], build: buildWheel, sample: sampleWheel, schemaHint: SCHEMA.wheel.hint, validate: SCHEMA.wheel.validate },
  { key: "escape", name: "Escape Room", blurb: "Sequential locked puzzles, solve each to unlock the next. Strong for multi-step review.", bands: ["35", "68", "912"], build: buildEscape, sample: sampleEscape, schemaHint: SCHEMA.escape.hint, validate: SCHEMA.escape.validate },
  { key: "millionaire", name: "Millionaire", blurb: "Climb a money ladder of rising-difficulty questions, with a 50:50 lifeline. Tense whole-class review.", bands: ["35", "68", "912"], build: buildMillionaire, sample: sampleMillionaire, schemaHint: SCHEMA.millionaire.hint, validate: SCHEMA.millionaire.validate },
  { key: "sequence", name: "Put It In Order", blurb: "Tap items into the correct order, steps, events, sizes, timelines, number order.", bands: ["k2", "35", "68"], build: buildSequence, sample: sampleSequence, schemaHint: SCHEMA.sequence.hint, validate: SCHEMA.sequence.validate },
  { key: "categorize", name: "Sort It Out", blurb: "Sort items into the right groups, classify and categorize into 2–3 buckets.", bands: ["k2", "35", "68", "912"], build: buildCategorize, sample: sampleCategorize, schemaHint: SCHEMA.categorize.hint, validate: SCHEMA.categorize.validate },
];

export function templateByKey(key: string): GameTemplate | undefined {
  return GAME_TEMPLATES.find((t) => t.key === key);
}

// ── Curated catalog of commercial digital titles (linked, not rebuilt) ───────
export interface CatalogTool { name: string; url: string; subjects: string; note: string; bands: Band[] }
export const DIGITAL_CATALOG: CatalogTool[] = [
  { name: "Teach Your Monster to Read", url: "https://www.teachyourmonstertoread.com", subjects: "Early reading / phonics", note: "Free phonics adventure for emerging readers.", bands: ["k2"] },
  { name: "ABCmouse", url: "https://www.abcmouse.com", subjects: "Early literacy & numeracy", note: "Structured pre-K–2 learning path.", bands: ["k2"] },
  { name: "Prodigy Math", url: "https://www.prodigygame.com", subjects: "Math", note: "Adaptive, standards-aligned math RPG.", bands: ["k2", "35", "68"] },
  { name: "Osmo", url: "https://www.playosmo.com", subjects: "Tangible-to-screen play", note: "Hands-on manipulatives that read into the screen.", bands: ["k2", "35"] },
  { name: "Blooket", url: "https://www.blooket.com", subjects: "Any (review)", note: "Game-mode quiz platform; untimed modes give better learning data.", bands: ["35", "68", "912"] },
  { name: "Kahoot", url: "https://kahoot.com", subjects: "Any (review)", note: "Live quiz show; prefer untimed for deliberate thinkers.", bands: ["35", "68", "912"] },
  { name: "Gimkit", url: "https://www.gimkit.com", subjects: "Any (review)", note: "Quiz game with in-game economy; solo and team modes.", bands: ["35", "68", "912"] },
  { name: "Quizizz", url: "https://quizizz.com", subjects: "Any (review)", note: "Self-paced or live quiz game with reports.", bands: ["35", "68", "912"] },
  { name: "Scratch", url: "https://scratch.mit.edu", subjects: "Coding / make-your-own-game", note: "Block-based programming; students build their own games.", bands: ["35", "68"] },
  { name: "Zoombinis", url: "https://www.terc.edu/zoombinis/", subjects: "Logic / algorithmic thinking", note: "Deductive-reasoning puzzle classic.", bands: ["35", "68"] },
  { name: "Minecraft Education", url: "https://education.minecraft.net", subjects: "STEM, systems, chemistry", note: "Sandbox for city planning, chemistry, collaboration.", bands: ["35", "68", "912"] },
  { name: "iCivics", url: "https://www.icivics.org", subjects: "Civics / government", note: "Free civics games and simulations.", bands: ["68", "912"] },
  { name: "Kerbal Space Program", url: "https://www.kerbalspaceprogram.com", subjects: "Physics", note: "Orbital mechanics and engineering through play.", bands: ["68", "912"] },
  { name: "Portal 2", url: "https://www.thinkwithportals.com", subjects: "Spatial reasoning / physics", note: "Puzzle game with a free education version and level editor.", bands: ["68", "912"] },
  { name: "Civilization VI", url: "https://civilization.com", subjects: "History / systems", note: "Resource tradeoffs and historical cause-and-effect.", bands: ["912"] },
  { name: "Papers, Please", url: "https://papersplea.se", subjects: "Ethics / policy (mature)", note: "Immigration-policy ethics; preview for age-appropriateness.", bands: ["912"] },
  { name: "Foldit", url: "https://fold.it", subjects: "Biochemistry (citizen science)", note: "Real protein-folding puzzles contributing to research.", bands: ["912"] },
  { name: "CodeCombat", url: "https://codecombat.com", subjects: "Programming", note: "Learn to code by playing an adventure game.", bands: ["68", "912"] },
];
