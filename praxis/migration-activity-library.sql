-- Pre-built activity library: 10 gamified quizzes, one per Synops case-study topic.
-- Each is a self-contained sandbox activity (calls SynopsActivity.submit). Published library
-- items (organisation_id NULL, is_library true) so every tenant can run or assign them.
-- Additive + idempotent (ON CONFLICT (id) DO NOTHING).

INSERT INTO interactive_activities
  (id, organisation_id, title, instructions, html, source, embed_url, kind, blooms_level, difficulty, is_library, tags, max_score, published, created_by_user_id)
VALUES
  ('actlib_retail_pricing', NULL, 'Spaza shop pricing: margin vs profit', 'A quick check on why a busy shop can still be broke at month-end.', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Nomsa buys a cold drink for R14 and sells it for R16. What is her gross profit per drink?", "options": [{"t": "R2", "correct": true, "why": "Selling price minus cost price = R16 - R14 = R2 gross profit per unit."}, {"t": "R16", "correct": false}, {"t": "R14", "correct": false}, {"t": "R30", "correct": false}]}, {"q": "She sells about 400 cold drinks a month at R2 profit each. Before other costs, that is roughly:", "options": [{"t": "R800", "correct": true, "why": "400 x R2 = R800 gross profit from cold drinks before fixed costs."}, {"t": "R6,400", "correct": false}, {"t": "R1,800", "correct": false}, {"t": "R400", "correct": false}]}, {"q": "Her rent (R1,800) and electricity (R600) are examples of what kind of cost?", "options": [{"t": "Fixed costs she pays no matter how much she sells", "correct": true, "why": "Rent and electricity are fixed overheads; they must be covered by total gross profit, not per-item margin."}, {"t": "Costs that disappear if she lowers prices", "correct": false}, {"t": "Costs of goods sold per drink", "correct": false}, {"t": "Profit", "correct": false}]}, {"q": "Why can Nomsa feel busy all day but have no money at month-end?", "options": [{"t": "Her thin per-item margins may not add up to enough to cover her fixed costs", "correct": true, "why": "Being busy is about volume; profitability is margin x volume minus fixed costs. Thin margins on high volume can still lose to overheads."}, {"t": "Because the shop next door is cheaper", "correct": false}, {"t": "Because she sells too few products", "correct": false}, {"t": "Because customers pay late", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Understand', 'foundational', true, ARRAY['pricing','retail','margins']::text[], '100', true, 'system'),
  ('actlib_agri_cashflow', NULL, 'Seasonal cash flow: timing the gaps', 'Money in twice a season, money out every week - where does it go?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Sipho is paid in a lump sum at harvest but pays for seeds, water and a helper weekly. This mismatch is called a:", "options": [{"t": "Cash-flow timing gap", "correct": true, "why": "Income and expenses arrive on different schedules, so cash can run out even when the business is profitable overall."}, {"t": "Loss", "correct": false}, {"t": "Fixed cost", "correct": false}, {"t": "Bad debt", "correct": false}]}, {"q": "Which is the clearest sign of a cash-flow problem rather than a profit problem?", "options": [{"t": "The season is profitable overall, but he runs dry mid-season", "correct": true, "why": "A cash-flow problem is about timing: profitable on paper, but no cash at a given moment."}, {"t": "He sells his crops below cost", "correct": false}, {"t": "His crops fail", "correct": false}, {"t": "He has no customers", "correct": false}]}, {"q": "What is the cheapest way for Sipho to survive the mid-season gap next time?", "options": [{"t": "Set aside part of each harvest lump sum as a buffer for weekly costs", "correct": true, "why": "Reserving a cash buffer from the lump sum smooths the weeks between harvests and avoids high-interest borrowing."}, {"t": "Borrow from the neighbour again at high interest", "correct": false}, {"t": "Stop paying the helper", "correct": false}, {"t": "Plant a crop that never needs water", "correct": false}]}, {"q": "A weekly cash plan between harvests would mainly help him:", "options": [{"t": "See in advance which weeks he will run short, and prepare", "correct": true, "why": "Forecasting weekly needs lets him spot the shortfall early and act before it becomes a crisis."}, {"t": "Increase the price buyers pay him", "correct": false}, {"t": "Grow crops faster", "correct": false}, {"t": "Avoid paying for transport", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'intermediate', true, ARRAY['cash-flow','seasonality','farming']::text[], '100', true, 'system'),
  ('actlib_catering_costing', NULL, 'Costing a catering job fully', 'Before saying yes to the R8,000 job, count every cost.', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Thandi is offered R8,000 and her ingredients cost R4,500. Which costs is she most likely forgetting?", "options": [{"t": "Helpers, transport, gas and disposables", "correct": true, "why": "These are real job costs beyond ingredients; leaving them out makes the job look far more profitable than it is."}, {"t": "Nothing - ingredients are the only cost", "correct": false}, {"t": "Her rent from last year", "correct": false}, {"t": "The client's budget", "correct": false}]}, {"q": "If helpers, transport, gas and plates add up to R3,200, what is her real profit on the job?", "options": [{"t": "R300 (R8,000 - R4,500 - R3,200)", "correct": true, "why": "Full cost = R7,700, so profit is only R300 - not the R3,500 she imagined from ingredients alone."}, {"t": "R3,500", "correct": false}, {"t": "R8,000", "correct": false}, {"t": "A loss of R4,500", "correct": false}]}, {"q": "Thandi says yes mainly for 'the exposure'. What is the risk of that reasoning?", "options": [{"t": "Exposure does not pay her bills if the job barely breaks even or loses money", "correct": true, "why": "Exposure can have value, but it should be a conscious choice on top of a job that at least covers its costs."}, {"t": "Exposure always guarantees future paying clients", "correct": false}, {"t": "There is no risk", "correct": false}, {"t": "Her ingredients will spoil", "correct": false}]}, {"q": "The safest way for Thandi to decide is to:", "options": [{"t": "Add up every cost first, then compare to the R8,000 price", "correct": true, "why": "Full costing before quoting turns an exciting-sounding job into a clear profit-or-loss decision."}, {"t": "Trust her gut and say yes fast", "correct": false}, {"t": "Ask the next-door shop what to charge", "correct": false}, {"t": "Halve her ingredient quality", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['costing','catering','hidden-costs']::text[], '100', true, 'system'),
  ('actlib_salon_hiring', NULL, 'When to hire your first employee', 'Fully booked and exhausted - is hiring the answer, and how to test it?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Lerato is fully booked six days a week and turning clients away. What is the core business signal?", "options": [{"t": "Demand exceeds her personal capacity - a growth constraint", "correct": true, "why": "Turning away paying clients means her own hands are the bottleneck, the classic trigger to add capacity."}, {"t": "Her prices are too low", "correct": false}, {"t": "Nobody wants her service", "correct": false}, {"t": "She should close on the seventh day too", "correct": false}]}, {"q": "Her biggest fear is paying a salary in slow weeks. A cheap way to test hiring before committing is to:", "options": [{"t": "Bring someone in part-time or on the busiest days first", "correct": true, "why": "A small, reversible trial tests the fear (cost in slow weeks, client trust) without a full-time commitment."}, {"t": "Hire two full-time stylists immediately", "correct": false}, {"t": "Sign a five-year employment contract", "correct": false}, {"t": "Do nothing and stay exhausted", "correct": false}]}, {"q": "She worries a new stylist won't treat clients well. The best way to protect quality is to:", "options": [{"t": "Start small, set clear standards, and keep some clients as a check", "correct": true, "why": "Delegation with standards and a trial period lets her manage quality risk rather than avoid growth entirely."}, {"t": "Never let anyone else touch a client", "correct": false}, {"t": "Assume it will be fine", "correct": false}, {"t": "Only hire family", "correct": false}]}, {"q": "What is Lerato really afraid of, underneath the salary worry?", "options": [{"t": "Losing control of quality and taking on fixed cost before she trusts the person", "correct": true, "why": "Naming the real fear - control and commitment - points to cheap tests: trials, standards, gradual handover."}, {"t": "That she will earn too much money", "correct": false}, {"t": "That clients will stop coming entirely", "correct": false}, {"t": "That she will have free time", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['hiring','delegation','growth']::text[], '100', true, 'system'),
  ('actlib_tech_acquisition', NULL, 'Winning your first paying customer', 'A great product with one free user - what''s the wrong assumption?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Bongani keeps improving his app, sure that 'if it is good enough, clinics will come'. This belief is:", "options": [{"t": "An untested assumption about how customers are actually won", "correct": true, "why": "'Build it and they will come' is an assumption; customers are usually won by talking to them and selling, not by more features."}, {"t": "A proven law of business", "correct": false}, {"t": "Irrelevant to his survival", "correct": false}, {"t": "True for every product", "correct": false}]}, {"q": "He has one clinic using the app - for free. What does that tell him about demand?", "options": [{"t": "Very little - people accepting something free is not proof they will pay", "correct": true, "why": "Free usage does not test willingness to pay, which is the real signal of a viable product."}, {"t": "That the product is clearly worth paying for", "correct": false}, {"t": "That he should add more features", "correct": false}, {"t": "That the market is huge", "correct": false}]}, {"q": "With savings almost gone, the highest-value thing Bongani can do now is:", "options": [{"t": "Talk to clinics and try to make one actual paying sale", "correct": true, "why": "Customer discovery and a real sale test his core assumption fast, before the money runs out."}, {"t": "Spend another three months polishing the app", "correct": false}, {"t": "Wait for clinics to find him", "correct": false}, {"t": "Rebuild the app from scratch", "correct": false}]}, {"q": "How would he test whether his 'they will just come' assumption is even true?", "options": [{"t": "Ask several clinics to pay, and watch what they actually do", "correct": true, "why": "Behaviour (paying or not) tests the assumption far better than opinions or more building."}, {"t": "Read more about app design", "correct": false}, {"t": "Assume it is true and keep building", "correct": false}, {"t": "Lower the price to zero forever", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Understand', 'foundational', true, ARRAY['sales','customer-discovery','startups']::text[], '100', true, 'system'),
  ('actlib_manuf_supplier', NULL, 'Choosing a supplier beyond price', 'The cheapest fabric keeps costing Fatima orders. Why?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Fatima's cheapest supplier delivers late and sometimes sends the wrong colour, making her miss orders. The cheap price hides a:", "options": [{"t": "Total cost including lost orders, rework and unhappy customers", "correct": true, "why": "Unit price is only part of the cost; unreliability adds hidden costs that can exceed the saving."}, {"t": "Secret discount", "correct": false}, {"t": "Tax benefit", "correct": false}, {"t": "Higher margin", "correct": false}]}, {"q": "A second supplier is 12% dearer but reliable. Which idea best guides the choice?", "options": [{"t": "Total cost of ownership, not just the sticker price", "correct": true, "why": "TCO weighs reliability, quality and missed-order costs against unit price to find the truly cheaper option."}, {"t": "Always pick the lowest unit price", "correct": false}, {"t": "Always pick the most expensive", "correct": false}, {"t": "Pick randomly", "correct": false}]}, {"q": "If missed and late orders cost Fatima more than 12% of her fabric spend, then the reliable supplier is:", "options": [{"t": "Actually cheaper overall, despite the higher unit price", "correct": true, "why": "When failure costs exceed the price premium, the 'expensive' supplier is the lower-total-cost choice."}, {"t": "Still the wrong choice", "correct": false}, {"t": "Impossible to evaluate", "correct": false}, {"t": "Only worth it for big orders", "correct": false}]}, {"q": "What never shows up on the cheap supplier's invoice but still costs Fatima?", "options": [{"t": "Lost customers, rushed rework and her damaged reputation", "correct": true, "why": "These indirect costs are invisible on the invoice yet directly hurt the business - the heart of total-cost thinking."}, {"t": "The fabric price", "correct": false}, {"t": "The delivery date printed on the order", "correct": false}, {"t": "Her rent", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['suppliers','total-cost','operations']::text[], '100', true, 'system'),
  ('actlib_tourism_marketing', NULL, 'Cheap marketing for a guesthouse', 'Ayanda pays for flyers but ignores her happiest guests. Fix that.', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Ayanda spends on printed flyers but cannot tell if they work. The main weakness of the flyers is that they are:", "options": [{"t": "Hard to measure, so she cannot tell what is working", "correct": true, "why": "If you can't measure a channel, you can't tell whether the spend earns guests - a core marketing risk."}, {"t": "Too cheap", "correct": false}, {"t": "Too trustworthy", "correct": false}, {"t": "Seen by too many people", "correct": false}]}, {"q": "She has had very happy guests but never asked for reviews or referrals. What is she ignoring?", "options": [{"t": "Her cheapest, most trustworthy marketing - word of mouth from happy guests", "correct": true, "why": "Reviews and referrals from real guests cost almost nothing and are trusted far more than ads."}, {"t": "Expensive TV advertising", "correct": false}, {"t": "A costly new website team", "correct": false}, {"t": "A discount war with competitors", "correct": false}]}, {"q": "Occupancy is low midweek. A cheap, testable first step is to:", "options": [{"t": "Ask recent happy guests for an online review or a referral", "correct": true, "why": "It is low-cost, measurable, and builds the trust that drives new bookings - especially for quiet midweek gaps."}, {"t": "Print twice as many flyers", "correct": false}, {"t": "Cut her room price in half permanently", "correct": false}, {"t": "Do nothing until weekends fill", "correct": false}]}, {"q": "Why are guest reviews more powerful than her flyers?", "options": [{"t": "People trust other guests' real experiences more than an advert", "correct": true, "why": "Social proof from real guests is both cheaper and more persuasive than paid, unmeasured flyers."}, {"t": "Reviews are more colourful", "correct": false}, {"t": "Flyers are illegal", "correct": false}, {"t": "Reviews reach nobody", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['marketing','referrals','reviews']::text[], '100', true, 'system'),
  ('actlib_transport_utilisation', NULL, 'Which deliveries actually make money', 'One bakkie, a flat R250 fee - which trips secretly lose money?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Kagiso charges a flat R250 whether a trip is 5km or 80km. The flat rate ignores:", "options": [{"t": "That long trips cost far more in fuel and time than short ones", "correct": true, "why": "A flat fee hides that cost varies with distance and time, so some trips can cost more than R250 to run."}, {"t": "The colour of the bakkie", "correct": false}, {"t": "His competitors' logos", "correct": false}, {"t": "The weather", "correct": false}]}, {"q": "A long trip that 'eats his whole day and a full tank' is risky because it may:", "options": [{"t": "Cost more in fuel and lost time than the R250 he charges", "correct": true, "why": "If the trip's real cost exceeds R250, that delivery loses money even though it feels like income."}, {"t": "Always be his most profitable trip", "correct": false}, {"t": "Use no fuel", "correct": false}, {"t": "Take no time", "correct": false}]}, {"q": "How would Kagiso find out which trips actually make money?", "options": [{"t": "Track fuel, time and distance per trip and compare to the R250", "correct": true, "why": "Measuring cost per trip turns a guess into evidence about which jobs to price higher or drop."}, {"t": "Guess based on how tired he feels", "correct": false}, {"t": "Charge everyone less", "correct": false}, {"t": "Stop doing deliveries", "correct": false}]}, {"q": "His bakkie needs a big service soon. A smart pricing fix would be to:", "options": [{"t": "Charge based on distance/time so long trips cover their real cost (including wear)", "correct": true, "why": "Cost-reflective pricing makes each trip pay its share of fuel, time and vehicle wear."}, {"t": "Keep the flat rate and hope", "correct": false}, {"t": "Only ever do one trip a day", "correct": false}, {"t": "Raise prices only for short trips", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['cost-per-trip','pricing','logistics']::text[], '100', true, 'system'),
  ('actlib_crafts_labour', NULL, 'Pricing handmade goods and your time', 'Zinhle''s R80 ''profit'' hides something. And should she take the bulk order?', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "A necklace takes Zinhle 3 hours and R40 of beads; she sells at R120 and calls it R80 profit. What has she left out?", "options": [{"t": "The value of her own 3 hours of labour", "correct": true, "why": "R80 is only material profit; her time has a cost too. Ignoring labour makes the work look more profitable than it is."}, {"t": "The bead cost", "correct": false}, {"t": "The selling price", "correct": false}, {"t": "Nothing - R80 is correct", "correct": false}]}, {"q": "If Zinhle valued her time at just R30/hour, her real profit per necklace would be about:", "options": [{"t": "Roughly R-10 to break-even (R80 material profit minus ~R90 labour)", "correct": true, "why": "At R30/hour, 3 hours costs ~R90, wiping out the R80 - she may be barely breaking even or losing on her time."}, {"t": "R160", "correct": false}, {"t": "R80 unchanged", "correct": false}, {"t": "R120", "correct": false}]}, {"q": "A shop offers to buy 50 pieces if she drops the price to R90 each. First she should:", "options": [{"t": "Work out her true cost per piece (materials + her time) before agreeing", "correct": true, "why": "A wholesale price below true cost loses money on every unit; volume then multiplies the loss."}, {"t": "Say yes at once for the big order", "correct": false}, {"t": "Say no to all bulk orders forever", "correct": false}, {"t": "Raise her market price to R300", "correct": false}]}, {"q": "Why can Zinhle work every evening and weekend yet never save?", "options": [{"t": "She is not pricing in her labour, so she may be underpaid for her time", "correct": true, "why": "If price doesn't cover materials and a fair rate for her hours, hard work produces activity but little real profit."}, {"t": "She sells too few products", "correct": false}, {"t": "Her beads are too cheap", "correct": false}, {"t": "She saves too aggressively", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['pricing','labour','wholesale']::text[], '100', true, 'system'),
  ('actlib_construction_quoting', NULL, 'Quoting a job and controlling scope', 'Themba quoted from memory and keeps saying yes to extras. Judge his choices.', $ACTHTML$
<style>
  .sq{max-width:640px}
  .sq-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .sq-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .sq-meta{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .sq-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .sq-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .sq-opt{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px}
  .sq-opt:hover{border-color:#94a3b8}
  .sq-opt.correct{border-color:#16a34a;background:#f0fdf4}
  .sq-opt.wrong{border-color:#dc2626;background:#fef2f2}
  .sq-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .sq-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .sq-next[disabled]{opacity:.4;cursor:default}
  .sq-result{text-align:center;padding:24px 8px}
  .sq-score{font-size:46px;font-weight:800;color:#4f46e5}
</style>
<div class="sq" id="sq"></div>
<script>
(function(){
  var DATA = [{"q": "Themba quoted R30,000 'based mostly on memory'. The main weakness of that quote is that it:", "options": [{"t": "Was not built up from real measured costs, so it can easily be wrong", "correct": true, "why": "A quote from memory ignores actual material and labour costs, risking a price that cannot cover the work."}, {"t": "Was too detailed", "correct": false}, {"t": "Included a deposit", "correct": false}, {"t": "Was in the wrong currency", "correct": false}]}, {"q": "The client keeps asking for extras (bigger window, better tiles, extra plug). Saying yes each time for free is called:", "options": [{"t": "Scope creep - the job grows but the price does not", "correct": true, "why": "Unpriced additions expand the work beyond the quote, quietly turning a profit into a loss."}, {"t": "Good customer service with no downside", "correct": false}, {"t": "A discount", "correct": false}, {"t": "A deposit", "correct": false}]}, {"q": "Themba took no deposit and now pays for materials himself. A better practice would be to:", "options": [{"t": "Take a deposit up front to fund materials and show commitment", "correct": true, "why": "A deposit protects his cash flow and reduces the risk of funding someone else's project from his own pocket."}, {"t": "Never take money until the very end", "correct": false}, {"t": "Pay for everything himself to seem generous", "correct": false}, {"t": "Stop buying materials", "correct": false}]}, {"q": "Best way to handle future 'small extras' without seeming difficult?", "options": [{"t": "Price each change as a written add-on the client approves before work", "correct": true, "why": "Change orders keep the relationship friendly and the job profitable by making every extra a clear, agreed cost."}, {"t": "Always say yes for free", "correct": false}, {"t": "Refuse to ever change anything", "correct": false}, {"t": "Secretly use cheaper materials", "correct": false}]}];
  var i=0, correct=0, streak=0, answered=false;
  var root=document.getElementById('sq');
  function render(){
    if(i>=DATA.length){ return result(); }
    var q=DATA[i]; answered=false;
    var pct=Math.round(i/DATA.length*100);
    var h='<div class="sq-meta"><span class="sq-chip">&#11088; '+correct+' correct</span><span class="sq-chip">&#128293; '+streak+' streak</span><span class="sq-chip">Question '+(i+1)+' of '+DATA.length+'</span></div>';
    h+='<div class="sq-bar"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="sq-q">'+q.q+'</div><div id="opts"></div><div id="why"></div>';
    h+='<button class="sq-next" id="next" disabled>'+((i+1<DATA.length)?'Next':'See result')+'</button>';
    root.innerHTML=h;
    var opts=document.getElementById('opts');
    q.options.forEach(function(o,idx){
      var b=document.createElement('button'); b.className='sq-opt'; b.textContent=o.t;
      b.onclick=function(){ pick(idx,b,q); };
      opts.appendChild(b);
    });
    document.getElementById('next').onclick=function(){ i++; render(); };
  }
  function pick(idx,btn,q){
    if(answered) return; answered=true;
    var o=q.options[idx];
    var all=root.querySelectorAll('.sq-opt');
    q.options.forEach(function(oo,k){ if(oo.correct) all[k].classList.add('correct'); });
    if(o.correct){ correct++; streak++; } else { btn.classList.add('wrong'); streak=0; }
    var right=q.options.filter(function(x){return x.correct;})[0];
    var why=(right&&right.why)?right.why:'';
    document.getElementById('why').innerHTML = why?('<div class="sq-why">'+(o.correct?'✅ ':'❌ ')+why+'</div>'):'';
    document.getElementById('next').disabled=false;
  }
  function result(){
    var pct=Math.round(correct/DATA.length*100);
    root.innerHTML='<div class="sq-result"><div class="sq-score">'+pct+'%</div><p>You got '+correct+' of '+DATA.length+' right.</p><p style="color:#64748b">Your result has been recorded.</p></div>';
    try{ SynopsActivity.submit({correct:correct,total:DATA.length}, pct); }catch(e){}
  }
  render();
})();
</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Evaluate', 'advanced', true, ARRAY['quoting','scope-creep','contracts']::text[], '100', true, 'system')
ON CONFLICT (id) DO NOTHING;
