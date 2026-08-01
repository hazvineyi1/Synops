/**
 * Reusable K-12 "game-show" activity templates.
 *
 * Each template is a pure function that turns CONTENT (categories, questions, word lists…) into a
 * single self-contained, sandboxed HTML activity — the same contract the module quiz engine uses:
 * it posts `{ type:'activity_result', score }` to its parent when finished, so it plugs straight into
 * the existing ActivityPlayer and submission flow with zero new wiring.
 *
 * The mechanic that transfers across every band is *turn-taking with visible stakes*, so these are
 * built for solo self-play AND whole-class projected play (a teacher drives one screen, learners take
 * turns). They are content-parameterized, so ONE template serves many grade levels with different
 * content. Networked team/breakout play (shared live leaderboard, chat-buzzer) is deliberately left to
 * a later phase — it needs realtime session infrastructure this single-service stack doesn't have yet.
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
  + ".bcell.mark{background:#e9f7ee;border-color:var(--ok);color:var(--ok)}.bcell.free{background:#eef0fb;border-color:var(--indigo);color:var(--indigo)}.blank{display:inline-block;min-width:22px;border-bottom:3px solid var(--ink);margin:0 2px;text-align:center;font-weight:800;font-size:1.4rem}";

const COMMON = "function $(i){return document.getElementById(i);}"
  + "function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}"
  + "function report(s){try{parent.postMessage({type:'activity_result',score:Math.round(s),payload:{}},'*');}catch(e){}}"
  + "function setBar(p){var f=$('f');if(f)f.style.width=Math.max(0,Math.min(100,Math.round(p)))+'%';}"
  + "function pts(n){var s=$('stars');if(s)s.textContent=n;}"
  + "function speak(t){try{if('speechSynthesis'in window){window.speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.rate=.95;window.speechSynthesis.speak(u);}}catch(e){}}"
  + "function confetti(){for(var i=0;i<36;i++){var s=document.createElement('span');s.className='cf';s.style.left=(Math.random()*100)+'vw';s.style.animationDuration=(1.6+Math.random()*1.5)+'s';s.style.animationDelay=(Math.random()*.4)+'s';s.textContent=['🎉','⭐','🌟','🎊','✨','🏆'][i%6];document.body.appendChild(s);(function(x){setTimeout(function(){x.remove();},3600);})(s);}}"
  + "function endGame(pct,msg){setBar(100);var d=$('done');if(d){d.innerHTML='🎉 '+(msg||('You scored '+Math.round(pct)+'%'));d.style.display='block';}var h=$('hint');if(h)h.style.display='none';confetti();setTimeout(function(){report(pct);},1300);}";

function page(title: string, data: unknown, script: string): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<style>" + CSS + "</style>"
    + "<h2>" + title + "</h2><div id=\"stars\"></div><div id=\"app\"></div>"
    + "<div class=\"bar\"><div class=\"fill\" id=\"f\"></div></div><p id=\"hint\" class=\"hint\"></p><div id=\"done\" class=\"done\"></div>"
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
    + "$('app').appendChild(board);$('hint').textContent='Tap a point value. Read the clue, then say the answer!';"
    + "function openClue(q,b){if(b.disabled)return;var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:20';"
    + "var p=document.createElement('div');p.className='card';p.style.cssText='max-width:520px;text-align:center';p.innerHTML='<div style=\"font-weight:800;color:#4F46E5;margin-bottom:8px\">'+q.value+' points</div><div style=\"font-size:1.2rem;margin:10px 0 16px\">'+q.clue+'</div>';"
    + "var rev=document.createElement('button');rev.className='btn';rev.textContent='Reveal answer';var ansd=document.createElement('div');ansd.style.margin='12px 0';"
    + "var gb=document.createElement('div');gb.style.cssText='display:none;gap:10px;justify-content:center';rev.onclick=function(){ansd.innerHTML='<b>'+q.answer+'</b>';rev.style.display='none';gb.style.display='flex';};"
    + "var yes=document.createElement('button');yes.className='btn ok';yes.textContent='✓ Got it';var no=document.createElement('button');no.className='btn';no.textContent='✗ Missed';"
    + "function close(win){b.disabled=true;b.classList.add(win?'ok':'no');if(win){got+=q.value;pts(got+' pts');}doneCells++;setBar(doneCells/cells*100);document.body.removeChild(ov);if(doneCells===cells)endGame(got/totalPts*100,'Final score: '+got+' points!');}"
    + "yes.onclick=function(){close(true);};no.onclick=function(){close(false);};gb.appendChild(yes);gb.appendChild(no);p.appendChild(rev);p.appendChild(ansd);p.appendChild(gb);ov.appendChild(p);document.body.appendChild(ov);}";
  return page((c as { title?: string }).title || "Jeopardy", c, script);
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
  return page((c as { title?: string }).title || "Family Feud", c, script);
}

// ── 3) BINGO ─────────────────────────────────────────────────────────────────
function buildBingo(c: unknown): string {
  const script = "var pool=DATA.pool.slice();var size=DATA.size||5;var free=size%2===1;var need=size*size-(free?1:0);"
    + "if(pool.length<need){size=4;free=false;need=16;}var chosen=shuffle(pool).slice(0,need);var grid=[];var k=0;"
    + "for(var i=0;i<size*size;i++){if(free&&i===Math.floor(size*size/2)){grid.push('★');}else{grid.push(chosen[k++]);}}"
    + "var cells=[];var marked=[];var gEl=document.createElement('div');gEl.className='grid';gEl.style.gridTemplateColumns='repeat('+size+',1fr)';gEl.style.maxWidth='420px';gEl.style.margin='0 auto';"
    + "grid.forEach(function(v,i){var b=document.createElement('button');b.className='bcell'+(v==='★'?' free':'');b.textContent=v;marked[i]=(v==='★');if(v==='★')b.classList.add('mark');b.onclick=function(){if(v===current||v==='★'){b.classList.add('mark');marked[i]=true;checkWin();}};cells.push(b);gEl.appendChild(b);});"
    + "var wrap=document.createElement('div');wrap.appendChild(gEl);var callBox=document.createElement('div');callBox.style.cssText='text-align:center;margin:14px 0';callBox.innerHTML='<div id=\"call\" style=\"font-size:1.6rem;font-weight:800;color:#4F46E5;min-height:40px\">—</div>';"
    + "var nb=document.createElement('button');nb.className='btn';nb.textContent='📢 Next call';var order=shuffle(chosen.slice());var ci=-1;var current=null;"
    + "nb.onclick=function(){ci++;if(ci>=order.length){nb.disabled=true;return;}current=order[ci];$('call').textContent=current;speak(String(current));setBar(ci/order.length*70);};callBox.appendChild(nb);"
    + "$('app').appendChild(callBox);$('app').appendChild(wrap);$('hint').textContent='Tap \"Next call\", then tap that square if it is on your card. Get a full line to win!';var won=false;"
    + "function line(idx){return idx.every(function(i){return marked[i];});}function checkWin(){if(won)return;var w=false;var n=size;"
    + "for(var r=0;r<n;r++){var row=[];for(var col=0;col<n;col++)row.push(r*n+col);if(line(row))w=true;}"
    + "for(var col2=0;col2<n;col2++){var cl=[];for(var r2=0;r2<n;r2++)cl.push(r2*n+col2);if(line(cl))w=true;}"
    + "var d1=[],d2=[];for(var d=0;d<n;d++){d1.push(d*n+d);d2.push(d*n+(n-1-d));}if(line(d1)||line(d2))w=true;"
    + "if(w){won=true;endGame(100,'BINGO! 🎉');}}";
  return page((c as { title?: string }).title || "Bingo", c, script);
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
  return page((c as { title?: string }).title || "Password", c, script);
}

// ── 5) WHEEL / LETTER-REVEAL (Wheel of Fortune + Guess the Sound) ─────────────
function buildWheel(c: unknown): string {
  const script = "var puzzles=DATA.puzzles;var pi=0,score=0,possible=puzzles.length*100;"
    + "function render(){var pz=puzzles[pi];$('app').innerHTML='';pts('Puzzle '+(pi+1)+'/'+puzzles.length);setBar(pi/puzzles.length*100);var wrong=0;var phrase=pz.phrase.toUpperCase();var revealed={};"
    + "var hintc=document.createElement('div');hintc.className='card';hintc.style.textAlign='center';hintc.innerHTML='<span style=\"font-weight:800;color:#4F46E5\">Hint:</span> '+(pz.hint||'—');"
    + "if(pz.say){var sb=document.createElement('button');sb.className='btn';sb.style.marginLeft='8px';sb.textContent='🔊 Hear it';sb.onclick=function(){speak(pz.say);};hintc.appendChild(sb);}$('app').appendChild(hintc);"
    + "var pv=document.createElement('div');pv.style.cssText='text-align:center;margin:16px 0;line-height:2.2';$('app').appendChild(pv);"
    + "function paint(){pv.innerHTML='';phrase.split('').forEach(function(ch){if(/[A-Z0-9]/.test(ch)){var s=document.createElement('span');s.className='blank';s.textContent=revealed[ch]?ch:'';pv.appendChild(s);}else if(ch===' '){pv.appendChild(document.createTextNode('\\u00A0\\u00A0'));}else{var t=document.createElement('span');t.textContent=ch;t.style.margin='0 2px';pv.appendChild(t);}});}paint();"
    + "var kb=document.createElement('div');kb.className='row';kb.style.maxWidth='520px';kb.style.margin='0 auto';'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function(L){var b=document.createElement('button');b.className='btn';b.style.cssText='min-width:40px;padding:8px 10px';b.textContent=L;b.onclick=function(){if(b.disabled)return;b.disabled=true;if(phrase.indexOf(L)>=0){b.classList.add('ok');revealed[L]=true;paint();if(solved()){var earn=Math.max(20,100-wrong*15);score+=earn;[].slice.call(kb.querySelectorAll('button')).forEach(function(x){x.disabled=true;});setTimeout(next,800);}}else{b.classList.add('no');wrong++;}};kb.appendChild(b);});$('app').appendChild(kb);$('hint').textContent='Tap letters to fill in the answer. Fewer wrong guesses = more points!';"
    + "function solved(){return phrase.split('').every(function(ch){return !/[A-Z0-9]/.test(ch)||revealed[ch];});}}"
    + "function next(){pi++;if(pi>=puzzles.length){endGame(score/possible*100,'You solved them! '+score+' points');}else{render();}}render();";
  return page((c as { title?: string }).title || "Wheel", c, script);
}

// ── 6) ESCAPE ROOM (sequential locked stages) ────────────────────────────────
function buildEscape(c: unknown): string {
  const script = "var stages=DATA.stages;var si=0,hintsUsed=0,tries=0;"
    + "var intro=document.createElement('div');intro.className='card';intro.style.textAlign='center';intro.innerHTML='🔒 '+(DATA.intro||'Solve each lock to escape!');$('app').appendChild(intro);"
    + "var stageBox=document.createElement('div');$('app').appendChild(stageBox);"
    + "function render(){var st=stages[si];stageBox.innerHTML='';pts('Lock '+(si+1)+'/'+stages.length);setBar(si/stages.length*100);"
    + "var c1=document.createElement('div');c1.className='card';c1.innerHTML='<div style=\"font-weight:800;color:#4F46E5;margin-bottom:6px\">Lock '+(si+1)+'</div><div style=\"font-size:1.08rem\">'+st.prompt+'</div>';stageBox.appendChild(c1);"
    + "var fb=document.createElement('div');fb.style.cssText='text-align:center;font-weight:700;min-height:22px;margin:8px 0';"
    + "function solved(){si++;if(si>=stages.length){endGame(Math.max(40,100-hintsUsed*10-tries*3),'You escaped! 🎉🔓');}else{c1.style.borderColor='#15803d';setTimeout(render,700);}}"
    + "if(st.choices){var opts=document.createElement('div');opts.className='row';shuffle(st.choices).forEach(function(o){var b=document.createElement('button');b.className='btn';b.textContent=o;b.onclick=function(){if(b.disabled)return;if(o.toLowerCase()===String(st.answer).toLowerCase()){b.classList.add('ok');[].slice.call(opts.querySelectorAll('button')).forEach(function(x){x.disabled=true;});solved();}else{b.disabled=true;b.classList.add('no');tries++;fb.textContent='That lock did not open. Try again.';}};opts.appendChild(b);});stageBox.appendChild(opts);}"
    + "else{var wrap=document.createElement('div');wrap.className='row';var inp=document.createElement('input');inp.className='tx';inp.placeholder='Enter the code…';var go=document.createElement('button');go.className='btn';go.textContent='Unlock';function tryIt(){var v=(inp.value||'').trim().toLowerCase();if(!v)return;if(v===String(st.answer).toLowerCase()){go.classList.add('ok');inp.disabled=true;go.disabled=true;solved();}else{tries++;fb.textContent='🔒 Still locked. Check your work.';inp.classList.add('no');setTimeout(function(){inp.classList.remove('no');},400);}}go.onclick=tryIt;inp.addEventListener('keydown',function(e){if(e.key==='Enter')tryIt();});wrap.appendChild(inp);wrap.appendChild(go);stageBox.appendChild(wrap);}"
    + "stageBox.appendChild(fb);if(st.hint){var hw=document.createElement('div');hw.style.textAlign='center';var hb=document.createElement('button');hb.className='btn';hb.style.fontSize='.9rem';hb.textContent='💡 Hint (−10)';hb.onclick=function(){hintsUsed++;fb.textContent='💡 '+st.hint;hb.disabled=true;};hw.appendChild(hb);stageBox.appendChild(hw);}}render();";
  return page((c as { title?: string }).title || "Escape Room", c, script);
}

// ── Sample content per band (seeds the demo library) ─────────────────────────
type Sample = { title: string; instructions: string; content: unknown };

function sampleJeopardy(band: Band): Sample {
  if (band === "35") return { title: "Review Jeopardy — Grade 4", instructions: "Pick a category and point value. Read the clue aloud, agree on an answer, then reveal it and score yourselves.", content: { title: "Grade 4 Review Jeopardy", categories: [
    { name: "Math", clues: [{ value: 100, clue: "6 × 7", answer: "42" }, { value: 200, clue: "The name for the answer to a division problem", answer: "Quotient" }, { value: 300, clue: "¾ written as a decimal", answer: "0.75" }] },
    { name: "Science", clues: [{ value: 100, clue: "The gas plants breathe in", answer: "Carbon dioxide" }, { value: 200, clue: "Water changing to gas", answer: "Evaporation" }, { value: 300, clue: "The center of our solar system", answer: "The Sun" }] },
    { name: "Reading", clues: [{ value: 100, clue: "What the whole story is mostly about", answer: "The main idea" }, { value: 200, clue: "A word that means the same as another", answer: "A synonym" }, { value: 300, clue: "Words near an unknown word that hint at its meaning", answer: "Context clues" }] },
  ] } };
  if (band === "912") return { title: "Unit Review Jeopardy — HS", instructions: "Teams choose a value, discuss, and lock an answer before revealing. Track points on the board.", content: { title: "High School Unit Review", categories: [
    { name: "Biology", clues: [{ value: 200, clue: "The powerhouse of the cell", answer: "Mitochondria" }, { value: 400, clue: "The process plants use to make food from light", answer: "Photosynthesis" }, { value: 600, clue: "Molecule that carries genetic instructions", answer: "DNA" }] },
    { name: "Algebra", clues: [{ value: 200, clue: "Slope of y = 3x + 2", answer: "3" }, { value: 400, clue: "Solve: 2x − 4 = 10", answer: "x = 7" }, { value: 600, clue: "The quadratic formula solves equations of this form", answer: "ax² + bx + c = 0" }] },
    { name: "US History", clues: [{ value: 200, clue: "Year the Declaration of Independence was signed", answer: "1776" }, { value: 400, clue: "First 10 amendments to the Constitution", answer: "The Bill of Rights" }, { value: 600, clue: "President during the Civil War", answer: "Abraham Lincoln" }] },
  ] } };
  return { title: "Unit Review Jeopardy — Middle School", instructions: "Pick a value, read the clue, discuss as a team, then reveal and score.", content: { title: "Middle School Review", categories: [
    { name: "Life Science", clues: [{ value: 100, clue: "Organelle that makes energy in a cell", answer: "Mitochondria" }, { value: 200, clue: "Flow of energy: producers → consumers →", answer: "Decomposers" }, { value: 300, clue: "The process of cell division for growth", answer: "Mitosis" }] },
    { name: "Pre-Algebra", clues: [{ value: 100, clue: "−5 + 8", answer: "3" }, { value: 200, clue: "The value of x in x/4 = 5", answer: "20" }, { value: 300, clue: "20% of 60", answer: "12" }] },
    { name: "Geography", clues: [{ value: 100, clue: "Largest ocean on Earth", answer: "Pacific" }, { value: 200, clue: "The imaginary line at 0° latitude", answer: "The Equator" }, { value: 300, clue: "Continent the Sahara Desert is on", answer: "Africa" }] },
  ] } };
}

function sampleFeud(band: Band): Sample {
  const base = band === "912"
    ? { title: "Class Survey Feud — HS", rounds: [
        { question: "Name a renewable energy source.", answers: [{ text: "Solar", points: 40 }, { text: "Wind", points: 30 }, { text: "Hydro", points: 18 }, { text: "Geothermal", points: 12 }], distractors: ["Coal", "Gasoline"] },
        { question: "Name a branch of the US government.", answers: [{ text: "Legislative", points: 45 }, { text: "Executive", points: 35 }, { text: "Judicial", points: 20 }], distractors: ["Military", "Federal"] },
      ] }
    : band === "68"
    ? { title: "Class Survey Feud — Middle", rounds: [
        { question: "Name a state of matter.", answers: [{ text: "Solid", points: 40 }, { text: "Liquid", points: 33 }, { text: "Gas", points: 20 }, { text: "Plasma", points: 7 }], distractors: ["Metal", "Ice cube"] },
        { question: "Name a part of a plant cell.", answers: [{ text: "Cell wall", points: 38 }, { text: "Chloroplast", points: 30 }, { text: "Nucleus", points: 22 }, { text: "Vacuole", points: 10 }], distractors: ["Lungs", "Engine"] },
      ] }
    : { title: "Class Survey Feud — Grade 5", rounds: [
        { question: "Name a planet in our solar system.", answers: [{ text: "Earth", points: 35 }, { text: "Mars", points: 28 }, { text: "Jupiter", points: 22 }, { text: "Saturn", points: 15 }], distractors: ["The Moon", "The Sun"] },
        { question: "Name a punctuation mark.", answers: [{ text: "Period", points: 40 }, { text: "Comma", points: 30 }, { text: "Question mark", points: 20 }, { text: "Exclamation point", points: 10 }], distractors: ["Letter", "Number"] },
      ] };
  return { title: base.title, instructions: "Read the survey question. Tap answers you think were most popular — three misses ends the round. Reveal all the data at the end.", content: base };
}

function sampleBingo(band: Band): Sample {
  if (band === "k2") return { title: "Sight-Word Bingo — K–2", instructions: "Tap ‘Next call’ to hear a word, then tap it on your card. Fill a whole line — across, down, or corner-to-corner — to win!", content: { title: "Sight-Word Bingo", size: 4, pool: ["the", "and", "is", "to", "you", "was", "for", "are", "with", "his", "they", "at", "be", "this", "have", "from", "one", "had", "not", "but"] } };
  return { title: "Multiplication Bingo — Grade 3–5", instructions: "Tap ‘Next call’ to hear a product, then tap that number on your card. Get a full line to win!", content: { title: "Products Bingo", size: 5, pool: ["12", "16", "18", "20", "24", "28", "30", "36", "42", "48", "54", "56", "63", "64", "72", "81", "6", "9", "15", "25", "35", "40", "45", "49", "27", "32"] } };
}

function samplePassword(band: Band): Sample {
  const content = band === "68"
    ? { title: "Vocabulary Password — Middle", items: [
        { answer: "Photosynthesis", clues: ["Plants do it", "It uses sunlight", "It makes glucose and oxygen"], options: ["Respiration", "Photosynthesis", "Digestion", "Evaporation"] },
        { answer: "Democracy", clues: ["A type of government", "People have a say", "They vote for leaders"], options: ["Monarchy", "Dictatorship", "Democracy", "Anarchy"] },
        { answer: "Hypothesis", clues: ["Used in science", "An educated guess", "You test it with an experiment"], options: ["Conclusion", "Hypothesis", "Variable", "Theory"] },
      ] }
    : { title: "Vocabulary Password — Grade 4", items: [
        { answer: "Habitat", clues: ["A place", "Animals live there", "It has food, water, and shelter"], options: ["Habitat", "Weather", "Forest fire", "Migration"] },
        { answer: "Fraction", clues: ["A math word", "It is part of a whole", "It has a top and bottom number"], options: ["Fraction", "Angle", "Sum", "Pattern"] },
        { answer: "Predict", clues: ["Something readers do", "It means to guess what happens next", "You use clues from the story"], options: ["Predict", "Summarize", "Rhyme", "Whisper"] },
      ] };
  return { title: content.title, instructions: "Read the first clue and guess the word. Stuck? Reveal another clue — but the fewer you use, the more points you earn.", content };
}

function sampleWheel(band: Band): Sample {
  if (band === "k2") return { title: "Guess the Word — K–2", instructions: "Tap letters to fill in the mystery word. Use the hint, and tap ‘Hear it’ to sound it out!", content: { title: "Guess the Word", puzzles: [
    { phrase: "SUN", hint: "It is bright and up in the sky in the day", say: "sun" },
    { phrase: "FROG", hint: "A green animal that hops and says ribbit", say: "frog" },
    { phrase: "APPLE", hint: "A red or green fruit that is crunchy", say: "apple" },
  ] } };
  return { title: "Mystery Phrase — Grade 3–5", instructions: "Reveal the hidden phrase by guessing letters. Fewer wrong guesses means more points!", content: { title: "Mystery Phrase", puzzles: [
    { phrase: "MAIN IDEA", hint: "What a whole text is mostly about" },
    { phrase: "WATER CYCLE", hint: "Evaporation, condensation, precipitation…" },
    { phrase: "UNITED STATES", hint: "The country whose capital is Washington, D.C." },
  ] } };
}

function sampleEscape(band: Band): Sample {
  if (band === "912") return { title: "Escape the Lab — HS Review", instructions: "Solve each lock in order using what you know. Enter the code or pick the answer to open the next lock and escape.", content: { intro: "The lab door is locked. Solve each puzzle to escape!", stages: [
    { prompt: "Balance it: 2 H₂ + O₂ → ? H₂O. Enter the coefficient.", answer: "2", hint: "Count hydrogen atoms on the left." },
    { prompt: "Solve for x: 3x − 9 = 18.", answer: "9", hint: "Add 9, then divide by 3." },
    { prompt: "Which branch of government can declare a law unconstitutional?", answer: "Judicial", choices: ["Legislative", "Executive", "Judicial"], hint: "Think of the Supreme Court." },
  ] } };
  if (band === "68") return { title: "Escape the Island — Middle Review", instructions: "Work through each lock in order. Use the hint if you’re stuck — but it costs points.", content: { intro: "You’re stranded! Solve each lock to signal for rescue.", stages: [
    { prompt: "A recipe needs 3 cups for 4 people. How many cups for 8 people?", answer: "6", hint: "Double everything." },
    { prompt: "What is the powerhouse of the cell?", answer: "Mitochondria", choices: ["Nucleus", "Mitochondria", "Ribosome"], hint: "It makes energy." },
    { prompt: "Unscramble this landform: T-A-N-M-O-U-N-I", answer: "Mountain", hint: "It’s very tall." },
  ] } };
  return { title: "Escape the Treehouse — Grade 4", instructions: "Open each lock in order. Enter the answer or pick the right choice. Use a hint only if you need it.", content: { intro: "The treehouse ladder is locked! Solve each puzzle to climb down.", stages: [
    { prompt: "What is 8 × 4?", answer: "32", hint: "8, 16, 24, …" },
    { prompt: "Which word is a synonym for ‘happy’?", answer: "Joyful", choices: ["Angry", "Joyful", "Tired"], hint: "It means very glad." },
    { prompt: "How many sides does a hexagon have?", answer: "6", hint: "‘Hex’ means six." },
  ] } };
}

// ── Registry (the repository catalog of built templates) ─────────────────────
export interface GameTemplate {
  key: string;
  name: string;
  blurb: string;
  bands: Band[];
  build: (content: unknown) => string;
  sample: (band: Band) => Sample;
}

export const GAME_TEMPLATES: GameTemplate[] = [
  { key: "jeopardy", name: "Jeopardy", blurb: "Category board with point values — the classic content-review show. Great for whole-class team review.", bands: ["35", "68", "912"], build: buildJeopardy, sample: sampleJeopardy },
  { key: "feud", name: "Family Feud", blurb: "Class-survey guessing game — reveals ranked answers as a live data lesson.", bands: ["35", "68", "912"], build: buildFeud, sample: sampleFeud },
  { key: "bingo", name: "Bingo", blurb: "Caller-and-card recognition game for numbers, letters, sight words, or facts. Read-aloud built in.", bands: ["k2", "35"], build: buildBingo, sample: sampleBingo },
  { key: "password", name: "Password / Taboo", blurb: "Clue-by-clue vocabulary guessing — fewer clues used means more points.", bands: ["35", "68"], build: buildPassword, sample: samplePassword },
  { key: "wheel", name: "Wheel / Guess the Word", blurb: "Letter-reveal puzzle (Wheel of Fortune + ‘Guess the Sound’) for words and key phrases.", bands: ["k2", "35"], build: buildWheel, sample: sampleWheel },
  { key: "escape", name: "Escape Room", blurb: "Sequential locked puzzles — solve each to unlock the next. Strong for multi-step review.", bands: ["35", "68", "912"], build: buildEscape, sample: sampleEscape },
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
